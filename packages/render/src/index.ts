/**
 * SVG 渲染器（M1）。纯函数：doc + layout → SVG 字符串，无 DOM、无随机、无时间。
 * 输出确定性：同输入逐字节一致（黄金测试的前提）。
 */
import type { CovenantDoc, ViewDef } from "@covenant/core";
import { layoutSequence } from "@covenant/layout";
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

/** 画带跳线弧的边路径：交叉处用二次贝塞尔半圆跳过（表示"不相交的交点"） */
function pathWithHops(points: Point[], hops: Crossing[]): string {
  const R = 7;
  const parts: string[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    parts.push(`${i === 0 ? "M" : "L"}${round(p.x)} ${round(p.y)}`);
    if (i >= points.length - 1) continue;
    const q = points[i + 1]!;
    const dx = q.x - p.x, dy = q.y - p.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const ux = dx / len, uy = dy / len;
    for (const h of hops.filter((x) => x.seg === i).sort((a, b) => a.t - b.t)) {
      const before = { x: h.x - ux * R, y: h.y - uy * R };
      const after = { x: h.x + ux * R, y: h.y + uy * R };
      const nx = -uy, ny = ux;
      parts.push(`L${round(before.x)} ${round(before.y)}`);
      parts.push(`Q${round(h.x + nx * R * 2)} ${round(h.y + ny * R * 2)} ${round(after.x)} ${round(after.y)}`);
    }
  }
  return parts.join(" ");
}
const round = (n: number): number => Math.round(n * 100) / 100;

/* --------------------------- 标签避让 --------------------------- */

export interface LabelRequest {
  text: string;
  primary: Point;
  candidates: Point[];
}

export interface PlacedLabel extends Point {
  width: number;
}

const LABEL_FONT = 10.5;
const LABEL_H = 13;

function labelBox(p: Point, width: number): Rect {
  return { x: p.x - width / 2 - 2, y: p.y - 10, w: width + 4, h: LABEL_H + 2 };
}

function hitsAny(box: Rect, obstacles: Rect[]): boolean {
  return obstacles.some(
    (o) => box.x < o.x + o.w && o.x < box.x + box.w && box.y < o.y + o.h && o.y < box.y + box.h,
  );
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
  const placed: PlacedLabel[] = [];
  for (const req of requests) {
    const width = textWidth(req.text, LABEL_FONT);
    let chosen: Point | null = null;
    for (const cand of req.candidates) {
      if (!hitsAny(labelBox(cand, width), occupied)) {
        chosen = cand;
        break;
      }
    }
    if (!chosen) chosen = fallbackLabelPoint(req.primary, width, occupied) ?? req.primary;
    placed.push({ x: chosen.x, y: chosen.y, width });
    occupied.push(labelBox(chosen, width));
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

/** 边标签：优先 props.label，其次按关系语义生成（transition/communicates/relates） */
function edgeLabelText(rel: { kind: string; props?: Record<string, unknown> }): string {
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

function kindFill(kind: string): string {
  return THEME.nodeFill[kind] ?? "#ffffff";
}

function isDashed(kind: string): boolean {
  return THEME.dashedKinds.has(kind);
}

function openAnnotations(
  doc: CovenantDoc,
  kind: "element" | "relation",
  id: string,
): number {
  return (doc.annotations ?? []).filter((a) => {
    const t = a.target as { kind?: string; id?: string };
    return (
      t?.kind === kind &&
      t?.id === id &&
      (a.status === "open" || a.status === "ack")
    );
  }).length;
}

function badge(x: number, y: number, n: number): string {
  return [
    `<g class="badge"><circle cx="${round(x)}" cy="${round(y)}" r="10" fill="${THEME.badge}" stroke="#fff" stroke-width="1.5"/>`,
    `<text x="${round(x)}" y="${round(y + 3.6)}" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff">${n}</text></g>`,
  ].join("");
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

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="cvn-title cvn-desc" font-family="${THEME.font}">`,
  );
  out.push(`<title id="cvn-title">${esc(title)}</title>`);
  out.push(`<desc id="cvn-desc">${esc(doc.meta?.purpose ?? "")}</desc>`);
  out.push(
    `<defs><marker id="cvn-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${THEME.edge}"/></marker></defs>`,
  );
  out.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${THEME.bg}"/>`);

  // 参与者与生命线
  for (const p of seq.participants) {
    const cx = p.x + p.w / 2;
    out.push(`<g class="participant" data-id="${esc(p.id)}">`);
    out.push(
      `<rect x="${round(p.x)}" y="${round(seq.headerY)}" width="${round(p.w)}" height="${seq.headerH}" rx="6" fill="${THEME.nodeFill.participant ?? "#ffffff"}" stroke="${THEME.nodeStroke}" stroke-width="1.5"/>`,
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
    const dash = m.kind === "reply" ? ' stroke-dasharray="5 3"' : "";
    out.push(`<g class="message kind-${esc(m.kind)}" data-id="${esc(m.relId)}">`);
    if (m.self) {
      const x = m.fromX;
      out.push(
        `<path d="M${round(x)},${round(m.y)} h34 v20 h-34" fill="none" stroke="${THEME.edge}" stroke-width="1.5"${dash} marker-end="url(#cvn-arrow)"/>`,
      );
      out.push(
        `<text x="${round(x + 40)}" y="${round(m.y - 4)}" font-size="10.5" fill="${THEME.edgeLabel}">${esc(`${m.index}. ${m.label}`)}</text>`,
      );
    } else {
      out.push(
        `<line x1="${round(m.fromX)}" y1="${round(m.y)}" x2="${round(m.toX)}" y2="${round(m.y)}" stroke="${THEME.edge}" stroke-width="1.5"${dash} marker-end="url(#cvn-arrow)"/>`,
      );
      const mid = (m.fromX + m.toX) / 2;
      out.push(
        `<text x="${round(mid)}" y="${round(m.y - 6)}" text-anchor="middle" font-size="10.5" fill="${THEME.edgeLabel}">${esc(`${m.index}. ${m.label}`)}</text>`,
      );
    }
    out.push(`</g>`);
    const n = openAnnotations(doc, "relation", m.relId);
    if (n > 0 && options.showBadges !== false) out.push(badge(m.fromX + 14, m.y - 20, n));
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

  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="cvn-title cvn-desc" font-family="${THEME.font}">`,
  );
  out.push(`<title id="cvn-title">${esc(title)}</title>`);
  out.push(`<desc id="cvn-desc">${esc(doc.meta?.purpose ?? "")}</desc>`);
  out.push(
    `<defs><marker id="cvn-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${THEME.edge}"/></marker></defs>`,
  );
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

  // edges：先画路径（交叉处用跳线弧表示"不相交"），再统一做标签避让
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
        // 接线点模式：边是"点与点之间的直线"，交叉处才需要跳线弧
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
  for (let i = 0; i < edgeGeoms.length; i++) {
    const { edge, rel, points, lane } = edgeGeoms[i]!;
    const earlier = edgeGeoms.slice(0, i).map((g) => g.points);
    const hops = edgeCrossings(points, earlier, nodeRects);
    const d = pathWithHops(points, hops);
    edgeParts.push(
      `<g class="edge" data-id="${esc(edge.id)}">` +
        `<path d="${d}" fill="none" stroke="transparent" stroke-width="10" pointer-events="stroke"/>` +
        `<path d="${d}" fill="none" stroke="${THEME.edge}" stroke-width="1.6" marker-end="url(#cvn-arrow)"/>` +
        `</g>`,
    );
    const p = points;
    const horizontal =
      p.length === 4 && Math.abs(p[0]!.x - p[3]!.x) >= Math.abs(p[0]!.y - p[3]!.y);
    const aboveChannel = p.length === 4 && p[1]!.y < p[0]!.y;
    const primary =
      p.length === 2
        ? (() => {
            const a = p[0]!, b = p[1]!;
            const dx = b.x - a.x, dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            return { x: (a.x + b.x) / 2 - (dy / len) * 12, y: (a.y + b.y) / 2 + (dx / len) * 12 };
          })()
        : aboveChannel
          ? { x: (p[1]!.x + p[2]!.x) / 2, y: p[1]!.y + 14 }
      : !horizontal
        ? p.length === 4
          ? { x: p[1]!.x + 8 + lane * 14, y: (p[1]!.y + p[2]!.y) / 2 }
          : (p[0] ?? { x: 0, y: 0 })
        : p.length === 4
          ? { x: (p[1]!.x + p[2]!.x) / 2, y: p[1]!.y - 6 - lane * 12 }
          : (p[0] ?? { x: 0, y: 0 });
    labelRequests.push({
      text: edgeLabelText(rel),
      primary,
      candidates: labelCandidates(primary, aboveChannel, horizontal),
    });
    const n = openAnnotations(doc, "relation", edge.id);
    if (n > 0 && options.showBadges !== false) {
      badgeIndexes.push({ index: labelRequests.length - 1, n });
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
  for (let i = 0; i < placedLabels.length; i++) {
    const l = placedLabels[i]!;
    const req = labelRequests[i]!;
    out.push(
      // 边标签用胶囊承载，压住线也不影响阅读
      `<rect class="edge-label-bg" x="${round(l.x - l.width / 2 - 5)}" y="${round(l.y - 11)}" width="${round(l.width + 10)}" height="17" rx="8.5" fill="${THEME.labelBg}" stroke="${THEME.labelStroke}" stroke-width="0.8"/>`,
      `<text class="edge-label" x="${round(l.x)}" y="${round(l.y)}" text-anchor="middle" font-size="${LABEL_FONT}" fill="${THEME.edgeLabel}">${esc(req.text)}</text>`,
    );
  }
  for (const b of badgeIndexes) {
    const l = placedLabels[b.index];
    if (l) out.push(badge(l.x + Math.max(18, l.width / 2 + 8), l.y - 8, b.n));
  }
  // nodes
  const nameById = new Map((doc.elements ?? []).map((e) => [e.id, e.name]));
  for (const el of doc.elements ?? []) {
    const r = layout.nodes[el.id];
    if (!r) continue;
    const kind = el.kind;
    const dash = isDashed(kind) ? ' stroke-dasharray="6 3"' : "";
    const fill = kindFill(kind);
    out.push(`<g class="node kind-${esc(kind)}" data-id="${esc(el.id)}">`);
    if (junction) {
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      out.push(
        `<circle cx="${round(cx)}" cy="${round(cy)}" r="6" fill="${THEME.junctionDot}" stroke="${THEME.bg}" stroke-width="1.5"/>`,
        `<text x="${round(cx)}" y="${round(cy + 22)}" text-anchor="middle" font-size="12" font-weight="650" fill="${THEME.text}">${esc(fit(el.name, 180, 12))}</text>`,
      );
      out.push(`</g>`);
      const jn = openAnnotations(doc, "element", el.id);
      if (jn > 0 && options.showBadges !== false) out.push(badge(r.x + r.w - 12, r.y + 12, jn));
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
        `<polygon points="${pts}" fill="${fill}" stroke="${THEME.nodeStroke}" stroke-width="1.5"${dash}/>`,
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
        `<rect x="${round(r.x)}" y="${round(r.y)}" width="${round(r.w)}" height="${round(r.h)}" rx="${Math.round(r.h / 2)}" fill="${fill}" stroke="${THEME.nodeStroke}" stroke-width="1.5"/>`,
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
        `<polygon points="${pts}" fill="${fill}" stroke="${THEME.nodeStroke}" stroke-width="1.5"${dash}/>`,
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
        `<rect x="${round(r.x)}" y="${round(r.y)}" width="${round(r.w)}" height="${round(r.h)}" rx="${rx}" fill="${fill}" stroke="${THEME.nodeStroke}" stroke-width="1.5"${dash}/>`,
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
    const n = openAnnotations(doc, "element", el.id);
    if (n > 0 && options.showBadges !== false) out.push(badge(r.x + r.w - 12, r.y + 12, n));
  }

  out.push(`</svg>`);
  return out.join("\n");
}
