/**
 * 补丁门禁（Agent 侧信任边界）
 *
 * 目标：在写入磁盘之前，用可判定的规则回答"这个补丁能不能被接受"。
 * 规则对应 docs/design/ai-trust-boundary.md 的 T1–T7：
 *   - AI 只能追加批注，不能修改/删除人的批注
 *   - AI 不得冒充 human:*，也不得写 human 专属的 ai_hint
 *   - 目标必须真实存在，ID 不得重复
 *
 * 纯函数：只吃文档/补丁/actor，不碰文件系统，也不做任何文本编辑。
 */
import type { CovenantDoc, Finding } from "@covenant/core";
import { finding, REMOVE_PATH, STATUS_PATH } from "./parse";
import type { Patch } from "./parse";

export interface Actor {
  kind: "human" | "ai";
  id: string;
}

export function parseActor(raw: string): Actor | null {
  if (raw.startsWith("human:")) return { kind: "human", id: raw };
  if (raw.startsWith("ai:")) return { kind: "ai", id: raw };
  return null;
}

export interface GateOptions {
  actor: Actor;
}

const ULID_ID = /^a\.[0-9A-HJKMNP-TV-Z]{12,26}$/;
const ANNOTATION_TYPES = ["risk", "question", "decision", "todo", "defect", "smell"];
const SEVERITIES = ["blocker", "high", "medium", "low"];
const STATUSES = ["open", "ack", "resolved", "wontfix", "superseded"];
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** 允许的状态流转（终态不可再变，除 reopen） */
const TRANSITIONS: Record<string, string[]> = {
  open: ["ack", "resolved", "wontfix"],
  ack: ["resolved", "wontfix", "open"],
  resolved: ["open"],
  wontfix: ["open"],
  superseded: [],
};

function targetExists(doc: CovenantDoc, kind: string, id: string): boolean {
  const sets: Record<string, Set<string> | undefined> = {
    element: new Set((doc.elements ?? []).map((e) => e.id)),
    relation: new Set((doc.relations ?? []).map((r) => r.id)),
    frame: new Set((doc.frames ?? []).map((f) => f.id)),
    view: new Set((doc.views ?? []).map((v) => v.id)),
  };
  return Boolean(sets[kind]?.has(id));
}

const IMPL_STATUSES = ["implemented", "partial", "planned", "not_connected", "unknown"];
const EVIDENCE_KINDS = ["doc", "code"];
const EVIDENCE_LINES = /^[0-9]+(-[0-9]+)?$/;

/**
 * 元素/关系等"带类型字段对象"的通用字段校验（纯函数，供 gate 在元素编辑协议开放时接线）。
 *
 * 覆盖 schema 里 impl_status / evidence / segment-kind 三条约定；
 * 不校验 path 存在性（格式层明确允许先写证据后补文件），也不做任何 IO。
 *
 * @param kind  对象类型：element / relation / frame / …（segment 仅 relation 合法）
 * @param value 待校验对象（元素/关系定义的原始字段）
 */
export function validateTypedObjectFields(
  kind: string,
  value: Record<string, unknown>,
): Finding[] {
  const out: Finding[] = [];
  const raw = (value ?? {}) as Record<string, unknown>;

  if (raw.impl_status !== undefined && !IMPL_STATUSES.includes(String(raw.impl_status))) {
    out.push(
      finding(
        "gate/impl-status",
        `impl_status "${String(raw.impl_status)}" 不在允许值内`,
        IMPL_STATUSES.join(" | "),
      ),
    );
  }

  if (raw.evidence !== undefined) {
    const evidence = raw.evidence;
    if (!Array.isArray(evidence)) {
      out.push(
        finding(
          "gate/evidence",
          "evidence 必须是数组",
          "evidence: [{ kind: doc|code, path, lines? }]",
        ),
      );
    } else {
      for (let i = 0; i < evidence.length; i++) {
        const item = (evidence[i] ?? {}) as Record<string, unknown>;
        const kindValue = item.kind;
        const pathValue = item.path;
        const hasKind = typeof kindValue === "string" && EVIDENCE_KINDS.includes(kindValue);
        const hasPath = typeof pathValue === "string" && pathValue.length > 0;
        if (!hasKind || !hasPath) {
          const miss = !hasKind && hasPath ? "kind（doc|code）" : !hasPath && hasKind ? "path" : "kind 与 path";
          out.push(
            finding(
              "gate/evidence",
              `evidence[${i}] 缺少或非法 ${miss}`,
              "每项必须包含 kind（doc|code）与 path（仓库相对 POSIX 路径）",
            ),
          );
          continue;
        }
        if (item.lines !== undefined && !(typeof item.lines === "string" && EVIDENCE_LINES.test(item.lines))) {
          out.push(
            finding(
              "gate/evidence-lines",
              `evidence[${i}].lines 必须是 "12" 或 "12-34"，实际 ${JSON.stringify(item.lines)}`,
              "lines 形如 12 或 12-34",
            ),
          );
        }
      }
    }
  }

  if (kind !== "relation" && raw.segment !== undefined) {
    out.push(
      finding(
        "gate/segment-kind",
        `segment 只能用于 relation 对象，实际 kind=${kind}`,
        "删除 segment，或把对象改为 relation",
      ),
    );
  }

  return out;
}

/** 纯函数：返回门禁 findings；空数组 = 放行 */
export function gatePatch(doc: CovenantDoc, patch: Patch, options: GateOptions): Finding[] {
  const out: Finding[] = [];
  const actor = options.actor;

  if (patch.doc !== doc.id) {
    out.push(finding("gate/target", `补丁目标 ${patch.doc} 与文档 id ${doc.id} 不一致`));
  }
  const rev = doc.meta?.rev ?? 0;
  if (patch.base_rev !== rev) {
    out.push(
      finding(
        "gate/stale",
        `补丁基于 rev ${patch.base_rev}，文档已是 rev ${rev}`,
        "让 Agent 重新导出补丁（基于最新 rev）",
      ),
    );
  }
  if (!patch.intent || !patch.intent.trim()) {
    out.push(finding("gate/intent", "补丁缺少 intent（无法审计）"));
  }
  if (!Array.isArray(patch.ops) || patch.ops.length === 0) {
    out.push(finding("gate/empty", "补丁没有任何操作"));
  }

  const existingIds = new Set((doc.annotations ?? []).map((a) => a.id));
  const seenIds = new Set<string>();

  for (const op of patch.ops ?? []) {
    if (op.op !== "add" || op.path !== "/annotations/-") {
      const rm = REMOVE_PATH.exec(op.path ?? "");
      if (op.op === "remove" && rm) {
        const id = rm[1]!;
        if (actor.kind === "ai") {
          out.push(finding("gate/remove-actor", "AI 不得删除批注（删除是人类权限）"));
        }
        if (!existingIds.has(id)) {
          out.push(finding("gate/target", `批注 ${id} 不存在`));
        }
        continue;
      }
      if (op.op === "replace" && rm) {
        const id = rm[1]!;
        const v = (op.value ?? {}) as Record<string, unknown>;
        if (actor.kind === "ai") {
          out.push(finding("gate/edit-actor", "AI 不得编辑批注内容（编辑是人类权限）"));
        }
        const ann = (doc.annotations ?? []).find((a) => a.id === id);
        if (!ann) {
          out.push(finding("gate/target", `批注 ${id} 不存在`));
          continue;
        }
        if (JSON.stringify(v.target ?? {}) !== JSON.stringify(ann.target)) {
          out.push(finding("gate/edit-target", "编辑不得改变批注指向的 target"));
        }
        if (String(v.author ?? "") !== ann.author) {
          out.push(finding("gate/edit-author", "编辑不得改 author"));
        }
        if (String(v.created ?? "") !== ann.created) {
          out.push(finding("gate/edit-created", "编辑不得改 created"));
        }
        if (String(v.status ?? "") !== ann.status) {
          out.push(finding("gate/edit-status", "整块编辑不得改 status；状态流转请用 replace .../status"));
        }
        if (!v.title || String(v.title).trim().length === 0) {
          out.push(finding("gate/title", "批注 title 不能为空"));
        }
        if (!ANNOTATION_TYPES.includes(String(v.type))) {
          out.push(finding("gate/type", `批注 type "${String(v.type)}" 不在允许值内`, ANNOTATION_TYPES.join(" | ")));
        }
        if (!SEVERITIES.includes(String(v.severity))) {
          out.push(finding("gate/severity", `批注 severity "${String(v.severity)}" 不在允许值内`, SEVERITIES.join(" | ")));
        }
        continue;
      }      const m = STATUS_PATH.exec(op.path ?? "");
      if (op.op === "replace" && m) {
        const id = m[1]!;
        const nextStatus = String(op.value);
        if (actor.kind === "ai") {
          out.push(
            finding(
              "gate/status-actor",
              "AI 不得变更批注状态（open/ack/resolved 是人类判断）",
              "AI 可以新增批注表达意见，状态流转由人做",
            ),
          );
        }
        const ann = (doc.annotations ?? []).find((a) => a.id === id);
        if (!ann) {
          out.push(finding("gate/target", `批注 ${id} 不存在`));
          continue;
        }
        if (!STATUSES.includes(nextStatus)) {
          out.push(finding("gate/status", `status "${nextStatus}" 不在允许值内`, STATUSES.join(" | ")));
          continue;
        }
        const allowed = TRANSITIONS[ann.status] ?? [];
        if (!allowed.includes(nextStatus)) {
          out.push(
            finding(
              "gate/transition",
              `不允许的状态流转 ${ann.status} → ${nextStatus}`,
              `允许：${allowed.join(" | ") || "无（终态）"}`,
            ),
          );
        }
        continue;
      }
      out.push(
        finding(
          "gate/op",
          `不允许的操作 ${op.op} ${op.path}`,
          "v0 门禁放行 add /annotations/- 与 replace /annotations/<id>/status；改语义必须走人工评审",
        ),
      );
      continue;
    }
    const v = (op.value ?? {}) as Record<string, unknown>;
    const id = String(v.id ?? "");
    if (!ULID_ID.test(id)) {
      out.push(finding("gate/annotation-id", `批注 id "${id}" 不合法（需 a. + 12–26 位 Crockford Base32）`, `元素 ${id}`));
    }
    if (existingIds.has(id) || seenIds.has(id)) {
      out.push(finding("gate/duplicate-id", `批注 id "${id}" 重复`));
    }
    seenIds.add(id);

    // 信任边界：AI 不得冒充人、不得写 human 专属字段
    const valueAuthor = String(v.author ?? "");
    if (actor.kind === "ai") {
      if (valueAuthor.startsWith("human:")) {
        out.push(finding("gate/impersonation", `AI 补丁不得以 "${valueAuthor}" 身份创建批注`, "author 必须为 ai:<agent-name>"));
      } else if (!valueAuthor.startsWith("ai:")) {
        out.push(finding("gate/author", `AI 补丁的 author 必须是 ai:*，实际为 "${valueAuthor}"`));
      }
      if (v.ai_hint) {
        out.push(
          finding(
            "gate/ai-hint",
            "AI 不得写入 ai_hint（该字段是人给 AI 的指令）",
            "把结论写进 body；ai_hint 只能由人填写",
          ),
        );
      }
    } else {
      if (valueAuthor.startsWith("ai:")) {
        out.push(finding("gate/impersonation", `人类补丁不得以 "${valueAuthor}" 身份创建批注`));
      }
      const authorId = valueAuthor.startsWith("human:") ? valueAuthor : `human:${valueAuthor}`;
      if (actor.id !== authorId) {
        out.push(
          finding("gate/actor", `补丁以 "${valueAuthor}" 署名，但操作者是 ${actor.id}`, "author 必须与 --actor 一致"),
        );
      }
    }

    // 语义字段
    if (!v.title || String(v.title).trim().length === 0) {
      out.push(finding("gate/title", "批注 title 不能为空"));
    }
    if (!ANNOTATION_TYPES.includes(String(v.type))) {
      out.push(finding("gate/type", `批注 type "${String(v.type)}" 不在允许值内`, ANNOTATION_TYPES.join(" | ")));
    }
    if (!SEVERITIES.includes(String(v.severity))) {
      out.push(finding("gate/severity", `批注 severity "${String(v.severity)}" 不在允许值内`, SEVERITIES.join(" | ")));
    }
    if (!STATUSES.includes(String(v.status))) {
      out.push(finding("gate/status", `批注 status "${String(v.status)}" 不在允许值内`, STATUSES.join(" | ")));
    }
    if (!DATE_TIME.test(String(v.created ?? ""))) {
      out.push(finding("gate/created", `created 必须是带时区的 date-time，实际 "${String(v.created)}"`));
    }

    // 目标必须存在
    const target = (v.target ?? {}) as {
      kind?: string;
      id?: string;
      view?: string;
      segment?: unknown;
    };
    if (target.kind === "region") {
      if (!target.view || !targetExists(doc, "view", target.view)) {
        out.push(finding("gate/target", `region 批注指向不存在的视图 "${String(target.view)}"`));
      }
    } else if (target.kind === "document") {
      // document 级批注无需解析目标
    } else if (!target.kind || !target.id || !targetExists(doc, target.kind, target.id)) {
      out.push(
        finding(
          "gate/target",
          `批注目标不存在：${String(target.kind)}/${String(target.id)}`,
          "改为已存在的元素/关系/视图 id",
        ),
      );
    }

    // 段级批注：segment 仅 relation 目标可用，且必须是 0-based 非负整数。
    // 上界（< segmentCount）gate 无法得知（无布局），由渲染/viewer 按实际路径段数处理。
    if (target.segment !== undefined) {
      if (target.kind !== "relation") {
        out.push(
          finding(
            "gate/segment-kind",
            `segment 只能用于 relation 批注目标，实际 kind=${String(target.kind)}`,
            "删除 segment（整边批注），或把目标改为 relation",
          ),
        );
      } else if (
        typeof target.segment !== "number" ||
        !Number.isInteger(target.segment) ||
        target.segment < 0
      ) {
        out.push(
          finding(
            "gate/segment",
            `segment 必须是 0-based 非负整数，实际 ${JSON.stringify(target.segment)}`,
            "segment 从 0 开始（points[0] → points[1] 为第 0 段）",
          ),
        );
      }
    }
  }

  return out;
}
