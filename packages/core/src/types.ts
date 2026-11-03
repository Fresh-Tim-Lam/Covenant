/**
 * Covenant 内核类型（Tier-0/2 文档模型）。
 * 字段的权威定义见 docs/design/format-spec-v0.md 与 schema/kernel.schema.json。
 */

export type Severity = "error" | "warning" | "info";
export type Level = "L0" | "L1" | "L2" | "L3" | "L4" | "L5" | "L6";

/** 校验产出的一条问题（结构见 format-spec §7） */
export interface Finding {
  code: string;
  level: Level;
  severity: Severity;
  message: string;
  elementId?: string;
  path?: string;
  fixHint?: string;
  autoFixable?: boolean;
}

export interface Link {
  kind: "code" | "adr" | "issue" | "doc" | "url" | "metric";
  ref: string;
}

export interface ElementConstraint {
  id: string;
  text: string;
  kind?: "metric" | "manual" | "test";
  ref?: string;
}

export interface Port {
  id: string;
  name?: string;
}

export interface ElementDef {
  id: string;
  kind: string;
  name: string;
  summary: string;
  tech?: string;
  tags?: string[];
  props?: Record<string, unknown>;
  constraints?: ElementConstraint[];
  links?: Link[];
  parent?: string;
  ports?: Port[];
}

export interface RelationDef {
  id: string;
  kind: string;
  from: string;
  to: string;
  summary: string;
  props?: Record<string, unknown>;
  constraints?: ElementConstraint[];
  routing?: "orthogonal" | "bezier" | "straight";
  waypoints?: number[][];
}

export interface FrameDef {
  id: string;
  kind: string;
  name: string;
  members: string[];
}

export interface Selector {
  elements?: string[];
  relations?: string[];
  frames?: string[];
  tags?: string[];
}

export interface LayoutDef {
  engine?: "elk" | "dagre" | "sequencer" | "none";
  direction?: "RIGHT" | "LEFT" | "DOWN" | "UP";
  spacing?: { rank?: number; node?: number };
  pins?: Record<string, [number, number]>;
}

export interface PresentDef {
  notation?: string;
  theme?: string;
  show_frame_labels?: boolean;
  /** 节点呈现：box（默认框）/ junction（接线点 + 点间线，交叉处画跳线弧） */
  node_style?: "box" | "junction";
  annotations?: { status?: string[]; severity?: string[] };
}

export interface ViewDef {
  id: string;
  title: string;
  profile?: string;
  include?: Selector;
  exclude?: Selector;
  layout?: LayoutDef;
  present?: PresentDef;
  canvas?: Record<string, unknown>;
}

export type AnnotationTarget =
  | { kind: "relation"; id: string; aspect?: string; segment?: number }
  | { kind: "element" | "frame" | "view" | "document"; id: string; aspect?: string }
  | { kind: "region"; view: string; rect: [number, number, number, number] };

export interface ThreadItem {
  author: string;
  at: string;
  text: string;
}

export interface AnnotationDef {
  id: string;
  target: AnnotationTarget;
  type: "risk" | "question" | "decision" | "todo" | "defect" | "smell";
  severity: "blocker" | "high" | "medium" | "low";
  title: string;
  body?: string;
  status: "open" | "ack" | "resolved" | "wontfix" | "superseded";
  author: string;
  created: string;
  updated?: string;
  links?: Link[];
  ai_hint?: string;
  thread?: ThreadItem[];
  resolution?: { by: string; at: string; ref?: string };
}

export interface DocConstraint {
  id: string;
  type: string;
  severity?: "error" | "warning" | "info";
  [key: string]: unknown;
}

export interface MetaDef {
  title: string;
  purpose: string;
  non_goals: string[];
  audience?: ("human" | "ai")[];
  status?: "draft" | "review" | "frozen" | "deprecated";
  rev?: number;
  owners?: string[];
  updated?: string;
  ai?: { summary?: string; budget_tokens?: number };
}

export interface CovenantDoc {
  covenant: string;
  id: string;
  profile: string;
  notation?: string;
  meta: MetaDef;
  imports?: { from: string; select?: string[] }[];
  elements?: ElementDef[];
  relations?: RelationDef[];
  frames?: FrameDef[];
  views?: ViewDef[];
  annotations?: AnnotationDef[];
  links?: Link[];
  constraints?: DocConstraint[];
}

/** 解析结果：成功时 doc 存在，失败时只有 findings */
export interface ParseResult {
  doc?: CovenantDoc;
  findings: Finding[];
}
