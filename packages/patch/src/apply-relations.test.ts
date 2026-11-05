import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyPatch, parseActor, parsePatch } from "./index";
import { parseDocument } from "@covenant/core";
import { gatePatch } from "./gate";
import type { Patch } from "./index";

/**
 * 关系增删的落盘回归（task-22 修的两个真 bug）：
 *   1. E9：`add /relations/-` 此前被误用 appendElements，关系被追加进 **elements 块**
 *      → L3 profile/vocabulary 用元素词表校验关系 kind 报错。修复后必须落在 relations 块内。
 *   2. gate 元素 add 分支曾以 kind="relation" 校验类型字段（segment 会在元素上被放行）。
 *
 * 端到端链路：writeFile → parsePatch → gatePatch → applyPatch → readFileSync → parseDocument。
 */

const DOC = `covenant: "0.1"
id: t/apply-rel
profile: c4-container@1
meta:
  title: 关系落盘回归
  purpose: p
  non_goals: []
  rev: 1
elements:
  - id: e.a
    kind: container
    name: A
    summary: a
    tech: ts
  - id: e.b
    kind: container
    name: B
    summary: b
    tech: ts
relations:
  - id: r.ab
    kind: calls
    from: e.a
    to: e.b
    summary: A 调用 B
`;

function setup(): { dir: string; docPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "covenant-rel-"));
  const docPath = join(dir, "doc.cvn.yaml");
  writeFileSync(docPath, DOC, "utf8");
  return { dir, docPath };
}

function relPatch(): Patch {
  // parsePatch 接收 JSON 文本（不是对象）
  return parsePatch(
    JSON.stringify({
      covenant: "0.1",
      doc: "t/apply-rel",
      base_rev: 1,
      intent: "e2e: relation add + remove",
      ops: [
        {
          op: "add",
          path: "/relations/-",
          value: { id: "r.ba", kind: "calls", from: "e.b", to: "e.a", summary: "B 回调 A" },
        },
        { op: "remove", path: "/relations/r.ab", value: null },
      ],
    }),
    "patch.json",
  ).patch!;
}

const leadActor = parseActor("human:lead")!;

describe("关系增删落盘（E9 回归）", () => {
  it("add /relations/- 落在 relations 块内而非 elements；remove 生效；rev+1", () => {
    const { docPath } = setup();
    const patch = relPatch();
    const base = parseDocument(DOC, docPath);
    expect(base.doc, "DOC fixture 应可解析").not.toBeNull();
    const gate = gatePatch(base.doc!, patch, { actor: leadActor });
    expect(gate, "gate 应放行：" + JSON.stringify(gate)).toEqual([]);

    const result = applyPatch(docPath, patch, { by: "human:lead" });
    expect(result.ok).toBe(true);
    expect(result.newRev).toBe(2);

    const text = readFileSync(docPath, "utf8");
    const lines = text.split(/\r?\n/);
    const elIdx = lines.findIndex((l) => /^elements:\s*$/.test(l));
    const relIdx = lines.findIndex((l) => /^relations:\s*$/.test(l));
    const addIdx = lines.findIndex((l) => /id: r\.ba/.test(l));
    expect(relIdx).toBeGreaterThan(elIdx);
    expect(addIdx, "新关系必须出现在 relations 段内").toBeGreaterThan(relIdx);
    expect(text).not.toContain("id: r.ab");
    expect(text).toContain("B 回调 A");
    expect(text).toContain("  rev: 2");

    const parsed = parseDocument(text, docPath);
    expect(parsed.findings, "落盘后全量校验应零 findings：" + JSON.stringify(parsed.findings)).toEqual([]);
    expect((parsed.doc?.relations ?? []).map((r) => r.id)).toEqual(["r.ba"]);
  });

  it("gate：元素 add 携带 segment 被 gate/segment-kind 拦（修复误用 relation 词表）", () => {
    const { docPath } = setup();
    const patch = parsePatch(
      JSON.stringify({
        covenant: "0.1",
        doc: "t/apply-rel",
        base_rev: 1,
        intent: "element add with segment must fail",
        ops: [
          {
            op: "add",
            path: "/elements/-",
            value: { id: "e.x", kind: "container", name: "X", summary: "x", segment: 0 },
          },
        ],
      }),
      "patch.json",
    ).patch!;
    const base = parseDocument(DOC, docPath);
    const gate = gatePatch(base.doc!, patch, { actor: leadActor });
    expect(gate.some((f) => f.code === "gate/segment-kind"), JSON.stringify(gate)).toBe(true);
  });

  it("gate：关系 add 携带非法 impl_status 被 gate/impl-status 拦", () => {
    const { docPath } = setup();
    const patch = parsePatch(
      JSON.stringify({
        covenant: "0.1",
        doc: "t/apply-rel",
        base_rev: 1,
        intent: "relation add with bad impl_status",
        ops: [
          {
            op: "add",
            path: "/relations/-",
            value: { id: "r.bad", kind: "calls", from: "e.a", to: "e.b", summary: "s", impl_status: "nope" },
          },
        ],
      }),
      "patch.json",
    ).patch!;
    const base = parseDocument(DOC, docPath);
    const gate = gatePatch(base.doc!, patch, { actor: leadActor });
    expect(gate.some((f) => f.code === "gate/impl-status"), JSON.stringify(gate)).toBe(true);
  });
});
