import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDocument } from "@covenant/core";
import { checkDocument } from "@covenant/validate";
import {
  annotationYaml,
  appendAnnotations,
  applyPatch,
  applyStatusChanges,
  bumpRev,
  classifyOps,
  gatePatch,
  parseActor,
  parsePatch,
} from "./index";
import type { Patch } from "./index";

const firstValue = (p: Patch): Record<string, unknown> =>
  p.ops[0]!.value as Record<string, unknown>;

const DOC = `covenant: "0.1"
id: t/apply
profile: c4-container@1
meta:
  title: 测试
  purpose: p
  non_goals: []
  rev: 3
elements:
  - id: e.a
    kind: container
    name: A
    summary: a
    tech: ts
  - id: e.b
    kind: datastore
    name: B
    summary: b
    tech: pg
    props: { storage_kind: rdbms }
relations:
  - id: r.ab
    kind: writes
    from: e.a
    to: e.b
    summary: w
views:
  - id: v.main
    title: m
annotations:
  # 这条注释必须被保留
  - id: "a.01JAX9K3Q7P2"
    target: {"kind":"element","id":"e.a"}
    type: "risk"
    severity: "high"
    title: "旧批注"
    status: "open"
    author: "human:lily"
    created: "2026-11-03T00:00:00+08:00"
`;

const NEW_ID = "a.01JAX9K3Q7P2AAAABBBBCCCCDD";

function setup(): { dir: string; docPath: string } {
  const dir = mkdtempSync(join(tmpdir(), "covenant-patch-"));
  const docPath = join(dir, "t.cvn.yaml");
  writeFileSync(docPath, DOC, "utf8");
  return { dir, docPath };
}

function patch(overrides: Partial<Patch> = {}): Patch {
  return {
    covenant: "0.1",
    doc: "t/apply",
    base_rev: 3,
    intent: "测试应用",
    ops: [
      {
        op: "add",
        path: "/annotations/-",
        value: {
          id: NEW_ID,
          target: { kind: "element", id: "e.b" },
          type: "risk",
          severity: "medium",
          title: "新批注",
          body: "证据",
          status: "open",
          author: "human:you",
          created: "2026-11-03T01:00:00+08:00",
          ai_hint: "改为异步",
        },
      },
    ],
    ...overrides,
  };
}

describe("appendAnnotations / bumpRev", () => {
  it("追加批注不破坏既有注释与其余字节", () => {
    const next = appendAnnotations(DOC, [
      { id: NEW_ID, target: { kind: "element", id: "e.b" }, type: "risk", severity: "low", title: "t", status: "open", author: "human:you", created: "2026-11-03T00:00:00+08:00" },
    ]);
    expect(next).toContain("# 这条注释必须被保留");
    expect(next).toContain("旧批注");
    expect(next).toContain("新批注".length > 0 ? NEW_ID : "");
    expect(next).not.toContain("\r\n");
  });

  it("bumpRev 只改 rev 行", () => {
    const next = bumpRev(DOC);
    expect(next).toContain("  rev: 4");
    expect(next.replace("  rev: 4", "  rev: 3")).toBe(DOC);
  });

  it("annotationYaml 生成可被重新解析的 YAML 片段", () => {
    const block = annotationYaml({
      id: NEW_ID,
      target: { kind: "element", id: "e.b" },
      type: "risk",
      severity: "low",
      title: '含 "引号" 与 #井号',
      status: "open",
      author: "human:you",
      created: "2026-11-03T00:00:00+08:00",
    });
    const wrapped = `x:\n${block}\n`;
    const parsed = parseDocument(wrapped, "t.none");
    expect(parsed.doc).toBeDefined();
    const list = (parsed.doc as unknown as { x: { title: string }[] }).x;
    expect(list[0]!.title).toBe('含 "引号" 与 #井号');
  });
});

describe("applyPatch", () => {
  it("成功应用：rev+1、批注落盘、审计记录两条（intent/commit）、校验通过", () => {
    const { dir, docPath } = setup();
    const result = applyPatch(docPath, patch(), { by: "human:lily" });
    expect(result.ok).toBe(true);
    expect(result.newRev).toBe(4);

    const text = readFileSync(docPath, "utf8");
    expect(text).toContain("  rev: 4");
    expect(text).toContain("新批注");
    expect(text).toContain("ai_hint");

    const parsed = parseDocument(text, docPath);
    expect(parsed.doc).toBeDefined();
    expect(checkDocument(parsed.doc!, docPath).filter((f) => f.severity === "error")).toHaveLength(0);

    const auditFile = join(dir, ".audit");
    expect(existsSync(auditFile)).toBe(true);
  });

  it("base_rev 不匹配时拒绝，且原件不变", () => {
    const { docPath } = setup();
    const result = applyPatch(docPath, patch({ base_rev: 2 }));
    expect(result.ok).toBe(false);
    expect(result.findings[0]!.code).toBe("patch/base-rev");
    expect(readFileSync(docPath, "utf8")).toBe(DOC);
  });

  it("拒绝非 /annotations/- 的操作", () => {
    const { docPath } = setup();
    const result = applyPatch(
      docPath,
      patch({ ops: [{ op: "replace", path: "/meta/owners", value: { x: 1 } }] }),
    );
    expect(result.ok).toBe(false);
    expect(result.findings[0]!.code).toBe("patch/op");
    expect(readFileSync(docPath, "utf8")).toBe(DOC);
  });

  it("应用后不合法则中止（标题为空），原件不变", () => {
    const { docPath } = setup();
    const bad = patch();
    firstValue(bad).title = "";
    const result = applyPatch(docPath, bad);
    expect(result.ok).toBe(false);
    expect(result.findings.map((f) => f.code)).toContain("patch/would-invalidate");
    expect(readFileSync(docPath, "utf8")).toBe(DOC);
  });

  it("dry-run 不写盘但返回渲染结果", () => {
    const { docPath } = setup();
    const result = applyPatch(docPath, patch(), { dryRun: true });
    expect(result.ok).toBe(true);
    expect(result.rendered).toContain("新批注");
    expect(readFileSync(docPath, "utf8")).toBe(DOC);
  });

  it("doc id 不匹配时拒绝", () => {
    const { docPath } = setup();
    const result = applyPatch(docPath, patch({ doc: "other/doc" }));
    expect(result.ok).toBe(false);
    expect(result.findings[0]!.code).toBe("patch/target");
  });
});

describe("parsePatch", () => {
  it("合法补丁可解析", () => {
    const { patch: p, findings } = parsePatch(JSON.stringify(patch()));
    expect(findings).toHaveLength(0);
    expect(p?.doc).toBe("t/apply");
  });
  it("缺字段报 schema 错误", () => {
    const { findings } = parsePatch(JSON.stringify({ covenant: "0.1" }));
    expect(findings.length).toBeGreaterThan(0);
  });
  it("非法 JSON 报错", () => {
    expect(parsePatch("{oops").findings[0]!.code).toBe("patch/json");
  });
});

const codes = (fs: { code: string }[]): string[] => fs.map((f) => f.code);

function fixtureDoc() {
  const parsed = parseDocument(DOC, "t.cvn.yaml");
  if (!parsed.doc) throw new Error("fixture 不合法");
  return parsed.doc;
}

describe("gatePatch（Agent 信任边界）", () => {
  const human = parseActor("human:you")!;
  const ai = parseActor("ai:claude")!;

  it("人类合法补丁放行", () => {
    expect(gatePatch(fixtureDoc(), patch(), { actor: human })).toEqual([]);
  });

  it("AI 以 ai:* 署名且不写 ai_hint 时放行", () => {
    const p = patch();
    firstValue(p).author = "ai:claude";
    delete firstValue(p).ai_hint;
    expect(gatePatch(fixtureDoc(), p, { actor: ai })).toEqual([]);
  });

  it("AI 冒充 human 被拒", () => {
    const p = patch();
    firstValue(p).author = "human:lily";
    expect(codes(gatePatch(fixtureDoc(), p, { actor: ai }))).toContain("gate/impersonation");
  });

  it("AI 写 ai_hint 被拒", () => {
    const p = patch();
    firstValue(p).author = "ai:claude";
    expect(codes(gatePatch(fixtureDoc(), p, { actor: ai }))).toContain("gate/ai-hint");
  });

  it("base_rev 过期被拒", () => {
    expect(codes(gatePatch(fixtureDoc(), patch({ base_rev: 1 }), { actor: human }))).toContain(
      "gate/stale",
    );
  });

  it("目标不存在被拒", () => {
    const p = patch();
    firstValue(p).target = { kind: "element", id: "e.nope" };
    expect(codes(gatePatch(fixtureDoc(), p, { actor: human }))).toContain("gate/target");
  });

  it("重复 id 被拒（与既有批注冲突）", () => {
    const p = patch();
    firstValue(p).id = "a.01JAX9K3Q7P2";
    expect(codes(gatePatch(fixtureDoc(), p, { actor: human }))).toContain("gate/duplicate-id");
  });

  it("非 add /annotations/- 操作被拒", () => {
    const p = patch({ ops: [{ op: "replace", path: "/meta/rev", value: { x: 1 } }] });
    expect(codes(gatePatch(fixtureDoc(), p, { actor: human }))).toContain("gate/op");
  });

  it("人类署名与 actor 不一致被拒", () => {
    const p = patch();
    firstValue(p).author = "human:bob";
    expect(codes(gatePatch(fixtureDoc(), p, { actor: human }))).toContain("gate/actor");
  });

  it("intent 为空被拒", () => {
    expect(codes(gatePatch(fixtureDoc(), patch({ intent: " " }), { actor: human }))).toContain(
      "gate/intent",
    );
  });

  it("非法 enum 值被拒", () => {
    const p = patch();
    firstValue(p).severity = "critical";
    expect(codes(gatePatch(fixtureDoc(), p, { actor: human }))).toContain("gate/severity");
  });
});

const EXISTING = "a.01JAX9K3Q7P2";
const AT = "2026-11-03T13:00:00+08:00";

function statusPatch(id: string, status: string, baseRev = 3): Patch {
  return {
    covenant: "0.1",
    doc: "t/apply",
    base_rev: baseRev,
    intent: `状态流转 ${status}`,
    ops: [{ op: "replace", path: `/annotations/${id}/status`, value: status }],
  };
}

describe("批注状态流转", () => {
  it("classifyOps 区分新增/流转/未知", () => {
    const r = classifyOps([
      { op: "add", path: "/annotations/-", value: {} },
      { op: "replace", path: `/annotations/${EXISTING}/status`, value: "ack" },
      { op: "remove", path: "/elements/0", value: {} },
    ]);
    expect(r.adds).toHaveLength(1);
    expect(r.statuses).toEqual([{ id: EXISTING, status: "ack" }]);
    expect(r.unknown).toHaveLength(1);
  });

  it("open→ack：文本更新 status/updated，注释保留", () => {
    const next = applyStatusChanges(DOC, [{ id: EXISTING, status: "ack" }], "human:you", AT);
    expect(next).toContain('    status: "ack"');
    expect(next).toContain('    updated: "2026-11-03T13:00:00+08:00"');
    expect(next).toContain("# 这条注释必须被保留");
    expect(next).toContain("旧批注");
  });

  it("resolved：写入 resolution 映射；reopen 时移除", () => {
    const resolved = applyStatusChanges(DOC, [{ id: EXISTING, status: "resolved" }], "human:lily", AT);
    expect(resolved).toContain('    status: "resolved"');
    expect(resolved).toContain('"by":"human:lily"');
    const reopened = applyStatusChanges(resolved, [{ id: EXISTING, status: "open" }], "human:lily", AT);
    expect(reopened).toContain('    status: "open"');
    expect(reopened).not.toContain("    resolution:");
  });

  it("applyPatch 应用状态流转：rev+1 且校验通过", () => {
    const { docPath } = setup();
    const result = applyPatch(docPath, statusPatch(EXISTING, "ack"), { by: "human:you" });
    expect(result.ok).toBe(true);
    expect(result.newRev).toBe(4);
    const text = readFileSync(docPath, "utf8");
    expect(text).toContain('    status: "ack"');
    const parsed = parseDocument(text, docPath);
    expect(parsed.doc).toBeDefined();
    expect(checkDocument(parsed.doc!, docPath).filter((f) => f.severity === "error")).toHaveLength(0);
  });

  it("applyPatch 混合 add + 状态流转", () => {
    const { docPath } = setup();
    const p = patch();
    p.ops.push({ op: "replace", path: `/annotations/${EXISTING}/status`, value: "wontfix" });
    const result = applyPatch(docPath, p, { by: "human:you" });
    expect(result.ok).toBe(true);
    const text = readFileSync(docPath, "utf8");
    expect(text).toContain("新批注");
    expect(text).toContain('    status: "wontfix"');
    expect(text).toContain("    resolution:");
  });

  it("门禁：人类 ack 放行", () => {
    expect(gatePatch(fixtureDoc(), statusPatch(EXISTING, "ack"), { actor: parseActor("human:you")! })).toEqual([]);
  });

  it("门禁：AI 改状态被拒", () => {
    const fs = gatePatch(fixtureDoc(), statusPatch(EXISTING, "ack"), { actor: parseActor("ai:claude")! });
    expect(codes(fs)).toContain("gate/status-actor");
  });

  it("门禁：非法流转被拒（resolved→ack）", () => {
    const d = fixtureDoc();
    (d.annotations![0] as { status: string }).status = "resolved";
    const fs = gatePatch(d, statusPatch(EXISTING, "ack"), { actor: parseActor("human:you")! });
    expect(codes(fs)).toContain("gate/transition");
  });

  it("门禁：状态目标批注不存在被拒", () => {
    const fs = gatePatch(fixtureDoc(), statusPatch("a.01JAXNONEXISTENT000", "ack"), {
      actor: parseActor("human:you")!,
    });
    expect(codes(fs)).toContain("gate/target");
  });
});
describe("删除批注（remove /annotations/<id>）", () => {
  const writeDoc = (): string => {
    const dir = mkdtempSync(join(tmpdir(), "cvn-remove-"));
    const p = join(dir, "d.cvn.yaml");
    writeFileSync(p, DOC);
    return p;
  };
  const patch = (): Patch => ({
    covenant: "0.1",
    doc: "t/apply",
    base_rev: 3,
    intent: "删除一条误加批注",
    ops: [{ op: "remove", path: "/annotations/a.01JAX9K3Q7P2", value: null }],
  });

  it("人类可删除；AI 删除被门禁拒绝", () => {
    const p = writeDoc();
    const parsed = parseDocument(readFileSync(p, "utf8"), p);
    const human = gatePatch(parsed.doc!, patch(), { actor: parseActor("human:lily")! });
    expect(human).toEqual([]);
    const codes = gatePatch(parsed.doc!, patch(), { actor: parseActor("ai:bot")! }).map((f) => f.code);
    expect(codes).toContain("gate/remove-actor");
  });

  it("应用后删除目标块、rev+1、其它注释保留、空列表规范化为 []", () => {
    const p = writeDoc();
    const r = applyPatch(p, patch(), { by: "human:lily" });
    expect(r.ok).toBe(true);
    expect(r.newRev).toBe(4);
    const text = readFileSync(p, "utf8");
    expect(text).not.toContain("a.01JAX9K3Q7P2");
    expect(text).toContain("这条注释必须被保留");
    expect(text).toContain("annotations: []");
    expect(text).toContain("rev: 4");
  });

  it("删除不存在的批注 → gate/target", () => {
    const p = writeDoc();
    const parsed = parseDocument(readFileSync(p, "utf8"), p);
    const bad: Patch = { ...patch(), ops: [{ op: "remove", path: "/annotations/a.01JAX0000000000000000", value: null }] };
    expect(gatePatch(parsed.doc!, bad, { actor: parseActor("human:lily")! }).map((f) => f.code)).toContain("gate/target");
  });
});
describe("编辑批注内容（replace /annotations/<id> 整块）", () => {
  const editValue = () => ({
    id: "a.01JAX9K3Q7P2",
    target: { kind: "element", id: "e.a" },
    type: "defect",
    severity: "low",
    title: "改后的标题",
    body: "改后的正文",
    status: "open",
    author: "human:lily",
    created: "2026-11-03T00:00:00+08:00",
    ai_hint: "人工补充指令",
  });
  const patch = (value: Record<string, unknown>): Patch => ({
    covenant: "0.1",
    doc: "t/apply",
    base_rev: 3,
    intent: "编辑批注内容",
    ops: [{ op: "replace", path: "/annotations/a.01JAX9K3Q7P2", value }],
  });

  it("人类可编辑；AI 被拒；改 author/created/status 被拒", () => {
    const p = setup();
    const parsed = parseDocument(readFileSync(p.docPath, "utf8"), p.docPath);
    expect(gatePatch(parsed.doc!, patch(editValue()), { actor: parseActor("human:lily")! })).toEqual([]);
    const ai = gatePatch(parsed.doc!, patch(editValue()), { actor: parseActor("ai:bot")! }).map((f) => f.code);
    expect(ai).toContain("gate/edit-actor");
    const tamper = gatePatch(
      parsed.doc!,
      patch({ ...editValue(), author: "human:other" }),
      { actor: parseActor("human:lily")! },
    ).map((f) => f.code);
    expect(tamper).toContain("gate/edit-author");
    const status = gatePatch(
      parsed.doc!,
      patch({ ...editValue(), status: "resolved" }),
      { actor: parseActor("human:lily")! },
    ).map((f) => f.code);
    expect(status).toContain("gate/edit-status");
  });

  it("应用后字段更新、注释保留、rev+1、身份字段不变", () => {
    const p = setup();
    const r = applyPatch(p.docPath, patch(editValue()), { by: "human:lily" });
    expect(r.ok).toBe(true);
    expect(r.newRev).toBe(4);
    const text = readFileSync(p.docPath, "utf8");
    expect(text).toContain("改后的标题");
    expect(text).toContain("改后的正文");
    expect(text).toContain('type: "defect"');
    expect(text).toContain('author: "human:lily"');
    expect(text).toContain("这条注释必须被保留");
    expect(text).toContain("rev: 4");
  });
});