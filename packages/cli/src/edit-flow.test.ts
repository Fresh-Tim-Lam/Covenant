import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { performEdit } from "./edit-flow";

const CVN = `covenant: "0.1"
id: t/edit-flow
profile: c4-container@1
meta:
  title: Edit Flow
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

function project(): { dir: string; docPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "covenant-edit-flow-"));
  const docs = join(dir, "docs");
  mkdirSync(docs, { recursive: true });
  const docPath = join(docs, "flow.cvn.yaml");
  writeFileSync(docPath, CVN);
  return { dir, docPath };
}

function edits(ops: unknown[], extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    covenant: "0.1",
    doc: "t/edit-flow",
    base_rev: 1,
    actor: "human:you",
    ops,
    ...extra,
  });
}

const rename = [{ op: "set", path: "/elements/e.a/name", value: "A2" }];

describe("编辑落盘流程（CLI 与 serve 共用）", () => {
  it("预览：生成 .edited 文件与 diff，原文件不变", () => {
    const { docPath } = project();
    const r = performEdit({ docPath, editsText: edits(rename), accept: false });
    expect(r.ok).toBe(true);
    expect(r.changed).toBe(1);
    expect(r.out!.endsWith("flow.edited.cvn.yaml")).toBe(true);
    expect(existsSync(r.out!)).toBe(true);
    // git 可用时是 git diff，否则回退内置 diff；两者都必须包含变更
    expect(r.diff.includes("diff --git") || r.diff.includes("@@")).toBe(true);
    expect(r.diff).toContain("+    name: A2");
    expect(readFileSync(docPath, "utf8")).toContain("name: A\n");
  });

  it("accept：rev+1、写回、备份、审计、diff 标注来源", () => {
    const { docPath } = project();
    const r = performEdit({ docPath, editsText: edits(rename), accept: true });
    expect(r.ok).toBe(true);
    expect(r.rev).toBe(2);
    expect(existsSync(r.backup!)).toBe(true);
    const text = readFileSync(docPath, "utf8");
    expect(text).toContain("A2");
    expect(text).toContain("rev: 2");
    const auditDir = join(docPath, "..", ".audit");
    const audit = readdirSync(auditDir).filter((f) => f.startsWith("edit-"));
    expect(audit.length).toBeGreaterThan(0);
    expect(["git", "internal"]).toContain(r.diffKind);
    expect(r.diff.length).toBeGreaterThan(0);
  });

  it("AI actor 被拒绝（human-only）", () => {
    const { docPath } = project();
    const r = performEdit({ docPath, editsText: edits(rename, { actor: "ai:bot" }), accept: false });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("human");
  });

  it("base_rev 不匹配被拒绝", () => {
    const { docPath } = project();
    const r = performEdit({ docPath, editsText: edits(rename, { base_rev: 7 }), accept: false });
    expect(r.ok).toBe(false);
    expect(r.findings.map((f) => f.code)).toContain("edit/base-rev");
  });

  it("非法字段（kind）被拒绝，且不写盘", () => {
    const { docPath } = project();
    const r = performEdit({
      docPath,
      editsText: edits([{ op: "set", path: "/elements/e.a/kind", value: "datastore" }]),
      accept: false,
    });
    expect(r.ok).toBe(false);
    expect(existsSync(docPath.replace(/\.cvn\.yaml$/, ".edited.cvn.yaml"))).toBe(false);
  });
});
