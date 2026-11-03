import { describe, expect, it } from "vitest";
import type { CovenantDoc } from "@covenant/core";
import { diffDocs, formatDiff } from "./index";

function base(): CovenantDoc {
  return {
    covenant: "0.1",
    id: "t/x",
    profile: "c4-container@1",
    meta: { title: "T", purpose: "p", non_goals: [] },
    elements: [
      { id: "e.a", kind: "container", name: "A", summary: "a", tech: "ts" },
      { id: "e.b", kind: "datastore", name: "B", summary: "b", tech: "pg", props: { storage_kind: "rdbms" } },
    ],
    relations: [{ id: "r.ab", kind: "writes", from: "e.a", to: "e.b", summary: "w" }],
    views: [{ id: "v.main", title: "M" }],
    annotations: [
      {
        id: "a.01JAXTEST0001AAAA0001",
        target: { kind: "element", id: "e.a" },
        type: "risk",
        severity: "low",
        title: "t",
        status: "open",
        author: "human:lily",
        created: "2026-11-03T00:00:00+08:00",
      },
    ],
  };
}

const clone = (): CovenantDoc => structuredClone(base());
const kinds = (r: ReturnType<typeof diffDocs>): string[] => r.changes.map((c) => c.kind);

describe("diffDocs 分类", () => {
  it("相同文档无变更", () => {
    const r = diffDocs(base(), clone());
    expect(r.changes).toEqual([]);
    expect(r.needsApproval).toBe(false);
  });

  it("新增元素 → material", () => {
    const b = clone();
    b.elements!.push({ id: "e.c", kind: "container", name: "C", summary: "c", tech: "ts" });
    const r = diffDocs(base(), b);
    expect(kinds(r)).toContain("element-added");
    expect(r.summary.material).toBe(1);
    expect(r.needsApproval).toBe(false);
  });

  it("删除元素 → breaking 且需批准", () => {
    const b = clone();
    b.elements = b.elements!.filter((e) => e.id !== "e.b");
    b.relations = [];
    const r = diffDocs(base(), b);
    expect(kinds(r)).toContain("element-removed");
    expect(kinds(r)).toContain("relation-removed");
    expect(r.needsApproval).toBe(true);
  });

  it("元素 kind 变化 → breaking", () => {
    const b = clone();
    b.elements![0]!.kind = "external-system";
    expect(kinds(diffDocs(base(), b))).toContain("element-kind-changed");
    expect(diffDocs(base(), b).needsApproval).toBe(true);
  });

  it("tech 变化 → material", () => {
    const b = clone();
    b.elements![0]!.tech = "rust";
    const r = diffDocs(base(), b);
    expect(kinds(r)).toContain("element-tech-changed");
    expect(r.summary.material).toBe(1);
  });

  it("名称/摘要变化 → cosmetic", () => {
    const b = clone();
    b.elements![0]!.name = "A2";
    b.elements![0]!.summary = "a2";
    const r = diffDocs(base(), b);
    expect(kinds(r)).toContain("element-name-changed");
    expect(kinds(r)).toContain("element-summary-changed");
    expect(r.summary.cosmetic).toBe(2);
    expect(r.summary.breaking).toBe(0);
  });

  it("关系 kind 变化 → breaking", () => {
    const b = clone();
    b.relations![0]!.kind = "reads";
    const r = diffDocs(base(), b);
    expect(kinds(r)).toContain("relation-kind-changed");
    expect(r.needsApproval).toBe(true);
  });

  it("关系端点变化 → breaking", () => {
    const b = clone();
    b.relations![0]!.to = "e.a";
    expect(kinds(diffDocs(base(), b))).toContain("relation-to-changed");
  });

  it("批注状态变化 → cosmetic", () => {
    const b = clone();
    b.annotations![0]!.status = "resolved";
    const r = diffDocs(base(), b);
    expect(kinds(r)).toContain("annotation-status-changed");
    expect(r.summary.cosmetic).toBe(1);
    expect(r.needsApproval).toBe(false);
  });

  it("剖面变化 → breaking", () => {
    const b = clone();
    b.profile = "dfd@1";
    expect(kinds(diffDocs(base(), b))).toContain("profile-changed");
  });

  it("视图布局变化 → cosmetic", () => {
    const b = clone();
    b.views![0]!.layout = { direction: "DOWN" };
    expect(kinds(diffDocs(base(), b))).toContain("view-layout-changed");
  });

  it("输出稳定：breaking 在前，且两次一致", () => {
    const b = clone();
    b.elements![0]!.name = "A2";
    b.relations![0]!.kind = "reads";
    const r1 = diffDocs(base(), b);
    const r2 = diffDocs(base(), b);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    if (r1.changes.length > 1) expect(r1.changes[0]!.class).toBe("breaking");
  });

  it("formatDiff 输出摘要与批准提示", () => {
    const b = clone();
    b.relations![0]!.kind = "reads";
    const text = formatDiff(diffDocs(base(), b), "a.yaml", "b.yaml");
    expect(text).toContain("covenant diff");
    expect(text).toContain("BREAKING");
    expect(text).toContain("需要人工批准");
  });
});
