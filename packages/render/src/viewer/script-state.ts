/**
 * 看板运行时「状态与纯工具」分片（自 packages/render/src/html.ts 的 SCRIPT 模板原样拆出）。
 *
 * 为什么拆：html.ts 冻结在 1977 行（`pnpm granularity` 棘轮只许减不许增），
 * 新增「图上增删元素」必须先腾空间；本块是自包含的「指针封印 + localStorage 存取 + 纯工具函数」，
 * 与其余运行时逻辑只通过同一 IIFE 作用域通信，可整段搬走而不改任何标识符。
 *
 * 搬运约定（AGENTS.md E2）：
 *   1. 只做精确文本范围移动，不重命名、不重排、不改缩进；
 *   2. html.ts 里原位置替换为 `${SCRIPT_STATE}`，拼接后渲染出的 HTML 与拆分前逐字节一致；
 *   3. 分片内容不得含反引号或 `${`（否则会截断本模板字符串）。
 *
 * 注意：模板字面量紧跟反引号开始，是为了让拼接结果不带额外换行（首行就是原文件第 348 行）。
 */
export const SCRIPT_STATE = `  var draggingWin = false;
  // 拖拽窗口期间的"指针封印"：
  //   draggingWin 只在按住时有效，但 pointerenter/click 往往在 pointerup **之后**才落到画布上
  //   （窗口移开 → 指针下方换成别的元素 → 事件在释放瞬间派发），于是"拖完立刻触发别的元素"。
  //   因此释放后再封印一小段时间，覆盖释放瞬间的残余事件。
  // panning 同理：画布平移时指针不动而画布在动，节点/连线照样派发 pointerenter，
  // 若只封 draggingWin，"拖画布扫过元素"就会一路弹悬浮窗（实测 bug，见 viewer.verify.test.ts）。
  var SUPPRESS_AFTER_DRAG_MS = 260;
  var pointerSuppressedUntil = 0;
  var panning = false;
  function pointerSuppressed(){
    return draggingWin || panning || (pointerSuppressedUntil && Date.now() < pointerSuppressedUntil);
  }
  // hover 色忆：同一 (kind,id,segment) 的 hover 窗在 400ms 内重开时复用同一颜色，
  // 避免"窗口盖住元素 → leave → close → enter → 重新分配颜色"的振荡闪色。
  var hoverColorMemo = {};

  function normalize(v){
    if (Array.isArray(v)) return { add: v, status: {}, deleted: [], edited: {}, checked: {} };
    if (v && typeof v === "object") return { add: v.add || [], status: v.status || {}, deleted: v.deleted || [], edited: v.edited || {}, checked: v.checked || {} };
    return { add: [], status: {}, deleted: [], edited: {}, checked: {} };
  }
  function load(){
    try {
      var raw = JSON.parse(localStorage.getItem(STORE) || "{}") || {};
      var out = {};
      for (var k in raw) if (Object.prototype.hasOwnProperty.call(raw, k)) out[k] = normalize(raw[k]);
      return out;
    } catch (e) { return {}; }
  }
  function save(){
    try { localStorage.setItem(STORE, JSON.stringify(local)); } catch (e) {}
  }
  function byId(list, id){ for (var i=0;i<list.length;i++) if (list[i].id===id) return list[i]; return null; }
  function docByKey(key){ for (var i=0;i<DATA.docs.length;i++) if (DATA.docs[i].key===key) return DATA.docs[i]; return null; }
  /** 按 docId / key / id 任一命中（写回与导出都按 docId 定位，避免 key≠docId 时取不到） */
  function docByAny(k){ for (var i=0;i<DATA.docs.length;i++){ var d=DATA.docs[i]; if (d.docId===k || d.key===k || d.id===k) return d; } return null; }
  function currentDoc(){ return docByKey(current); }
  function editOpsFor(doc){
    if (!doc) return {};
    if (!editOps[doc.docId]) editOps[doc.docId] = {};
    return editOps[doc.docId];
  }
  function currentEditOps(){ return editOpsFor(currentDoc()); }
  function localFor(id){
    if (!local[id]) local[id] = { add: [], status: {}, deleted: [], edited: {}, checked: {} };
    return local[id];
  }
  function allAnns(doc){ return doc.annotations.concat(localFor(doc.docId).add); }
  function isAnnDeleted(doc, id){ return localFor(doc.docId).deleted.indexOf(id) >= 0; }
  function effAnn(doc, a){
    var ov = localFor(doc.docId).edited[a.id];
    if (!ov) return a;
    var out = {};
    for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = a[k];
    for (var k2 in ov) if (Object.prototype.hasOwnProperty.call(ov, k2)) out[k2] = ov[k2];
    return out;
  }
  function visibleAnns(doc){ var l = localFor(doc.docId); return doc.annotations.filter(function(a){ return l.deleted.indexOf(a.id) < 0; }).map(function(a){ return effAnn(doc, a); }).concat(l.add.map(function(a){ return effAnn(doc, a); })); }
  function effStatus(doc, a){ var ov = localFor(doc.docId).status[a.id]; return ov || a.status; }
  function refreshCheckedBadges(doc){
    // 在"当前激活文档"的 SVG 上画 ✓ 徽章（多文档结构：每文档一个 .doc section + 一个 svg）
    // 注意：section 的 data-doc 存的是 key（docId#viewId，见下方渲染处），不是 docId。
    //       用 docId 会永远匹配不到 → 徽章画不出来。优先 key，回退 docId 兼容旧结构。
    var docKeyAttr = doc.key || doc.docId;
    var section = document.querySelector('.doc[data-doc="' + docKeyAttr + '"]:not([hidden])')
      || document.querySelector('.doc[data-doc="' + doc.docId + '"]:not([hidden])');
    var svg = section ? section.querySelector("svg") : null;
    if (!svg) return;
    svg.querySelectorAll(".verified-badge").forEach(function(b){ b.remove(); });
    var checked = localFor(doc.docId).checked;
    for (var id in checked) {
      if (!Object.prototype.hasOwnProperty.call(checked, id)) continue;
      var el = svg.querySelector('[data-id="' + id + '"]');
      if (!el) continue;
      var bb = el.getBBox ? el.getBBox() : { x: 0, y: 0, width: 120, height: 40 };
      var g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "verified-badge");
      var cx = bb.x + bb.width + 4, cy = bb.y - 4;
      g.innerHTML = '<circle cx="' + cx + '" cy="' + cy + '" r="8" fill="#16a34a" stroke="#fff" stroke-width="1.5"/><path d="M' + (cx-3.5) + ' ' + cy + ' L' + (cx-1) + ' ' + (cy+2.8) + ' L' + (cx+3.5) + ' ' + (cy-2.5) + '" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
      g.setAttribute("pointer-events", "none");
      svg.appendChild(g);
    }
  }
  function pendingCount(doc){ var l = localFor(doc.docId); return l.add.length + Object.keys(l.status).length + l.deleted.length + Object.keys(l.checked).length + Object.keys(l.edited).length; }

  function esc(s){
    return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
  }
  function newId(){
    var A = "0123456789ABCDEFGHJKMNPQRSTVWXYZ", out = "";
    for (var i=0;i<26;i++) out += A.charAt(Math.floor(Math.random()*A.length));
    return "a." + out;
  }
  function nowISO(){
    var d = new Date();
    function p(n){ return (n<10?"0":"") + n; }
    var off = -d.getTimezoneOffset(), sign = off >= 0 ? "+" : "-";
    off = Math.abs(off);
    return d.getFullYear() + "-" + p(d.getMonth()+1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()) + sign + p(Math.floor(off/60)) + ":" + p(off%60);
  }
  // —— 待新增关系的节点盒：真实浏览器用 getBBox；jsdom 无该 API，退回 positions + 名义盒 150x40 ——
  // 返回 layout.Rect 形状 {x,y,w,h}，直接喂给注入的 route()/clearPath()（线路路由底层，ADR/用户裁决：编辑必须结合路由底层）
  function nodeRouteBox(el, doc, id){
    if (el && typeof el.getBBox === "function") {
      try { var b = el.getBBox(); if (b && b.width > 0) return { x: b.x, y: b.y, w: b.width, h: b.height }; } catch (e3) {}
    }
    var p = doc && doc.positions ? doc.positions[id] : null;
    if (!p) return null;
    return { x: p[0] - 75, y: p[1] - 20, w: 150, h: 40 };
  }
  // 全图节点盒表：clearPath 避障要用（无关框的扩展矩形判定）
  function nodesRouteRects(svg, doc){
    var out = {};
    var nodes = svg.querySelectorAll(".node[data-id]");
    for (var i = 0; i < nodes.length; i++){
      var id = nodes[i].getAttribute("data-id");
      var box = nodeRouteBox(nodes[i], doc, id);
      if (box) out[id] = box;
    }
    return out;
  }
  // —— 表单窗口拖拽（创建元素/关系表单不在 wins 体系里，独立绑定）——
  function makeFormDraggable(winEl){
    var head = winEl.querySelector(".insp-head");
    if (!head || head.getAttribute("data-drag") === "1") return;
    head.setAttribute("data-drag", "1");
    head.addEventListener("pointerdown", function(ev){
      if (ev.button !== 0) return;
      if (ev.target && ev.target.closest && ev.target.closest("button")) return;
      ev.preventDefault();
      var sx = ev.clientX, sy = ev.clientY;
      var ol = parseFloat(winEl.style.left) || winEl.offsetLeft;
      var ot = parseFloat(winEl.style.top) || winEl.offsetTop;
      function mv(e2){ winEl.style.left = (ol + e2.clientX - sx) + "px"; winEl.style.top = (ot + e2.clientY - sy) + "px"; }
      function up(){ window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); }
      window.addEventListener("pointermove", mv);
      window.addEventListener("pointerup", up);
    });
  }
  // —— pending 关系路由规划器：按 layout() 主流程同款约定组装 ——
  //   ① 端口：同侧按「对端中心排序 + PORT_GAP=16 对称排布」的空位搜索（避开已有边锚点，不越出框）；
  //   ② routePorts 端口 stub 引出（ROUTE_STUB=20，不贴边平行接入）；
  //   ③ 车道错开：中段通道避开已有边同向通道坐标（±14 步进找空位）；
  //   ④ clearPath 避障（避开无关框）。
  //   route/routePorts/clearPath 来自 SCRIPT_ROUTE_PRELUDE 注入的 layout 真实函数（单一事实源，不自实现）。
  function planPendingRoute(fromBox, toBox, fromId, toId, doc, svg, skipIds, extraUsed){
    var fcx = fromBox.x + fromBox.w / 2, fcy = fromBox.y + fromBox.h / 2;
    var tcx = toBox.x + toBox.w / 2, tcy = toBox.y + toBox.h / 2;
    var horiz = Math.abs(tcx - fcx) >= Math.abs(tcy - fcy);
    var fromSide = horiz ? (tcx >= fcx ? "right" : "left") : (tcy >= fcy ? "bottom" : "top");
    var toSide = horiz ? (tcx >= fcx ? "left" : "right") : (tcy >= fcy ? "top" : "bottom");
    var rels = (doc && doc.relations) || [];
    function sideFixed(box, side){
      return side === "left" ? box.x : side === "right" ? box.x + box.w : side === "top" ? box.y : box.y + box.h;
    }
    function relPts(r){
      return (r.segments && r.segments.points) || null;
    }
    // 某框某侧已被已有边占用的沿边坐标
    function usedAlong(box, side, nodeId){
      var arr = [];
      for (var i = 0; i < rels.length; i++){
        var r = rels[i];
        if (skipIds && skipIds.indexOf(r.id) >= 0) continue;
        var pts = relPts(r);
        if (!pts || pts.length < 2) continue;
        var isFrom = r.from === nodeId, isTo = r.to === nodeId;
        if (!isFrom && !isTo) continue;
        var p = isFrom ? pts[0] : pts[pts.length - 1];
        var onL = Math.abs(p[0] - box.x) < 1, onR = Math.abs(p[0] - (box.x + box.w)) < 1;
        var onT = Math.abs(p[1] - box.y) < 1, onB = Math.abs(p[1] - (box.y + box.h)) < 1;
        var s = onL ? "left" : onR ? "right" : onT ? "top" : onB ? "bottom" : null;
        if (s === side) arr.push(side === "left" || side === "right" ? p[1] : p[0]);
      }
      return arr;
    }
    // 在框的 side 边上找空端口位：自边中心向两侧 16px 步进，避开已用锚点、不越出框
    function pickAlong(box, side, usedArr){
      var along = (side === "left" || side === "right") ? box.y + box.h / 2 : box.x + box.w / 2;
      var lo = (side === "left" || side === "right") ? box.y + 10 : box.x + 10;
      var hi = (side === "left" || side === "right") ? box.y + box.h - 10 : box.x + box.w - 10;
      for (var k = 0; k <= 8; k++){
        var offs = k === 0 ? [0] : [k * 16, -k * 16];
        for (var j = 0; j < offs.length; j++){
          var cand = along + offs[j];
          if (cand < lo || cand > hi) continue;
          var ok = true;
          for (var u = 0; u < usedArr.length; u++) if (Math.abs(usedArr[u] - cand) < 12) { ok = false; break; }
          if (ok) return cand;
        }
      }
      return along;
    }
    var startPt, endPt;
    if (horiz) {
      startPt = { x: sideFixed(fromBox, fromSide), y: pickAlong(fromBox, fromSide, usedAlong(fromBox, fromSide, fromId)) };
      endPt = { x: sideFixed(toBox, toSide), y: pickAlong(toBox, toSide, usedAlong(toBox, toSide, toId)) };
    } else {
      startPt = { x: pickAlong(fromBox, fromSide, usedAlong(fromBox, fromSide, fromId)), y: sideFixed(fromBox, fromSide) };
      endPt = { x: pickAlong(toBox, toSide, usedAlong(toBox, toSide, toId)), y: sideFixed(toBox, toSide) };
    }
    // 车道避让：收集已有边的同向通道坐标，pending 中段 ±14 步进找空位
    var usedMid = [];
    for (var r2 = 0; r2 < rels.length; r2++){
      var rr = rels[r2];
      var pp = (rr && rr.segments && rr.segments.points) || [];
      for (var k = 0; k < pp.length - 1; k++){
        if (Math.abs(pp[k][1] - pp[k + 1][1]) < 0.01) usedMid.push(pp[k][0]);
        else if (Math.abs(pp[k][0] - pp[k + 1][0]) < 0.01) usedMid.push(pp[k][1]);
      }
    }
    if (extraUsed) for (var e2 = 0; e2 < extraUsed.length; e2++) usedMid.push(extraUsed[e2]);
    var pts = routePorts(startPt, endPt, fromSide, toSide, 0);
    // 中段通道落位：routePorts 默认 mid=(stub 端点均值)，与已占通道冲突时 ±14 步进找空位
    function midBlocked(v){
      for (var i = 0; i < usedMid.length; i++) if (Math.abs(usedMid[i] - v) < 12) return true;
      return false;
    }
    var t = 0;
    while (midBlocked(horiz ? pts[1].x : pts[1].y) && t < 8){
      var d = (t % 2 === 0 ? 1 : -1) * 14 * Math.ceil((t + 1) / 2);
      var axis = horiz ? "x" : "y";
      pts[1][axis] += d; pts[2][axis] += d;
      t++;
    }
    return clearPath(dedupe(pts), nodesRouteRects(svg, doc), fromId, toId);
  }`;
