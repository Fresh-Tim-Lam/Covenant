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
  /** 同跨度平行边的通道号（-1/0/1），用于标签错位 */
  lane: number;
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

  // 长边（跨层 > 1）走顶部通道，避免穿过中间层节点
  const longEdges = horizontal
    ? relations
        .map((rel) => ({
          rel,
          span: Math.abs(
            (rank.get(endpoint(rel.to)) ?? 0) - (rank.get(endpoint(rel.from)) ?? 0),
          ),
        }))
        .filter((x) => x.span > 1)
    : [];
  const channelOf = new Map<string, number>();
  longEdges.forEach((x, i) => channelOf.set(x.rel.id, 8 + i * 8));
  const effPadding = opts.padding + (longEdges.length > 0 ? 8 + longEdges.length * 8 : 0);

  const raw: Record<string, Rect> = {};
  for (const [r, list] of columns) {
    const pos = reverse ? maxRank - r : r;
    for (let i = 0; i < list.length; i++) {
      const id = list[i]!;
      const w = opts.nodeWidth;
      const h = opts.nodeHeight;
      if (horizontal) {
        const colX = pos * (w + opts.rankGap);
        const colH = colHeights.get(r) ?? 0;
        const y = (maxColHeight - colH) / 2 + i * (h + opts.nodeGap);
        raw[id] = { x: colX, y, w, h };
      } else {
        const colY = pos * (h + opts.rankGap);
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

  // 平移归一化（保证非负 + padding；长边通道留在顶部空白区）
  const minX = Math.min(...Object.values(raw).map((r) => r.x), 0);
  const minY = Math.min(...Object.values(raw).map((r) => r.y), 0);
  const nodes: Record<string, Rect> = {};
  for (const [id, r] of Object.entries(raw)) {
    nodes[id] = { ...r, x: r.x - minX + effPadding, y: r.y - minY + effPadding };
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
    const a = nodes[fromId]!;
    const b = nodes[toId]!;
    const channel = channelOf.get(rel.id);
    if (channel !== undefined) {
      specs.push({ rel, fromId, toId, fromSide: "top", toSide: "top", channel });
      continue;
    }
    const ac = centerOf(a);
    const bc = centerOf(b);
    if (Math.abs(bc.x - ac.x) >= Math.abs(bc.y - ac.y)) {
      const toRight = bc.x >= ac.x;
      specs.push({
        rel,
        fromId,
        toId,
        fromSide: toRight ? "right" : "left",
        toSide: toRight ? "left" : "right",
        channel,
      });
    } else {
      const toDown = bc.y >= ac.y;
      specs.push({
        rel,
        fromId,
        toId,
        fromSide: toDown ? "bottom" : "top",
        toSide: toDown ? "top" : "bottom",
        channel,
      });
    }
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
  const laneCounters = new Map<string, number>();
  for (const s of specs) {
    const start = portOf.get(`${s.rel.id}|from`)!;
    const end = portOf.get(`${s.rel.id}|to`)!;
    if (s.channel !== undefined) {
      edges.push({
        id: s.rel.id,
        from: s.rel.from,
        to: s.rel.to,
        points: clearPath(routeAbovePorts(start, end, s.channel), nodes, s.fromId, s.toId),
        lane: 0,
      });
      continue;
    }
    const key = `${rank.get(s.fromId) ?? 0}->${rank.get(s.toId) ?? 0}`;
    const n = laneCounters.get(key) ?? 0;
    laneCounters.set(key, n + 1);
    const lane = (n % 3) - 1;
    edges.push({
      id: s.rel.id,
      from: s.rel.from,
      to: s.rel.to,
      points: clearPath(routePorts(start, end, s.fromSide, s.toSide, lane), nodes, s.fromId, s.toId),
      lane,
    });
  }
  const maxX = Math.max(...Object.values(nodes).map((r) => r.x + r.w), 0);
  const maxY = Math.max(...Object.values(nodes).map((r) => r.y + r.h), 0);
  return {
    nodes,
    edges,
    width: Math.ceil(maxX + effPadding),
    height: Math.ceil(maxY + effPadding),
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

function sideNormal(side: PortSide): Point {
  if (side === "left") return { x: -1, y: 0 };
  if (side === "right") return { x: 1, y: 0 };
  if (side === "top") return { x: 0, y: -1 };
  return { x: 0, y: 1 };
}

function dedupe(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) out.push(p);
  }
  return out;
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