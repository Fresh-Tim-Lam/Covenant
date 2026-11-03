import { describe, expect, it } from "vitest";
import { parseDocument } from "@covenant/core";
import type { CovenantDoc } from "@covenant/core";
import { applyEdits, parseEdits, serializeDoc, unifiedDiff } from "./index";

const SOURCE = `covenant: "0.1"
id: t/edit
profile: c4-container@1
meta:
  title: 编辑测试
  purpose: p
  non_goals: []
  rev: 3
elements:
  - id: e.a
    kind: container
    name: 服务 A
    summary: 做 A
    tech: TS
relations:
  - id: r.ab
    kind: calls
    from: e.a
    to: e.b
    summary: 调用
views:
  - id: v.main
    title: 主视图
`;

function doc(): CovenantDoc {
  const parsed = parseDocument(SOURCE, "t/edit.cvn.yaml");
  if (!parsed.doc) throw new Error("fixture 解析失败");
  return parsed.doc;
}

function edits(ops: unknown[]): string {
  return JSON.stringify({ covenant: "0.1", doc: "t/edit", base_rev: 3, ops });
}

describe("parseEdits", () => {
  it("拒绝非法 JSON 与空 ops", () => {
    expect(parseEdits("{").findings.map((f) => f.code)).toContain("edit/json");
    expect(parseEdits(JSON.stringify({ ops: [] })).findings.map((f) => f.code)).toContain("edit/ops");
  });

  it("接受合法 set ops", () => {
    const r = parseEdits(edits([{ op: "set", path: "/elements/e.a/name", value: "新名" }]));
    expect(r.findings).toEqual([]);
    expect(r.edits?.ops).toHaveLength(1);
  });
});

describe("applyEdits", () => {
  it("改元素 name/summary，且不修改原文档", () => {
    const d = doc();
    const r = parseEdits(
      edits([
        { op: "set", path: "/elements/e.a/name", value: "支付网关" },
        { op: "set", path: "/elements/e.a/summary", value: "新职责" },
      ]),
    );
    const out = applyEdits(d, r.edits!);
    expect(out.findings).toEqual([]);
    expect(out.changed).toBe(2);
    expect(out.doc!.elements![0]!.name).toBe("支付网关");
    expect(out.doc!.elements![0]!.summary).toBe("新职责");
    // 原文档未被改写
    expect(d.elements![0]!.name).toBe("服务 A");
  });

  it("改视图 pins（节点位置）", () => {
    const r = parseEdits(
      edits([{ op: "set", path: "/views/v.main/layout/pins/e.a", value: [120, 80] }]),
    );
    const out = applyEdits(doc(), r.edits!);
    expect(out.findings).toEqual([]);
    expect(out.doc!.views![0]!.layout!.pins!["e.a"]).toEqual([120, 80]);
  });

  it("base_rev 不匹配 → edit/base-rev", () => {
    const r = parseEdits(
      JSON.stringify({ doc: "t/edit", base_rev: 1, ops: [{ op: "set", path: "/elements/e.a/name", value: "x" }] }),
    );
    expect(applyEdits(doc(), r.edits!).findings.map((f) => f.code)).toContain("edit/base-rev");
  });

  it("禁止编辑语义敏感字段（kind / id）", () => {
    for (const field of ["kind", "id"]) {
      const r = parseEdits(
        edits([{ op: "set", path: `/elements/e.a/${field}`, value: "container" }]),
      );
      expect(applyEdits(doc(), r.edits!).findings.map((f) => f.code)).toContain("edit/field");
    }
  });

  it("目标不存在 / 值非法 → 报错", () => {
    const miss = parseEdits(edits([{ op: "set", path: "/elements/e.none/name", value: "x" }]));
    expect(applyEdits(doc(), miss.edits!).findings.map((f) => f.code)).toContain("edit/target");
    const bad = parseEdits(edits([{ op: "set", path: "/views/v.main/layout/pins/e.a", value: [1] }]));
    expect(applyEdits(doc(), bad.edits!).findings.map((f) => f.code)).toContain("edit/value");
  });
});

describe("serializeDoc", () => {
  it("生成可再次解析的 YAML，语义保持一致", () => {
    const r = parseEdits(edits([{ op: "set", path: "/elements/e.a/name", value: "新名" }]));
    const out = applyEdits(doc(), r.edits!).doc!;
    const text = serializeDoc(out);
    expect(text).toContain("# 由 covenant edit 生成");
    const reparsed = parseDocument(text, "out.cvn.yaml");
    expect(reparsed.findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(reparsed.doc!.elements![0]!.name).toBe("新名");
  });
});

describe("unifiedDiff", () => {
  it("无变化返回空串", () => {
    expect(unifiedDiff("a\nb\n", "a\nb\n")).toBe("");
  });

  it("修改行生成 hunk 头与 -/+ 行", () => {
    const diff = unifiedDiff("a\nold\nc\n", "a\nnew\nc\n", { fromLabel: "orig", toLabel: "edited" });
    expect(diff).toContain("--- orig");
    expect(diff).toContain("+++ edited");
    expect(diff).toMatch(/@@ -1,\d+ \+1,\d+ @@/);
    expect(diff).toContain("-old");
    expect(diff).toContain("+new");
    expect(diff).toContain(" a");
  });

  it("插入行计入 + 计数", () => {
    const diff = unifiedDiff("a\nc\n", "a\nb\nc\n");
    expect(diff).toContain("+b");
    expect(diff).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
  });
});
