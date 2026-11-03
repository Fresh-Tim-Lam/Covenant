import type { CovenantDoc } from "@covenant/core";

/**
 * 序列图专用布局（非 ELK）：
 *   x = 参与者顺序，y = 消息序号；参与者顶部方框 + 生命线。
 * 选中裁剪来自通用 layout 的 nodes/edges（视图 include 已生效）。
 */
export interface SequenceParticipant {
  id: string;
  name: string;
  /** 方框左边缘 */
  x: number;
  w: number;
}

export type SequenceMessageKind = "sync" | "async" | "reply";

export interface SequenceMessage {
  relId: string;
  from: string;
  to: string;
  fromX: number;
  toX: number;
  y: number;
  label: string;
  kind: SequenceMessageKind;
  self: boolean;
  /** 从 1 开始的展示序号 */
  index: number;
}

export interface SequenceLayout {
  width: number;
  height: number;
  participants: SequenceParticipant[];
  messages: SequenceMessage[];
  headerY: number;
  headerH: number;
}

export interface SequenceOptions {
  includeIds?: Set<string>;
  includeRelationIds?: Set<string>;
}

const BOX_W = 170;
const COL_GAP = 90;
const PAD = 40;
const HEADER_Y = 24;
const HEADER_H = 44;
const ROW_GAP = 46;

export function layoutSequence(doc: CovenantDoc, options: SequenceOptions = {}): SequenceLayout {
  const pool = (doc.elements ?? []).filter(
    (e) => e.kind === "actor" || e.kind === "participant",
  );
  const selected = options.includeIds
    ? pool.filter((e) => options.includeIds!.has(e.id))
    : pool;

  const participants: SequenceParticipant[] = selected.map((e, i) => ({
    id: e.id,
    name: e.name,
    x: PAD + i * (BOX_W + COL_GAP),
    w: BOX_W,
  }));
  const byId = new Map(participants.map((p) => [p.id, p]));

  const relations = (doc.relations ?? [])
    .filter((r) => r.kind === "message" || r.kind === "return")
    .filter((r) => !options.includeRelationIds || options.includeRelationIds.has(r.id));

  const firstRow = HEADER_Y + HEADER_H + ROW_GAP;
  const messages: SequenceMessage[] = [];
  for (const r of relations) {
    const from = r.from.split(":")[0] ?? r.from;
    const to = r.to.split(":")[0] ?? r.to;
    const fp = byId.get(from);
    const tp = byId.get(to);
    if (!fp || !tp) continue;
    const raw = typeof r.props?.kind === "string" ? r.props.kind : "";
    const kind: SequenceMessageKind =
      r.kind === "return" ? "reply" : raw === "async" ? "async" : raw === "reply" ? "reply" : "sync";
    const label =
      typeof r.props?.label === "string" && r.props.label.trim() !== ""
        ? String(r.props.label)
        : r.summary || r.kind;
    messages.push({
      relId: r.id,
      from,
      to,
      fromX: fp.x + fp.w / 2,
      toX: tp.x + tp.w / 2,
      y: firstRow + messages.length * ROW_GAP,
      label,
      kind,
      self: from === to,
      index: messages.length + 1,
    });
  }

  const lastY = messages.length > 0 ? messages[messages.length - 1]!.y : firstRow;
  const width = PAD * 2 + (selected.length > 0 ? selected.length * BOX_W + (selected.length - 1) * COL_GAP : 0);
  return {
    width,
    height: lastY + 70,
    participants,
    messages,
    headerY: HEADER_Y,
    headerH: HEADER_H,
  };
}
