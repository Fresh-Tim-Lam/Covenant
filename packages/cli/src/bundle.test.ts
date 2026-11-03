import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("covenant bundle：文件夹打包（可复跑）", () => {
  it("从示例契约生成 site/（index.html + manifest + views/*.svg + annotations.json）", () => {
    const root = mkdtempSync(join(tmpdir(), "covenant-bundle-"));
    const docs = join(root, "docs");
    mkdirSync(docs, { recursive: true });
    copyFileSync(resolve("examples/quickstart/mini.cvn.yaml"), join(docs, "mini.cvn.yaml"));
    const out = join(root, "site");

    execSync(`pnpm exec tsx packages/cli/src/index.ts bundle "${docs}" -o "${out}"`, {
      cwd: process.cwd(),
      stdio: "pipe",
    });

    expect(existsSync(join(out, "index.html"))).toBe(true);
    expect(existsSync(join(out, "manifest.json"))).toBe(true);
    expect(existsSync(join(out, "annotations.json"))).toBe(true);

    const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
    expect(manifest.version).toBe(3);
    expect(manifest.entries.length).toBeGreaterThan(0);
    const first = manifest.entries[0];
    expect(first.svg.startsWith("views/")).toBe(true);
    expect(existsSync(join(out, first.svg))).toBe(true);
    expect(Array.isArray(first.annotations)).toBe(true);

    const index = readFileSync(join(out, "index.html"), "utf8");
    expect(index).toContain('id="views"'); // 主查看器同款侧栏
    expect(index).toContain('id="inspector"'); // 悬浮检查器
    expect(index).toContain('id="btn-export"');
    expect(index).toContain("data-id");
  });
});
