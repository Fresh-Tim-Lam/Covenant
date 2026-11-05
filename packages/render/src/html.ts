/**
 * 自包含单文件 HTML（M3：可标注版）。
 *
 * 构建期：布局 + SVG（不画角标）→ 内联；浏览器端：
 *   点选元素/关系 → 新增批注（localStorage）→ 角标实时更新 → 导出 .patch.json。
 * 零外部请求；语义副本内嵌于 #covenant-data，AI 可直接读取。
 */
import { COVENANT_VERSION, type CovenantDoc, type Evidence, type ImplStatus, type ViewDef } from "@covenant/core";
import type { LayoutResult, Point, Rect } from "@covenant/layout";
import { CSS } from "./viewer.css";
import { SCRIPT_EDIT_ELEMENTS } from "./viewer/script-edit-elements";
import { SCRIPT_STATE } from "./viewer/script-state";

export interface DocView {
  doc: CovenantDoc;
  svg: string;
  layout: LayoutResult;
  /** 视图 id：一份文档多视图时用于区分导航/本地存储 */
  viewId?: string;
  viewTitle?: string;
  /**
   * 来源路径（可选）：CLI 若传入 `examples/covenant-self.cvn.yaml` 这类相对路径，
   * 侧栏分组可据此精确判定；未传时退回按 doc.id 推断。
   */
  source?: string;
}

export interface SiteOptions {
  title?: string;
}

/** 侧栏分组的规范顺序（未声明的自定义组追加在最后，保持首次出现顺序） */
const GROUP_ORDER = ["自身架构", "系统契约", "示例演示", "模板", "其他"];

function groupFromId(id: string): string {
  if (id === "covenant/self-architecture") return "自身架构";
  if (id === "covenant/self") return "系统契约";
  // 示例工程的命名空间（与 examples/ 下文件对应）
  if (id === "covenant/package-graph") return "示例演示";
  if (/^templates?\//.test(id)) return "模板";
  if (/^(example|examples|order|orders|payments|topology|quickstart)\//.test(id)) return "示例演示";
  return "其他";
}

/**
 * 侧栏分组：优先 doc.meta.group（格式未正式声明字段，按可选扩展读取）；
 * 其次按来源路径；最后按 doc.id 命名空间推断（CLI 目前未传 source，线上看板走这条）。
 */
function docGroup(view: DocView): string {
  const declared = (view.doc.meta as unknown as Record<string, unknown> | undefined)?.group;
  if (typeof declared === "string" && declared.trim()) return declared.trim();
  const src = (view.source ?? "").replace(/\\/g, "/");
  if (src) {
    if (/(^|\/)arch\//.test(src)) return "系统契约";
    if (/examples\/covenant-self[^/]*$/.test(src)) return "自身架构";
    if (/(^|\/)examples\//.test(src)) return "示例演示";
    if (/(^|\/)templates\//.test(src)) return "模板";
  }
  return groupFromId(view.doc.id);
}

function groupRank(name: string): number {
  const i = GROUP_ORDER.indexOf(name);
  return i < 0 ? GROUP_ORDER.length : i;
}

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 内联 JSON 必须转义 `<`，否则 `</script>` 会提前闭合 */
function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function anchors(layout: LayoutResult) {
  const elements: Record<string, [number, number]> = {};
  for (const [id, r] of Object.entries(layout.nodes)) {
    elements[id] = [r.x + r.w - 12, r.y + 12] as [number, number];
  }
  const relations: Record<string, [number, number]> = {};
  for (const e of layout.edges) {
    const p = e.points;
    const mid = p.length === 4 ? { x: (p[1]!.x + p[2]!.x) / 2, y: (p[1]!.y + p[2]!.y) / 2 } : (p[0] ?? { x: 0, y: 0 });
    relations[e.id] = [mid.x + 18, mid.y - 8] as [number, number];
  }
  return { elements, relations };
}

/**
 * 折线按弧长取 t=0.5 的点：保证"连到边的中间"而不是端口/箭头附近。
 * 不能简单取 points 数组下标中位点——紧凑布局的边通常是 6 点路径
 * （端口 → 侧边 stub → 竖向 jog → 通道横段 → … → 端口），数组中间点会落在拐角/stub 上。
 */
function polylineMidpoint(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { ...points[0]! };
  const segs: { a: Point; b: Point; len: number }[] = [];
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len });
    total += len;
  }
  if (total === 0) return { ...points[0]! };
  const target = total / 2;
  let acc = 0;
  for (const s of segs) {
    if (acc + s.len >= target) {
      const t = s.len === 0 ? 0 : (target - acc) / s.len;
      return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
    }
    acc += s.len;
  }
  return { ...points[points.length - 1]! };
}

/**
 * 关系的路径几何（供浏览器端按"段"做热区/锚点/badge）。
 * junction 视图下渲染器把边画成"节点中心到节点中心的直线"，这里必须用同一份 2 点覆盖，
 * 否则运行时段的命中区域与静态 SVG 不一致。
 */
interface RelationSegments {
  points: [number, number][];
  segmentCount: number;
}

function relationSegments(
  layout: LayoutResult,
  doc: CovenantDoc,
  viewDef: ViewDef | undefined,
): Record<string, RelationSegments> {
  const junction = viewDef?.present?.node_style === "junction";
  const out: Record<string, RelationSegments> = {};
  for (const e of layout.edges) {
    let points: [number, number][] = e.points.map((p) => [p.x, p.y] as [number, number]);
    if (junction) {
      const rel = (doc.relations ?? []).find((r) => r.id === e.id);
      const from = rel ? layout.nodes[rel.from] : undefined;
      const to = rel ? layout.nodes[rel.to] : undefined;
      if (from && to) {
        points = [
          [from.x + from.w / 2, from.y + from.h / 2],
          [to.x + to.w / 2, to.y + to.h / 2],
        ];
      }
    }
    out[e.id] = { points, segmentCount: Math.max(1, points.length - 1) };
  }
  return out;
}

/**
 * 引导线锚点：元素取矩形中心，关系取折线按弧长的中点（与 badge 锚点不同，badge 偏右上角）。
 * 多小窗的引导线需要"连到元素/边本体"的中间位置，所以单独投影一份。
 * 段窗（w.segment != null）的锚点由浏览器端用 segments 的段中点计算。
 */
function centers(layout: LayoutResult, segments: Record<string, RelationSegments>) {
  const elements: Record<string, [number, number]> = {};
  for (const [id, r] of Object.entries(layout.nodes)) {
    elements[id] = [r.x + r.w / 2, r.y + r.h / 2] as [number, number];
  }
  const relations: Record<string, [number, number]> = {};
  for (const e of layout.edges) {
    const g = segments[e.id];
    const mid = polylineMidpoint(
      g ? g.points.map((p) => ({ x: p[0], y: p[1] })) : e.points,
    );
    relations[e.id] = [mid.x, mid.y] as [number, number];
  }
  return { elements, relations };
}

/** 投影到内嵌 JSON 的证据项（lines 只在有值时输出，控制体积） */
interface ProjectedEvidence {
  kind: "doc" | "code";
  path: string;
  lines?: string;
}

interface ProjectedElement {
  id: string;
  kind: string;
  name: string;
  summary: string;
  tech: string;
  implStatus?: ImplStatus;
  implStatusExplicit?: boolean;
  evidence?: ProjectedEvidence[];
}

interface ProjectedRelation {
  id: string;
  kind: string;
  from: string;
  to: string;
  summary: string;
  implStatus?: ImplStatus;
  implStatusExplicit?: boolean;
  evidence?: ProjectedEvidence[];
}

/** impl_status 强度序：implemented(0) < partial(1) < planned(2) < not_connected(3) < unknown(4) */
const IMPL_STATUS_ORDER: Record<ImplStatus, number> = {
  implemented: 0,
  partial: 1,
  planned: 2,
  not_connected: 3,
  unknown: 4,
};

/** 关系缺省 impl_status = 两端有效状态中较弱者（取 max） */
function weakerImplStatus(a: ImplStatus, b: ImplStatus): ImplStatus {
  return IMPL_STATUS_ORDER[b] > IMPL_STATUS_ORDER[a] ? b : a;
}

/** 证据只在非空时输出；无字段文档的 DATA 字节不变 */
function projectEvidence(list: Evidence[] | undefined): ProjectedEvidence[] | undefined {
  if (!list || list.length === 0) return undefined;
  return list.map((ev) => {
    const out: ProjectedEvidence = { kind: ev.kind, path: ev.path };
    if (ev.lines) out.lines = ev.lines;
    return out;
  });
}

function projectDoc(view: DocView) {
  const d = view.doc;
  // 与 CLI 构建一致地解析当前视图（junction 的 node_style 影响边的实际绘制几何）
  const viewDef: ViewDef | undefined = view.viewId
    ? (d.views ?? []).find((v) => v.id === view.viewId)
    : (d.views && d.views.length === 1 ? d.views[0] : undefined);
  const segments = relationSegments(view.layout, d, viewDef);
  // 元素有效状态先算好，关系缺省时按弱端继承
  const elementStatus = new Map<string, ImplStatus>();
  for (const e of d.elements ?? []) elementStatus.set(e.id, e.impl_status ?? "implemented");
  return {
    key: view.viewId ? `${d.id}#${view.viewId}` : d.id,
    docId: d.id,
    viewId: view.viewId ?? null,
    defaultViewId: d.views && d.views.length ? d.views[0].id : null,
    title: view.viewTitle ?? d.meta?.title ?? d.id,
    group: docGroup(view),
    purpose: d.meta?.purpose ?? "",
    nonGoals: d.meta?.non_goals ?? [],
    rev: d.meta?.rev ?? 0,
    profile: d.profile,
    size: { width: view.layout.width, height: view.layout.height },
    anchors: anchors(view.layout),
    centers: centers(view.layout, segments),
    segments: segments,
    positions: Object.fromEntries(
      Object.entries(view.layout.nodes).map(([id, r]) => [id, [r.x, r.y]]),
    ) as Record<string, [number, number]>,
    elements: (d.elements ?? []).map((e): ProjectedElement => {
      const status: ImplStatus = e.impl_status ?? "implemented";
      const explicit = e.impl_status !== undefined;
      const out: ProjectedElement = {
        id: e.id,
        kind: e.kind,
        name: e.name,
        summary: e.summary,
        tech: e.tech ?? "",
      };
      // 仅"有值"时输出键：显式声明，或有效值不是缺省 implemented
      if (explicit || status !== "implemented") {
        out.implStatus = status;
        out.implStatusExplicit = explicit;
      }
      const evidence = projectEvidence(e.evidence);
      if (evidence) out.evidence = evidence;
      return out;
    }),
    relations: (d.relations ?? []).map((r): ProjectedRelation => {
      const out: ProjectedRelation = {
        id: r.id,
        kind: r.kind,
        from: r.from,
        to: r.to,
        summary: r.summary,
      };
      let status: ImplStatus;
      let explicit: boolean;
      if (r.impl_status !== undefined) {
        status = r.impl_status;
        explicit = true;
      } else {
        status = weakerImplStatus(
          elementStatus.get(r.from) ?? "implemented",
          elementStatus.get(r.to) ?? "implemented",
        );
        explicit = false;
      }
      if (explicit || status !== "implemented") {
        out.implStatus = status;
        out.implStatusExplicit = explicit;
      }
      const evidence = projectEvidence(r.evidence);
      if (evidence) out.evidence = evidence;
      return out;
    }),
    annotations: (d.annotations ?? []).map((a) => ({
      id: a.id,
      target: a.target,
      type: a.type,
      severity: a.severity,
      title: a.title,
      body: a.body ?? "",
      status: a.status,
      author: a.author,
      aiHint: a.ai_hint ?? "",
    })),
  };
}

const SVGNS = "http://www.w3.org/2000/svg";

const SCRIPT = `
(function(){
  "use strict";
  var SVGNS = "http://www.w3.org/2000/svg";
  var DATA = JSON.parse(document.getElementById("covenant-data").textContent);
  var STORE = "covenant:viewer:v1";
  var current = DATA.docs.length ? DATA.docs[0].id : null;
  var selected = null;
  var editing = false;
  // 编辑暂存按 docId 分桶：{ [docId]: { [path]: op } }，避免 A 图的 ops 混进 B 图的 edits.json
  var editOps = {};
  var pendingDiff = null;
  var nodeDrag = null;
  var editingAnn = null;
  var local = load();
  // —— 多小窗状态 ——
  // wins: 打开中的窗口（hover 预览 / 点击保留 / 📌 钉住 三种态）；el 复用 #inspector 作为主窗
  var wins = [];
  var winSeq = 0;
  var zSeq = 0;
  var primaryEl = document.getElementById("inspector");
  var guidesEl = document.getElementById("insp-guides");
  var COLORS = ["#2563eb","#dc2626","#059669","#d97706","#7c3aed","#db2777","#0891b2","#65a30d"];
  var colorSeq = 0;
  var HOVER_CLOSE_MS = 120;
${SCRIPT_STATE}

  // ===== 多小窗 / 同色引导线 / 彩色锚点高亮 =====
  function currentSvg(){
    var docs = document.querySelectorAll(".doc");
    for (var i=0;i<docs.length;i++) if (!docs[i].hidden) return docs[i].querySelector("svg");
    return null;
  }
  function shapeOf(kind, id){
    var svg = currentSvg();
    if (!svg) return null;
    var list = svg.querySelectorAll(kind === "element" ? ".node" : ".edge");
    for (var i=0;i<list.length;i++) if (list[i].getAttribute("data-id") === id) return list[i];
    return null;
  }
  // —— 多段边几何（来自 build 期 projectDoc.segments）——
  function segGeom(doc, id){ return doc && doc.segments ? doc.segments[id] : null; }
  function segCount(doc, id){ var g = segGeom(doc, id); return g ? g.segmentCount : 1; }
  function segMid(doc, id, k){
    var g = segGeom(doc, id);
    if (!g || k == null || k < 0 || k + 1 >= g.points.length) return null;
    var a = g.points[k], b = g.points[k + 1];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  }
  // 运行时注入透明段热区（不改静态 SVG，黄金图不变）
  function ensureSegHits(doc){
    var svg = currentSvg();
    if (!svg || !doc || !doc.segments) return;
    var edges = svg.querySelectorAll(".edge[data-id]");
    for (var i=0;i<edges.length;i++){
      var el = edges[i];
      var id = el.getAttribute("data-id");
      var olds = el.querySelectorAll(".seg-hit");
      for (var o=0;o<olds.length;o++) olds[o].parentNode.removeChild(olds[o]);
      var g = doc.segments[id];
      if (!g) continue;
      for (var k=0;k+1<g.points.length;k++){
        var a = g.points[k], b = g.points[k + 1];
        var p = document.createElementNS(SVGNS, "path");
        p.setAttribute("class", "seg-hit");
        p.setAttribute("data-seg", String(k));
        p.setAttribute("d", "M" + a[0] + " " + a[1] + "L" + b[0] + " " + b[1]);
        p.setAttribute("fill", "none");
        p.setAttribute("stroke", "transparent");
        p.setAttribute("stroke-width", "10");
        p.setAttribute("pointer-events", "stroke");
        bindSegHit(p, id, k);
        el.appendChild(p);
      }
    }
  }
  function bindSegHit(path, id, k){
    path.addEventListener("click", function(ev){
      ev.stopPropagation();
      if (moved) { moved = false; return; }
      closeOtherHoverWins("relation", id, k);
      openWindow("relation", id, "clicked", { x: ev.clientX, y: ev.clientY }, k);
    });
    path.addEventListener("pointerenter", function(ev){
      closeOtherHoverWins("relation", id, k);
      var w = findWin("relation", id, k);
      if (w){ clearTimeout(w.closeTimer); return; }
      openWindow("relation", id, "hover", { x: ev.clientX, y: ev.clientY }, k);
    });
    path.addEventListener("pointerleave", function(ev){
      // 指针移入窗口本体/另一个窗口时不算离开（防 hover 窗边界振荡闪烁）
      var rt = ev.relatedTarget;
      if (rt && rt.closest && rt.closest(".cvn-win")) return;
      var w = findWin("relation", id, k);
      if (w) scheduleHoverClose(w);
    });
  }
  // 悬停预览是瞬态的：进入新对象时立即收掉别的 hover 窗（点击/钉住窗不受影响）
  function closeOtherHoverWins(kind, id, segment){
    for (var i=wins.length-1;i>=0;i--){
      var w = wins[i];
      if (w.state !== "hover" || w.pinned) continue;
      if (w.kind === kind && w.targetId === id && w.segment === segment) continue;
      closeWin(w);
    }
  }
  function findWin(kind, id, segment){
    var seg = segment == null ? null : segment;
    for (var i=wins.length-1;i>=0;i--){
      if (wins[i].kind === kind && wins[i].targetId === id && wins[i].segment === seg) return wins[i];
    }
    return null;
  }
  function activeWin(){ return wins.length ? wins[wins.length-1] : null; }
  function primaryBusy(){ for (var i=0;i<wins.length;i++) if (wins[i].el === primaryEl) return true; return false; }
  function acquireWinEl(){
    if (!primaryBusy()) return primaryEl;
    var el = document.createElement("div");
    el.className = "cvn-win"; el.hidden = true;
    (primaryEl.parentNode || document.body).appendChild(el);
    return el;
  }
  // 8 色确定性调色板：优先取当前未被占用的颜色，占满后循环
  function colorFor(){
    var used = {};
    for (var i=0;i<wins.length;i++) used[wins[i].color] = 1;
    for (var j=0;j<COLORS.length;j++){
      var idx = (colorSeq + j) % COLORS.length;
      if (!used[COLORS[idx]]) { colorSeq = idx + 1; return COLORS[idx]; }
    }
    var c = COLORS[colorSeq % COLORS.length]; colorSeq = (colorSeq + 1) % COLORS.length; return c;
  }
  function colorInUse(color){
    for (var i=0;i<wins.length;i++) if (wins[i].color === color) return true;
    return false;
  }
  function hoverKeyOf(kind, id, segment){
    return kind + "|" + id + "|" + (segment == null ? "" : segment);
  }
  function rememberHoverColor(w){
    var now = Date.now();
    hoverColorMemo[hoverKeyOf(w.kind, w.targetId, w.segment)] = { color: w.color, ts: now };
    // 顺手清理过期记忆，避免无限增长
    for (var mk in hoverColorMemo){
      if (Object.prototype.hasOwnProperty.call(hoverColorMemo, mk) && now - hoverColorMemo[mk].ts > 10000) delete hoverColorMemo[mk];
    }
  }
  function stripIds(el){
    var list = el.querySelectorAll("[id]");
    for (var i=0;i<list.length;i++) list[i].removeAttribute("id");
  }
  function fieldOf(w, name){ return w.el.querySelector('[data-field="' + name + '"]'); }
  function fieldVal(w, name){ var el = fieldOf(w, name); return el ? String(el.value) : ""; }
  function positionWin(w, at){
    var el = w.el;
    var parent = el.offsetParent || document.body;
    var pr = parent.getBoundingClientRect();
    var ww = el.offsetWidth || 360, hh = el.offsetHeight || 320;
    // 级联偏移，避免新窗与现存窗完全重叠
    var off = 18 * ((wins.length - 1) % 8);
    var cx = at && isFinite(at.x) ? at.x : 140 + off;
    var cy = at && isFinite(at.y) ? at.y : 120 + off;
    var maxL = (parent.clientWidth || window.innerWidth || 1024) - ww - 8;
    var maxT = (parent.clientHeight || window.innerHeight || 768) - hh - 8;
    var left = cx - pr.left + 16 + off;
    var top = cy - pr.top + 12 + off;
    el.style.left = Math.max(8, Math.min(left, Math.max(8, maxL))) + "px";
    el.style.top = Math.max(8, Math.min(top, Math.max(8, maxT))) + "px";
  }
  function syncHighlights(){
    var old = document.querySelectorAll(".node.hl, .edge.hl");
    for (var i=0;i<old.length;i++){ old[i].classList.remove("hl"); old[i].style.removeProperty("--hl"); }
    for (var j=0;j<wins.length;j++){
      var el = shapeOf(wins[j].kind, wins[j].targetId);
      if (!el) continue;
      el.classList.add("hl");
      el.style.setProperty("--hl", wins[j].color);
    }
  }
  function anchorOf(w){
    var doc = currentDoc();
    if (!doc) return null;
    if (w.kind === "relation" && w.segment != null){
      var sm = segMid(doc, w.targetId, w.segment);
      if (sm) return sm;
    }
    var src = doc.centers && doc.centers[w.kind === "element" ? "elements" : "relations"];
    var p = src && src[w.targetId];
    if (!p){
      var fb = w.kind === "element" ? (doc.anchors && doc.anchors.elements) : (doc.anchors && doc.anchors.relations);
      p = fb && fb[w.targetId];
    }
    return p || null;
  }
  // 从窗口最近边中点连到锚点（元素中心 / 整边弧长中点 / 段中点）；坐标已换算到 main 容器坐标系
  function guidePoints(w){
    var a = anchorOf(w);
    if (!a) return null;
    var el = w.el;
    var tvx = tx + a[0] * scale, tvy = ty + a[1] * scale;
    var wx = parseFloat(el.style.left) || 0, wy = parseFloat(el.style.top) || 0;
    var ww = el.offsetWidth || 360, wh = el.offsetHeight || 320;
    var cx = wx + ww / 2, cy = wy + wh / 2;
    var dx = tvx - cx, dy = tvy - cy;
    var sx, sy;
    if (Math.abs(dx) * wh >= Math.abs(dy) * ww){ sx = dx < 0 ? wx : wx + ww; sy = cy; }
    else { sx = cx; sy = dy < 0 ? wy : wy + wh; }
    return [sx, sy, tvx, tvy];
  }
  function round1(v){ return String(Math.round(v * 10) / 10); }
  function updateGuides(){
    if (!guidesEl) return;
    var keep = {};
    for (var i=0;i<wins.length;i++){
      var w = wins[i], pts = guidePoints(w);
      if (!pts){
        if (w.line && w.line.parentNode) w.line.parentNode.removeChild(w.line);
        w.line = null;
        continue;
      }
      if (!w.line){
        w.line = document.createElementNS(SVGNS, "line");
        w.line.setAttribute("data-win", w.id);
        w.line.setAttribute("stroke-linecap", "round");
        guidesEl.appendChild(w.line);
      }
      w.line.setAttribute("x1", round1(pts[0]));
      w.line.setAttribute("y1", round1(pts[1]));
      w.line.setAttribute("x2", round1(pts[2]));
      w.line.setAttribute("y2", round1(pts[3]));
      w.line.setAttribute("stroke", w.color);
      keep[w.id] = 1;
    }
    var lines = guidesEl.querySelectorAll("line");
    for (var j=lines.length-1;j>=0;j--){ if (!keep[lines[j].getAttribute("data-win")]) lines[j].parentNode.removeChild(lines[j]); }
    // svg 元素没有 HTMLElement 的 hidden 属性，必须用 attribute 控制，否则引导线永远不显示
    if (wins.length === 0) guidesEl.setAttribute("hidden", "");
    else guidesEl.removeAttribute("hidden");
    var wrapEl = document.getElementById("stage-wrap");
    guidesEl.setAttribute("width", String((wrapEl && wrapEl.clientWidth) || 1024));
    guidesEl.setAttribute("height", String((wrapEl && wrapEl.clientHeight) || 768));
  }
  function colorAlpha(hex, alpha){
    var h = String(hex || "").replace("#", "");
    if (h.length !== 6) return "rgba(37,99,235," + alpha + ")";
    var r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }
  function paintWin(w){
    w.el.setAttribute("data-color", w.color);
    w.el.style.borderColor = w.color;
    var head = w.el.querySelector(".insp-head");
    if (head){
      head.style.borderBottomColor = w.color;
      head.style.boxShadow = "inset 4px 0 0 0 " + w.color;
      // 标题条用该窗颜色的浅色渐染，边框/标题条/引导线/锚点高亮保持同色
      head.style.background = "linear-gradient(90deg, " + colorAlpha(w.color, 0.16) + ", #f8fafc 62%)";
    }
  }
  function winOfEl(el){
    for (var i=0;i<wins.length;i++) if (wins[i].el === el) return wins[i];
    return null;
  }
  function movedIntoWindow(rt){ return rt && rt.closest && rt.closest(".cvn-win"); }
  /**
   * 窗口根元素级监听只装一次（主窗 #inspector 会被反复复用）。
   * 绝对不能每次 renderWin 都 addEventListener：旧闭包会随主窗元素存活，
   * 关闭后仍被触发 → activateWin 把已关闭的"幽灵窗"塞回 wins → 残留高亮/引导线。
   */
  function ensureWinElListeners(el){
    if (el.getAttribute("data-bind") === "1") return;
    el.setAttribute("data-bind", "1");
    el.addEventListener("pointerdown", function(){
      var cur = winOfEl(el);
      if (cur) activateWin(cur);
    });
    el.addEventListener("pointerenter", function(){
      var cur = winOfEl(el);
      if (cur && cur.state === "hover") clearTimeout(cur.closeTimer);
    });
    el.addEventListener("pointerleave", function(ev){
      var cur = winOfEl(el);
      if (!cur || cur.state !== "hover") return;
      // 指针只是移回锚定对象/另一个窗口 → 仍在 hover 区域内，不关闭（防边界振荡闪烁）
      if (movedIntoWindow(ev.relatedTarget)) return;
      var anchorShape = shapeOf(cur.kind, cur.targetId);
      if (anchorShape && ev.relatedTarget && anchorShape.contains(ev.relatedTarget)) return;
      scheduleHoverClose(cur);
    });
  }
  function activateWin(w){
    var idx = wins.indexOf(w);
    if (idx < 0) return; // 已关闭的窗口不再复活（防幽灵高亮/引导线）
    if (wins[wins.length-1] !== w){ wins.splice(idx, 1); wins.push(w); }
    // 点击置顶：仅当不在 DOM 末尾时移动（避免输入框每点一次就重排导致失焦）
    var parent = w.el.parentNode;
    if (parent && parent.lastElementChild !== w.el) parent.appendChild(w.el);
    w.el.style.zIndex = String(20 + (++zSeq % 1000));
    selected = { kind: w.kind, id: w.targetId, segment: w.segment };
    syncHighlights();
    updateGuides();
  }
  function closeWin(w){
    clearTimeout(w.closeTimer);
    if (w.state === "hover" && !w.pinned) rememberHoverColor(w);
    var idx = wins.indexOf(w);
    if (idx >= 0) wins.splice(idx, 1);
    if (w.line && w.line.parentNode) w.line.parentNode.removeChild(w.line);
    w.line = null;
    if (w.el === primaryEl){
      w.el.hidden = true; w.el.innerHTML = "";
      w.el.removeAttribute("data-win"); w.el.removeAttribute("data-color");
      w.el.removeAttribute("data-kind"); w.el.removeAttribute("data-target");
      w.el.removeAttribute("data-segment");
      w.el.style.borderColor = "";
    } else if (w.el.parentNode){
      w.el.parentNode.removeChild(w.el);
    }
    if (selected && selected.kind === w.kind && selected.id === w.targetId && selected.segment === w.segment){
      var top = activeWin();
      selected = top ? { kind: top.kind, id: top.targetId, segment: top.segment } : null;
    }
    if (!wins.length){
      var sel = document.querySelectorAll(".sel");
      for (var i=0;i<sel.length;i++) sel[i].classList.remove("sel");
    }
    syncHighlights();
    updateGuides();
  }
  function closeUnpinned(){
    for (var i=wins.length-1;i>=0;i--) if (!wins[i].pinned) closeWin(wins[i]);
  }
  function closeAll(){ for (var i=wins.length-1;i>=0;i--) closeWin(wins[i]); }
  function openWindow(kind, id, state, at, segment){
    var seg = segment == null ? null : segment;
    var w = findWin(kind, id, seg);
    if (w){
      clearTimeout(w.closeTimer);
      if (state === "clicked" && w.state === "hover"){ w.state = "clicked"; renderWin(w); }
      activateWin(w);
      return w;
    }
    var el = acquireWinEl();
    // hover 预览若刚被同目标关闭过，复用上次颜色（不重新分配 → 不会闪色）
    var memo = state === "hover" ? hoverColorMemo[hoverKeyOf(kind, id, seg)] : null;
    var color = memo && Date.now() - memo.ts < 400 && !colorInUse(memo.color) ? memo.color : colorFor();
    w = { id: "w" + (++winSeq), kind: kind, targetId: id, segment: seg, color: color, state: state, pinned: false, formOpen: false, formScope: seg == null ? "edge" : "segment", el: el, line: null, closeTimer: 0 };
    wins.push(w);
    el.hidden = false;
    el.className = "cvn-win";
    el.setAttribute("data-win", w.id);
    el.setAttribute("data-kind", kind);
    el.setAttribute("data-target", id);
    if (seg != null) el.setAttribute("data-segment", String(seg));
    else el.removeAttribute("data-segment");
    el.setAttribute("data-color", color);
    el.style.borderColor = color;
    ensureWinElListeners(el);
    positionWin(w, at);
    renderWin(w);
    activateWin(w);
    return w;
  }
  // 悬停预览：离开形状后延时关闭；进入窗口/再次悬停会取消计时
  function scheduleHoverClose(w){
    if (!w || w.state !== "hover" || w.pinned) return;
    clearTimeout(w.closeTimer);
    w.closeTimer = setTimeout(function(){ if (w.state === "hover" && !w.pinned) closeWin(w); }, HOVER_CLOSE_MS);
  }

  var searchInput = document.getElementById("views-search");
  if (searchInput) {
    searchInput.addEventListener("input", function() {
      var q = this.value.toLowerCase();
      var groups = document.querySelectorAll("#views .views-group");
      for (var g = 0; g < groups.length; g++) {
        var btns = groups[g].querySelectorAll(".views-doc");
        var visible = 0;
        for (var b = 0; b < btns.length; b++) {
          var match = !q || btns[b].textContent.toLowerCase().includes(q);
          btns[b].style.display = match ? "" : "none";
          if (match) visible++;
        }
        var title = groups[g].querySelector(".views-group-title");
        if (title) title.style.display = visible > 0 ? "" : "none";
      }
    });
  }
  function switchDoc(id){
    current = id; selected = null;
    // 切图必须清掉全部小窗的瞬态：批注内联编辑残留 + 钉住（否则回来时表单会"自动复现"、窗口被隐式钉死）
    editingAnn = null;
    closeAll();
    var docs = document.querySelectorAll(".doc");
    for (var i=0;i<docs.length;i++) docs[i].hidden = docs[i].getAttribute("data-doc") !== id;
    var btns = document.querySelectorAll("#views button");
    for (var j=0;j<btns.length;j++) btns[j].className = btns[j].getAttribute("data-doc") === id ? "views-doc on" : "views-doc";
    var doc = currentDoc();
    // 高亮当前 view 所在分组标题（分组默认全部展开，不折叠）
    var groups = document.querySelectorAll(".views-group");
    for (var g=0; g<groups.length; g++){
      groups[g].className = doc && groups[g].getAttribute("data-group") === doc.group ? "views-group on" : "views-group";
    }
    renderInspector(null, null);
    ensureSegHits(doc);
    drawBadges(doc);
    updateHeader();
    updateEditPending(); refreshElemPendingUi();
    fitView();
  }

  function counts(doc){
    var map = {};
    var list = visibleAnns(doc);
    for (var i=0;i<list.length;i++){
      var a = list[i];
      var st = effStatus(doc, a);
      if (st !== "open" && st !== "ack") continue;
      var t = a.target || {};
      if (!t.kind || !t.id) continue;
      // 关系按 (id, segment) 分开计数：整边 "" / 第 k 段 "k"
      var seg = t.kind === "relation" && t.segment != null ? String(t.segment) : "";
      var k = t.kind + "|" + t.id + "|" + seg;
      map[k] = (map[k] || 0) + 1;
    }
    return map;
  }

  function badgePos(doc, kind, id, seg){
    if (kind === "element") return doc.anchors.elements[id];
    if (seg === "" || seg == null) return doc.anchors.relations[id];
    return segMid(doc, id, Number(seg));
  }

  function drawBadges(doc){
    var svg = document.querySelector('.doc[data-doc="' + doc.key + '"] svg');
    if (!svg) return;
    var old = svg.querySelector("#cvn-badges");
    if (old) old.parentNode.removeChild(old);
    var g = document.createElementNS(SVGNS, "g");
    g.setAttribute("id", "cvn-badges");
    var c = counts(doc);
    for (var key in c){
      if (!Object.prototype.hasOwnProperty.call(c, key)) continue;
      var parts = key.split("|"), kind = parts[0], id = parts[1], seg = parts[2];
      var pos = badgePos(doc, kind, id, seg);
      if (!pos) continue;
      var circle = document.createElementNS(SVGNS, "circle");
      circle.setAttribute("cx", pos[0]); circle.setAttribute("cy", pos[1]); circle.setAttribute("r", "10");
      circle.setAttribute("fill", "#dc2626"); circle.setAttribute("stroke", "#fff"); circle.setAttribute("stroke-width", "1.5");
      circle.setAttribute("data-kind", kind);
      circle.setAttribute("data-id", id);
      if (kind === "relation" && seg !== "") circle.setAttribute("data-seg", seg);
      var text = document.createElementNS(SVGNS, "text");
      text.setAttribute("x", pos[0]); text.setAttribute("y", pos[1] + 3.6);
      text.setAttribute("text-anchor", "middle"); text.setAttribute("font-size", "10.5");
      text.setAttribute("font-weight", "700"); text.setAttribute("fill", "#fff");
      text.textContent = String(c[key]);
      g.appendChild(circle); g.appendChild(text);
    }
    svg.appendChild(g);
  }

  function updateHeader(){
    var doc = currentDoc();
    var n = doc ? pendingCount(doc) : 0;
    var el = document.getElementById("pending");
    if (el) el.textContent = "未导出改动 " + n;
    updateEditPending();
    var annSaveBtn = document.getElementById("btn-ann-save");
    if (annSaveBtn) annSaveBtn.hidden = !(window.__CVN_EDIT__ && window.__CVN_EDIT__.patchEndpoint && n > 0);
  }

  // 按窗口范围取批注：segment == null → 整条边/元素；k → 仅该段
  function annsForScope(doc, kind, id, segment){
    var seg = segment == null ? null : segment;
    return allAnns(doc).filter(function(a){
      var t = a.target || {};
      if (t.kind !== kind || t.id !== id) return false;
      var aSeg = t.segment == null ? null : t.segment;
      return aSeg === seg;
    });
  }
  function visibleAnnsForScope(doc, kind, id, segment){
    return annsForScope(doc, kind, id, segment)
      .filter(function(a){ return !isAnnDeleted(doc, a.id); })
      .map(function(a){ return effAnn(doc, a); });
  }

  function transitions(st){
    if (st === "open") return ["ack", "resolved", "wontfix"];
    if (st === "ack") return ["resolved", "wontfix", "open"];
    if (st === "resolved" || st === "wontfix") return ["open"];
    return [];
  }
  function statusLabel(s){
    if (s === "ack") return "确认";
    if (s === "resolved") return "已解决";
    if (s === "wontfix") return "不修";
    if (s === "open") return "重新打开";
    return s;
  }
  function statusButtons(id, st){
    var t = transitions(st), out = '<div class="acts">';
    for (var i=0;i<t.length;i++){
      out += '<button data-act="' + t[i] + '" data-id="' + esc(id) + '">' + statusLabel(t[i]) + '</button>';
    }
    return out + '</div>';
  }
  var undoStack = [];
  function pushUndo(fn){ undoStack.push(fn); if (undoStack.length > 20) undoStack.shift(); }
  function refreshDocUi(){ var doc = currentDoc(); if (!doc) return; drawBadges(doc); updateHeader(); }
  function deleteAnn(id){
    var doc = currentDoc();
    if (!doc) return;
    var l = localFor(doc.docId);
    var idx = -1;
    for (var i = 0; i < l.add.length; i++) if (l.add[i].id === id) idx = i;
    if (idx >= 0) {
      var removed = l.add.splice(idx, 1)[0];
      save(); refreshDocUi(); renderSelected();
      pushUndo(function(){ localFor(doc.docId).add.splice(idx, 0, removed); save(); refreshDocUi(); renderSelected(); });
      showUndoToast("已删除本地批注", "撤销");
      return;
    }
    if (l.deleted.indexOf(id) < 0) l.deleted.push(id);
    save(); refreshDocUi(); renderSelected();
    pushUndo(function(){ var ll = localFor(doc.docId); ll.deleted = ll.deleted.filter(function(x){ return x !== id; }); save(); refreshDocUi(); renderSelected(); });
    showUndoToast("已移入回收桶（导出时生成 remove）", "撤销");
  }
  function saveAnnEdit(id, w){
    var doc = currentDoc();
    if (!doc || !w) return;
    var l = localFor(doc.docId);
    var values = {
      type: fieldVal(w, "ae-type"),
      severity: fieldVal(w, "ae-sev"),
      title: fieldVal(w, "ae-title").trim(),
      body: fieldVal(w, "ae-body"),
      aiHint: fieldVal(w, "ae-hint"),
    };
    if (!values.title) { alert("标题不能为空"); return; }
    var idx = -1;
    for (var i = 0; i < l.add.length; i++) if (l.add[i].id === id) idx = i;
    if (idx >= 0) {
      for (var k in values) if (Object.prototype.hasOwnProperty.call(values, k)) l.add[idx][k] = values[k];
    } else {
      l.edited[id] = values;
    }
    editingAnn = null;
    save(); refreshDocUi(); renderWin(w);
    showToast("批注已更新（导出补丁生效）");
  }
  function restoreAnn(id){
    var doc = currentDoc();
    if (!doc) return;
    var l = localFor(doc.docId);
    l.deleted = l.deleted.filter(function(x){ return x !== id; });
    save(); refreshDocUi(); renderSelected();
    pushUndo(function(){ localFor(doc.docId).deleted.push(id); save(); refreshDocUi(); renderSelected(); });
    showUndoToast("已恢复批注", "撤销");
  }
  function undoLast(){
    var fn = undoStack.pop();
    if (fn) { fn(); showToast("已撤销"); }
  }
  function showUndoToast(msg, label){
    var tip = document.getElementById("toast");
    if (!tip) { tip = document.createElement("div"); tip.id = "toast"; document.body.appendChild(tip); }
    tip.innerHTML = '<span>' + esc(msg) + '</span><button id="toast-undo">' + esc(label) + '</button>';
    tip.className = "show undoable";
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function(){ tip.className = ""; tip.textContent = ""; }, 3200);
    var ub = document.getElementById("toast-undo");
    if (ub) ub.addEventListener("click", function(ev){ ev.stopPropagation(); tip.className = ""; undoLast(); });
  }

  function setStatus(annId, status, w){
    var doc = currentDoc();
    if (!doc) return;
    localFor(doc.docId).status[annId] = status;
    save();
    drawBadges(doc);
    updateHeader();
    if (w) renderWin(w);
  }

  function renderInspector(kind, id, segment){
    // 兼容旧调用：null 表示清空全部窗口；否则定位/创建对应窗口并重绘
    if (!id){ closeAll(); return; }
    var w = findWin(kind, id, segment);
    if (!w){ openWindow(kind, id, "clicked", null, segment); return; }
    renderWin(w);
  }
  function renderSelected(){
    if (!selected){ closeAll(); return; }
    renderInspector(selected.kind, selected.id, selected.segment);
  }

  function renderAnnItems(doc, list){
    var html = '';
    for (var i=0;i<list.length;i++){
      var a = list[i];
      var st = effStatus(doc, a);
      var isEditingThis = editingAnn === a.id;
      var localChanged = localFor(doc.docId).status[a.id] ? ' · 本地改为 ' + st : '';
      html += '<li' + (isEditingThis ? ' class="editing"' : '') + '><div><span class="chip ' + esc(a.severity) + '">' + esc(a.severity) + '</span><span class="chip type">' + esc(a.type) + '</span><span class="hint">' + esc(st) + ' · ' + esc(a.author) + esc(localChanged) + '</span></div>';
      html += '<div class="ann-title">' + esc(a.title) + '</div>';
      if (a.body) html += '<div class="ann-body">' + esc(a.body) + '</div>';
      if (a.aiHint) html += '<div class="ann-hint"><b>AI 指令：</b>' + esc(a.aiHint) + '</div>';
      html += '<button class="del-ann" data-id="' + esc(a.id) + '" title="删除批注（可撤销/回收桶）">×</button>';
      html += '<button class="edit-ann" data-id="' + esc(a.id) + '">编辑</button>';
      html += statusButtons(a.id, st);
      html += '</li>';
    }
    return html;
  }

  // 实现状态 chip + 结构化证据（仅小窗内展示，不画进 SVG）
  function implStatusChip(status){
    var st = status || "implemented";
    return '<span class="impl-chip impl-' + esc(st) + '">' + esc(st) + '</span>';
  }
  function implStatusRow(obj){
    var out = '<div class="kv"><b>实现</b>' + implStatusChip(obj.implStatus);
    if (obj.implStatusExplicit === false) out += '<span class="impl-note">（继承自端点）</span>';
    return out + '</div>';
  }
  function renderEvidence(evidence){
    if (!evidence || !evidence.length) return '';
    var out = '<h3 style="margin-top:12px">证据（' + evidence.length + '）</h3><ul class="evidence">';
    for (var i=0;i<evidence.length;i++){
      var e = evidence[i] || {};
      var p = String(e.path == null ? "" : e.path);
      var loc = p + (e.lines ? ':' + String(e.lines) : '');
      var kind = String(e.kind || "");
      out += '<li><span class="ev-kind ev-' + esc(kind) + '">' + esc(kind) + '</span>' +
        '<code class="ev-path" title="' + esc(loc) + '">' + esc(loc) + '</code>' +
        '<button type="button" class="copy-evidence" data-copy="' + esc(loc) + '" title="复制证据路径">复制</button></li>';
    }
    return out + '</ul>';
  }

  // 单个小窗的内容渲染 + 事件绑定（多窗共用；主窗复用 #inspector 保留旧 id 以便兼容）
  function renderWin(w){
    var doc = currentDoc();
    if (!doc) return;
    var kind = w.kind, id = w.targetId;
    var obj = kind === "element" ? byId(doc.elements, id) : byId(doc.relations, id);
    if (!obj){ closeWin(w); return; }
    var html = "";
    if (kind === "element"){
      html += '<h3>' + esc(obj.name) + '</h3><div class="meta">' + esc(obj.id) + ' · ' + esc(obj.kind) + '</div>';
      html += '<div class="kv"><b>职责</b>' + esc(obj.summary) + '</div>';
      if (obj.tech) html += '<div class="kv"><b>技术</b>' + esc(obj.tech) + '</div>';
    } else {
      html += '<h3>' + esc(obj.kind) + '</h3><div class="meta">' + esc(obj.id) + ' · ' + esc(obj.from) + ' → ' + esc(obj.to) + '</div>';
      html += '<div class="kv"><b>语义</b>' + esc(obj.summary) + '</div>';
    }
    // 实现状态（缺省 implemented；关系缺省为弱端继承）+ 证据列表（不画进 SVG）
    html += implStatusRow(obj);
    html += renderEvidence(obj.evidence);
    if (editing) {
      html += '<div class="edit-box"><h3>编辑（暂存）</h3>';
      if (kind === "element") {
        html += '<label>名称</label><input id="e-name" data-field="e-name" value="' + esc(obj.name) + '">';
        html += '<label>职责</label><textarea id="e-summary" data-field="e-summary">' + esc(obj.summary) + '</textarea>';
        html += '<label>技术</label><input id="e-tech" data-field="e-tech" value="' + esc(obj.tech || "") + '">';
        var pos = doc.positions && doc.positions[id] ? doc.positions[id] : [0, 0];
        html += '<div class="row"><div><label>X</label><input id="e-pin-x" data-field="e-pin-x" type="number" value="' + esc(pos[0]) + '"></div><div><label>Y</label><input id="e-pin-y" data-field="e-pin-y" type="number" value="' + esc(pos[1]) + '"></div></div>';
      } else {
        html += '<label>语义</label><textarea id="e-summary" data-field="e-summary">' + esc(obj.summary) + '</textarea>';
      }
      html += '<button id="edit-apply" data-field="edit-apply">暂存修改</button><p class="hint">导出编辑 JSON 后运行 covenant edit 预览/应用。</p></div>';
    }
    var list = visibleAnnsForScope(doc, kind, id, w.segment);
    var wholeEdge = kind === "relation" && w.segment != null ? visibleAnnsForScope(doc, kind, id, null) : [];
    var scopeLabel = w.segment != null ? ' · 本段' : '';
    html += '<h3 style="margin-top:12px">批注（' + list.length + scopeLabel + '）</h3>';
    if (!list.length) html += '<p class="hint">' + (w.segment != null ? '本段还没有批注。' : '还没有批注。') + '</p>';
    else html += '<ul class="anns">' + renderAnnItems(doc, list) + '</ul>';
    // 段窗：可折叠的"整条边批注"，保证旧批注（无 segment）可见/可操作
    if (kind === "relation" && w.segment != null){
      html += '<div class="whole-edge-box">' +
        '<button type="button" class="whole-edge-toggle" aria-expanded="false">整条边批注（' + wholeEdge.length + '）</button>' +
        '<div class="whole-edge-body" hidden>' +
        (wholeEdge.length ? '<ul class="anns">' + renderAnnItems(doc, wholeEdge) + '</ul>' : '<p class="hint">整条边还没有批注。</p>') +
        '</div>' +
        '<div class="whole-edge-actions"><button type="button" class="open-edge-win">打开整条边窗口</button></div>' +
        '</div>';
    }
    var trash = localFor(doc.docId).deleted;
    if (trash.length) {
      html += '<details class="trash"><summary>🗑 回收桶（' + trash.length + '）</summary><p class="hint">已隐藏；导出补丁会生成 remove 操作。点「恢复」撤回。</p><ul class="anns">';
      for (var t = 0; t < trash.length; t++) {
        var ta = byId(doc.annotations, trash[t]);
        html += '<li><div class="ann-title">' + esc(ta ? ta.title : "（文档中已不存在）") + '</div><div class="hint">' + esc(trash[t]) + '</div><button class="trash-restore" data-id="' + esc(trash[t]) + '">恢复</button></li>';
      }
      html += '</ul></details>';
    }
    var editTarget = null;
    for (var q = 0; q < list.length; q++) if (list[q].id === editingAnn) editTarget = list[q];
    for (var q2 = 0; q2 < wholeEdge.length && !editTarget; q2++) if (wholeEdge[q2].id === editingAnn) editTarget = wholeEdge[q2];
    if (editTarget) {
      var ea = editTarget;
      html += '<div class="form edit-form"><div class="edit-head"><h3>编辑批注</h3><div class="edit-actions"><button class="ann-save" data-id="' + esc(ea.id) + '">保存</button><button class="ann-cancel" data-id="' + esc(ea.id) + '" title="取消编辑，返回新增批注">← 返回</button></div></div>' +
        '<div class="row"><div><label>类型</label><select id="ae-type" data-field="ae-type">' + ["risk","question","todo","defect","smell","decision"].map(function(t){ return "<option" + (t === ea.type ? " selected" : "") + ">" + t + "</option>"; }).join("") + '</select></div>' +
        '<div><label>严重度</label><select id="ae-sev" data-field="ae-sev">' + ["blocker","high","medium","low"].map(function(s2){ return "<option" + (s2 === ea.severity ? " selected" : "") + ">" + s2 + "</option>"; }).join("") + '</select></div></div>' +
        '<label>标题</label><input id="ae-title" data-field="ae-title" value="' + esc(ea.title) + '">' +
        '<label>正文</label><textarea id="ae-body" data-field="ae-body">' + esc(ea.body || "") + '</textarea>' +
        '<label>给 AI 的指令 ai_hint</label><textarea id="ae-hint" data-field="ae-hint">' + esc(ea.aiHint || "") + '</textarea>' +
        '</div>';
    } else {
      editingAnn = null;
      // 段窗：新建默认落在本段，可切"整条边"（target 不带 segment）
      var scopeRow = '';
      if (kind === "relation" && w.segment != null){
        scopeRow = '<div class="row"><div><label>标注范围</label><select id="f-scope" data-field="f-scope">' +
          '<option value="segment"' + (w.formScope === "edge" ? "" : " selected") + '>本段（第 ' + (w.segment + 1) + ' 段）</option>' +
          '<option value="edge"' + (w.formScope === "edge" ? " selected" : "") + '>整条边</option>' +
          '</select></div></div>';
      }
      // 「新增批注」折叠：标题行右侧 [保存] [取消]（展开时可见），底部无提交按钮
      html += '<div class="form ann-form">' +
        '<div class="ann-form-head">' +
        '<button type="button" class="ann-form-toggle" aria-expanded="' + (w.formOpen ? "true" : "false") + '"><span class="ann-form-chev">' + (w.formOpen ? "▾" : "▸") + '</span>＋ 新增批注</button>' +
        '<div class="ann-form-actions"' + (w.formOpen ? "" : " hidden") + '>' +
        '<button id="f-submit" data-field="f-submit" class="f-submit-btn">保存</button>' +
        '<button type="button" class="f-cancel-btn" data-field="f-cancel">取消</button>' +
        '</div></div>' +
        '<div class="ann-form-body"' + (w.formOpen ? "" : " hidden") + '>' +
        scopeRow +
        '<div class="row"><div><label>类型</label><select id="f-type" data-field="f-type"><option>risk</option><option>question</option><option>todo</option><option>defect</option><option>smell</option><option>decision</option></select></div>' +
        '<div><label>严重度</label><select id="f-sev" data-field="f-sev"><option>high</option><option selected>medium</option><option>low</option><option>blocker</option></select></div></div>' +
        '<label>标题（一句话结论）</label><input id="f-title" data-field="f-title" placeholder="例如：这里缺少降级路径">' +
        '<label>正文（证据与背景）</label><textarea id="f-body" data-field="f-body"></textarea>' +
        '<label>给 AI 的指令 ai_hint（祈使句，可留空）</label><textarea id="f-hint" data-field="f-hint" placeholder="例如：优先改为异步；禁止两阶段提交"></textarea>' +
        '</div></div>';
        '</div></div>';
    }
    var headHint = (kind === "element" ? "元素" : "关系") + ' · ' + esc(id) +
      (w.segment != null ? ' · 段 ' + (w.segment + 1) + '/' + segCount(doc, id) : '');
    var verified = !!localFor(doc.docId).checked[id];
    var head = '<div class="insp-head" id="insp-drag"><span class="grip" aria-hidden="true" title="按住拖动窗口"></span><button class="pin-btn" id="insp-pin" aria-pressed="false" title="钉住：点击别处不关闭">📌</button><span class="win-dot" style="background:' + w.color + '"></span><span class="hint">' + headHint + '</span><span class="insp-actions"><button class="verify-top-btn' + (verified ? " on" : "") + '" data-id="' + esc(id) + '" data-kind="' + esc(kind) + '" title="核验通过：图上显示 ✓ 徽章">' + (verified ? "✓" : "✓") + '</button><button class="copy-btn" id="insp-copy" title="复制该对象的语义与批注 JSON">复制</button><button class="insp-close" id="insp-close" title="关闭">×</button></span></div>';
    w.el.innerHTML = head + '<div class="insp-body">' + html + '</div>';
    refreshCheckedBadges(doc);
    w.el.hidden = false;
    if (w.el !== primaryEl) stripIds(w.el);
    bindWin(w);
    paintWin(w);
    if (editingAnn) {
      var ef = w.el.querySelector(".edit-form");
      if (ef && ef.scrollIntoView) ef.scrollIntoView({ block: "nearest" });
    }
    syncHighlights();
    updateGuides();
  }

  function bindWin(w){
    var el = w.el;
    var kind = w.kind, id = w.targetId;
    var head = el.querySelector(".insp-head");
    var closeBtn = el.querySelector(".insp-close");
    if (closeBtn) closeBtn.addEventListener("click", function(ev){ ev.stopPropagation(); closeWin(w); });
    var copyBtn = el.querySelector(".copy-btn");
    if (copyBtn) copyBtn.addEventListener("click", function(ev){ ev.stopPropagation(); copySelection(kind, id, w.segment); });
    // 证据路径复制（复用 fallbackCopy；不做 file:// 跳转）
    var evBtns = el.querySelectorAll(".copy-evidence");
    for (var evi = 0; evi < evBtns.length; evi++){
      (function(btn){
        btn.addEventListener("click", function(ev){
          ev.stopPropagation();
          var text = btn.getAttribute("data-copy") || "";
          fallbackCopy(text, function(ok){ showToast(ok ? "已复制路径" : "复制失败：请手动选择路径"); });
        });
      })(evBtns[evi]);
    }
    var pinBtn = el.querySelector(".pin-btn");
    if (pinBtn) {
      function paintPin(){
        pinBtn.className = w.pinned ? "pin-btn on" : "pin-btn";
        pinBtn.setAttribute("aria-pressed", w.pinned ? "true" : "false");
        pinBtn.title = w.pinned ? "已钉住：点击别处也不关闭（再点取消）" : "钉住：点击别处不关闭";
      }
      paintPin();
      pinBtn.addEventListener("click", function(ev){
        ev.stopPropagation();
        w.pinned = !w.pinned;
        if (w.pinned){ w.state = "clicked"; clearTimeout(w.closeTimer); }
        paintPin();
        showToast(w.pinned ? "已钉住：点击别处不关闭" : "已取消钉住：点击别处会关闭");
      });
    }
    var toggle = el.querySelector(".ann-form-toggle");
    if (toggle) toggle.addEventListener("click", function(ev){
      ev.stopPropagation();
      w.formOpen = !w.formOpen;
      var body = el.querySelector(".ann-form-body");
      if (body) body.hidden = !w.formOpen;
      var actions = el.querySelector(".ann-form-actions");
      if (actions) actions.hidden = !w.formOpen;
      toggle.setAttribute("aria-expanded", w.formOpen ? "true" : "false");
      var chev = toggle.querySelector(".ann-form-chev");
      if (chev) chev.textContent = w.formOpen ? "▾" : "▸";
      updateGuides();
    });
    var cancelBtn = el.querySelector(".f-cancel-btn");
    if (cancelBtn) cancelBtn.addEventListener("click", function(ev){
      ev.stopPropagation();
      w.formOpen = false;
      var body = el.querySelector(".ann-form-body");
      if (body) body.hidden = true;
      var actions = el.querySelector(".ann-form-actions");
      if (actions) actions.hidden = true;
      var tg = el.querySelector(".ann-form-toggle");
      if (tg) { tg.setAttribute("aria-expanded", "false"); var ch = tg.querySelector(".ann-form-chev"); if (ch) ch.textContent = "▸"; }
    });
    if (head) {
      head.addEventListener("pointerdown", function(ev){
        if (!ev.target || !ev.target.closest || ev.target.closest("button")) return;
        ev.preventDefault();
        // 必须阻止冒泡：否则 pointerdown 会传到画布 → 触发画布平移/点击清除选择
        ev.stopPropagation();
        if (ev.button !== 0) return;
        activateWin(w);
        draggingWin = true;
        var parent = el.offsetParent || document.body;
        var px = function(v){ var n = parseFloat(v); return isFinite(n) ? n : 0; };
        var drag = {
          sx: ev.clientX,
          sy: ev.clientY,
          l: px(el.style.left) || el.offsetLeft,
          t: px(el.style.top) || el.offsetTop,
          moved: false,
        };
        function move(e2){
          var dx = e2.clientX - drag.sx, dy = e2.clientY - drag.sy;
          if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
          if (!drag.moved) return;
          // 允许拖出容器边界（不钳制），用户可通过滚动/缩放找回窗口
          el.style.left = (drag.l + dx) + "px";
          el.style.top = (drag.t + dy) + "px";
          updateGuides();
        }
        function up(){ draggingWin = false; pointerSuppressedUntil = Date.now() + SUPPRESS_AFTER_DRAG_MS; window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); }
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      });
    }
    // 窗口根元素的 pointerdown/enter/leave 由 ensureWinElListeners 一次性安装（见上），
    // 这里只按当前窗口状态刷新内容；不要再往 el 上绑监听（会累积旧闭包 → 幽灵窗）。
    // 段窗：折叠"整条边批注" + 打开整条边窗口
    var wholeToggle = el.querySelector(".whole-edge-toggle");
    if (wholeToggle) wholeToggle.addEventListener("click", function(ev){
      ev.stopPropagation();
      var body = el.querySelector(".whole-edge-body");
      var open = body ? body.hidden : false;
      if (body) body.hidden = !open;
      wholeToggle.setAttribute("aria-expanded", open ? "true" : "false");
      updateGuides();
    });
    var openEdgeBtn = el.querySelector(".open-edge-win");
    if (openEdgeBtn) openEdgeBtn.addEventListener("click", function(ev){
      ev.stopPropagation();
      openWindow("relation", id, "clicked", { x: ev.clientX, y: ev.clientY }, null);
    });
    // 新建批注的标注范围（本段 / 整条边）
    var scopeSel = fieldOf(w, "f-scope");
    if (scopeSel) scopeSel.addEventListener("change", function(){ w.formScope = String(scopeSel.value); });
    var editBtns = el.querySelectorAll(".edit-ann");
    for (var ei = 0; ei < editBtns.length; ei++){
      (function(btn){ btn.addEventListener("click", function(ev){ ev.stopPropagation(); editingAnn = btn.getAttribute("data-id"); w.formOpen = false; renderWin(w); }); })(editBtns[ei]);
    }
    var saveBtns = el.querySelectorAll(".ann-save");
    for (var si2 = 0; si2 < saveBtns.length; si2++){
      (function(btn){ btn.addEventListener("click", function(ev){ ev.stopPropagation(); saveAnnEdit(btn.getAttribute("data-id"), w); }); })(saveBtns[si2]);
    }
    var cancelBtns = el.querySelectorAll(".ann-cancel");
    for (var ci = 0; ci < cancelBtns.length; ci++){
      (function(btn){ btn.addEventListener("click", function(ev){ ev.stopPropagation(); editingAnn = null; renderWin(w); }); })(cancelBtns[ci]);
    }
    var delBtns = el.querySelectorAll(".del-ann");
    for (var di = 0; di < delBtns.length; di++){
      (function(btn){ btn.addEventListener("click", function(ev){ ev.stopPropagation(); deleteAnn(btn.getAttribute("data-id")); }); })(delBtns[di]);
    }
    var resBtns = el.querySelectorAll(".trash-restore");
    for (var ri = 0; ri < resBtns.length; ri++){
      (function(btn){ btn.addEventListener("click", function(ev){ ev.stopPropagation(); restoreAnn(btn.getAttribute("data-id")); }); })(resBtns[ri]);
    }
    if (editing) {
      var applyBtn = fieldOf(w, "edit-apply");
      if (applyBtn) applyBtn.addEventListener("click", function(){ applyEditUi(kind, id, w); });
    }
    // ✓ 核验按钮（顶栏紧凑样式：只切 on 类，文字保持 "✓"）
    var verifyBtns = el.querySelectorAll(".verify-top-btn");
    for (var vi = 0; vi < verifyBtns.length; vi++){
      (function(vb){
        vb.addEventListener("click", function(ev){
          ev.stopPropagation();
          // 注意：bindWin 作用域里没有 doc 变量。此前这里写 doc.docId，
          // 点击瞬间抛 ReferenceError 并被浏览器吞掉 → 按钮"点了没反应"。
          var vdoc = currentDoc();
          if (!vdoc) return;
          var vid = vb.getAttribute("data-id");
          if (!vid) return;
          var ll = localFor(vdoc.docId);
          if (ll.checked[vid]) { delete ll.checked[vid]; } else { ll.checked[vid] = true; }
          save();
          vb.classList.toggle("on", !!ll.checked[vid]);
          vb.textContent = "✓";
          refreshCheckedBadges(vdoc);
        });
      })(verifyBtns[vi]);
    }
    var fSubmit = fieldOf(w, "f-submit");
    if (fSubmit) fSubmit.addEventListener("click", function(){ submit(w); });
    var acts = el.querySelectorAll(".acts button");
    for (var j=0;j<acts.length;j++){
      (function(btn){
        if (!btn.getAttribute("data-act")) return; // 编辑表单的按钮不走状态流转
        btn.addEventListener("click", function(){
          setStatus(btn.getAttribute("data-id"), btn.getAttribute("data-act"), w);
        });
      })(acts[j]);
    }
  }

  function submit(w){
    var doc = currentDoc();
    if (!doc || !w) return;
    var title = fieldVal(w, "f-title").trim();
    if (!title) { alert("标题必填"); return; }
    // 段窗默认标注本段；用户可切"整条边"（target 不带 segment）
    var target = { kind: w.kind, id: w.targetId };
    if (w.kind === "relation" && w.segment != null){
      var scopeEl = fieldOf(w, "f-scope");
      var scope = scopeEl ? String(scopeEl.value) : (w.formScope || "segment");
      w.formScope = scope;
      if (scope !== "edge") target.segment = w.segment;
    }
    var ann = {
      id: newId(),
      target: target,
      type: fieldVal(w, "f-type"),
      severity: fieldVal(w, "f-sev"),
      title: title,
      body: fieldVal(w, "f-body").trim(),
      status: "open",
      author: "human:you",
      created: nowISO(),
      aiHint: fieldVal(w, "f-hint").trim()
    };
    localFor(doc.docId).add.push(ann);
    w.formOpen = false; // 提交后回到默认折叠
    save();
    drawBadges(doc);
    updateHeader();
    renderWin(w);
  }

  function buildPatchFor(doc){
    if (!doc) return null;
    var l = localFor(doc.docId);
    var ops = [];
    for (var i=0;i<l.add.length;i++){
      var a = effAnn(doc, l.add[i]);
      ops.push({ op: "add", path: "/annotations/-", value: {
        id: a.id, target: a.target, type: a.type, severity: a.severity,
        title: a.title, body: a.body, status: a.status, author: a.author,
        created: a.created, ai_hint: a.aiHint || undefined
      }});
    }
    for (var id2 in l.status){
      if (!Object.prototype.hasOwnProperty.call(l.status, id2)) continue;
      if (l.deleted.indexOf(id2) >= 0) continue;
      ops.push({ op: "replace", path: "/annotations/" + id2 + "/status", value: l.status[id2] });
    }
    for (var eid in l.edited){
    if (!Object.prototype.hasOwnProperty.call(l.edited, eid)) continue;
    if (l.deleted.indexOf(eid) >= 0) continue;
    var isLocalAdd = false;
    for (var ai = 0; ai < l.add.length; ai++) if (l.add[ai].id === eid) isLocalAdd = true;
    if (isLocalAdd) continue;
    var orig = byId(doc.annotations, eid);
    if (!orig) continue;
    var merge = effAnn(doc, orig);
    ops.push({ op: "replace", path: "/annotations/" + eid, value: {
      id: merge.id, target: merge.target, type: merge.type, severity: merge.severity,
      title: merge.title, body: merge.body, status: effStatus(doc, merge), author: merge.author,
      created: merge.created, ai_hint: merge.aiHint || undefined
    }});
  }
  for (var d2 = 0; d2 < l.deleted.length; d2++){
      ops.push({ op: "remove", path: "/annotations/" + l.deleted[d2], value: null });
    }
    if (!ops.length && !pushPendingElementOps(doc, ops)) return null;
    for (var cid in l.checked) {
      if (!Object.prototype.hasOwnProperty.call(l.checked, cid) || isPendingElementRemove(doc, cid)) continue;
      var cel = byId(doc.elements, cid);
      if (!cel) continue;
      var newProps = Object.assign({}, cel.props || {}, { user_verified: true });
      ops.push({ op: "replace", path: "/elements/" + cid, value: Object.assign({}, cel, { props: newProps }) });
    }
    var patch = { covenant: "0.1", doc: doc.docId, base_rev: doc.rev, intent: "人工审查（HTML 导出：批注 / 状态流转 / 元素核验 / 元素增删）", ops: ops };
    return patch;
  }

  function buildAnnotationPatch(){ return buildPatchFor(currentDoc()); }

  /** 导出全部文档的改动（单文件 bundle，供 covenant apply 批量落盘） */
  function exportAllPatches(){
    var all = [];
    for (var di = 0; di < DATA.docs.length; di++) {
      var p = buildPatchFor(DATA.docs[di]);
      if (p) all.push(p);
    }
    if (!all.length) { alert("所有文档都没有改动可导出"); return; }
    var bundle = { covenant: "0.1", patches: all };
    var blob = new Blob([JSON.stringify(bundle, null, 2)], {type: "application/json"});
    var url = URL.createObjectURL(blob);
    var a3 = document.createElement("a");
    a3.href = url; a3.download = "covenant-all.patches.json";
    document.body.appendChild(a3); a3.click(); document.body.removeChild(a3);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
    showToast("已导出 " + all.length + " 个文档的补丁");
  }

  function exportPatch(){
    var doc = currentDoc();
    if (!doc) return;
    var patch = buildAnnotationPatch();
    if (!patch) { alert("没有改动可导出"); return; }
    var blob = new Blob([JSON.stringify(patch, null, 2)], {type: "application/json"});
    var url = URL.createObjectURL(blob);
    var a2 = document.createElement("a");
    a2.href = url; a2.download = doc.docId.replace(/\\//g, "-") + ".patch.json";
    document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
  }

  /**
   * 写回：先取服务端真实 rev 并 rebase，再 POST。
   * 为什么必须 rebase：页面里的 doc.rev 是构建时冻结的；服务端每次写回 rev+1，
   * 若不 rebase，第二次写回必然被 gate 以 patch/base-rev 拒绝。
   */
  function serverSaveAnnotations(){
    var patch = buildAnnotationPatch();
    if (!patch) { showToast("没有改动可写回"); return; }
    var cfg = window.__CVN_EDIT__;
    if (!cfg || !cfg.patchEndpoint) { showToast("请用 pnpm edit:serve 打开页面后再写回"); return; }
    var docId = patch.doc;
    var headers = { "content-type": "application/json", "x-covenant-token": cfg.token };
    var revUrl = "/api/rev?doc=" + encodeURIComponent(docId);

    function post(){
      return fetch(cfg.patchEndpoint, {
        method: "POST",
        headers: headers,
        body: JSON.stringify({ patch: patch, actor: "human:you" }),
      }).then(function(r){
        return r.json().then(function(j){ return { status: r.status, body: j }; });
      });
    }

    fetch(revUrl, { headers: headers })
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(revBody){
        // 取不到就按原 rev 试（旧 serve 无 /api/rev 时保持兼容）
        if (revBody && revBody.ok && typeof revBody.rev === "number") {
          if (revBody.rev !== patch.base_rev) {
            patch.base_rev = revBody.rev;  // rebase
            var d0 = docByAny(docId);
            if (d0) d0.rev = revBody.rev;  // 同步本地，供后续导出
          }
        }
        return post();
      })
      .then(function(x){
        if (!x.body || !x.body.ok) {
          var msg = (x.body && x.body.message) ? x.body.message : "写回失败";
          var codes = [];
          if (x.body && x.body.findings) for (var i = 0; i < x.body.findings.length; i++) codes.push(x.body.findings[i].code);
          showToast(msg + (codes.length ? "：" + codes.join(", ") : ""));
          return;
        }
        // 成功后把新 rev 写回内存中的 doc，下一次写回/导出才不会用旧 rev
        var d = docByAny(docId);
        if (d && typeof x.body.rev === "number") d.rev = x.body.rev;
        if (d) {
          delete local[docId]; save();
          drawBadges(d); updateHeader();
          renderSelected();
        }
        showToast("已写回 .cvn.yaml（rev " + x.body.rev + "）");
      })
      .catch(function(){ showToast("写回请求失败：请确认 edit:serve 仍在运行"); });
  }

  function resetLocal(){
    if (!confirm("清空本浏览器里的未导出批注？")) return;
    var doc = currentDoc();
    if (doc) { delete local[doc.docId]; save(); drawBadges(doc); updateHeader(); renderInspector(null, null); }
  }

  var btns = document.querySelectorAll("#views button");
  for (var i=0;i<btns.length;i++){
    (function(b){ b.addEventListener("click", function(){ switchDoc(b.getAttribute("data-doc")); }); })(btns[i]);
  }
  var shapes = document.querySelectorAll(".node, .edge");
  for (var k=0;k<shapes.length;k++){
    (function(el){
      var isEdge = el.classList.contains("edge");
      function kindOf(){ return el.getAttribute("data-kind") || (el.classList.contains("node") ? "element" : "relation"); }
      function idOf(){ return el.getAttribute("data-id") || ""; }
      // 指针从元素/窗口移入窗口或回到锚定对象时不算"移开"（防 hover 窗边界振荡闪烁）
      function movedIntoWindow(rt){ return rt && rt.closest && rt.closest(".cvn-win"); }
      el.addEventListener("click", function(ev){
        ev.stopPropagation();
        if (moved) { moved = false; return; }
        if (pointerSuppressed()) return;
        // 段热区（.seg-hit）自己 stopPropagation 处理；命中则整边 handler 不重复开窗
        var segEl = ev.target && ev.target.closest ? ev.target.closest("[data-seg]") : null;
        if (segEl) return;
        var kind = kindOf(), id = idOf();
        if (!id) return;
        // 点击另一个对象：保留已有点击窗，直接再开一个新窗（多窗并存）；
        // 只有点空白画布才关闭所有未钉住的窗（见 clearSelection）。
        closeOtherHoverWins(kind, id, null);
        openWindow(kind, id, "clicked", { x: ev.clientX, y: ev.clientY });
      });
      // 悬停 → 预览窗 + 同色高亮；移开（非点击/非钉住）→ 延时关闭。
      // 有段热区的边由各 .seg-hit 自己处理悬停，整边 hover 不再介入。
      el.addEventListener("pointerenter", function(ev){
        if (pointerSuppressed()) return;
        if (isEdge && el.querySelector(".seg-hit")) return;
        var kind = kindOf(), id = idOf();
        if (!id) return;
        closeOtherHoverWins(kind, id, null);
        var w = findWin(kind, id, null);
        if (w){ clearTimeout(w.closeTimer); return; }
        openWindow(kind, id, "hover", { x: ev.clientX, y: ev.clientY });
      });
      el.addEventListener("pointerleave", function(ev){
        if (pointerSuppressed()) return;
        if (isEdge && el.querySelector(".seg-hit")) return;
        if (movedIntoWindow(ev.relatedTarget)) return;
        var w = findWin(kindOf(), idOf(), null);
        if (w) scheduleHoverClose(w);
      });
    })(shapes[k]);
  }
  var wrap = document.getElementById("stage-wrap");
  var stage = document.getElementById("stage");

  // 未钉住时：点画布空白、画布外空白、工具条之外的区域都应关闭小窗。
  // 命中节点/连线由它们自己的 click 处理（会 stopPropagation），此处不干预。
  document.addEventListener("click", function(ev){
    if (pointerSuppressed()) return;
    var t = ev.target;
    if (!t || !t.closest || !t.isConnected) return;
    if (t.closest(".cvn-win, #toast, header, #views")) return;
    if (t.closest("a[download]")) return; // 导出用的隐藏下载链接，不应触发关闭
    if (t.closest(".node, .edge")) return;
    clearSelection();
  });
  var zoomLabel = document.getElementById("zoom-label");
  var tx = 0, ty = 0, scale = 1;
  var dragging = false, moved = false, captured = false, activePointerId = null;
  var startX = 0, startY = 0, startTx = 0, startTy = 0, userZoomed = false;

  function clamp(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v; }
  function applyTransform(){
    if (!stage) return;
    stage.style.transform = "translate(" + tx + "px," + ty + "px) scale(" + scale + ")";
    if (zoomLabel) zoomLabel.textContent = Math.round(scale * 100) + "%";
    updateGuides(); // 缩放/平移时引导线实时跟随
  }
  function activeSvg(){
    var docs = document.querySelectorAll(".doc");
    for (var i=0;i<docs.length;i++) if (!docs[i].hidden) return docs[i].querySelector("svg");
    return null;
  }
  function fitView(){
    if (!wrap) return;
    var svg = activeSvg();
    if (!svg) return;
    var sw = 0, sh = 0;
    if (svg.viewBox && svg.viewBox.baseVal){ sw = svg.viewBox.baseVal.width; sh = svg.viewBox.baseVal.height; }
    if (!sw || !sh){ var box = svg.getBoundingClientRect(); sw = box.width; sh = box.height; }
    if (!sw || !sh){ tx = 0; ty = 0; scale = 1; applyTransform(); return; }
    var w = wrap.clientWidth, h = wrap.clientHeight;
    var k = Math.min((w - 56) / sw, (h - 56) / sh, 1.25);
    if (!(k > 0)) k = 1;
    scale = k; tx = (w - sw * scale) / 2; ty = (h - sh * scale) / 2; userZoomed = false; applyTransform();
  }
  function zoomAt(cx, cy, factor){
    if (!wrap) return;
    var rect = wrap.getBoundingClientRect();
    var px = cx - rect.left, py = cy - rect.top;
    var nx = (px - tx) / scale, ny = (py - ty) / scale;
    scale = clamp(scale * factor, 0.15, 4);
    tx = px - nx * scale; ty = py - ny * scale; userZoomed = true; applyTransform();
  }
  function clearSelection(){
    // 点空白 / Esc：关闭所有未钉住的小窗；📌 钉住的窗保持不动
    closeUnpinned();
  }

  function selectionPayload(kind, id, segment){
    var doc = currentDoc();
    if (!doc) return null;
    var seg = segment == null ? null : segment;
    var obj = kind === "element" ? byId(doc.elements, id) : byId(doc.relations, id);
    var anns = annsForScope(doc, kind, id, seg).filter(function(a){ return !isAnnDeleted(doc, a.id); }).map(function(a){ return effAnn(doc, a); }).map(function(a){
      return {
        id: a.id, type: a.type, severity: a.severity, title: a.title,
        body: a.body, status: effStatus(doc, a), author: a.author, aiHint: a.aiHint || undefined
      };
    });
    var target = { kind: kind, id: id };
    if (kind === "relation" && seg != null) target.segment = seg;
    return { doc: doc.docId, rev: doc.rev, target: target, object: obj, annotations: anns };
  }
  function showToast(msg){
    var tip = document.getElementById("toast");
    if (!tip) { tip = document.createElement("div"); tip.id = "toast"; document.body.appendChild(tip); }
    tip.textContent = msg; tip.className = "show";
    clearTimeout(showToast._t);
    showToast._t = setTimeout(function(){ tip.className = ""; }, 1600);
  }
  function fallbackCopy(text, done){
    try {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta); done(ok);
    } catch (e) { done(false); }
  }
  function copySelection(kind, id, segment){
    var payload = selectionPayload(kind, id, segment);
    if (!payload) return;
    var text = JSON.stringify(payload, null, 2);
    function done(ok){ showToast(ok ? "已复制选中对象 JSON" : "复制失败：浏览器不允许剪贴板，请手动选择文本"); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function(){ done(true); }, function(){ fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }

  function updateEditPending(){
    var n = Object.keys(currentEditOps()).length;
    var el = document.getElementById("edit-pending");
    if (el) { el.textContent = "暂存修改 " + n; el.hidden = !editing || n === 0; }
    var ex = document.getElementById("btn-edit-export");
    if (ex) ex.hidden = !editing || n === 0;
    var sb = document.getElementById("btn-edit-save");
    if (sb) sb.hidden = !(editing && window.__CVN_EDIT__);
  }
  function setEditOp(path, value){
    currentEditOps()[path] = { op: "set", path: path, value: value };
    updateEditPending();
  }
  function toggleEdit(){
    editing = !editing;
    document.body.classList.toggle("editing", editing);
    var b = document.getElementById("btn-edit");
    if (b) b.textContent = editing ? "退出编辑" : "编辑";
    updateEditPending();
    // 所有打开的小窗一起切换到/退出编辑态
    for (var i=0;i<wins.length;i++) renderWin(wins[i]);
    showToast(editing ? "编辑模式：改文本/坐标后点「暂存修改」" : "已退出编辑模式");
  }
  function applyEditUi(kind, id, w){
    var doc = currentDoc();
    if (!doc || !w) return;
    if (kind === "element") {
      var name = fieldVal(w, "e-name").trim();
      var summary = fieldVal(w, "e-summary").trim();
      if (!name) { alert("名称不能为空"); return; }
      if (!summary) { alert("职责不能为空"); return; }
      setEditOp("/elements/" + id + "/name", name);
      setEditOp("/elements/" + id + "/summary", summary);
      var tech = fieldVal(w, "e-tech").trim();
      if (tech) setEditOp("/elements/" + id + "/tech", tech);
      var viewId = doc.viewId || doc.defaultViewId;
      if (viewId) {
        var x = Number(fieldVal(w, "e-pin-x")), y = Number(fieldVal(w, "e-pin-y"));
        if (isFinite(x) && isFinite(y)) setEditOp("/views/" + viewId + "/layout/pins/" + id, [x, y]);
      }
    } else {
      var s = fieldVal(w, "e-summary").trim();
      if (!s) { alert("语义不能为空"); return; }
      setEditOp("/relations/" + id + "/summary", s);
    }
    showToast("已暂存修改（共 " + Object.keys(currentEditOps()).length + " 条）");
  }
  function exportEdits(){
    var doc = currentDoc();
    if (!doc) return;
    var bucket = currentEditOps();
    var ops = [];
    for (var k in bucket) if (Object.prototype.hasOwnProperty.call(bucket, k)) ops.push(bucket[k]);
    if (!ops.length) { alert("还没有暂存的修改"); return; }
    var payload = {
      covenant: "0.1", doc: doc.docId, base_rev: doc.rev,
      actor: "human:you", intent: "HTML 编辑（暂存）", ops: ops
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = doc.docId.replace(/\\//g, "-") + ".edits.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1500);
    showToast("已导出 edits.json；运行 covenant edit 预览/应用");
  }

  function serverSave(){
    var api = window.__CVN_EDIT__;
    if (!api) { showToast("未连接编辑服务：请用 covenant serve --edit 打开页面"); return; }
    var doc = currentDoc();
    if (!doc) return;
    var bucket = currentEditOps();
    var ops = [];
    for (var k in bucket) if (Object.prototype.hasOwnProperty.call(bucket, k)) ops.push(bucket[k]);
    if (!ops.length) { alert("还没有暂存的修改"); return; }
    var payload = { covenant: "0.1", doc: doc.docId, base_rev: doc.rev, actor: "human:you", intent: "HTML 编辑（编辑态服务）", ops: ops };
    var accept = !!pendingDiff;
    fetch(api.endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-covenant-token": api.token },
      body: JSON.stringify({ edits: payload, accept: accept })
    }).then(function(r){ return r.json(); }).then(function(res){
      if (!res.ok) { showToast("失败：" + (res.message || "未知错误")); return; }
      if (!accept) {
        pendingDiff = res.diff || "（无差异）";
        var aw = activeWin();
        var box = aw ? aw.el : document.getElementById("inspector");
        if (box) {
          var pre = box.querySelector("#edit-diff");
          if (!pre) { pre = document.createElement("pre"); pre.id = "edit-diff"; box.appendChild(pre); }
          pre.textContent = "预览 diff（再点「确认写回」）：\\n" + pendingDiff;
          pre.style.cssText = "max-height:240px;overflow:auto;background:#0b1220;color:#e2e8f0;padding:8px;border-radius:6px;font-size:11px;white-space:pre-wrap";
        }
        var b = document.getElementById("btn-edit-save");
        if (b) b.textContent = "确认写回";
        showToast("已生成预览：检查 diff 后确认写回");
      } else {
        pendingDiff = null; editOps[doc.docId] = {}; updateEditPending();
        var b2 = document.getElementById("btn-edit-save");
        if (b2) b2.textContent = "预览并写回";
        showToast("已写回 rev=" + res.rev + "（备份 " + res.backup + "）");
      }
    }).catch(function(e){ showToast("请求失败：" + e.message); });
  }

  if (wrap){
    wrap.addEventListener("wheel", function(ev){
      ev.preventDefault();
      zoomAt(ev.clientX, ev.clientY, ev.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });
    wrap.addEventListener("pointerdown", function(ev){
      if (ev.button !== 0) return;
      dragging = true; moved = false; captured = false; activePointerId = ev.pointerId;
      startX = ev.clientX; startY = ev.clientY; startTx = tx; startTy = ty;
      wrap.classList.add("dragging");
      // 注意：这里不能立即 setPointerCapture —— 那会把后续 click 的 target 重定向到 wrap，
      // 导致节点/连线的点选处理器收不到事件（悬浮检查器打不开）。只在真正开始拖拽后再捕获。
    });
    wrap.addEventListener("pointermove", function(ev){
      if (!dragging) return;
      var dx = ev.clientX - startX, dy = ev.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      if (moved && !captured) {
        try { wrap.setPointerCapture(ev.pointerId); captured = true; } catch (e) {}
      }
      if (moved){ tx = startTx + dx; ty = startTy + dy; userZoomed = true; applyTransform(); }
    });
    function endDrag(){
      dragging = false; wrap.classList.remove("dragging");
      if (captured && activePointerId !== null) {
        try { wrap.releasePointerCapture(activePointerId); } catch (e) {}
      }
      captured = false;
    }
    wrap.addEventListener("pointerup", endDrag);
    wrap.addEventListener("pointercancel", endDrag);
    wrap.addEventListener("dragstart", function(ev){ ev.preventDefault(); });
    wrap.addEventListener("selectstart", function(ev){ ev.preventDefault(); });
    wrap.addEventListener("dblclick", function(ev){ onCanvasDblclick(ev); });
    wrap.addEventListener("click", function(ev){
      if (moved) { moved = false; return; }
      if (ev.target === wrap || ev.target === stage) clearSelection();
    });
    window.addEventListener("resize", function(){ if (!userZoomed) fitView(); });
    var zi = document.getElementById("zoom-in");
    if (zi) zi.addEventListener("click", function(){ var r = wrap.getBoundingClientRect(); zoomAt(r.left + r.width/2, r.top + r.height/2, 1.25); });
    var zo = document.getElementById("zoom-out");
    if (zo) zo.addEventListener("click", function(){ var r = wrap.getBoundingClientRect(); zoomAt(r.left + r.width/2, r.top + r.height/2, 1/1.25); });
    var zf = document.getElementById("zoom-fit");
    if (zf) zf.addEventListener("click", fitView);
    var zr = document.getElementById("zoom-reset");
    if (zr) zr.addEventListener("click", function(){ scale = 1; tx = 0; ty = 0; userZoomed = true; applyTransform(); });
    window.addEventListener("keydown", function(ev){ if (ev.key === "Escape") { clearSelection(); closeCreateForm(); } else onElementKeydown(ev); });
  }
  var nodeEls = document.querySelectorAll(".node");
  for (var q = 0; q < nodeEls.length; q++) {
    (function(el){
      el.addEventListener("pointerdown", function(ev){
        if (!editing || ev.button !== 0) return;
        var id = el.getAttribute("data-id");
        var doc = currentDoc();
        var pos = doc && doc.positions && doc.positions[id];
        if (!pos) return;
        ev.stopPropagation(); ev.preventDefault();
        nodeDrag = { id: id, el: el, startX: ev.clientX, startY: ev.clientY, ox: pos[0], oy: pos[1] };
        try { el.setPointerCapture(ev.pointerId); } catch (e) {}
      });
      el.addEventListener("pointermove", function(ev){
        if (!nodeDrag || nodeDrag.el !== el) return;
        var dx = (ev.clientX - nodeDrag.startX) / scale;
        var dy = (ev.clientY - nodeDrag.startY) / scale;
        el.style.transform = "translate(" + dx + "px," + dy + "px)";
      });
      el.addEventListener("pointerup", function(ev){
        if (!nodeDrag || nodeDrag.el !== el) return;
        var dx = (ev.clientX - nodeDrag.startX) / scale;
        var dy = (ev.clientY - nodeDrag.startY) / scale;
        el.style.transform = "";
        var x = Math.round(nodeDrag.ox + dx), y = Math.round(nodeDrag.oy + dy);
        var doc = currentDoc();
        var viewId = doc ? (doc.viewId || doc.defaultViewId) : null;
        if (viewId) setEditOp("/views/" + viewId + "/layout/pins/" + nodeDrag.id, [x, y]);
        var aw = findWin("element", nodeDrag.id);
        if (aw) {
          var px2 = fieldOf(aw, "e-pin-x"), py2 = fieldOf(aw, "e-pin-y");
          if (px2 && py2) { px2.value = String(x); py2.value = String(y); }
        }
        nodeDrag = null;
        showToast("位置已暂存（" + x + ", " + y + "），导出/写回生效");
      });
      el.addEventListener("pointercancel", function(){
        if (nodeDrag && nodeDrag.el === el) { el.style.transform = ""; nodeDrag = null; }
      });
    })(nodeEls[q]);
  }
  var ex = document.getElementById("btn-export"); if (ex) ex.addEventListener("click", exportPatch);
  var exAll = document.getElementById("btn-export-all"); if (exAll) exAll.addEventListener("click", exportAllPatches);
  var annSave = document.getElementById("btn-ann-save"); if (annSave) annSave.addEventListener("click", serverSaveAnnotations);
  try {
    if (localStorage.getItem("covenant:viewer:nav") === "off") document.body.classList.add("nav-collapsed");
  } catch (e) {}
  var navBtn = document.getElementById("btn-nav");
  if (navBtn) navBtn.addEventListener("click", function(){
    document.body.classList.toggle("nav-collapsed");
    try {
      localStorage.setItem("covenant:viewer:nav", document.body.classList.contains("nav-collapsed") ? "off" : "on");
    } catch (e) {}
    setTimeout(fitView, 0);
  });  var be = document.getElementById("btn-edit"); if (be) be.addEventListener("click", toggleEdit);
  var bx = document.getElementById("btn-edit-export"); if (bx) bx.addEventListener("click", exportEdits);
  var bs = document.getElementById("btn-edit-save"); if (bs) bs.addEventListener("click", serverSave);
  var rs = document.getElementById("btn-reset"); if (rs) rs.addEventListener("click", resetLocal);

${SCRIPT_EDIT_ELEMENTS}
  if (DATA.docs.length) switchDoc(DATA.docs[0].key);
  setTimeout(fitView, 0);
})();
`;

export function renderHtml(views: DocView[], options: SiteOptions = {}): string {
  const title = options.title ?? views[0]?.doc.meta?.title ?? "Covenant";
  const docs = views.map(projectDoc);
  const total = views.reduce((n, v) => n + (v.doc.annotations?.length ?? 0), 0);
  const keyOf = (v: DocView): string => (v.viewId ? `${v.doc.id}#${v.viewId}` : v.doc.id);
  const labelOf = (v: DocView): string =>
    `${v.doc.meta?.title ?? v.doc.id}${v.viewTitle ? ` · ${v.viewTitle}` : ""}`;

  // 侧栏按 group 分组：组标题不可点击、组内按钮缩进；默认全部展开（不折叠）
  const grouped = new Map<string, DocView[]>();
  for (const v of views) {
    const g = docGroup(v);
    const list = grouped.get(g);
    if (list) list.push(v);
    else grouped.set(g, [v]);
  }
  const groupNames = [...grouped.keys()].sort((a, b) => groupRank(a) - groupRank(b));
  const firstGroup = views.length ? docGroup(views[0]!) : "";
  const nav = groupNames
    .map((g) => {
      const buttons = grouped
        .get(g)!
        .map((v) => `<button class="views-doc" data-doc="${esc(keyOf(v))}">${esc(labelOf(v))}</button>`)
        .join("\n        ");
      return (
        `<div class="views-group${g === firstGroup ? " on" : ""}" data-group="${esc(g)}">` +
        `<div class="views-group-title">${esc(g)}</div>\n        ${buttons}\n      </div>`
      );
    })
    .join("\n      ");

  const sections = views
    .map(
      (v, i) =>
        `<section class="doc" data-doc="${esc(keyOf(v))}"${i === 0 ? "" : " hidden"}>\n${v.svg}\n</section>`,
    )
    .join("\n");

  return [
    "<!DOCTYPE html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">`,
    `<title>${esc(title)}</title>`,
    `<style>${CSS}</style>`,
    "</head>",
    "<body>",
    "<header>",
    `<h1>${esc(title)}</h1>`,
    `<span class="sub">${views.length} 张契约图 · ${total} 条已入库批注 · 构建期渲染 · 无外部请求</span>`,
    '<span class="sp"></span>',
    '<button id="btn-nav" title="收起/展开侧栏">☰</button>',
    '<div id="zoom">',    '<button id="zoom-out" title="缩小">−</button>',
    '<span id="zoom-label">100%</span>',
    '<button id="zoom-in" title="放大">+</button>',
    '<button id="zoom-fit" title="适应窗口">适应</button>',
    '<button id="zoom-reset" title="100%">1:1</button>',
    '</div>',
    '<span class="sub" id="edit-pending" hidden>暂存修改 0</span>',
    '<button id="btn-edit" title="编辑文本属性与节点位置">编辑</button>',
    '<button id="btn-edit-export" hidden title="导出 edits.json，用 covenant edit 应用">导出编辑 JSON</button>',
    '<button id="btn-edit-save" hidden title="通过本地编辑服务预览 diff 并写回">预览并写回</button>',
    '<span class="sub" id="pending">未导出批注 0</span>',
    '<button id="btn-reset">重置本地改动</button>',
    '<button id="btn-export" class="pri">导出补丁 JSON</button>',
    '<button id="btn-export-all" title="把所有文档的改动打包成一个 covenant-all.patches.json">导出全部 JSON</button>',
    '<button id="btn-ann-save" class="pri" hidden title="把批注改动直接写回 .cvn.yaml（需 pnpm edit:serve）">写回</button>',
    "</header>",
    '<div id="shell">',
    `<aside id="views">\n      <input id="views-search" type="text" placeholder="搜索架构图…" style="width:100%;padding:5px 8px;margin-bottom:6px;border:1px solid var(--line);border-radius:6px;font:inherit;font-size:12px;color:var(--ink2);background:var(--surface);outline:none">
      ${nav}
</aside>`,
    "<main>",
    `<div id="stage-wrap"><div id="stage">\n${sections}\n</div></div>`,
    '<div id="tip">滚轮缩放 · 拖拽平移 · 双击放大 · 悬停预览 · 点击元素/连线标注</div>',
    '<svg id="insp-guides" aria-hidden="true" hidden></svg>',
    '<div id="inspector" hidden class="cvn-win"></div>',
    "</main>",
    "</div>",
    '<footer><span>由 covenant 构建</span><span>只读语义 + 本地批注 · 导出后交给 CLI/Agent 校验入库</span><span>语义副本内嵌于 #covenant-data</span></footer>',
    `<script id="covenant-data" type="application/json">${safeJson({ version: COVENANT_VERSION, docs })}</script>`,
    `<script>${SCRIPT}</script>`,
    "</body>",
    "</html>",
  ].join("\n");
}
