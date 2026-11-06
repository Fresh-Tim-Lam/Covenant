/**
 * 编辑模式元素工具栏 + 放置模式（由 packages/render/src/html.ts 的 SCRIPT 模板以
 * ${SCRIPT_ELEM_TOOLBAR} 注入到同一个 IIFE 作用域）。
 *
 * 职责：工具栏按钮渲染、放置模式状态机（placingKind）、占位落点（elemPlacePts）。
 * 路由几何在 script-state.ts（route/clearPath），patch ops 在 script-edit-relations.ts。
 */
export const SCRIPT_ELEM_TOOLBAR = `
  // —— 编辑模式元素工具栏：c4 标准五类按钮，点击进入放置模式（点画布落元素）——
  var placingKind = null;
  var elemPlacePts = {}; // { [docId]: { [elemId]: [x,y] } } 占位落点（SVG 用户坐标，运行时视觉用）
  var ELEM_PALETTE = [
    { kind: "container", label: "容器" },
    { kind: "person", label: "人员" },
    { kind: "datastore", label: "存储" },
    { kind: "queue", label: "队列" },
    { kind: "external-system", label: "外部系统" },
  ];
  function ensureElemToolbar(){
    var el = document.getElementById("elem-toolbar");
    if (el) return el;
    el = document.createElement("div");
    el.id = "elem-toolbar";
    for (var i = 0; i < ELEM_PALETTE.length; i++){
      (function(item){
        var btn = document.createElement("button");
        btn.className = "elem-tb-btn";
        btn.setAttribute("data-kind", item.kind);
        btn.textContent = "+ " + item.label;
        btn.title = "点击后在画布上选择放置位置";
        btn.addEventListener("click", function(ev){
          ev.stopPropagation();
          beginPlace(item.kind, item.label);
        });
        el.appendChild(btn);
      })(ELEM_PALETTE[i]);
    }
    var wrap = document.getElementById("stage-wrap");
    (wrap || document.body).appendChild(el);
    return el;
  }
  function beginPlace(kind, label){
    cancelConnecting();
    placingKind = kind;
    document.body.classList.add("placing");
    showToast("放置「" + label + "」：点击画布位置（Esc 取消）");
  }
  function cancelPlacing(){
    if (!placingKind) return;
    placingKind = null;
    document.body.classList.remove("placing");
  }
  /** 放置模式/工具栏创建的元素：占位落点记录在点击处（仅运行时视觉，patch 不含坐标） */
  function rememberPlacePt(docId, id, pt){
    if (!elemPlacePts[docId]) elemPlacePts[docId] = {};
    elemPlacePts[docId][id] = pt;
  }
  function forgetPlacePt(docId, id){
    if (elemPlacePts[docId]) delete elemPlacePts[docId][id];
  }
  /** 客户端坐标 → SVG 用户坐标（getScreenCTM 逆变换；jsdom 无该 API 时退回原始值） */
  function clientToSvg(svg, cx, cy){
    try {
      if (!svg.getScreenCTM) return [cx, cy];
      var m = svg.getScreenCTM();
      if (!m) return [cx, cy];
      var inv = m.inverse();
      var pt = svg.createSVGPoint ? svg.createSVGPoint() : null;
      if (!pt) return [cx, cy];
      pt.x = cx; pt.y = cy;
      var p = pt.matrixTransform(inv);
      return [p.x, p.y];
    } catch (e4) { return [cx, cy]; }
  }
  function elementKindOptions(){
    var doc = currentDoc();
    var els = (doc && doc.elements) || [];
    var seen = {}, out = [];
    for (var i = 0; i < els.length; i++){
      var k = String(els[i].kind || "");
      if (!k || seen[k]) continue;
      seen[k] = 1; out.push(k);
    }
    out.sort();
    return out.length ? out : ["container"];
  }
  function templateForKind(doc, kind){
    var els = (doc && doc.elements) || [];
    for (var i = 0; i < els.length; i++) if (els[i].kind === kind) return els[i];
    return null;
  }
  /** 暂存元素的占位落点（运行时视觉；id 在 submitCreateElement 生成后回填） */
  var pendingPlacePt = null;
  function placePtPending(doc, pt){
    pendingPlacePt = { docId: doc.docId, pt: pt };
  }
  ensureElemToolbar();
`;
