import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** 看板「导出全部 JSON」产出的 covenant-all.patches.json 必须能被 CLI 批量落盘 */
const doc = (id: string) => `covenant: "0.1"
id: ${id}
profile: c4-container@1
meta:
  title: ${id}
  purpose: p
  non_goals: []
  rev: 1
elements:
  - id: e.a
    kind: container
    name: A
    summary: a
    tech: TS
views:
  - id: v.main
    title: 主视图
`;

const annOp = (id: string) => ({
  op: "add",
  path: "/annotations/-",
  value: {
    id,
    target: { kind: "element", id: "e.a" },
    type: "risk",
    severity: "low",
    title: `from ${id}`,
    status: "open",
    author: "human:you",
    created: "2026-11-04T00:00:00+08:00",
  },
});

describe("covenant apply-bundle：批量落盘看板导出的全部补丁", () => {
  it("两个文档各自 apply，rev 递增且批注落盘", () => {
    const root = mkdtempSync(join(tmpdir(), "covenant-bundle-apply-"));
    const docs = join(root, "arch");
    mkdirSync(docs, { recursive: true });
    writeFileSync(join(docs, "a.cvn.yaml"), doc("t/a"));
    writeFileSync(join(docs, "b.cvn.yaml"), doc("t/b"));

    const bundle = {
      covenant: "0.1",
      patches: [
        { covenant: "0.1", doc: "t/a", base_rev: 1, intent: "test", ops: [annOp("a.01JAYBNDTEST000000000001")] },
        { covenant: "0.1", doc: "t/b", base_rev: 1, intent: "test", ops: [annOp("a.01JAYBNDTEST000000000002")] },
      ],
    };
    const bundlePath = join(root, "covenant-all.patches.json");
    writeFileSync(bundlePath, JSON.stringify(bundle, null, 2));

    const out = execSync(
      `pnpm exec tsx packages/cli/src/index.ts apply-bundle "${bundlePath}" --root "${docs}" --by human:you`,
      { cwd: process.cwd(), stdio: "pipe" },
    ).toString();

    expect(out).toContain("成功 2 / 2");
    const a = readFileSync(join(docs, "a.cvn.yaml"), "utf8");
    const b = readFileSync(join(docs, "b.cvn.yaml"), "utf8");
    expect(a).toContain("a.01JAYBNDTEST000000000001");
    expect(b).toContain("a.01JAYBNDTEST000000000002");
    expect(a).toMatch(/rev:\s*2/);
    expect(b).toMatch(/rev:\s*2/);
  });

  it("找不到对应文档的补丁被跳过并计为失败（不静默）", () => {
    const root = mkdtempSync(join(tmpdir(), "covenant-bundle-apply-miss-"));
    const docs = join(root, "arch");
    mkdirSync(docs, { recursive: true });
    writeFileSync(join(docs, "a.cvn.yaml"), doc("t/a"));

    const bundlePath = join(root, "all.json");
    writeFileSync(
      bundlePath,
      JSON.stringify({
        covenant: "0.1",
        patches: [
          { covenant: "0.1", doc: "t/a", base_rev: 1, intent: "test", ops: [annOp("a.01JAYBNDTEST000000000003")] },
          { covenant: "0.1", doc: "t/missing", base_rev: 1, intent: "test", ops: [] },
        ],
      }),
    );

    let failed = false;
    let out = "";
    try {
      out = execSync(
        `pnpm exec tsx packages/cli/src/index.ts apply-bundle "${bundlePath}" --root "${docs}" --by human:you`,
        { cwd: process.cwd(), stdio: "pipe" },
      ).toString();
    } catch (e) {
      failed = true;
      const err = e as { stdout?: Buffer; stderr?: Buffer; status?: number };
      out = (err.stdout ?? Buffer.from("")).toString() + (err.stderr ?? Buffer.from("")).toString();
    }
    expect(failed).toBe(true); // 非零退出，让失败可见（AGENTS.md L6）
    expect(out).toContain("成功 1 / 2");
    expect(out).toContain("t/missing");
  });
});
