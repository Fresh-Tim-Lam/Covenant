/**
 * 图编辑（v0）：受控语义编辑 → 生成新文件 + 统一 diff，供人工审查后合入。
 *
 * 为什么不是"网页直接写 YAML"：
 *  - `.cvn.yaml` 是唯一事实源，直接写会破坏补丁门禁与审计；
 *  - 保注释的 YAML 行级编辑复杂且易错；
 *  - 用户要的是"后端处理好 git diff"——先生成待审查的新文件与 diff，再合入。
 *
 * 编辑范围（v0）：元素 name/summary/tech；关系 summary；视图 pins（节点位置）。
 * 不做：增删元素/关系、改 kind、改剖面（这些是 breaking，需批准流程）。
 */
import yaml from "js-yaml";
import type { CovenantDoc, Finding } from "@covenant/core";

export interface EditOp {
  op: "set";
  /** /elements/<id>/<field> | /relations/<id>/<field> | /views/<id>/layout/pins/<elementId> */
  path: string;
  value: unknown;
}

export interface EditFile {
  covenant: "0.1";
  doc: string;
  base_rev?: number;
  actor?: string;
  intent?: string;
  ops: EditOp[];
}

const finding = (code: string, message: string, fixHint?: string): Finding => ({
  code,
  level: "L4",
  severity: "error",
  message,
  fixHint,
});

export function parseEdits(text: string): { edits?: EditFile; findings: Finding[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { findings: [finding("edit/json", `编辑文件不是合法 JSON：${(e as Error).message}`)] };
  }
  if (!data || typeof data !== "object") {
    return { findings: [finding("edit/json", "编辑文件必须是对象")] };
  }
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.ops) || obj.ops.length === 0) {
    return { findings: [finding("edit/ops", "ops 必须是非空数组")] };
  }
  for (const [i, op] of obj.ops.entries()) {
    const o = op as Record<string, unknown>;
    if (o.op !== "set" || typeof o.path !== "string") {
      return { findings: [finding("edit/op", `ops[${i}] 只支持 {op:"set", path, value}`)] };
    }
  }
  return { edits: data as EditFile, findings: [] };
}

const EDITABLE_FIELDS: Record<"element" | "relation", string[]> = {
  element: ["name", "summary", "tech"],
  relation: ["summary"],
};

export interface ApplyEditsResult {
  doc?: CovenantDoc;
  changed: number;
  findings: Finding[];
}

/** 应用编辑 op；不修改入参（返回新文档对象）。 */
export function applyEdits(doc: CovenantDoc, edits: EditFile): ApplyEditsResult {
  const findings: Finding[] = [];
  const next: CovenantDoc = JSON.parse(JSON.stringify(doc));
  let changed = 0;

  if (edits.doc && edits.doc !== doc.id) {
    findings.push(
      finding("edit/doc", `编辑文件 doc="${edits.doc}" 与文档 id="${doc.id}" 不一致`, "确认编辑对象"),
    );
  }
  if (
    typeof edits.base_rev === "number" &&
    typeof doc.meta?.rev === "number" &&
    edits.base_rev !== doc.meta.rev
  ) {
    findings.push(
      finding(
        "edit/base-rev",
        `base_rev=${edits.base_rev} 与文档 rev=${doc.meta.rev} 不一致（文档已变更）`,
        "基于最新版本重新导出编辑",
      ),
    );
  }

  for (const op of edits.ops) {
    const parts = op.path.split("/").filter((p) => p.length > 0);
    if (parts[0] === "elements" || parts[0] === "relations") {
      const kind = parts[0] === "elements" ? "element" : "relation";
      const [, id, field, ...rest] = parts;
      if (!id || !field || rest.length > 0) {
        findings.push(finding("edit/path", `无法解析路径 ${op.path}`, "形如 /elements/<id>/<field>"));
        continue;
      }
      const allowed = EDITABLE_FIELDS[kind];
      if (!allowed.includes(field)) {
        findings.push(
          finding("edit/field", `${kind}.${field} 不允许编辑（允许：${allowed.join(", ")}）`),
        );
        continue;
      }
      const list = (kind === "element" ? next.elements : next.relations) ?? [];
      const target = list.find((x) => x.id === id);
      if (!target) {
        findings.push(finding("edit/target", `${kind} ${id} 不存在`));
        continue;
      }
      if (typeof op.value !== "string" || op.value.trim() === "") {
        findings.push(finding("edit/value", `${op.path} 的值必须是非空字符串`));
        continue;
      }
      (target as unknown as Record<string, unknown>)[field] = op.value.trim();
      changed++;
      continue;
    }

    if (parts[0] === "views" && parts[2] === "layout" && parts[3] === "pins") {
      const [, viewId, , , elementId] = parts;
      if (!viewId || !elementId) {
        findings.push(finding("edit/path", `无法解析 pins 路径 ${op.path}`));
        continue;
      }
      const view = (next.views ?? []).find((v) => v.id === viewId);
      if (!view) {
        findings.push(finding("edit/target", `view ${viewId} 不存在`));
        continue;
      }
      if (!Array.isArray(op.value) || op.value.length !== 2 || !op.value.every((n) => typeof n === "number")) {
        findings.push(finding("edit/value", `${op.path} 的值必须是 [x, y] 数字对`));
        continue;
      }
      view.layout = view.layout ?? {};
      view.layout.pins = { ...(view.layout.pins ?? {}), [elementId]: [op.value[0] as number, op.value[1] as number] };
      changed++;
      continue;
    }

    findings.push(
      finding(
        "edit/path",
        `不支持的编辑路径 ${op.path}`,
        "v0 支持 /elements/<id>/{name,summary,tech}、/relations/<id>/summary、/views/<id>/layout/pins/<elementId>",
      ),
    );
  }

  if (findings.length > 0) return { changed, findings };
  return { doc: next, changed, findings: [] };
}

/** 序列化为 YAML（会丢注释——所以只用于生成待审查的新文件） */
export function serializeDoc(doc: CovenantDoc, header?: string): string {
  const body = yaml.dump(doc as unknown, {
    schema: yaml.CORE_SCHEMA,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
  const prefix = header ?? "# 由 covenant edit 生成：待审查的新文件（原文件未被修改）\n";
  return prefix + body;
}

/** 生成统一 diff（无 git 依赖；行级 LCS） */
export function unifiedDiff(
  before: string,
  after: string,
  opts: { fromLabel?: string; toLabel?: string; context?: number } = {},
): string {
  const a = before.split(/\r?\n/);
  const b = after.split(/\r?\n/);
  const n = a.length;
  const m = b.length;
  // LCS 表（文件量级：千行内可接受）
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  type Line = { type: " " | "-" | "+"; text: string };
  const lines: Line[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      lines.push({ type: " ", text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
      lines.push({ type: "-", text: a[i]! });
      i++;
    } else {
      lines.push({ type: "+", text: b[j]! });
      j++;
    }
  }
  while (i < n) lines.push({ type: "-", text: a[i++]! });
  while (j < m) lines.push({ type: "+", text: b[j++]! });

  const changed = lines.some((l) => l.type !== " ");
  if (!changed) return "";

  const ctx = opts.context ?? 3;
  const out: string[] = [`--- ${opts.fromLabel ?? "a"}`, `+++ ${opts.toLabel ?? "b"}`];
  // 找出变更行，按 context 分组
  const idx = lines.map((l, k) => (l.type !== " " ? k : -1)).filter((k) => k >= 0);
  let cursor = 0;
  while (cursor < idx.length) {
    const start = Math.max(0, idx[cursor]! - ctx);
    let end = Math.min(lines.length - 1, idx[cursor]! + ctx);
    let next = cursor + 1;
    while (next < idx.length && idx[next]! - ctx <= end + 1) {
      end = Math.min(lines.length - 1, idx[next]! + ctx);
      next++;
    }
    const slice = lines.slice(start, end + 1);
    const oldStart = lines.slice(0, start).filter((l) => l.type !== "+").length + 1;
    const newStart = lines.slice(0, start).filter((l) => l.type !== "-").length + 1;
    const oldCount = slice.filter((l) => l.type !== "+").length;
    const newCount = slice.filter((l) => l.type !== "-").length;
    out.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const l of slice) out.push(`${l.type}${l.text}`);
    cursor = next;
  }
  return out.join("\n") + "\n";
}
