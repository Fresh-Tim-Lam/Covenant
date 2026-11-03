import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkIndex, collectSources, writeIndex } from "./index";

function setup(): { root: string; indexPath: string } {
  const root = mkdtempSync(join(tmpdir(), "covenant-index-"));
  mkdirSync(join(root, "packages/core/src"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "arch"), { recursive: true });
  writeFileSync(join(root, "packages/core/src/a.ts"), "export const a = 1;\n");
  writeFileSync(join(root, "packages/core/src/a.test.ts"), "// test\n");
  writeFileSync(join(root, "scripts/x.mjs"), "console.log(1);\n");
  const indexPath = join(root, "arch/index.yaml");
  writeFileSync(
    indexPath,
    [
      "entries:",
      "  - file: packages/core/src/a.ts",
      "    f: 测试文件 A",
      "    r: []",
      "    a: []",
      "  - file: scripts/x.mjs",
      "    f: 测试脚本",
      "",
    ].join("\n"),
  );
  return { root, indexPath };
}

const codes = (fs: { code: string }[]): string[] => fs.map((f) => f.code);

describe("FRAS 索引 I1–I3", () => {
  it("collectSources 只收 src 下非测试 TS 与 scripts/*.mjs", () => {
    const { root } = setup();
    expect(collectSources(root)).toEqual(["packages/core/src/a.ts", "scripts/x.mjs"]);
  });

  it("未写哈希时判 stale", () => {
    const { root, indexPath } = setup();
    expect(codes(checkIndex(root, indexPath))).toContain("index/stale");
  });

  it("writeIndex 补哈希后通过", () => {
    const { root, indexPath } = setup();
    const r = writeIndex(root, indexPath);
    expect(r.updated).toBe(2);
    expect(r.missing).toEqual([]);
    expect(checkIndex(root, indexPath)).toEqual([]);
  });

  it("源码变更 → stale", () => {
    const { root, indexPath } = setup();
    writeIndex(root, indexPath);
    writeFileSync(join(root, "packages/core/src/a.ts"), "export const a = 2;\n");
    expect(codes(checkIndex(root, indexPath))).toContain("index/stale");
  });

  it("文件删除 → orphan", () => {
    const { root, indexPath } = setup();
    writeIndex(root, indexPath);
    rmSync(join(root, "packages/core/src/a.ts"));
    expect(codes(checkIndex(root, indexPath))).toContain("index/orphan");
  });

  it("缺条目 → missing（I1）", () => {
    const { root, indexPath } = setup();
    writeIndex(root, indexPath);
    writeFileSync(join(root, "packages/core/src/b.ts"), "export const b = 1;\n");
    const fs = checkIndex(root, indexPath);
    expect(codes(fs)).toContain("index/missing");
    expect(fs.find((f) => f.code === "index/missing")!.message).toContain("b.ts");
  });

  it("f 为空 / 不可独立阅读 → 报错（I3）", () => {
    const { root, indexPath } = setup();
    writeFileSync(
      indexPath,
      ["entries:", "  - file: packages/core/src/a.ts", "    f: ''"].join("\n"),
    );
    const fs = checkIndex(root, indexPath);
    expect(codes(fs)).toContain("index/empty-f");
    expect(codes(fs)).toContain("index/missing"); // 另一文件没有条目

    writeFileSync(
      indexPath,
      [
        "entries:",
        "  - file: packages/core/src/a.ts",
        "    f: 详见文档",
        "  - file: scripts/x.mjs",
        "    f: 脚本",
      ].join("\n"),
    );
    expect(codes(checkIndex(root, indexPath))).toContain("index/unreadable-f");
  });
});
