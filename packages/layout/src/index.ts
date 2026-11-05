/**
 * 确定性分层布局（M1）。
 *
 * 设计取舍（对应 GAP-01）：不引入 ELK，先做一个"够用且完全确定"的分层算法，
 * 好处是渲染器可打进浏览器单文件、体积小、输出可逐字节复现；复杂图再评估 ELK。
 *
 * 算法：DFS 标记回边（破环）→ Kahn 拓扑排序（同层按文档顺序稳定）→ 最长路径定层
 *      → 层内顺序 = 文档顺序 → 坐标 = 层号 × 间距；pins 覆盖 → 平移到 padding。
 */
import type { CovenantDoc, ElementDef, RelationDef, ViewDef } from "@covenant/core";

export * from "./sequence";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface EdgeGeom {
  id: string;
  from: string;
  to: string;
  points: Point[];
  /** 路径段数 = points.length - 1（段级批注的合法下标范围是 [0, segmentCount)） */
  segmentCount: number;
  /** 同跨度平行边的通道号（-1/0/1），用于标签错位 */
  lane: number;
  /**
   * 长边专用的"标签附着段"下标（points[i] → points[i+1]）。
   * 长边为 6 点路径：水平布局通道段是 [2,3]；垂直布局通道段是 [1,2]。
   */
  labelSegment?: [number, number];
}
export interface LayoutResult {
  nodes: Record<string, Rect>;
  edges: EdgeGeom[];
  width: number;
  height: number;
  /** 每个元素所在层（调试/测试用） */
  ranks: Record<string, number>;
}

export interface LayoutOptions {
  direction?: "RIGHT" | "LEFT" | "DOWN" | "UP";
  /** 同层节点间距 */
  rankGap?: number;
  /** 层内节点间距 */
  nodeGap?: number;
  nodeWidth?: number;
  nodeHeight?: number;
  padding?: number;
  pins?: Record<string, [number, number]>;
  /** 只布局这些元素；缺省为全部 */
  includeIds?: string[];
  /** 只保留这些关系（与 includeIds 取交集）；缺省为端点都在图中的全部关系 */
  includeRelationIds?: string[];
}

export interface ViewSelection {
  elementIds: string[];
  relationIds: string[];
}

/** 选择器匹配：`*` 全选、`e.*` 前缀、`tag:critical` 标签、其余精确 id */
function matchPattern(id: string, tags: string[] | undefined, patterns: string[] | undefined): boolean {
  if (!patterns || patterns.length === 0) return true;
  for (const p of patterns) {
    if (p === "*" || p === "**") return true;
    if (p.startsWith("tag:")) {
      if ((tags ?? []).includes(p.slice(4))) return true;
      continue;
    }
    if (p.endsWith("*")) {
      if (id.startsWith(p.slice(0, -1))) return true;
      continue;
    }
    if (id === p) return true;
  }
  return false;
}

const excludedBy = (id: string, tags: string[] | undefined, patterns?: string[]): boolean =>
  Boolean(patterns && patterns.length > 0) && matchPattern(id, tags, patterns);

/** 按视图 include/exclude 计算元素与关系集合；无视图时返回全部 */
export function selectView(doc: CovenantDoc, view?: ViewDef): ViewSelection {
  const elements = doc.elements ?? [];
  const relations = doc.relations ?? [];
  const inc = view?.include ?? {};
  const exc = view?.exclude ?? {};

  const elementIds = elements
    .filter(
      (e) =>
        matchPattern(e.id, e.tags, inc.elements) && !excludedBy(e.id, e.tags, exc.elements),
    )
    .map((e) => e.id);
  const selected = new Set(elementIds);

  const relationIds = relations
    .filter((r) => {
      const from = (r.from.split(":")[0] ?? r.from);
      const to = (r.to.split(":")[0] ?? r.to);
      if (!selected.has(from) || !selected.has(to)) return false;
      if (!matchPattern(r.id, undefined, inc.relations)) return false;
      if (excludedBy(r.id, undefined, exc.relations)) return false;
      return true;
    })
    .map((r) => r.id);

  return { elementIds, relationIds };
}

const DEFAULTS = {
  direction: "RIGHT" as const,
  rankGap: 110,
  nodeGap: 46,
  nodeWidth: 190,
  nodeHeight: 74,
  padding: 28,
};

const endpoint = (ref: string): string => ref.split(":")[0] ?? ref;

/* ------------------- 标签文本 / 宽度估算（layout 与 render 共用） ------------------- */

/** 关系标签文本：props.label → transition trigger/guard → communicates → relates → kind。 */
export function relationLabelText(rel: {
  kind: string;
  props?: Record<string, unknown>;
}): string {
  const props = rel.props ?? {};
  if (typeof props.label === "string" && props.label.trim() !== "") return String(props.label);
  if (rel.kind === "transition") {
    const trigger = typeof props.trigger === "string" ? props.trigger : "";
    const guard = typeof props.guard === "string" ? props.guard : "";
    if (trigger) return guard ? `${trigger} [${guard}]` : trigger;
  }
  if (rel.kind === "communicates") {
    const parts = [props.protocol, props.network].filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    if (parts.length > 0) return parts.join(" · ");
  }
  if (rel.kind === "relates") {
    const card = props.cardinality as { from?: string; to?: string } | undefined;
    if (card?.from && card?.to) return `${card.from}:${card.to}`;
  }
  return rel.kind;
}

/** 确定性文本宽度估算（与 render 同口径）：CJK 记 1em，ASCII 记 0.55em。 */
export function estimateTextWidth(text: string, fontPx = 10.5): number {
  let units = 0;
  for (const ch of text) units += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.55;
  return units * fontPx;
}

/** 标签文本估算宽度（文本 + 左右 padding 10px）。紧凑布局不再按它扩车道，保留给测试/兜底口径。 */
export function estimateLabelWidth(rel: { kind: string; props?: Record<string, unknown> }): number {
  return estimateTextWidth(relationLabelText(rel)) + 10;
}

/* ----------------------- 交叉最小化（barycenter） ----------------------- */

function columnPositions(columns: Map<number, string[]>): Map<string, number> {
  const pos = new Map<string, number>();
  for (const list of columns.values()) list.forEach((id, i) => pos.set(id, i));
  return pos;
}

/** 相邻层之间的边（用于统计交叉） */
function adjacentEdges(
  relations: RelationDef[],
  rank: Map<string, number>,
): { u: string; v: string }[] {
  const out: { u: string; v: string }[] = [];
  for (const r of relations) {
    const u = endpoint(r.from);
    const v = endpoint(r.to);
    if (u === v) continue;
    const ru = rank.get(u) ?? 0;
    const rv = rank.get(v) ?? 0;
    if (rv - ru !== 1) continue;
    out.push({ u, v });
  }
  return out;
}

function crossingCount(
  columns: Map<number, string[]>,
  edges: { u: string; v: string }[],
  rank: Map<string, number>,
): number {
  const pos = columnPositions(columns);
  const byRank = new Map<number, [number, number][]>();
  for (const e of edges) {
    const r = rank.get(e.u) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push([pos.get(e.u) ?? 0, pos.get(e.v) ?? 0]);
  }
  let total = 0;
  for (const group of byRank.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        if ((a[0] - b[0]) * (a[1] - b[1]) < 0) total++;
      }
    }
  }
  return total;
}

/** 交替上下扫描，按邻居重心排序；只保留交叉数更少的方案（确定性：并列按文档序） */
function optimizeColumns(
  initial: Map<number, string[]>,
  relations: RelationDef[],
  rank: Map<string, number>,
  indexOf: Map<string, number>,
): Map<number, string[]> {
  const edges = adjacentEdges(relations, rank);
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const { u, v } of edges) {
    if (!preds.has(v)) preds.set(v, []);
    preds.get(v)!.push(u);
    if (!succs.has(u)) succs.set(u, []);
    succs.get(u)!.push(v);
  }

  const snapshot = (m: Map<number, string[]>): Map<number, string[]> =>
    new Map([...m].map(([k, v]) => [k, [...v]]));

  let best = snapshot(initial);
  let bestScore = crossingCount(best, edges, rank);
  if (bestScore === 0 || edges.length === 0) return best;

  const ranks = [...initial.keys()].sort((a, b) => a - b);
  let cur = snapshot(initial);
  for (let iter = 0; iter < 6 && bestScore > 0; iter++) {
    const down = iter % 2 === 0;
    const order = down ? ranks.slice(1) : [...ranks].reverse().slice(1);
    for (const r of order) {
      const list = cur.get(r);
      if (!list || list.length < 2) continue;
      const neighbor = down ? preds : succs;
      const pos = columnPositions(cur);
      const scored = list.map((id) => {
        const nb = (neighbor.get(id) ?? []).filter((x) => pos.has(x));
        const score = nb.length
          ? nb.reduce((s, x) => s + (pos.get(x) ?? 0), 0) / nb.length
          : (pos.get(id) ?? 0);
        return { id, score, docIdx: indexOf.get(id) ?? 0 };
      });
      scored.sort((a, b) => a.score - b.score || a.docIdx - b.docIdx);
      cur.set(r, scored.map((s) => s.id));
    }
    const score = crossingCount(cur, edges, rank);
    if (score < bestScore) {
      bestScore = score;
      best = snapshot(cur);
    }
  }
  return best;
}

/** 破环：DFS 找回边（u→v 且 v 在当前栈中） */
function findBackEdges(ids: string[], adj: Map<string, string[]>): Set<string> {
  const state = new Map<string, 0 | 1 | 2>();
  const back = new Set<string>();
  for (const id of ids) state.set(id, 0);

  for (const start of ids) {
    if (state.get(start) !== 0) continue;
    // 显式栈，避免深图递归爆栈
    const stack: { id: string; i: number }[] = [{ id: start, i: 0 }];
    state.set(start, 1);
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const next = adj.get(top.id) ?? [];
      if (top.i >= next.length) {
        state.set(top.id, 2);
        stack.pop();
        continue;
      }
      const child = next[top.i++]!;
      const st = state.get(child) ?? 0;
      if (st === 1) {
        back.add(`${top.id}->${child}`);
      } else if (st === 0) {
        state.set(child, 1);
        stack.push({ id: child, i: 0 });
      }
    }
  }
  return back;
}

export function layout(
  doc: CovenantDoc,
  options: LayoutOptions = {},
): LayoutResult {
  // 注意：不能直接 {...DEFAULTS, ...options}——显式传入的 undefined 会覆盖默认值，
  // 导致坐标变成 NaN（视图未写 layout 时就会触发）。
  const opts = {
    direction: options.direction ?? DEFAULTS.direction,
    rankGap: options.rankGap ?? DEFAULTS.rankGap,
    nodeGap: options.nodeGap ?? DEFAULTS.nodeGap,
    nodeWidth: options.nodeWidth ?? DEFAULTS.nodeWidth,
    nodeHeight: options.nodeHeight ?? DEFAULTS.nodeHeight,
    padding: options.padding ?? DEFAULTS.padding,
    pins: options.pins ?? {},
    includeIds: options.includeIds,
    includeRelationIds: options.includeRelationIds,
  };
  const allElements = doc.elements ?? [];
  const include = opts.includeIds ? new Set(opts.includeIds) : null;
  const elements = allElements.filter((e) => !include || include.has(e.id));
  const byId = new Map<string, ElementDef>(elements.map((e) => [e.id, e]));
  const indexOf = new Map<string, number>(elements.map((e, i) => [e.id, i]));

  // 只保留两端都在图中的关系（并按视图选择器过滤）
  const relAllow = opts.includeRelationIds ? new Set(opts.includeRelationIds) : null;
  const relations: RelationDef[] = (doc.relations ?? []).filter(
    (r) =>
      byId.has(endpoint(r.from)) &&
      byId.has(endpoint(r.to)) &&
      (!relAllow || relAllow.has(r.id)),
  );

  const ids = elements.map((e) => e.id);
  const adj = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const r of relations) {
    const u = endpoint(r.from);
    const v = endpoint(r.to);
    if (u !== v) adj.get(u)!.push(v);
  }
  for (const list of adj.values()) list.sort();

  const back = findBackEdges(ids, adj);

  // 入度（忽略回边）
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  const fwd = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const r of relations) {
    const u = endpoint(r.from);
    const v = endpoint(r.to);
    if (u === v || back.has(`${u}->${v}`)) continue;
    fwd.get(u)!.push(v);
    indeg.set(v, (indeg.get(v) ?? 0) + 1);
  }

  // Kahn：同层/同可用集合内按文档顺序，保证确定性
  const rank = new Map<string, number>(ids.map((id) => [id, 0]));
  const queue = ids
    .filter((id) => (indeg.get(id) ?? 0) === 0)
    .sort((a, b) => (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0));
  const processed: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    processed.push(u);
    for (const v of (fwd.get(u) ?? []).slice().sort(
      (a, b) => (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0),
    )) {
      rank.set(v, Math.max(rank.get(v) ?? 0, (rank.get(u) ?? 0) + 1));
      indeg.set(v, (indeg.get(v) ?? 1) - 1);
      if ((indeg.get(v) ?? 0) === 0) {
        queue.push(v);
        queue.sort((a, b) => (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0));
      }
    }
  }
  // 理论上破环后应全部处理；兜底给未处理节点按已有层
  for (const id of ids) if (!processed.includes(id)) rank.set(id, rank.get(id) ?? 0);

  // 父子容器：child 至少比 parent 深一层（部署图的 artifact/datastore 落到 node 之后）
  const parentOf = new Map<string, string>();
  for (const e of elements) {
    if (e.parent && byId.has(e.parent)) parentOf.set(e.id, e.parent);
  }
  if (parentOf.size > 0) {
    for (let iter = 0; iter < elements.length; iter++) {
      let changed = false;
      for (const [child, parent] of parentOf) {
        const want = (rank.get(parent) ?? 0) + 1;
        if ((rank.get(child) ?? 0) < want) {
          rank.set(child, want);
          changed = true;
        }
      }
      if (!changed) break;
    }
  }

  // 按层分组 → 交叉最小化（barycenter）
  const initialColumns = new Map<number, string[]>();
  for (const id of ids) {
    const r = rank.get(id) ?? 0;
    if (!initialColumns.has(r)) initialColumns.set(r, []);
    initialColumns.get(r)!.push(id);
  }
  const columns = optimizeColumns(initialColumns, relations, rank, indexOf);
  const maxRank = Math.max(0, ...[...columns.keys()]);
  const colHeights = new Map<number, number>();
  for (const [r, list] of columns) {
    colHeights.set(r, list.length * opts.nodeHeight + Math.max(0, list.length - 1) * opts.nodeGap);
  }
  const maxColHeight = Math.max(0, ...colHeights.values());

  const horizontal = opts.direction === "RIGHT" || opts.direction === "LEFT";
  const reverse = opts.direction === "LEFT" || opts.direction === "UP";

  /** 物理列/行序号：LEFT/UP 反向时镜像，用于判断"目标在右/下"与间隙归属 */
  const phys = (r: number): number => (reverse ? maxRank - r : r);
  const rankOf = (id: string): number => rank.get(id) ?? 0;
  const relSpan = (rel: RelationDef): number =>
    Math.abs(rankOf(endpoint(rel.to)) - rankOf(endpoint(rel.from)));

  // 长边（跨层 > 1）走"通道 + 侧边走廊"：先从框侧引出短 stub，再进列/行间隙里的独立 lane，
  // 上行（水平布局）/左行（垂直布局）到通道，横/竖走到目标侧 lane，最后 stub 进目标框。
  // 竖/横段全部落在间隙与通道带里，因此不会穿过任何中间层节点；lane 互异，平行长边不贴合。
  const longEdges = relations
    .map((rel) => ({ rel, span: relSpan(rel) }))
    .filter((x) => x.span > 1);
  /**
   * 通道间距（紧凑）：10px。边标签已去掉背景胶囊、只留文字，通道上的文字允许轻微相邻，
   * 换取更小的画布；不再按胶囊高度预留 25px。
   */
  const CHANNEL_STEP = 10;
  const channelOf = new Map<string, number>();
  longEdges.forEach((x, i) => channelOf.set(x.rel.id, 10 + i * CHANNEL_STEP));
  const channelBand =
    longEdges.length > 0 ? 10 + (longEdges.length - 1) * CHANNEL_STEP + 20 : 0;
  /** 通道占用的外侧留白：水平布局在顶部、垂直布局在左侧 */
  const padX = opts.padding + (horizontal ? 0 : channelBand);
  const padY = opts.padding + (horizontal ? channelBand : 0);

  // 列/行间隙要同时容纳：长边走廊段 + 短边的中间车道。紧凑模式下车道统一 10px，
  // 不再按标签胶囊宽度扩张；只有 lane 很多（间隙装不下）时才加大该间隙。
  interface GapSlot {
    relId: string;
    kind: "long-src" | "long-dst" | "short";
  }
  const gapSlots = new Map<number, GapSlot[]>();
  const addGapSlot = (gap: number, slot: GapSlot): void => {
    const list = gapSlots.get(gap) ?? [];
    list.push(slot);
    gapSlots.set(gap, list);
  };
  /** 车道最小间距（紧凑）：所有方向统一 10px */
  const LANE_STEP = 10;
  /** 短边标签占位：宽标签无法塞进 20px stub，按半宽把该 lane 起点外移（仅少量间隙变宽） */
  const relById = new Map(relations.map((rel) => [rel.id, rel]));
  const gapHalf = new Map<number, number>();
  const relInfos = relations.map((rel) => ({
    rel,
    pf: phys(rankOf(endpoint(rel.from))),
    pt: phys(rankOf(endpoint(rel.to))),
  }));
  for (const info of relInfos) {
    const span = Math.abs(info.pt - info.pf);
    const forward = info.pt > info.pf;
    if (span > 1) {
      addGapSlot(forward ? info.pf : info.pf - 1, { relId: info.rel.id, kind: "long-src" });
      addGapSlot(forward ? info.pt - 1 : info.pt, { relId: info.rel.id, kind: "long-dst" });
    } else if (span === 1) {
      addGapSlot(Math.min(info.pf, info.pt), { relId: info.rel.id, kind: "short" });
    }
  }
  for (const [gap, slots] of gapSlots) {
    slots.sort((u, v) => u.relId.localeCompare(v.relId) || u.kind.localeCompare(v.kind));
    let half = 0;
    for (const s of slots) {
      if (s.kind !== "short") continue;
      const rel = relById.get(s.relId);
      if (rel) half = Math.max(half, estimateTextWidth(relationLabelText(rel)) / 2);
    }
    if (half > 0) gapHalf.set(gap, half);
  }
  const laneStart = (gap: number): number => Math.max(20, (gapHalf.get(gap) ?? 0) + 6);
  const gapSize = new Map<number, number>();
  for (let p = 0; p < maxRank; p++) {
    const n = gapSlots.get(p)?.length ?? 0;
    if (n === 0) {
      gapSize.set(p, opts.rankGap);
      continue;
    }
    // 紧凑：step=10；仅当 lane 很多/标签较宽时按"半宽 + 6 边距"把间隙撑到刚好不压节点
    const half = gapHalf.get(p) ?? 0;
    const start = laneStart(p);
    const last = start + (n - 1) * LANE_STEP;
    gapSize.set(
      p,
      Math.max(opts.rankGap, 52 + (n - 1) * LANE_STEP, last + half + 18, start + half + 18),
    );
  }
  // 物理列/行坐标：按每个间隙的实际尺寸累加（间隙变大时仍完全确定性）
  const axisAt = new Map<number, number>();
  {
    let cur = 0;
    for (let p = 0; p <= maxRank; p++) {
      axisAt.set(p, cur);
      if (p < maxRank) {
        cur += (horizontal ? opts.nodeWidth : opts.nodeHeight) + gapSize.get(p)!;
      }
    }
  }

  const raw: Record<string, Rect> = {};
  for (const [r, list] of columns) {
    const pos = phys(r);
    for (let i = 0; i < list.length; i++) {
      const id = list[i]!;
      const w = opts.nodeWidth;
      const h = opts.nodeHeight;
      if (horizontal) {
        const colX = axisAt.get(pos)!;
        const colH = colHeights.get(r) ?? 0;
        const y = (maxColHeight - colH) / 2 + i * (h + opts.nodeGap);
        raw[id] = { x: colX, y, w, h };
      } else {
        const colY = axisAt.get(pos)!;
        const colW = list.length * w + Math.max(0, list.length - 1) * opts.nodeGap;
        const x = (maxColHeight - colW) / 2 + i * (w + opts.nodeGap);
        raw[id] = { x, y: colY, w, h };
      }
    }
  }

  // pins 覆盖
  for (const [id, [px, py]] of Object.entries(opts.pins ?? {})) {
    if (raw[id]) raw[id] = { ...raw[id]!, x: px, y: py };
  }

  // 平移归一化（保证非负 + padding；长边通道带留在顶部/左侧空白区）
  const minX = Math.min(...Object.values(raw).map((r) => r.x), 0);
  const minY = Math.min(...Object.values(raw).map((r) => r.y), 0);
  const nodes: Record<string, Rect> = {};
  for (const [id, r] of Object.entries(raw)) {
    nodes[id] = { ...r, x: r.x - minX + padX, y: r.y - minY + padY };
  }

  // 边路由：每条边独立接入点（同侧按对端位置排序、保留最小间距；端口不够则扩框）
  type PortSide = "left" | "right" | "top" | "bottom";
  const PORT_GAP = 16;
  const PORT_PAD = 12;
  const centerOf = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

  interface EndSpec {
    rel: RelationDef;
    fromId: string;
    toId: string;
    fromSide: PortSide;
    toSide: PortSide;
    channel: number | undefined;
  }
  const specs: EndSpec[] = [];
  for (const rel of relations) {
    const fromId = endpoint(rel.from);
    const toId = endpoint(rel.to);
    const channel = channelOf.get(rel.id);
    const pf = phys(rankOf(fromId));
    const pt = phys(rankOf(toId));
    let fromSide: PortSide;
    let toSide: PortSide;
    if (horizontal) {
      if (pt === pf) {
        // 同列（防御性分支）：走列右侧走廊，避免竖穿同列节点
        fromSide = "right";
        toSide = "right";
      } else {
        const toRight = pt > pf;
        fromSide = toRight ? "right" : "left";
        toSide = toRight ? "left" : "right";
      }
    } else if (pt === pf) {
      fromSide = "bottom";
      toSide = "bottom";
    } else {
      const toDown = pt > pf;
      fromSide = toDown ? "bottom" : "top";
      toSide = toDown ? "top" : "bottom";
    }
    specs.push({ rel, fromId, toId, fromSide, toSide, channel });
  }

  interface PortNeed {
    rel: RelationDef;
    end: "from" | "to";
    other: string;
  }
  const needs = new Map<string, PortNeed[]>();
  const addNeed = (id: string, side: PortSide, need: PortNeed): void => {
    const k = `${id}|${side}`;
    const list = needs.get(k) ?? [];
    list.push(need);
    needs.set(k, list);
  };
  for (const s of specs) {
    addNeed(s.fromId, s.fromSide, { rel: s.rel, end: "from", other: s.toId });
    addNeed(s.toId, s.toSide, { rel: s.rel, end: "to", other: s.fromId });
  }

  // 端口不够 → 沿该侧方向扩框（保持中心，不重排整体）
  for (const [id, r] of Object.entries(nodes)) {
    let growW = 0;
    let growH = 0;
    for (const side of ["left", "right", "top", "bottom"] as PortSide[]) {
      const list = needs.get(`${id}|${side}`);
      if (!list || list.length < 2) continue;
      const needLen = (list.length - 1) * PORT_GAP + 2 * PORT_PAD;
      const len = side === "left" || side === "right" ? r.h : r.w;
      if (needLen <= len) continue;
      const delta = needLen - len;
      if (side === "left" || side === "right") growH = Math.max(growH, delta);
      else growW = Math.max(growW, delta);
    }
    if (growW > 0 || growH > 0) {
      nodes[id] = { x: r.x - growW / 2, y: r.y - growH / 2, w: r.w + growW, h: r.h + growH };
    }
  }

  // 扩框后同列（水平布局）/同排（垂直布局）节点可能相撞（端口很多时）：沿该维度顺向压紧，
  // 保证最小 nodeGap；只向后推、不回移，保持确定性。pins（人工坐标）是权威，不参与压紧。
  const pinnedIds = new Set(Object.keys(opts.pins ?? {}));
  const physCols = new Map<number, string[]>();
  for (const id of Object.keys(nodes)) {
    const p = phys(rankOf(id));
    const list = physCols.get(p) ?? [];
    list.push(id);
    physCols.set(p, list);
  }
  for (const list of physCols.values()) {
    if (horizontal) list.sort((a, b) => nodes[a]!.y - nodes[b]!.y || nodes[a]!.x - nodes[b]!.x);
    else list.sort((a, b) => nodes[a]!.x - nodes[b]!.x || nodes[a]!.y - nodes[b]!.y);
    let cursor = -Infinity;
    for (const id of list) {
      const r = nodes[id]!;
      if (horizontal) {
        const y = pinnedIds.has(id) ? r.y : Math.max(r.y, cursor);
        nodes[id] = { ...r, y };
        cursor = Math.max(cursor, y + r.h + opts.nodeGap);
      } else {
        const x = pinnedIds.has(id) ? r.x : Math.max(r.x, cursor);
        nodes[id] = { ...r, x };
        cursor = Math.max(cursor, x + r.w + opts.nodeGap);
      }
    }
  }

  // 列/行几何（物理位置）：长边 lane 必须落在"列/行间隙"内——间隙里没有节点，天然不穿框。
  const nodeRows = new Map<number, { lo: number; hi: number }>();
  for (const [id, r] of Object.entries(nodes)) {
    const p = phys(rankOf(id));
    const g = nodeRows.get(p) ?? { lo: Infinity, hi: -Infinity };
    g.lo = Math.min(g.lo, horizontal ? r.x : r.y);
    g.hi = Math.max(g.hi, horizontal ? r.x + r.w : r.y + r.h);
    nodeRows.set(p, g);
  }
  // 车道坐标：同一间隙内所有 lane（长边走廊段 + 短边中间车道）从间隙起点依次排布；
  // 紧凑模式统一 LANE_STEP=10，平行边靠得很近但不重合。
  const laneAt = new Map<string, number>();
  for (const [gap, slots] of gapSlots) {
    const a = nodeRows.get(gap);
    const b = nodeRows.get(gap + 1);
    if (!a || !b) continue;
    slots.forEach((slot, i) =>
      laneAt.set(`${slot.relId}|${slot.kind}`, a.hi + laneStart(gap) + i * LANE_STEP),
    );
  }

  // 分配端口：同侧按对端位置排序（减少交叉），线性排布并保持最小间距
  const portOf = new Map<string, Point>();
  for (const [id, r] of Object.entries(nodes)) {
    for (const side of ["left", "right", "top", "bottom"] as PortSide[]) {
      const list = needs.get(`${id}|${side}`);
      if (!list) continue;
      const key = (n: PortNeed): number =>
        side === "left" || side === "right" ? centerOf(nodes[n.other]!).y : centerOf(nodes[n.other]!).x;
      const sorted = [...list].sort(
        (p, q) => key(p) - key(q) || p.rel.id.localeCompare(q.rel.id),
      );
      const center = side === "left" || side === "right" ? r.y + r.h / 2 : r.x + r.w / 2;
      const fixed = side === "left" ? r.x : side === "right" ? r.x + r.w : side === "top" ? r.y : r.y + r.h;
      for (let i = 0; i < sorted.length; i++) {
        const along = center + (i - (sorted.length - 1) / 2) * PORT_GAP;
        const point =
          side === "left" || side === "right"
            ? { x: fixed, y: along }
            : { x: along, y: fixed };
        portOf.set(`${sorted[i]!.rel.id}|${sorted[i]!.end}`, point);
      }
    }
  }

  const edges: EdgeGeom[] = [];
  const longIndex = new Map(longEdges.map((x, i) => [x.rel.id, i]));
  for (const s of specs) {
    const start = portOf.get(`${s.rel.id}|from`)!;
    const end = portOf.get(`${s.rel.id}|to`)!;
    if (s.channel !== undefined) {
      const srcLane = laneAt.get(`${s.rel.id}|long-src`);
      const dstLane = laneAt.get(`${s.rel.id}|long-dst`);
      const pts: Point[] = horizontal
        ? [
            start,
            { x: srcLane ?? start.x, y: start.y },
            { x: srcLane ?? start.x, y: s.channel },
            { x: dstLane ?? end.x, y: s.channel },
            { x: dstLane ?? end.x, y: end.y },
            end,
          ]
        : [
            start,
            { x: start.x, y: srcLane ?? start.y },
            { x: s.channel, y: srcLane ?? start.y },
            { x: s.channel, y: dstLane ?? end.y },
            { x: end.x, y: dstLane ?? end.y },
            end,
          ];
      const points = dedupe(pts);
      edges.push({
        id: s.rel.id,
        from: s.rel.from,
        to: s.rel.to,
        points,
        segmentCount: points.length - 1,
        lane: longIndex.get(s.rel.id) ?? 0,
        labelSegment: horizontal ? [2, 3] : [1, 2],
      });
      continue;
    }
    // 短边：把 lane 换算成 routePorts 的偏移（offset = lane * 14），使中间段正好落在分配到的车道 x/y 上
    const slot = laneAt.get(`${s.rel.id}|short`);
    const nf = s.fromSide === "right" ? 1 : s.fromSide === "left" ? -1 : 0;
    const nt = s.toSide === "right" ? 1 : s.toSide === "left" ? -1 : 0;
    const nfV = s.fromSide === "bottom" ? 1 : s.fromSide === "top" ? -1 : 0;
    const ntV = s.toSide === "bottom" ? 1 : s.toSide === "top" ? -1 : 0;
    let lane = 0;
    if (slot !== undefined && horizontal && nf !== 0 && nt !== 0) {
      const center = (start.x + nf * ROUTE_STUB + end.x + nt * ROUTE_STUB) / 2;
      lane = (slot - center) / 14;
    } else if (slot !== undefined && !horizontal && nfV !== 0 && ntV !== 0) {
      const center = (start.y + nfV * ROUTE_STUB + end.y + ntV * ROUTE_STUB) / 2;
      lane = (slot - center) / 14;
    }
    const points = clearPath(routePorts(start, end, s.fromSide, s.toSide, lane), nodes, s.fromId, s.toId);
    edges.push({
      id: s.rel.id,
      from: s.rel.from,
      to: s.rel.to,
      points,
      segmentCount: points.length - 1,
      lane,
    });
  }
  const maxX = Math.max(...Object.values(nodes).map((r) => r.x + r.w), 0);
  const maxY = Math.max(...Object.values(nodes).map((r) => r.y + r.h), 0);
  return {
    nodes,
    edges,
    width: Math.ceil(maxX + (horizontal ? padX : opts.padding)),
    height: Math.ceil(maxY + (horizontal ? opts.padding : padY)),
    ranks: Object.fromEntries(rank),
  };
}

/** 长边：从源顶部上行到顶部通道，横向走 channel，再下到目标顶部 */
export function routeAbove(a: Rect, b: Rect, channelY: number): Point[] {
  const ax = a.x + a.w / 2;
  const bx = b.x + b.w / 2;
  return [
    { x: ax, y: a.y },
    { x: ax, y: channelY },
    { x: bx, y: channelY },
    { x: bx, y: b.y },
  ];
}

/** 正交折线：水平为主 → 走中间竖线；垂直为主 → 走中间横线。lane 用于分离同跨度的平行边。 */
export function route(a: Rect, b: Rect, lane = 0): Point[] {
  const aCx = a.x + a.w / 2;
  const aCy = a.y + a.h / 2;
  const bCx = b.x + b.w / 2;
  const bCy = b.y + b.h / 2;
  const offset = lane * 14;
  if (Math.abs(bCx - aCx) >= Math.abs(bCy - aCy)) {
    const start = bCx >= aCx ? { x: a.x + a.w, y: aCy } : { x: a.x, y: aCy };
    const end = bCx >= aCx ? { x: b.x, y: bCy } : { x: b.x + b.w, y: bCy };
    const midX = (start.x + end.x) / 2 + offset;
    return [start, { x: midX, y: start.y }, { x: midX, y: end.y }, end];
  }
  const start = bCy >= aCy ? { x: aCx, y: a.y + a.h } : { x: aCx, y: a.y };
  const end = bCy >= aCy ? { x: bCx, y: b.y } : { x: bCx, y: b.y + b.h };
  const midY = (start.y + end.y) / 2 + offset;
  return [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
}

export type PortSide = "left" | "right" | "top" | "bottom";

/** 接线出口的垂直短引线长度：保证线不会沿着框边平行接入 */
export const ROUTE_STUB = 20;
/** 线与框的最小间距 */
export const ROUTE_MARGIN = 12;

export function sideNormal(side: PortSide): Point {
  if (side === "left") return { x: -1, y: 0 };
  if (side === "right") return { x: 1, y: 0 };
  if (side === "top") return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

export function dedupe(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) out.push(p);
  }
  return out;
}

/**
 * 路径第 k 段（points[k] → points[k+1]，0-based）的中点。
 * 供 render（段级 badge）与 viewer（段级点击/引导线）共用；越界下标夹到合法范围，确定性。
 */
export function segmentMidpoint(points: Point[], k: number): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { x: points[0]!.x, y: points[0]!.y };
  const i = Math.max(0, Math.min(points.length - 2, Math.floor(k)));
  const a = points[i]!;
  const b = points[i + 1]!;
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * 端口到端口的正交折线：先沿端口法线走 ROUTE_STUB（垂直引出/引入，避免贴边平行），
 * 中间用正交折线连接；lane 用于分离平行边。
 */
export function routePorts(
  start: Point,
  end: Point,
  fromSide: PortSide,
  toSide: PortSide,
  lane = 0,
): Point[] {
  const nf = sideNormal(fromSide);
  const nt = sideNormal(toSide);
  const p1: Point = { x: start.x + nf.x * ROUTE_STUB, y: start.y + nf.y * ROUTE_STUB };
  const p2: Point = { x: end.x + nt.x * ROUTE_STUB, y: end.y + nt.y * ROUTE_STUB };
  const horizFrom = fromSide === "left" || fromSide === "right";
  const horizTo = toSide === "left" || toSide === "right";
  const mid: Point[] = [];
  if (horizFrom && horizTo) {
    const midX = (p1.x + p2.x) / 2 + lane * 14;
    mid.push({ x: midX, y: p1.y }, { x: midX, y: p2.y });
  } else if (!horizFrom && !horizTo) {
    const midY = (p1.y + p2.y) / 2 + lane * 14;
    mid.push({ x: p1.x, y: midY }, { x: p2.x, y: midY });
  } else if (horizFrom) {
    mid.push({ x: p2.x, y: p1.y });
  } else {
    mid.push({ x: p1.x, y: p2.y });
  }
  return dedupe([start, p1, ...mid, p2, end]);
}

/**
 * 线与框保持最小间距：扫描中间线段，若从无关框的"扩展矩形"内穿过/贴边，
 * 把该段整体平移到框外 margin 处（保持正交；首尾 stub 不动）。
 */
export function clearPath(
  points: Point[],
  nodes: Record<string, Rect>,
  fromId: string,
  toId: string,
  margin = ROUTE_MARGIN,
): Point[] {
  const pts = points.map((p) => ({ ...p }));
  const obstacles = Object.entries(nodes).filter(([id]) => id !== fromId && id !== toId);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 2; i < pts.length - 3; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const horizontal = Math.abs(a.y - b.y) < 0.01;
      const vertical = Math.abs(a.x - b.x) < 0.01;
      if (!horizontal && !vertical) continue;
      for (const [, r] of obstacles) {
        if (horizontal) {
          const x0 = Math.min(a.x, b.x);
          const x1 = Math.max(a.x, b.x);
          if (x1 < r.x - margin || x0 > r.x + r.w + margin) continue;
          if (a.y <= r.y - margin || a.y >= r.y + r.h + margin) continue;
          const top = r.y - margin;
          const bottom = r.y + r.h + margin;
          const next = Math.abs(a.y - top) <= Math.abs(a.y - bottom) ? top : bottom;
          a.y = next;
          b.y = next;
        } else {
          const y0 = Math.min(a.y, b.y);
          const y1 = Math.max(a.y, b.y);
          if (y1 < r.y - margin || y0 > r.y + r.h + margin) continue;
          if (a.x <= r.x - margin || a.x >= r.x + r.w + margin) continue;
          const left = r.x - margin;
          const right = r.x + r.w + margin;
          const next = Math.abs(a.x - left) <= Math.abs(a.x - right) ? left : right;
          a.x = next;
          b.x = next;
        }
      }
    }
  }
  return dedupe(pts);
}

/** 长边：从端口上行到顶部通道，横向，再下到目标端口 */
export function routeAbovePorts(start: Point, end: Point, channelY: number): Point[] {
  return [start, { x: start.x, y: channelY }, { x: end.x, y: channelY }, end];
}