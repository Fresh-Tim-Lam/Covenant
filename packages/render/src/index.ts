/**
 * SVG 渲染器（M1）。纯函数：doc + layout → SVG 字符串，无 DOM、无随机、无时间。
 * 输出确定性：同输入逐字节一致（黄金测试的前提）。
 */
import type { CovenantDoc, ImplStatus, ViewDef } from "@covenant/core";
import { layoutSequence, relationLabelText, segmentMidpoint } from "@covenant/layout";
import type { LayoutResult, Point, Rect } from "@covenant/layout";

export * from "./html";

export interface RenderOptions {
  /** 视图标题，缺省用 meta.title */
  title?: string;
  /** 是否绘制批注角标；HTML 版由前端统一绘制，传 false */
  showBadges?: boolean;
  /** 当前视图（用于读取 present.node_style） */
  view?: ViewDef;
}

const THEME = {
  labelBg: "#ffffff",
  labelStroke: "#cbd5e1",
  junctionDot: "#0f172a",
  bg: "#ffffff",
  nodeFill: {
    container: "#ffffff",
    "external-system": "#fff7ed",
    datastore: "#f1f5f9",
    queue: "#fdf4ff",
    person: "#f0f9ff",
    process: "#ffffff",
    "data-store": "#f1f5f9",
    "external-entity": "#fff7ed",
    start: "#ecfdf5",
    end: "#fef2f2",
    decision: "#fffbeb",
    io: "#f5f3ff",
    predefined: "#f8fafc",
    subprocess: "#f8fafc",
    actor: "#f0f9ff",
    initial: "#dcfce7",
    final: "#fee2e2",
    state: "#ffffff",
    choice: "#fffbeb",
    composite: "#f8fafc",
    participant: "#ffffff",
    component: "#eef2ff",
    interface: "#f0fdf4",
    "container-ref": "#f8fafc",
    module: "#ffffff",
    package: "#f8fafc",
    file: "#ffffff",
    function: "#f0f9ff",
    external: "#fff7ed",
  } as Record<string, string>,
  dashedKinds: new Set([
    "datastore",
    "data-store",
    "external-system",
    "external-entity",
    "container-ref",
    "external",
  ]),
  nodeStroke: "#94a3b8",
  text: "#0f172a",
  meta: "#64748b",
  tag: "#94a3b8",
  edge: "#94a3b8",
  edgeLabel: "#64748b",
  badge: "#dc2626",
  frame: "#2563eb",
  font:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif",
};

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 粗略宽度估计：CJK 记 1em，ASCII 记 0.55em（确定性，不依赖字体度量） */
function textWidth(text: string, fontPx: number): number {
  let units = 0;
  for (const ch of text) {
    units += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.55;
  }
  return units * fontPx;
}

function fit(text: string, maxPx: number, fontPx: number): string {
  const src = String(text ?? "");
  if (textWidth(src, fontPx) <= maxPx) return src;
  let out = "";
  for (const ch of src) {
    if (textWidth(out + ch + "…", fontPx) > maxPx) break;
    out += ch;
  }
  return out + "…";
}

function pointsToPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${round(p.x)} ${round(p.y)}`)
    .join(" ");
}

interface Crossing { seg: number; t: number; x: number; y: number; }

function segmentParams(a: Point, b: Point, c: Point, d: Point): { t: number; u: number } | null {
  const rx = b.x - a.x, ry = b.y - a.y;
  const sx = d.x - c.x, sy = d.y - c.y;
  const denom = rx * sy - ry * sx;
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denom;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denom;
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null;
  return { t, u };
}

function nearNode(p: Point, nodes: Rect[]): boolean {
  return nodes.some((r) => p.x > r.x - 8 && p.x < r.x + r.w + 8 && p.y > r.y - 8 && p.y < r.y + r.h + 8);
}

/** 找当前边与更早边的真实交点（共享端点/节点附近不算；这些交点要画跳线弧） */
function edgeCrossings(points: Point[], others: Point[][], nodes: Rect[]): Crossing[] {
  const out: Crossing[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!, b = points[i + 1]!;
    for (const other of others) {
      for (let j = 0; j < other.length - 1; j++) {
        const c = other[j]!, d = other[j + 1]!;
        const hit = segmentParams(a, b, c, d);
        if (!hit) continue;
        const p = { x: a.x + (b.x - a.x) * hit.t, y: a.y + (b.y - a.y) * hit.t };
        if (nearNode(p, nodes)) continue;
        if (Math.hypot(p.x - a.x, p.y - a.y) < 10 || Math.hypot(p.x - b.x, p.y - b.y) < 10) continue;
        out.push({ seg: i, t: hit.t, x: p.x, y: p.y });
      }
    }
  }
  out.sort((m, n) => (m.seg - n.seg) || (m.t - n.t));
  const dedup: Crossing[] = [];
  for (const c of out) {
    if (dedup.some((q) => Math.hypot(q.x - c.x, q.y - c.y) < 5)) continue;
    dedup.push(c);
  }
  return dedup;
}

function distPointSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

/**
 * 真实连接点（实心圆）：一条边的**端点**落在另一条边的线段上（T 型汇入）。
 * 仅内部折点重合不算连接——两条边并道/共享走廊会产生折点重合，
 * 那是路由副作用，不是语义连接（此前会被误标成实心圆）。
 * 排除节点内部与端口附近（那里由节点/箭头表达）；同点去重。
 */
export function solidJoinPoints(edges: Point[][], nodes: Rect[]): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < edges.length; i++) {
    const verts = edges[i]!;
    // 只取首尾端点（端口/T 型汇入）；内部折点重合是并道副作用，忽略。
    for (const vi of [0, verts.length - 1]) {
      const p = verts[vi]!;
      if (nearNode(p, nodes)) continue;
      let hit = false;
      for (let j = 0; j < edges.length && !hit; j++) {
        if (j === i) continue;
        const other = edges[j]!;
        for (let k = 0; k < other.length - 1; k++) {
          if (distPointSegment(p, other[k]!, other[k + 1]!) <= 2) {
            hit = true;
            break;
          }
        }
      }
      if (hit && !out.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 4)) out.push(p);
    }
  }
  return out;
}

/** 交叉点标记：空心=仅几何穿越；实心=真实连接（T 型/共享折点） */
interface CrossingMarker extends Point {
  kind: "hollow" | "solid";
}

function crossingMarkers(
  geoms: { points: Point[] }[],
  crossings: Point[],
  nodes: Rect[],
): CrossingMarker[] {
  const out: CrossingMarker[] = [];
  for (const p of solidJoinPoints(geoms.map((g) => g.points), nodes)) {
    out.push({ x: p.x, y: p.y, kind: "solid" });
  }
  for (const p of crossings) {
    if (nearNode(p, nodes)) continue;
    if (out.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 4)) continue;
    if (out.some((q) => q.kind === "hollow" && Math.hypot(q.x - p.x, q.y - p.y) < 4)) continue;
    out.push({ x: p.x, y: p.y, kind: "hollow" });
  }
  return out;
}
const round = (n: number): number => Math.round(n * 100) / 100;

/* --------------------------- 标签避让 --------------------------- */

export interface LabelRequest {
  text: string;
  primary: Point;
  candidates: Point[];
  /** true = 必须贴附在边路径上（沿路径滑动选位），禁止垂直偏移"悬浮" */
  attach?: boolean;
  /** 其他边的线段：胶囊不得压到它们（用户要求"胶囊别挡住别的线"） */
  avoid?: [Point, Point][];
}

export interface PlacedLabel extends Point {
  width: number;
}

const LABEL_FONT = 10.5;
/** 文字视觉盒高度（碰撞检测用；不再有背景胶囊，碰撞盒≈文字包围盒） */
const LABEL_BOX_H = 11;
/** 基线相对路径点的偏移：让文字视觉中心落在线上（贴线要求） */
const LABEL_BASELINE_OFFSET = 2.5;

function labelBox(p: Point, width: number): Rect {
  return {
    x: p.x - width / 2 - 2,
    y: p.y - LABEL_BOX_H / 2,
    w: width + 4,
    h: LABEL_BOX_H,
  };
}

function hitsAny(box: Rect, obstacles: Rect[]): boolean {
  return obstacles.some(
    (o) => box.x < o.x + o.w && o.x < box.x + box.w && box.y < o.y + o.h && o.y < box.y + box.h,
  );
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  const eps = 1e-9;
  if (((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps)) &&
      ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps))) return true;
  return false;
}

/** 线段是否穿过矩形（含端点落入/贴边） */
function segmentHitsRect(a: Point, b: Point, box: Rect): boolean {
  const inside = (p: Point): boolean =>
    p.x >= box.x - 0.5 && p.x <= box.x + box.w + 0.5 && p.y >= box.y - 0.5 && p.y <= box.y + box.h + 0.5;
  if (inside(a) || inside(b)) return true;
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ];
  for (let i = 0; i < 4; i++) {
    if (segmentsIntersect(a, b, corners[i]!, corners[(i + 1) % 4]!)) return true;
  }
  return false;
}

/** 胶囊矩形是否压到任意"别的边"线段 */
function hitsEdge(box: Rect, avoid?: [Point, Point][]): boolean {
  if (!avoid || avoid.length === 0) return false;
  return avoid.some(([a, b]) => segmentHitsRect(a, b, box));
}

/**
 * 在候选位置中挑第一个不冲突（不压节点、不压已放标签）的位置。
 * 确定性：请求按传入顺序处理，候选按生成顺序尝试。
 */
/** 候选耗尽后的确定性回退：以主位置为中心按环扩张找空位（防标签叠在一起）。 */
function fallbackLabelPoint(primary: Point, width: number, occupied: Rect[]): Point | null {
  const radii = [16, 32, 48, 64, 80, 96];
  const dirs: [number, number][] = [
    [0, -1], [1, 0], [0, 1], [-1, 0],
    [1, -1], [1, 1], [-1, 1], [-1, -1],
  ];
  for (const r of radii) {
    for (const [dx, dy] of dirs) {
      const p = { x: primary.x + dx * r, y: primary.y + dy * r };
      if (!hitsAny(labelBox(p, width), occupied)) return p;
    }
  }
  return null;
}

export function placeLabels(requests: LabelRequest[], obstacles: Rect[]): PlacedLabel[] {
  const occupied: Rect[] = [...obstacles];
  const placedBoxes: Rect[] = [];
  const overlapArea = (a: Rect, b: Rect): number => {
    const w = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const h = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return w * h;
  };
  const placed: PlacedLabel[] = [];
  for (const req of requests) {
    const width = textWidth(req.text, LABEL_FONT);
    let chosen: Point | null = null;
    for (const cand of req.candidates) {
      const box = labelBox(cand, width);
      if (!hitsAny(box, occupied) && !hitsEdge(box, req.avoid)) {
        chosen = cand;
        break;
      }
    }
    if (!chosen) {
      if (req.attach) {
        // 贴线标签：候选全部在路径上，优先不压节点（P0），其次不压其它标签，最后才允许跨其它边线。
        // 紧凑布局下宽标签跨相邻车道线不可避免，但必须仍贴在线上且不盖住节点。
        let best = req.primary;
        let bestScore = Number.POSITIVE_INFINITY;
        for (const cand of req.candidates) {
          const box = labelBox(cand, width);
          let nodeArea = 0;
          for (const o of obstacles) nodeArea += overlapArea(box, o);
          let labelArea = 0;
          for (const o of placedBoxes) labelArea += overlapArea(box, o);
          const score = nodeArea * 1e6 + labelArea * 1e3 + (hitsEdge(box, req.avoid) ? 1 : 0);
          if (score < bestScore) { bestScore = score; best = cand; }
        }
        chosen = best;
      } else {
        chosen = fallbackLabelPoint(req.primary, width, occupied) ?? req.primary;
      }
    }
    const box = labelBox(chosen, width);
    placed.push({ x: chosen.x, y: chosen.y, width });
    occupied.push(box);
    placedBoxes.push(box);
  }
  return placed;
}

/** 候选位置：主位置 → 沿垂直/水平方向小步移动，取第一个空闲的 */
export function labelCandidates(
  primary: Point,
  aboveChannel: boolean,
  horizontal: boolean,
): Point[] {
  const deltas: [number, number][] = aboveChannel
    ? [[0, 0], [0, -14], [0, 14], [0, -28], [0, 28], [0, -42], [0, 42], [24, 0], [-24, 0]]
    : horizontal
      ? [
          [0, 0], [0, 12], [0, -12], [0, 24], [0, -24], [0, 36], [0, -36], [0, 48], [0, -48],
          [30, 0], [-30, 0],
        ]
      : [[0, 0], [14, 0], [-14, 0], [0, 20], [0, -20], [40, 0], [-40, 0], [0, 36], [0, -36]];
  return deltas.map(([dx, dy]) => ({ x: primary.x + dx, y: primary.y + dy }));
}

/** 边标签文本来源与 layout 的宽度估算共用同一实现，避免"估算宽度 ≠ 实际渲染文本" */
function edgeLabelText(rel: { kind: string; props?: Record<string, unknown> }): string {
  return relationLabelText(rel);
}

function kindFill(kind: string): string {
  return THEME.nodeFill[kind] ?? "#ffffff";
}

function isDashed(kind: string): boolean {
  return THEME.dashedKinds.has(kind);
}

/* ------------------- impl_status 线型映射（P0 格式扩展） ------------------- */

const IMPL_RANK: Record<ImplStatus, number> = {
  implemented: 0,
  partial: 1,
  planned: 2,
  not_connected: 3,
  unknown: 4,
};

interface ImplPaint {
  /** 覆盖默认描边色；缺省则沿用原色 */
  stroke?: string;
  dash: string;
  opacity?: string;
}

/** 非 implemented 的线型；implemented 不产生任何新属性（保证旧 SVG 逐字节不变） */
const IMPL_PAINT: Record<Exclude<ImplStatus, "implemented">, ImplPaint> = {
  partial: { dash: "7 4" },
  planned: { dash: "2 3", opacity: ".72" },
  not_connected: { stroke: "#8b98a5", dash: "5 5", opacity: ".8" },
  unknown: { stroke: "#9a6a00", dash: "2 3" },
};

/** 元素有效状态：显式声明优先，缺省 implemented */
function elementStatus(el: { impl_status?: ImplStatus }): ImplStatus {
  return el.impl_status ?? "implemented";
}

/** 关系有效状态：显式优先；否则继承"弱端"（IMPL_RANK 更大的一端） */
function relationStatus(
  rel: { impl_status?: ImplStatus; from: string; to: string },
  elementStatusById: Map<string, ImplStatus>,
): ImplStatus {
  if (rel.impl_status) return rel.impl_status;
  const a = elementStatusById.get(rel.from) ?? "implemented";
  const b = elementStatusById.get(rel.to) ?? "implemented";
  return IMPL_RANK[a] >= IMPL_RANK[b] ? a : b;
}

interface StatusMaps {
  elements: Map<string, ImplStatus>;
  relations: Map<string, ImplStatus>;
  needsMutedMarker: boolean;
  needsUnknownMarker: boolean;
}

function statusMaps(doc: CovenantDoc): StatusMaps {
  const elements = new Map<string, ImplStatus>();
  for (const el of doc.elements ?? []) elements.set(el.id, elementStatus(el));
  const relations = new Map<string, ImplStatus>();
  for (const rel of doc.relations ?? []) relations.set(rel.id, relationStatus(rel, elements));
  const all = [...relations.values()];
  return {
    elements,
    relations,
    needsMutedMarker: all.includes("not_connected"),
    needsUnknownMarker: all.includes("unknown"),
  };
}

/**
 * 元素几何的描边/线型属性。implemented 时返回与旧实现逐字节完全相同的属性串；
 * 非 implemented 时覆盖 kind-dash（datastore/external 的 6 3 等）。
 */
function elementPaintAttrs(eff: ImplStatus, baseDash: string): string {
  if (eff === "implemented") {
    return ` stroke="${THEME.nodeStroke}" stroke-width="1.5"${baseDash ? ` stroke-dasharray="${baseDash}"` : ""}`;
  }
  const p = IMPL_PAINT[eff];
  return ` stroke="${p.stroke ?? THEME.nodeStroke}" stroke-width="1.5" stroke-dasharray="${p.dash}"${p.opacity ? ` opacity="${p.opacity}"` : ""}`;
}

/** junction 圆点：fill 保持，stroke 用状态色（partial/planned 无专用色时用默认描边色让虚线可见） */
function junctionPaintAttrs(eff: ImplStatus): string {
  if (eff === "implemented") return ` stroke="${THEME.bg}" stroke-width="1.5"`;
  const p = IMPL_PAINT[eff];
  return ` stroke="${p.stroke ?? THEME.nodeStroke}" stroke-width="1.5" stroke-dasharray="${p.dash}"${p.opacity ? ` opacity="${p.opacity}"` : ""}`;
}

/** 边的描边/线型 + 箭头 marker；implemented 复用默认 #cvn-arrow */
function edgePaint(eff: ImplStatus, strokeWidth = 1.6): { attrs: string; marker: string } {
  if (eff === "implemented") {
    return { attrs: ` stroke="${THEME.edge}" stroke-width="${strokeWidth}"`, marker: "cvn-arrow" };
  }
  const p = IMPL_PAINT[eff];
  const marker =
    eff === "not_connected" ? "cvn-arrow-muted" : eff === "unknown" ? "cvn-arrow-unknown" : "cvn-arrow";
  return {
    attrs: ` stroke="${p.stroke ?? THEME.edge}" stroke-width="${strokeWidth}" stroke-dasharray="${p.dash}"${p.opacity ? ` opacity="${p.opacity}"` : ""}`,
    marker,
  };
}

/** 箭头 marker 定义：只在需要时追加，保证无状态文档的 defs 逐字节不变 */
function arrowMarkerDefs(needsMuted: boolean, needsUnknown: boolean): string {
  const one = (id: string, color: string): string =>
    `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker>`;
  let defs = `<defs>${one("cvn-arrow", THEME.edge)}`;
  if (needsMuted) defs += one("cvn-arrow-muted", "#8b98a5");
  if (needsUnknown) defs += one("cvn-arrow-unknown", "#9a6a00");
  return `${defs}</defs>`;
}

interface AnnotationCounts {
  /** 整条关系的未决批注数（target 无 segment） */
  whole: number;
  /** 按段号聚合的未决批注数（仅 kind=relation 且 segment 为合法非负整数） */
  segments: Map<number, number>;
}

/**
 * 未决批注计数：整边（无 segment）与段级分开。
 * 非 relation 目标即使误写 segment 也按整边计数（gate 会拒绝 element+segment）。
 */
function annotationCounts(
  doc: CovenantDoc,
  kind: "element" | "relation",
  id: string,
): AnnotationCounts {
  const res: AnnotationCounts = { whole: 0, segments: new Map<number, number>() };
  for (const a of doc.annotations ?? []) {
    const t = a.target as { kind?: string; id?: string; segment?: unknown };
    if (t?.kind !== kind || t?.id !== id) continue;
    if (a.status !== "open" && a.status !== "ack") continue;
    const seg = t.segment;
    if (kind === "relation" && typeof seg === "number" && Number.isInteger(seg) && seg >= 0) {
      res.segments.set(seg, (res.segments.get(seg) ?? 0) + 1);
    } else {
      res.whole += 1;
    }
  }
  return res;
}

/** 整边未决批注数（保持旧行为：无 segment 时与旧版完全一致） */
function openAnnotations(
  doc: CovenantDoc,
  kind: "element" | "relation",
  id: string,
): number {
  return annotationCounts(doc, kind, id).whole;
}

function badge(x: number, y: number, n: number): string {
  return [
    `<g class="badge"><circle cx="${round(x)}" cy="${round(y)}" r="10" fill="${THEME.badge}" stroke="#fff" stroke-width="1.5"/>`,
    `<text x="${round(x)}" y="${round(y + 3.6)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff">${n}</text></g>`,
  ].join("");
}

/** 用户核验通过的绿色 ✓ 徽章 */
function verifiedBadge(x: number, y: number): string {
  return `<g class="verified-badge" pointer-events="none"><circle cx="${round(x)}" cy="${round(y)}" r="8" fill="#16a34a" stroke="#fff" stroke-width="1.5"/><path d="M${round(x - 3.5)} ${round(y)} L${round(x - 1)} ${round(y + 2.8)} L${round(x + 3.5)} ${round(y - 2.5)}" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}

function frameBox(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const pad = 18;
  const x = Math.min(...rects.map((r) => r.x)) - pad;
  const y = Math.min(...rects.map((r) => r.y)) - pad - 14;
  const x2 = Math.max(...rects.map((r) => r.x + r.w)) + pad;
  const y2 = Math.max(...rects.map((r) => r.y + r.h)) + pad;
  return { x, y, w: x2 - x, h: y2 - y };
}

/**
 * 序列图渲染：参与者方框 + 生命线 + 水平消息箭头。
 * 选中范围从通用 layout 的 nodes/edges 推回来（视图 include 已经生效）。
 */
export function renderSequenceSvg(
  doc: CovenantDoc,
  layout: LayoutResult,
  options: RenderOptions = {},
): string {
  const includeIds = new Set(Object.keys(layout.nodes));
  const includeRelationIds = new Set(layout.edges.map((e) => e.id));
  const seq = layoutSequence(doc, { includeIds, includeRelationIds });
  const title = options.title ?? doc.meta?.title ?? doc.id;
  const out: string[] = [];
  const W = seq.width;
  const H = seq.height;
  const bottom = H - 24;
  const status = statusMaps(doc);

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="cvn-title cvn-desc" font-family="${THEME.font}">`,
  );
  out.push(`<title id="cvn-title">${esc(title)}</title>`);
  out.push(`<desc id="cvn-desc">${esc(doc.meta?.purpose ?? "")}</desc>`);
  out.push(arrowMarkerDefs(status.needsMutedMarker, status.needsUnknownMarker));
  out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${THEME.bg}"/>`);

  // 参与者与生命线
  for (const p of seq.participants) {
    const cx = p.x + p.w / 2;
    const eff = status.elements.get(p.id) ?? "implemented";
    out.push(`<g class="participant" data-id="${esc(p.id)}">`);
    out.push(
      `<rect x="${round(p.x)}" y="${round(seq.headerY)}" width="${round(p.w)}" height="${seq.headerH}" rx="6" fill="${THEME.nodeFill.participant ?? "#ffffff"}"${elementPaintAttrs(eff, "")}/>`,
    );
    out.push(
      `<text x="${round(cx)}" y="${round(seq.headerY + seq.headerH / 2 + 4.5)}" text-anchor="middle" font-size="12.5" font-weight="650" fill="${THEME.text}">${esc(fit(p.name, p.w - 20, 12.5))}</text>`,
    );
    out.push(
      `<line x1="${round(cx)}" y1="${round(seq.headerY + seq.headerH)}" x2="${round(cx)}" y2="${round(bottom)}" stroke="${THEME.frame}" stroke-width="1" stroke-dasharray="4 4"/>`,
    );
    out.push(`</g>`);
    const n = openAnnotations(doc, "element", p.id);
    if (n > 0 && options.showBadges !== false) out.push(badge(p.x + p.w - 10, seq.headerY + 10, n));
  }

  // 消息
  for (const m of seq.messages) {
    const eff = status.relations.get(m.relId) ?? "implemented";
    const paint = edgePaint(eff, 1.5);
    // implemented 且 reply → 保留原有 5 3 虚线；非 implemented 由状态线型覆盖
    const dash = eff === "implemented" && m.kind === "reply" ? ' stroke-dasharray="5 3"' : "";
    out.push(`<g class="message kind-${esc(m.kind)}" data-id="${esc(m.relId)}">`);
    if (m.self) {
      const x = m.fromX;
      out.push(
        `<path d="M${round(x)},${round(m.y)} h34 v20 h-34" fill="none"${paint.attrs}${dash} marker-end="url(#${paint.marker})"/>`,
      );
      out.push(
        `<text x="${round(x + 40)}" y="${round(m.y - 4)}" font-size="10.5" fill="${THEME.edgeLabel}">${esc(`${m.index}. ${m.label}`)}</text>`,
      );
    } else {
      out.push(
        `<line x1="${round(m.fromX)}" y1="${round(m.y)}" x2="${round(m.toX)}" y2="${round(m.y)}"${paint.attrs}${dash} marker-end="url(#${paint.marker})"/>`,
      );
      const mid = (m.fromX + m.toX) / 2;
      out.push(
        `<text x="${round(mid)}" y="${round(m.y - 6)}" text-anchor="middle" font-size="10.5" fill="${THEME.edgeLabel}">${esc(`${m.index}. ${m.label}`)}</text>`,
      );
    }
    out.push(`</g>`);
    const counts = annotationCounts(doc, "relation", m.relId);
    if (counts.whole > 0 && options.showBadges !== false) {
      out.push(badge(m.fromX + 14, m.y - 20, counts.whole));
    }
    if (counts.segments.size > 0 && options.showBadges !== false) {
      const midX = m.self ? m.fromX + 17 : (m.fromX + m.toX) / 2;
      for (const count of counts.segments.values()) {
        out.push(badge(midX, m.y - 20, count));
      }
    }
  }

  out.push(`</svg>`);
  return out.join("\n");
}
export function renderSvg(
  doc: CovenantDoc,
  layout: LayoutResult,
  options: RenderOptions = {},
): string {
  // 序列图有专用 sequencer 布局，不走通用图渲染
  if (doc.profile === "sequence@1") {
    return renderSequenceSvg(doc, layout, options);
  }
  const title = options.title ?? doc.meta?.title ?? doc.id;
  const out: string[] = [];
  const W = layout.width;
  const H = layout.height;
  const status = statusMaps(doc);

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="cvn-title cvn-desc" font-family="${THEME.font}">`,
  );
  out.push(`<title id="cvn-title">${esc(title)}</title>`);
  out.push(`<desc id="cvn-desc">${esc(doc.meta?.purpose ?? "")}</desc>`);
  out.push(arrowMarkerDefs(status.needsMutedMarker, status.needsUnknownMarker));
  out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${THEME.bg}"/>`);

  // frames（先画，作为背景边界）
  for (const frame of doc.frames ?? []) {
    const rects = (frame.members ?? [])
      .map((m) => layout.nodes[m])
      .filter((r): r is Rect => Boolean(r));
    const box = frameBox(rects);
    if (!box) continue;
    out.push(
      `<g class="frame"><rect x="${round(box.x)}" y="${round(box.y)}" width="${round(box.w)}" height="${round(box.h)}" rx="10" fill="none" stroke="${THEME.frame}" stroke-width="1.4" stroke-dasharray="8 4"/>`,
      `<text x="${round(box.x + 10)}" y="${round(box.y + 18)}" font-size="11.5" fill="${THEME.frame}" font-weight="600">${esc(frame.name)}</text></g>`,
    );
  }

  const nodeStyle = options.view?.present?.node_style ?? "box";
  const junction = nodeStyle === "junction";

  // edges：先画路径（交叉不再拱起/断开，改用交点圆点表达），再画圆点、标签
  interface EdgeGeom {
    edge: LayoutResult["edges"][number];
    rel: NonNullable<CovenantDoc["relations"]>[number];
    points: Point[];
    lane: number;
  }
  const edgeGeoms = layout.edges
    .map((edge): EdgeGeom | null => {
      const rel = (doc.relations ?? []).find((r) => r.id === edge.id);
      if (!rel) return null;
      let points = edge.points.map((p) => ({ x: p.x, y: p.y }));
      if (junction) {
        // 接线点模式：边是"点与点之间的直线"
        const from = layout.nodes[rel.from];
        const to = layout.nodes[rel.to];
        if (from && to) {
          points = [
            { x: from.x + from.w / 2, y: from.y + from.h / 2 },
            { x: to.x + to.w / 2, y: to.y + to.h / 2 },
          ];
        }
      }
      return { edge, rel, points, lane: edge.lane ?? 0 };
    })
    .filter((g): g is EdgeGeom => g !== null);

  const nodeRects: Rect[] = Object.values(layout.nodes);
  const edgeParts: string[] = [];
  const labelRequests: LabelRequest[] = [];
  const badgeIndexes: { index: number; n: number }[] = [];
  /** 段级批注 badge：points 用渲染时的实际路径（junction 模式是两点直线） */
  const segmentBadges: { points: Point[]; segments: Map<number, number> }[] = [];
  const hollowCrossings: Point[] = [];
  // 所有边的线段（供标签避让"别的线"用）
  const allSegments: { owner: number; seg: [Point, Point] }[] = [];
  edgeGeoms.forEach((g, owner) => {
    for (let k = 0; k + 1 < g.points.length; k++) {
      allSegments.push({ owner, seg: [g.points[k]!, g.points[k + 1]!] });
    }
  });
  for (let i = 0; i < edgeGeoms.length; i++) {
    const { edge, rel, points, lane } = edgeGeoms[i]!;
    const earlier = edgeGeoms.slice(0, i).map((g) => g.points);
    for (const hit of edgeCrossings(points, earlier, nodeRects)) {
      hollowCrossings.push({ x: hit.x, y: hit.y });
    }
    const d = pointsToPath(points);
    const paint = edgePaint(status.relations.get(edge.id) ?? "implemented");
    edgeParts.push(
      `<g class="edge" data-id="${esc(edge.id)}">` +
        `<path d="${d}" fill="none" stroke="transparent" stroke-width="10" pointer-events="stroke"/>` +
        `<path d="${d}" fill="none"${paint.attrs} marker-end="url(#${paint.marker})"/>` +
        `</g>`,
    );
    const p = points;
    // 胶囊必须"连在线上"：候选点全部取自路径本身（长边优先通道段），碰撞时沿路径滑动，不垂直偏移。
    const segs: [Point, Point][] = [];
    if (p.length === 2) segs.push([p[0]!, p[1]!]);
    else for (let k = 0; k + 1 < p.length; k++) segs.push([p[k]!, p[k + 1]!]);
    const primarySeg = p.length === 2 ? 0 : (edge.labelSegment?.[0] ?? Math.min(1, segs.length - 1));
    const orderedSegs: [Point, Point][] = [];
    if (segs[primarySeg]) orderedSegs.push(segs[primarySeg]!);
    segs.forEach((s, k) => {
      if (k !== primarySeg) orderedSegs.push(s);
    });
    const laneShift = ((lane % 5) - 2) * 0.055;
    const ts = [0.5, 0.35, 0.65, 0.2, 0.8, 0.1, 0.9].map((t) =>
      Math.min(0.94, Math.max(0.06, t + laneShift)),
    );
    const candidates: Point[] = [];
    for (const seg of orderedSegs) {
      for (const t of ts) {
        const cand = {
          x: seg[0]!.x + (seg[1]!.x - seg[0]!.x) * t,
          y: seg[0]!.y + (seg[1]!.y - seg[0]!.y) * t,
        };
        if (!candidates.some((q) => Math.hypot(q.x - cand.x, q.y - cand.y) < 1)) {
          candidates.push(cand);
        }
      }
    }
    labelRequests.push({
      text: edgeLabelText(rel),
      primary: candidates[0]!,
      candidates,
      attach: true,
      avoid: allSegments.filter((s) => s.owner !== i).map((s) => s.seg),
    });
    const counts = annotationCounts(doc, "relation", edge.id);
    if (counts.whole > 0 && options.showBadges !== false) {
      badgeIndexes.push({ index: labelRequests.length - 1, n: counts.whole });
    }
    if (counts.segments.size > 0 && options.showBadges !== false) {
      segmentBadges.push({ points, segments: counts.segments });
    }
  }

  const nodeObstacles: Rect[] = Object.values(layout.nodes).map((r) => ({
    x: r.x - 2,
    y: r.y - 2,
    w: r.w + 4,
    h: r.h + 4,
  }));
  const placedLabels = placeLabels(labelRequests, nodeObstacles);

  out.push(...edgeParts);
  // 交点圆点：空心=仅几何穿越（不相交）；实心=真实连接（T 型汇入/共享折点）。
  // 画在所有边之后，避免被后续边覆盖；同点去重（实心优先）。
  for (const m of crossingMarkers(edgeGeoms, hollowCrossings, nodeRects)) {
    out.push(
      m.kind === "solid"
        ? `<circle class="crossing crossing-solid" cx="${round(m.x)}" cy="${round(m.y)}" r="3" fill="${THEME.edge}" stroke="none" pointer-events="none"/>`
        : `<circle class="crossing crossing-hollow" cx="${round(m.x)}" cy="${round(m.y)}" r="3.2" fill="${THEME.bg}" stroke="${THEME.edge}" stroke-width="1.3" pointer-events="none"/>`,
    );
  }
  for (let i = 0; i < placedLabels.length; i++) {
    const l = placedLabels[i]!;
    const req = labelRequests[i]!;
    // 去胶囊：只画文字；细白描边（paint-order:stroke）保证压线时可读，不产生背景块
    out.push(
      `<text class="edge-label" x="${round(l.x)}" y="${round(l.y + LABEL_BASELINE_OFFSET)}" text-anchor="middle" font-size="${LABEL_FONT}" fill="${THEME.edgeLabel}" stroke="${THEME.labelBg}" stroke-width="2.4" stroke-linejoin="round" paint-order="stroke">${esc(req.text)}</text>`,
    );
  }
  for (const b of badgeIndexes) {
    const l = placedLabels[b.index];
    if (l) out.push(badge(l.x + Math.max(18, l.width / 2 + 8), l.y - 10, b.n));
  }
  // 段级 badge：落在对应段中点正上方（无 segment 批注时循环为空 → 输出与旧版逐字节一致）
  for (const sb of segmentBadges) {
    const entries = [...sb.segments.entries()].sort((a, b) => a[0] - b[0]);
    for (const [seg, count] of entries) {
      const mid = segmentMidpoint(sb.points, seg);
      out.push(badge(mid.x, mid.y - 10, count));
    }
  }
  // nodes
  const nameById = new Map((doc.elements ?? []).map((e) => [e.id, e.name]));
  for (const el of doc.elements ?? []) {
    const r = layout.nodes[el.id];
    if (!r) continue;
    const kind = el.kind;
    const eff = status.elements.get(el.id) ?? "implemented";
    // implemented 保持原有 kind-dash（datastore/external 6 3）；非 implemented 覆盖之
    const baseDash = isDashed(kind) ? "6 3" : "";
    const shapeAttrs = elementPaintAttrs(eff, baseDash);
    const fill = kindFill(kind);
    out.push(`<g class="node kind-${esc(kind)}" data-id="${esc(el.id)}">`);
    if (junction) {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      out.push(
        `<circle cx="${round(cx)}" cy="${round(cy)}" r="6" fill="${THEME.junctionDot}"${junctionPaintAttrs(eff)}/>`,
        `<text x="${round(cx)}" y="${round(cy + 22)}" text-anchor="middle" font-size="12" font-weight="650" fill="${THEME.text}">${esc(fit(el.name, 180, 12))}</text>`,
      );
      out.push(`</g>`);
      const jn = openAnnotations(doc, "element", el.id);
      if (jn > 0 && options.showBadges !== false) out.push(badge(r.x + r.w - 12, r.y + 12, jn));
      if (el.props?.user_verified) out.push(verifiedBadge(r.x + r.w + 4, r.y));
      continue;
    }

    if (kind === "decision") {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const pts = [
        `${round(cx)},${round(r.y)}`,
        `${round(r.x + r.w)},${round(cy)}`,
        `${round(cx)},${round(r.y + r.h)}`,
        `${round(r.x)},${round(cy)}`,
      ].join(" ");
      out.push(
        `<polygon points="${pts}" fill="${fill}"${shapeAttrs}/>`,
      );
      out.push(
        `<text x="${round(cx)}" y="${round(cy - 2)}" text-anchor="middle" font-size="12.5" font-weight="650" fill="${THEME.text}">${esc(fit(el.name, r.w * 0.6, 12.5))}</text>`,
      );
      if (el.summary) {
        out.push(
          `<text x="${round(cx)}" y="${round(cy + 14)}" text-anchor="middle" font-size="10" fill="${THEME.tag}">${esc(fit(el.summary, r.w * 0.55, 10))}</text>`,
        );
      }
    } else if (kind === "start" || kind === "end" || kind === "initial" || kind === "final") {
      out.push(
        `<rect x="${round(r.x)}" y="${round(r.y)}" width="${round(r.w)}" height="${round(r.h)}" rx="${Math.round(r.h / 2)}" fill="${fill}"${elementPaintAttrs(eff, "")}/>`,
      );
      out.push(
        `<text x="${round(r.x + r.w / 2)}" y="${round(r.y + r.h / 2 + 4.5)}" text-anchor="middle" font-size="13" font-weight="650" fill="${THEME.text}">${esc(fit(el.name, r.w - 40, 13))}</text>`,
      );
    } else if (kind === "io") {
      const skew = 18;
      const pts = [
        `${round(r.x + skew)},${round(r.y)}`,
        `${round(r.x + r.w)},${round(r.y)}`,
        `${round(r.x + r.w - skew)},${round(r.y + r.h)}`,
        `${round(r.x)},${round(r.y + r.h)}`,
      ].join(" ");
      out.push(
        `<polygon points="${pts}" fill="${fill}"${shapeAttrs}/>`,
      );
      out.push(
        `<text x="${round(r.x + 12 + skew)}" y="${round(r.y + 26)}" font-size="13" font-weight="650" fill="${THEME.text}">${esc(fit(el.name, r.w - 24 - skew * 2, 13))}</text>`,
      );
      if (el.summary) {
        out.push(
          `<text x="${round(r.x + 12 + skew)}" y="${round(r.y + 60)}" font-size="10.5" fill="${THEME.tag}">${esc(fit(el.summary, r.w - 24 - skew * 2, 10.5))}</text>`,
        );
      }
    } else {
      const rx = kind === "attribute" ? Math.round(Math.min(r.h / 2, 30)) : kind === "entity" ? 4 : 8;
      out.push(
        `<rect x="${round(r.x)}" y="${round(r.y)}" width="${round(r.w)}" height="${round(r.h)}" rx="${rx}" fill="${fill}"${shapeAttrs}/>`,
      );
      out.push(
        `<text x="${round(r.x + 12)}" y="${round(r.y + 24)}" font-size="13" font-weight="650" fill="${THEME.text}">${esc(fit(el.name, r.w - 24, 13))}</text>`,
      );
      const parentName = el.parent ? nameById.get(el.parent) : undefined;
      const metaLine = [el.tech, parentName ? `@${parentName}` : ""]
        .filter((s): s is string => Boolean(s))
        .join(" · ");
      if (metaLine) {
        out.push(
          `<text x="${round(r.x + 12)}" y="${round(r.y + 42)}" font-size="11" fill="${THEME.meta}">${esc(fit(metaLine, r.w - 24, 11))}</text>`,
        );
      }
      if (el.summary) {
        out.push(
          `<text x="${round(r.x + 12)}" y="${round(r.y + 60)}" font-size="10.5" fill="${THEME.tag}">${esc(fit(el.summary, r.w - 24, 10.5))}</text>`,
        );
      }
    }
    out.push(`</g>`);
    if (el.props?.user_verified) out.push(verifiedBadge(r.x + r.w + 4, r.y));
    const n = openAnnotations(doc, "element", el.id);
    if (n > 0 && options.showBadges !== false) out.push(badge(r.x + r.w - 12, r.y + 12, n));
  }

  out.push(`</svg>`);
  return out.join("\n");
}
