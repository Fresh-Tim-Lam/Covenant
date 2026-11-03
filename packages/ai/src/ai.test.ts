import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDocument } from "@covenant/core";
import type { CovenantDoc } from "@covenant/core";
import { gatePatch, parseActor } from "@covenant/patch";
import { buildAnnotationPatch, buildBrief, formatBrief, newAnnotationId } from "./index";

function load(file: string): CovenantDoc {
  const parsed = parseDocument(readFileSync(file, "utf8"), file);
  if (!parsed.doc) throw new Error(`解析失败: ${file}`);
  return parsed.doc;
}

describe("review brief", () => {
  it("统计与未决批注正确", () => {
    const brief = buildBrief(load("examples/payments-arch.cvn.yaml"));
    expect(brief.doc).toBe("payments/containers");
    expect(brief.stats.elements).toBeGreaterThan(5);
    expect(brief.stats.open).toBeGreaterThan(0);
    expect(brief.openAnnotations.length).toBe(brief.stats.open);
  });

  it("把 human 的 ai_hint 带进简报", () => {
    const brief = buildBrief(load("examples/payments-arch.cvn.yaml"));
    const withHint = brief.openAnnotations.filter((a) => a.aiHint.length > 0);
    expect(withHint.length).toBeGreaterThan(0);
  });

  it("生成待答问题且确定性", () => {
    const doc = load("examples/payments-arch.cvn.yaml");
    const a = buildBrief(doc);
    const b = buildBrief(doc);
    expect(a).toEqual(b);
    expect(a.questions.length).toBeGreaterThan(0);
  });

  it("markdown 含关键小节与写回指引", () => {
    const md = formatBrief(buildBrief(load("examples/payments-arch.cvn.yaml")));
    expect(md).toContain("## 未决批注");
    expect(md).toContain("## 待回答的问题");
    expect(md).toContain("ai_hint");
    expect(md).toContain("禁止写");
  });
});

describe("AI 批注补丁", () => {
  const doc = load("examples/payments-arch.cvn.yaml");

  it("合法输入生成的补丁能过门禁", () => {
    const r = buildAnnotationPatch({
      doc,
      actor: "ai:claude",
      targetId: "e.gateway",
      title: "限流策略缺少上限",
      body: "props 里没有 rate_limit",
    });
    expect(r.findings).toEqual([]);
    expect(r.patch!.ops).toHaveLength(1);
    expect(r.patch!.doc).toBe(doc.id);
    expect(r.patch!.base_rev).toBe(doc.meta?.rev ?? 0);
    const gate = gatePatch(doc, r.patch!, { actor: parseActor("ai:claude")! });
    expect(gate).toEqual([]);
    const value = r.patch!.ops[0]!.value as Record<string, unknown>;
    expect(value.author).toBe("ai:claude");
    expect(value.ai_hint).toBeUndefined();
  });

  it("拒绝 human 身份", () => {
    const r = buildAnnotationPatch({ doc, actor: "human:lily", targetId: "e.gateway", title: "x" });
    expect(r.patch).toBeUndefined();
    expect(r.findings.map((f) => f.code)).toContain("ai/actor");
  });

  it("拒绝不存在的目标", () => {
    const r = buildAnnotationPatch({ doc, actor: "ai:claude", targetId: "e.nope", title: "x" });
    expect(r.findings.map((f) => f.code)).toContain("ai/target");
  });

  it("拒绝空标题", () => {
    const r = buildAnnotationPatch({ doc, actor: "ai:claude", targetId: "e.gateway", title: "  " });
    expect(r.findings.map((f) => f.code)).toContain("ai/title");
  });

  it("支持批注到关系", () => {
    const r = buildAnnotationPatch({
      doc,
      actor: "ai:claude",
      targetId: "r.pay-ledger",
      title: "两阶段提交风险",
    });
    expect(r.targetKind).toBe("relation");
    expect(r.findings).toEqual([]);
  });

  it("newAnnotationId 符合 schema 的 ID 规则", () => {
    const id = newAnnotationId();
    expect(id).toMatch(/^a\.[0-9A-HJKMNP-TV-Z]{12,26}$/);
    expect(id).toHaveLength(28);
  });
});
