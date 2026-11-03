/**
 * AI 协作能力（M4/M5）：把"读懂文档 → 生成合法补丁"变成可复用函数。
 *
 * 两个能力：
 *   buildBrief     生成评审简报（确定性）：元素/关系/未决批注/ai_hint/待答问题
 *   buildAnnotationPatch  由 AI 生成 gate 可接受的补丁（author=ai:*，禁止 ai_hint）
 *
 * 信任边界在这里也成立：本包只允许"新增 AI 批注"，不提供改状态/改语义的入口。
 */
import { randomBytes } from "node:crypto";
import type { CovenantDoc, Finding } from "@covenant/core";
import type { Patch, PatchOp } from "@covenant/patch";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 生成 26 位 Crockford Base32 的 ULID 形态 id（无时间单调性，够用且合规） */
export function newAnnotationId(): string {
  const bytes = randomBytes(26);
  let out = "";
  for (const b of bytes) out += CROCKFORD[b % 32];
  return `a.${out}`;
}

export interface BriefAnnotation {
  id: string;
  target: { kind: string; id: string };
  severity: string;
  type: string;
  title: string;
  body: string;
  aiHint: string;
  status: string;
}

export interface ReviewBrief {
  doc: string;
  title: string;
  purpose: string;
  profile: string;
  rev: number;
  stats: {
    elements: number;
    relations: number;
    annotations: number;
    open: number;
  };
  openAnnotations: BriefAnnotation[];
  questions: string[];
}

export function buildBrief(doc: CovenantDoc): ReviewBrief {
  const elements = doc.elements ?? [];
  const relations = doc.relations ?? [];
  const annotations = doc.annotations ?? [];
  const open = annotations.filter((a) => a.status === "open" || a.status === "ack");

  const briefAnnotations: BriefAnnotation[] = open.map((a) => ({
    id: a.id,
    target: a.target as { kind: string; id: string },
    severity: a.severity,
    type: a.type,
    title: a.title,
    body: a.body ?? "",
    aiHint: a.ai_hint ?? "",
    status: a.status,
  }));

  const questions: string[] = [];
  for (const a of briefAnnotations.slice(0, 3)) {
    questions.push(
      `针对「${a.title}」（${a.severity}），当前设计取舍是什么？移除/修改它会破坏哪些调用方？`,
    );
  }
  if (doc.profile === "c4-container@1") {
    const stores = elements.filter((e) => e.kind === "datastore");
    for (const s of stores.slice(0, 1)) {
      questions.push(`存储 ${s.name} 的备份/迁移策略在图里没有体现，是否需要补一条约束？`);
    }
  }
  if (relations.length === 0) questions.push("这张图没有任何关系，是否漏画了调用/依赖？");
  if (questions.length === 0) questions.push("这张图的关键风险是什么？哪些约束代码推不出来？");

  return {
    doc: doc.id,
    title: doc.meta?.title ?? doc.id,
    purpose: doc.meta?.purpose ?? "",
    profile: doc.profile,
    rev: doc.meta?.rev ?? 0,
    stats: {
      elements: elements.length,
      relations: relations.length,
      annotations: annotations.length,
      open: open.length,
    },
    openAnnotations: briefAnnotations,
    questions: questions.slice(0, 5),
  };
}

export function formatBrief(brief: ReviewBrief): string {
  const lines: string[] = [];
  lines.push(`# 评审简报：${brief.title}`);
  lines.push("");
  lines.push(`- 文档：\`${brief.doc}\`（${brief.profile}，rev ${brief.rev}）`);
  lines.push(`- 目的：${brief.purpose || "（未填写）"}`);
  lines.push(
    `- 规模：${brief.stats.elements} 元素 / ${brief.stats.relations} 关系 / ${brief.stats.annotations} 批注（${brief.stats.open} 未决）`,
  );
  lines.push("");
  if (brief.openAnnotations.length === 0) {
    lines.push("## 未决批注");
    lines.push("");
    lines.push("（无）");
  } else {
    lines.push("## 未决批注");
    lines.push("");
    for (const a of brief.openAnnotations) {
      lines.push(`### [${a.severity}] ${a.title}`);
      lines.push("");
      lines.push(`- 目标：\`${a.target.kind}/${a.target.id}\`（${a.type}）`);
      if (a.body) lines.push(`- 现象：${a.body}`);
      if (a.aiHint) lines.push(`- **人给的约束（ai_hint）**：${a.aiHint}`);
      lines.push("");
    }
  }
  lines.push("## 待回答的问题");
  lines.push("");
  for (const q of brief.questions) lines.push(`- ${q}`);
  lines.push("");
  lines.push("## 写回方式（不要手改 YAML）");
  lines.push("");
  lines.push("1. 生成补丁：`covenant ai annotate <doc> --target <id> --title ... --actor ai:<name> --out p.json`");
  lines.push("2. 门禁：`covenant patch-check <doc> p.json --actor ai:<name>`");
  lines.push("3. 落盘：`covenant apply <doc> p.json --by ai:<name>`");
  lines.push("");
  lines.push("> AI 只能新增批注：author 必须是 `ai:*`，禁止写 `ai_hint`，禁止改批注状态。");
  return lines.join("\n");
}

export interface DraftOptions {
  doc: CovenantDoc;
  /** 必须是 ai:<name> */
  actor: string;
  /** 批注目标 id（元素/关系/视图） */
  targetId: string;
  title: string;
  body?: string;
  type?: string;
  severity?: string;
  intent?: string;
}

export interface DraftResult {
  patch?: Patch;
  findings: Finding[];
  /** 解析出的目标类型 */
  targetKind?: string;
}

const finding = (code: string, message: string, fixHint?: string): Finding => ({
  code,
  level: "L4",
  severity: "error",
  message,
  fixHint,
});

function resolveTarget(doc: CovenantDoc, id: string): string | undefined {
  if ((doc.elements ?? []).some((e) => e.id === id)) return "element";
  if ((doc.relations ?? []).some((r) => r.id === id)) return "relation";
  if ((doc.frames ?? []).some((f) => f.id === id)) return "frame";
  if ((doc.views ?? []).some((v) => v.id === id)) return "view";
  return undefined;
}

/**
 * 构造一条 gate 可接受的 AI 批注补丁。
 * 不合法时返回 findings，不抛异常——调用方决定打印还是退出。
 */
export function buildAnnotationPatch(options: DraftOptions): DraftResult {
  const findings: Finding[] = [];
  const { doc } = options;

  if (!options.actor.startsWith("ai:")) {
    findings.push(
      finding("ai/actor", `actor 必须以 ai: 开头（当前 "${options.actor}"）`, "AI 不得以 human:* 身份创建批注"),
    );
  }
  const title = (options.title ?? "").trim();
  if (!title) findings.push(finding("ai/title", "批注标题不能为空"));

  const targetKind = resolveTarget(doc, options.targetId);
  if (!targetKind) {
    findings.push(
      finding("ai/target", `批注目标 "${options.targetId}" 不存在`, "先用 covenant ai brief 或 read_doc 查看 id"),
    );
  }

  if (findings.length > 0) return { findings, targetKind };

  const op: PatchOp = {
    op: "add",
    path: "/annotations/-",
    value: {
      id: newAnnotationId(),
      target: { kind: targetKind, id: options.targetId },
      type: options.type ?? "risk",
      severity: options.severity ?? "medium",
      title,
      body: (options.body ?? "").trim(),
      status: "open",
      author: options.actor,
      created: new Date().toISOString(),
    },
  };

  return {
    patch: {
      covenant: "0.1",
      doc: doc.id,
      base_rev: doc.meta?.rev ?? 0,
      intent: options.intent ?? `AI 审阅：${title}`,
      ops: [op],
    },
    findings: [],
    targetKind,
  };
}
