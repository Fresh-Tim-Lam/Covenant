/**
 * 补丁模型与输入解析：`Patch` / `PatchOp` 契约、JSON 解析、操作分类。
 *
 * 模型与共用诊断构造器放在最底层：gate.ts 只做纯校验、apply.ts 只做文本落盘，
 * 二者都从本文件取类型，避免同目录循环依赖。
 */
import type { Finding } from "@covenant/core";

export interface PatchOp {
  op: string;
  path: string;
  value: unknown;
}

export interface Patch {
  covenant: string;
  doc: string;
  base_rev: number;
  intent: string;
  ops: PatchOp[];
}

/** 状态流转（replace /annotations/<id>/status）的解析结果 */
export interface StatusOp {
  id: string;
  status: string;
}

/** 补丁模块统一的 L4 Finding 构造器（与 validate 的 finding 同形） */
export const finding = (
  code: string,
  message: string,
  fixHint?: string,
): Finding => ({ code, level: "L4", severity: "error", message, fixHint });

export const STATUS_PATH = /^\/annotations\/([^/]+)\/status$/;
export const REMOVE_PATH = /^\/annotations\/([^/]+)$/;

/** 把补丁操作分成：新增批注 / 状态流转 / 未知 */
export interface AnnotationEdit {
  id: string;
  value: Record<string, unknown>;
}

export function classifyOps(ops: PatchOp[]): {
  adds: PatchOp[];
  statuses: StatusOp[];
  removes: string[];
  edits: AnnotationEdit[];
  unknown: PatchOp[];
} {
  const adds: PatchOp[] = [];
  const statuses: StatusOp[] = [];
  const removes: string[] = [];
  const edits: AnnotationEdit[] = [];
  const unknown: PatchOp[] = [];
  for (const op of ops ?? []) {
    if (op.op === "add" && op.path === "/annotations/-") {
      adds.push(op);
      continue;
    }
    const m = STATUS_PATH.exec(op.path ?? "");
    if (op.op === "replace" && m) {
      statuses.push({ id: m[1]!, status: String(op.value) });
      continue;
    }
    const rm = REMOVE_PATH.exec(op.path ?? "");
    if (op.op === "remove" && rm) {
      removes.push(rm[1]!);
      continue;
    }
    if (op.op === "replace" && rm) {
      edits.push({ id: rm[1]!, value: (op.value ?? {}) as Record<string, unknown> });
      continue;
    }
    unknown.push(op);
  }
  return { adds, statuses, removes, edits, unknown };
}

export function parsePatch(text: string, file = "patch.json"): { patch?: Patch; findings: Finding[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { findings: [finding("patch/json", `补丁不是合法 JSON: ${(e as Error).message}`)] };
  }
  const p = data as Partial<Patch>;
  const findings: Finding[] = [];
  if (typeof p.doc !== "string") findings.push(finding("patch/schema", "缺少 doc"));
  if (typeof p.base_rev !== "number") findings.push(finding("patch/schema", "缺少 base_rev"));
  if (typeof p.intent !== "string") findings.push(finding("patch/schema", "缺少 intent"));
  if (!Array.isArray(p.ops)) findings.push(finding("patch/schema", "缺少 ops 数组"));
  if (findings.length > 0) return { findings };
  return { patch: p as Patch, findings: [] };
}
