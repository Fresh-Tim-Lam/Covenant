/**
 * 自包含单文件 HTML（M3：可标注版）。
 *
 * 构建期：布局 + SVG（不画角标）→ 内联；浏览器端：
 *   点选元素/关系 → 新增批注（localStorage）→ 角标实时更新 → 导出 .patch.json。
 * 零外部请求；语义副本内嵌于 #covenant-data，AI 可直接读取。
 */
import type { CovenantDoc } from "@covenant/core";
import type { LayoutResult, Rect } from "@covenant/layout";

export interface DocView {
  doc: CovenantDoc;
  svg: string;
  layout: LayoutResult;
  /** 视图 id：一份文档多视图时用于区分导航/本地存储 */
  viewId?: string;
  viewTitle?: string;
}

export interface SiteOptions {
  title?: string;
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

function projectDoc(view: DocView) {
  const d = view.doc;
  return {
    key: view.viewId ? `${d.id}#${view.viewId}` : d.id,
    docId: d.id,
    viewId: view.viewId ?? null,
    defaultViewId: d.views && d.views.length ? d.views[0].id : null,
    title: view.viewTitle ?? d.meta?.title ?? d.id,
    purpose: d.meta?.purpose ?? "",
    nonGoals: d.meta?.non_goals ?? [],
    rev: d.meta?.rev ?? 0,
    profile: d.profile,
    size: { width: view.layout.width, height: view.layout.height },
    anchors: anchors(view.layout),
    positions: Object.fromEntries(
      Object.entries(view.layout.nodes).map(([id, r]) => [id, [r.x, r.y]]),
    ) as Record<string, [number, number]>,
    elements: (d.elements ?? []).map((e) => ({
      id: e.id,
      kind: e.kind,
      name: e.name,
      summary: e.summary,
      tech: e.tech ?? "",
    })),
    relations: (d.relations ?? []).map((r) => ({
      id: r.id,
      kind: r.kind,
      from: r.from,
      to: r.to,
      summary: r.summary,
    })),
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

const CSS = `
:root{--bg:#f8fafc;--panel:#fff;--ink:#0f172a;--muted:#64748b;--line:#cbd5e1;--accent:#2563eb;--danger:#dc2626}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
body{font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:var(--ink);background:var(--bg);display:flex;flex-direction:column;overflow:hidden}
header{display:flex;align-items:center;gap:10px;padding:8px 14px;background:var(--panel);border-bottom:1px solid var(--line);flex:0 0 auto}
header h1{font-size:15px;margin:0;font-weight:650;white-space:nowrap}
header .sub{color:var(--muted);font-size:12px;white-space:nowrap}
header .sp{flex:1}
header button{font:inherit;font-size:12px;padding:5px 9px;border-radius:6px;border:1px solid var(--line);background:#fff;cursor:pointer;color:var(--ink)}
header button.pri{background:var(--accent);color:#fff;border-color:var(--accent)}
#zoom{display:flex;align-items:center;gap:4px}
#zoom-label{min-width:42px;text-align:center;color:var(--muted);font-size:12px;font-variant-numeric:tabular-nums}
#shell{display:flex;flex:1;min-height:0}
#views{width:224px;flex:0 0 224px;display:flex;flex-direction:column;gap:4px;padding:8px;background:var(--panel);border-right:1px solid var(--line);overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:thin}
#views button{display:block;width:100%;text-align:left;white-space:normal;word-break:break-word;font:inherit;font-size:12.5px;line-height:1.35;padding:7px 9px;border:1px solid transparent;border-radius:7px;background:transparent;cursor:pointer;color:var(--ink)}
#views button:hover{background:#f1f5f9}
#views button.on{background:#dbeafe;border-color:var(--accent);color:var(--accent);font-weight:600}
body.nav-collapsed #views{display:none}
main{position:relative;flex:1;min-height:0;overflow:hidden}
#stage-wrap{position:absolute;inset:0;overflow:hidden;cursor:grab;touch-action:none}
#stage-wrap.dragging{cursor:grabbing}
#stage{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform}
.doc svg{display:block;background:#fff;border:1px solid var(--line);border-radius:10px}
#tip{position:absolute;left:12px;bottom:10px;z-index:5;background:rgba(255,255,255,.92);border:1px solid var(--line);border-radius:999px;padding:3px 10px;font-size:11.5px;color:var(--muted);pointer-events:none}
#inspector{position:absolute;left:16px;top:16px;z-index:20;width:360px;max-width:calc(100vw - 24px);max-height:calc(100% - 24px);display:flex;flex-direction:column;overflow:hidden;background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:0 14px 36px rgba(15,23,42,.2)}
#inspector[hidden]{display:none}
.insp-head{display:flex;align-items:center;gap:6px;flex:0 0 38px;height:38px;padding:0 10px;background:linear-gradient(#f8fafc,#f1f5f9);border-bottom:1px solid var(--line);border-radius:10px 10px 0 0;cursor:grab;user-select:none;-webkit-user-select:none}
.insp-body{flex:1;min-height:0;overflow:auto;padding:10px 14px 14px}
.insp-head:active{cursor:grabbing}
.insp-head .hint{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#475569}
.grip{width:14px;height:16px;flex:0 0 14px;background-image:radial-gradient(#94a3b8 1px,transparent 1.3px);background-size:5px 5px;opacity:.75}
.insp-head .insp-actions{margin-left:auto}
.insp-close{border:0;background:transparent;font-size:17px;line-height:1;cursor:pointer;color:var(--muted);padding:2px 4px}
.insp-close:hover{color:var(--ink)}
.pin-btn{border:1px solid var(--line);background:#fff;border-radius:6px;font-size:13px;line-height:1;padding:2px 7px;cursor:pointer;opacity:.55;filter:grayscale(1);transition:all .12s}
.pin-btn:hover{opacity:.85;filter:grayscale(.4)}
.pin-btn.on{background:#dbeafe;border-color:var(--accent);opacity:1;filter:none;transform:rotate(-30deg);box-shadow:0 0 0 2px #bfdbfe}
.pin-btn.on::after{content:"●";font-size:7px;color:var(--accent);margin-left:2px}
.del-ann{float:right;border:1px solid var(--line);background:#fff;border-radius:6px;font-size:12px;line-height:1;padding:2px 6px;cursor:pointer;color:#b91c1c}
.del-ann:hover{background:#fee2e2}
.edit-ann{font-size:12px;padding:2px 8px;border:1px solid var(--line);border-radius:6px;background:#fff;cursor:pointer;margin-right:6px}
.anns li.editing{background:#eff6ff;border-color:#bfdbfe}
.edit-form{border-color:#bfdbfe;background:#f8fafc}
.edit-head{display:flex;align-items:center;justify-content:space-between;gap:8px;position:sticky;top:0;z-index:1;background:#f8fafc;padding:2px 0 4px}
.edit-head h3{margin:0}
.edit-actions{display:flex;gap:6px;align-items:center}
.edit-head .ann-save{font-size:12px;padding:3px 12px;border:1px solid #2563eb;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer;font-weight:600}
.edit-head .ann-save:hover{background:#1d4ed8}
.edit-head .ann-cancel{font-size:12px;padding:3px 10px;border:1px solid var(--line);border-radius:6px;background:#fff;cursor:pointer;color:#475569}
.edit-head .ann-cancel:hover{background:#f1f5f9}
.trash{margin-top:10px;padding:8px;border:1px dashed var(--line);border-radius:8px;background:#fafafa}
.trash .anns li{display:flex;justify-content:space-between;gap:8px;align-items:center}
.trash-restore{font-size:12px;padding:2px 8px;border:1px solid var(--line);border-radius:6px;background:#fff;cursor:pointer}
#toast.undoable{pointer-events:auto;display:flex;gap:10px;align-items:center}
#toast button{border:1px solid #93c5fd;background:#eff6ff;color:#1d4ed8;border-radius:6px;padding:2px 8px;cursor:pointer;font:inherit;font-size:12px}
h3{font-size:13px;margin:0 0 8px}
.hint{color:var(--muted);font-size:12px}
.meta{color:var(--muted);font-size:12px;margin-bottom:10px}
.kv{font-size:12.5px;margin:2px 0}
.kv b{color:var(--muted);font-weight:500;display:inline-block;min-width:52px}
ul.anns{list-style:none;margin:10px 0 0;padding:0}
ul.anns li{border:1px solid var(--line);border-radius:8px;padding:9px 10px;margin-bottom:8px}
.chip{display:inline-block;padding:1px 6px;border-radius:999px;font-size:11px;color:#fff;margin-right:4px}
.chip.low{background:#94a3b8}.chip.medium{background:#d97706}.chip.high{background:var(--danger)}.chip.blocker{background:#7f1d1d}
.chip.type{background:#e2e8f0;color:#334155}
.ann-title{font-weight:600;font-size:12.5px;margin:3px 0}
.ann-body{font-size:12px;color:#334155;white-space:pre-wrap}
.ann-hint{margin-top:6px;padding:6px 8px;border-left:3px solid var(--accent);background:#dbeafe;font-size:12px;border-radius:0 4px 4px 0;white-space:pre-wrap}
.form{margin-top:14px;border-top:1px solid var(--line);padding-top:12px}
.form label{display:block;font-size:12px;color:var(--muted);margin:8px 0 4px}
.form input,.form textarea,.form select{width:100%;font:inherit;font-size:12.5px;padding:6px 8px;border:1px solid var(--line);border-radius:6px;background:#fff;color:var(--ink)}
.form textarea{resize:vertical;min-height:52px}
.form .row{display:flex;gap:8px}
.form .row>div{flex:1}
.form button{margin-top:10px;width:100%;font:inherit;font-size:13px;padding:8px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer}
footer{flex:0 0 auto;padding:5px 14px;border-top:1px solid var(--line);background:var(--panel);color:var(--muted);font-size:11.5px;display:flex;gap:16px}
.node,.edge{cursor:pointer}
.node:hover rect,.node:hover polygon,.node:hover ellipse{stroke:var(--accent);stroke-width:2.5}
.node.sel rect,.node.sel polygon,.node.sel ellipse{stroke:var(--accent);stroke-width:2.5}
.edge:hover path{stroke:var(--accent)}
.acts{margin-top:8px;display:flex;gap:6px;flex-wrap:wrap}
.acts button{font:inherit;font-size:11.5px;padding:4px 9px;border:1px solid var(--line);border-radius:6px;background:#fff;cursor:pointer}
.acts button:hover{border-color:var(--accent);color:var(--accent)}
#stage-wrap,header,#views,footer,#tip{user-select:none;-webkit-user-select:none}
svg text{user-select:none}
.editing .node{cursor:move}
#inspector,#inspector input,#inspector textarea,#inspector select{user-select:text}
.insp-actions{display:flex;gap:6px;align-items:center}
.copy-btn{font:inherit;font-size:11.5px;padding:3px 8px;border:1px solid var(--line);border-radius:6px;background:#fff;cursor:pointer;color:var(--ink)}
.copy-btn:hover{border-color:var(--accent);color:var(--accent)}
#toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%) translateY(8px);background:#0f172a;color:#fff;padding:7px 14px;border-radius:8px;font-size:12.5px;opacity:0;pointer-events:none;transition:opacity .15s,transform .15s;z-index:50}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.edit-box{margin-top:12px;border-top:1px dashed var(--line);padding-top:10px}
.edit-box label{display:block;font-size:12px;color:var(--muted);margin:7px 0 3px}
.edit-box input,.edit-box textarea{width:100%;font:inherit;font-size:12.5px;padding:5px 8px;border:1px solid var(--line);border-radius:6px}
.edit-box textarea{min-height:46px;resize:vertical}
.edit-box .row{display:flex;gap:8px}
.edit-box .row>div{flex:1}
.edit-box button{margin-top:9px;width:100%;font:inherit;font-size:12.5px;padding:7px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer}
`;

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
  var pinned = false;
  var editingAnn = null;
  var local = load();

  function normalize(v){
    if (Array.isArray(v)) return { add: v, status: {}, deleted: [], edited: {} };
    if (v && typeof v === "object") return { add: v.add || [], status: v.status || {}, deleted: v.deleted || [], edited: v.edited || {} };
    return { add: [], status: {}, deleted: [], edited: {} };
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
  function currentDoc(){ return docByKey(current); }
  function editOpsFor(doc){
    if (!doc) return {};
    if (!editOps[doc.docId]) editOps[doc.docId] = {};
    return editOps[doc.docId];
  }
  function currentEditOps(){ return editOpsFor(currentDoc()); }
  function localFor(id){
    if (!local[id]) local[id] = { add: [], status: {}, deleted: [], edited: {} };
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
  function pendingCount(doc){ var l = localFor(doc.docId); return l.add.length + Object.keys(l.status).length + l.deleted.length + Object.keys(l.edited).length; }

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

  function switchDoc(id){
    current = id; selected = null;
    // 切图必须清掉悬浮窗的瞬态：批注内联编辑残留 + 钉住（否则回来时表单会"自动复现"、窗口被隐式钉死）
    editingAnn = null;
    pinned = false;
    var docs = document.querySelectorAll(".doc");
    for (var i=0;i<docs.length;i++) docs[i].hidden = docs[i].getAttribute("data-doc") !== id;
    var btns = document.querySelectorAll("#views button");
    for (var j=0;j<btns.length;j++) btns[j].className = btns[j].getAttribute("data-doc") === id ? "on" : "";
    var doc = currentDoc();
    renderInspector(null, null);
    drawBadges(doc);
    updateHeader();
    updateEditPending();
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
      var k = t.kind + "|" + t.id;
      map[k] = (map[k] || 0) + 1;
    }
    return map;
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
      var parts = key.split("|"), kind = parts[0], id = parts[1];
      var pos = kind === "element" ? doc.anchors.elements[id] : kind === "relation" ? doc.anchors.relations[id] : null;
      if (!pos) continue;
      var circle = document.createElementNS(SVGNS, "circle");
      circle.setAttribute("cx", pos[0]); circle.setAttribute("cy", pos[1]); circle.setAttribute("r", "10");
      circle.setAttribute("fill", "#dc2626"); circle.setAttribute("stroke", "#fff"); circle.setAttribute("stroke-width", "1.5");
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

  function annsFor(doc, kind, id){
    return allAnns(doc).filter(function(a){ return a.target && a.target.kind === kind && a.target.id === id; });
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
      save(); refreshDocUi(); renderInspector(selected ? selected.kind : null, selected ? selected.id : null);
      pushUndo(function(){ localFor(doc.docId).add.splice(idx, 0, removed); save(); refreshDocUi(); renderInspector(selected ? selected.kind : null, selected ? selected.id : null); });
      showUndoToast("已删除本地批注", "撤销");
      return;
    }
    if (l.deleted.indexOf(id) < 0) l.deleted.push(id);
    save(); refreshDocUi(); renderInspector(selected ? selected.kind : null, selected ? selected.id : null);
    pushUndo(function(){ var ll = localFor(doc.docId); ll.deleted = ll.deleted.filter(function(x){ return x !== id; }); save(); refreshDocUi(); renderInspector(selected ? selected.kind : null, selected ? selected.id : null); });
    showUndoToast("已移入回收桶（导出时生成 remove）", "撤销");
  }
  function saveAnnEdit(id, kind, selId){
    var doc = currentDoc();
    if (!doc) return;
    var l = localFor(doc.docId);
    var values = {
      type: document.getElementById("ae-type").value,
      severity: document.getElementById("ae-sev").value,
      title: document.getElementById("ae-title").value.trim(),
      body: document.getElementById("ae-body").value,
      aiHint: document.getElementById("ae-hint").value,
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
    save(); refreshDocUi(); renderInspector(kind, selId);
    showToast("批注已更新（导出补丁生效）");
  }
  function restoreAnn(id){
    var doc = currentDoc();
    if (!doc) return;
    var l = localFor(doc.docId);
    l.deleted = l.deleted.filter(function(x){ return x !== id; });
    save(); refreshDocUi(); renderInspector(selected ? selected.kind : null, selected ? selected.id : null);
    pushUndo(function(){ localFor(doc.docId).deleted.push(id); save(); refreshDocUi(); renderInspector(selected ? selected.kind : null, selected ? selected.id : null); });
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

  function setStatus(annId, status, kind, id){
    var doc = currentDoc();
    if (!doc) return;
    localFor(doc.docId).status[annId] = status;
    save();
    drawBadges(doc);
    updateHeader();
    renderInspector(kind, id);
  }

  function renderInspector(kind, id){
    var box = document.getElementById("inspector");
    var doc = currentDoc();
    if (!box || !doc) return;
    if (!id){ box.hidden = true; box.innerHTML = ""; return; }
    var obj = kind === "element" ? byId(doc.elements, id) : byId(doc.relations, id);
    if (!obj){ box.innerHTML = ""; return; }
    var html = "";
    if (kind === "element"){
      html += '<h3>' + esc(obj.name) + '</h3><div class="meta">' + esc(obj.id) + ' · ' + esc(obj.kind) + '</div>';
      html += '<div class="kv"><b>职责</b>' + esc(obj.summary) + '</div>';
      if (obj.tech) html += '<div class="kv"><b>技术</b>' + esc(obj.tech) + '</div>';
    } else {
      html += '<h3>' + esc(obj.kind) + '</h3><div class="meta">' + esc(obj.id) + ' · ' + esc(obj.from) + ' → ' + esc(obj.to) + '</div>';
      html += '<div class="kv"><b>语义</b>' + esc(obj.summary) + '</div>';
    }
    if (editing) {
      html += '<div class="edit-box"><h3>编辑（暂存）</h3>';
      if (kind === "element") {
        html += '<label>名称</label><input id="e-name" value="' + esc(obj.name) + '">';
        html += '<label>职责</label><textarea id="e-summary">' + esc(obj.summary) + '</textarea>';
        html += '<label>技术</label><input id="e-tech" value="' + esc(obj.tech || "") + '">';
        var pos = doc.positions && doc.positions[id] ? doc.positions[id] : [0, 0];
        html += '<div class="row"><div><label>X</label><input id="e-pin-x" type="number" value="' + esc(pos[0]) + '"></div><div><label>Y</label><input id="e-pin-y" type="number" value="' + esc(pos[1]) + '"></div></div>';
      } else {
        html += '<label>语义</label><textarea id="e-summary">' + esc(obj.summary) + '</textarea>';
      }
      html += '<button id="edit-apply">暂存修改</button><p class="hint">导出编辑 JSON 后运行 covenant edit 预览/应用。</p></div>';
    }
    var list = annsFor(doc, kind, id).filter(function(a){ return !isAnnDeleted(doc, a.id); }).map(function(a){ return effAnn(doc, a); });
    html += '<h3 style="margin-top:12px">批注（' + list.length + '）</h3>';
    if (!list.length) html += '<p class="hint">还没有批注。</p>';
    else {
      html += '<ul class="anns">';
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
      html += '</ul>';
    }
    var trash = localFor(doc.docId).deleted;
    if (trash.length) {
      html += '<div class="trash"><h3>回收桶（' + trash.length + '）</h3><p class="hint">已隐藏；导出补丁会生成 remove 操作。点「恢复」撤回。</p><ul class="anns">';
      for (var t = 0; t < trash.length; t++) {
        var ta = byId(doc.annotations, trash[t]);
        html += '<li><div class="ann-title">' + esc(ta ? ta.title : "（文档中已不存在）") + '</div><div class="hint">' + esc(trash[t]) + '</div><button class="trash-restore" data-id="' + esc(trash[t]) + '">恢复</button></li>';
      }
      html += '</ul></div>';
    }
    var editTarget = null;
    for (var q = 0; q < list.length; q++) if (list[q].id === editingAnn) editTarget = list[q];
    if (editTarget) {
      var ea = editTarget;
      html += '<div class="form edit-form"><div class="edit-head"><h3>编辑批注</h3><div class="edit-actions"><button class="ann-save" data-id="' + esc(ea.id) + '">保存</button><button class="ann-cancel" data-id="' + esc(ea.id) + '" title="取消编辑，返回新增批注">← 返回</button></div></div>' +
        '<div class="row"><div><label>类型</label><select id="ae-type">' + ["risk","question","todo","defect","smell","decision"].map(function(t){ return "<option" + (t === ea.type ? " selected" : "") + ">" + t + "</option>"; }).join("") + '</select></div>' +
        '<div><label>严重度</label><select id="ae-sev">' + ["blocker","high","medium","low"].map(function(s2){ return "<option" + (s2 === ea.severity ? " selected" : "") + ">" + s2 + "</option>"; }).join("") + '</select></div></div>' +
        '<label>标题</label><input id="ae-title" value="' + esc(ea.title) + '">' +
        '<label>正文</label><textarea id="ae-body">' + esc(ea.body || "") + '</textarea>' +
        '<label>给 AI 的指令 ai_hint</label><textarea id="ae-hint">' + esc(ea.aiHint || "") + '</textarea>' +
        '</div>';
    } else {
      editingAnn = null;
      html += '<div class="form">' +
        '<h3>新增批注</h3>' +
        '<div class="row"><div><label>类型</label><select id="f-type"><option>risk</option><option>question</option><option>todo</option><option>defect</option><option>smell</option><option>decision</option></select></div>' +
        '<div><label>严重度</label><select id="f-sev"><option>high</option><option selected>medium</option><option>low</option><option>blocker</option></select></div></div>' +
        '<label>标题（一句话结论）</label><input id="f-title" placeholder="例如：这里缺少降级路径">' +
        '<label>正文（证据与背景）</label><textarea id="f-body"></textarea>' +
        '<label>给 AI 的指令 ai_hint（祈使句，可留空）</label><textarea id="f-hint" placeholder="例如：优先改为异步；禁止两阶段提交"></textarea>' +
        '<button id="f-submit">钉到图上</button></div>';
    }
    box.innerHTML = '<div class="insp-head" id="insp-drag"><span class="grip" aria-hidden="true" title="按住拖动窗口"></span><button class="pin-btn" id="insp-pin" aria-pressed="false" title="钉住：点击别处不关闭">📌</button><span class="hint">' + (kind === "element" ? "元素" : "关系") + ' · ' + esc(id) + '</span><span class="insp-actions"><button class="copy-btn" id="insp-copy" title="复制该对象的语义与批注 JSON">复制</button><button class="insp-close" id="insp-close" title="关闭">×</button></span></div><div class="insp-body">' + html + '</div>';
    box.hidden = false;
    if (editingAnn) {
      var ef = box.querySelector(".edit-form");
      if (ef && ef.scrollIntoView) ef.scrollIntoView({ block: "nearest" });
    }
    document.getElementById("insp-close").addEventListener("click", function(){
      pinned = false;
      box.hidden = true; box.innerHTML = ""; selected = null; clearSelection();
    });
    var pinBtn = document.getElementById("insp-pin");
    if (pinBtn) {
      function paintPin(){
        pinBtn.className = pinned ? "pin-btn on" : "pin-btn";
        pinBtn.setAttribute("aria-pressed", pinned ? "true" : "false");
        pinBtn.title = pinned ? "已钉住：点击别处也不关闭（再点取消）" : "钉住：点击别处不关闭";
      }
      paintPin();
      pinBtn.addEventListener("click", function(){
        pinned = !pinned;
        paintPin();
        showToast(pinned ? "已钉住：点击别处不关闭" : "已取消钉住：点击别处会关闭");
      });
    }
    var head = box.querySelector(".insp-head");
    if (head) {
      head.addEventListener("pointerdown", function(ev){
        if (!ev.target || !ev.target.closest || ev.target.closest("button")) return;
        ev.preventDefault();
        if (ev.button !== 0) return;
        var parent = box.offsetParent || document.body;
        var px = function(v){ var n = parseFloat(v); return isFinite(n) ? n : 0; };
        var drag = {
          sx: ev.clientX,
          sy: ev.clientY,
          l: px(box.style.left) || box.offsetLeft,
          t: px(box.style.top) || box.offsetTop,
          moved: false,
        };
        function move(e2){
          var dx = e2.clientX - drag.sx, dy = e2.clientY - drag.sy;
          if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
          if (!drag.moved) return;
          var maxL = (parent.clientWidth || window.innerWidth) - (box.offsetWidth || 360) - 4;
          var maxT = (parent.clientHeight || window.innerHeight) - (box.offsetHeight || 320) - 4;
          box.style.left = Math.max(4, Math.min(drag.l + dx, maxL)) + "px";
          box.style.top = Math.max(4, Math.min(drag.t + dy, maxT)) + "px";
        }
        function up(){ window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); }
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      });
    }    var editBtns = box.querySelectorAll(".edit-ann");
    for (var ei = 0; ei < editBtns.length; ei++){
      (function(btn){ btn.addEventListener("click", function(ev){ ev.stopPropagation(); editingAnn = btn.getAttribute("data-id"); renderInspector(kind, id); }); })(editBtns[ei]);
    }
    var saveBtns = box.querySelectorAll(".ann-save");
    for (var si2 = 0; si2 < saveBtns.length; si2++){
      (function(btn){ btn.addEventListener("click", function(ev){ ev.stopPropagation(); saveAnnEdit(btn.getAttribute("data-id"), kind, id); }); })(saveBtns[si2]);
    }
    var cancelBtns = box.querySelectorAll(".ann-cancel");
    for (var ci = 0; ci < cancelBtns.length; ci++){
      (function(btn){ btn.addEventListener("click", function(ev){ ev.stopPropagation(); editingAnn = null; renderInspector(kind, id); }); })(cancelBtns[ci]);
    }
    var delBtns = box.querySelectorAll(".del-ann");
    for (var di = 0; di < delBtns.length; di++){
      (function(btn){ btn.addEventListener("click", function(ev){ ev.stopPropagation(); deleteAnn(btn.getAttribute("data-id")); }); })(delBtns[di]);
    }
    var resBtns = box.querySelectorAll(".trash-restore");
    for (var ri = 0; ri < resBtns.length; ri++){
      (function(btn){ btn.addEventListener("click", function(ev){ ev.stopPropagation(); restoreAnn(btn.getAttribute("data-id")); }); })(resBtns[ri]);
    }
    var copyBtn = document.getElementById("insp-copy");
    if (copyBtn) copyBtn.addEventListener("click", function(){ copySelection(kind, id); });
    if (editing) {
      var applyBtn = document.getElementById("edit-apply");
      if (applyBtn) applyBtn.addEventListener("click", function(){ applyEditUi(kind, id); });
    }
    // 批注内联编辑态不渲染"新增批注"表单 → f-submit 可能不存在，必须判空
    // （否则这里抛 TypeError 会跳过下面 .acts 状态流转按钮的事件绑定）
    var fSubmit = document.getElementById("f-submit");
    if (fSubmit) fSubmit.addEventListener("click", function(){ submit(kind, id); });
    var acts = box.querySelectorAll(".acts button");
    for (var j=0;j<acts.length;j++){
      (function(btn){
        if (!btn.getAttribute("data-act")) return; // 编辑表单的按钮不走状态流转
        btn.addEventListener("click", function(){
          setStatus(btn.getAttribute("data-id"), btn.getAttribute("data-act"), kind, id);
        });
      })(acts[j]);
    }
  }

  function submit(kind, id){
    var doc = currentDoc();
    if (!doc || !selected) return;
    var title = document.getElementById("f-title").value.trim();
    if (!title) { alert("标题必填"); return; }
    var ann = {
      id: newId(),
      target: { kind: kind, id: id },
      type: document.getElementById("f-type").value,
      severity: document.getElementById("f-sev").value,
      title: title,
      body: document.getElementById("f-body").value.trim(),
      status: "open",
      author: "human:you",
      created: nowISO(),
      aiHint: document.getElementById("f-hint").value.trim()
    };
    localFor(doc.docId).add.push(ann);
    save();
    drawBadges(doc);
    updateHeader();
    renderInspector(kind, id);
  }

  function buildAnnotationPatch(){
    var doc = currentDoc();
    if (!doc) return;
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
    if (!ops.length) return null;
    var patch = { covenant: "0.1", doc: doc.docId, base_rev: doc.rev, intent: "人工审查（HTML 导出：新增批注 + 状态流转 + 编辑批注 + 删除批注）", ops: ops };
    return patch;
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

  function serverSaveAnnotations(){
    var patch = buildAnnotationPatch();
    if (!patch) { showToast("没有改动可写回"); return; }
    var cfg = window.__CVN_EDIT__;
    if (!cfg || !cfg.patchEndpoint) { showToast("请用 pnpm edit:serve 打开页面后再写回"); return; }
    fetch(cfg.patchEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json", "x-covenant-token": cfg.token },
      body: JSON.stringify({ patch: patch, actor: "human:you" }),
    }).then(function(r){
      return r.json().then(function(j){ return { status: r.status, body: j }; });
    }).then(function(x){
      if (!x.body || !x.body.ok) {
        var msg = (x.body && x.body.message) ? x.body.message : "写回失败";
        var codes = [];
        if (x.body && x.body.findings) for (var i = 0; i < x.body.findings.length; i++) codes.push(x.body.findings[i].code);
        showToast(msg + (codes.length ? "：" + codes.join(", ") : ""));
        return;
      }
      var doc = currentDoc();
      if (doc) {
        delete local[doc.docId]; save();
        drawBadges(doc); updateHeader();
        renderInspector(selected ? selected.kind : null, selected ? selected.id : null);
      }
      showToast("批注已写回 .cvn.yaml（rev " + x.body.rev + "）");
    }).catch(function(){ showToast("写回请求失败：请确认 edit:serve 仍在运行"); });
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
      el.addEventListener("click", function(ev){
        ev.stopPropagation();
        if (moved) { moved = false; return; }
        var kind = el.getAttribute("data-kind") || (el.classList.contains("node") ? "element" : "relation");
        var id = el.getAttribute("data-id");
        var sel = document.querySelectorAll(".sel");
        for (var s=0;s<sel.length;s++) sel[s].classList.remove("sel");
        el.classList.add("sel");
        selected = { kind: kind, id: id };
        renderInspector(kind, id);
        placeInspector(ev.clientX, ev.clientY);
      });
    })(shapes[k]);
  }
  var wrap = document.getElementById("stage-wrap");
  var stage = document.getElementById("stage");

  // 未钉住时：点画布空白、画布外空白、工具条之外的区域都应关闭悬浮窗。
  // 命中节点/连线由它们自己的 click 处理（会 stopPropagation），此处不干预。
  document.addEventListener("click", function(ev){
    if (pinned) return;
    var t = ev.target;
    if (!t || !t.closest || !t.isConnected) return;
    if (t.closest("#inspector, #toast, header")) return;
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
    if (pinned) return; // 钉住后点击别处不关闭
    var sel = document.querySelectorAll(".sel");
    for (var i=0;i<sel.length;i++) sel[i].classList.remove("sel");
    selected = null;
    var box = document.getElementById("inspector");
    if (box){ box.hidden = true; box.innerHTML = ""; }
  }
  function placeInspector(cx, cy){
    var box = document.getElementById("inspector");
    if (!box || pinned) return;
    var parent = box.offsetParent || document.body;
    var pr = parent.getBoundingClientRect();
    var w = box.offsetWidth || 360, h = box.offsetHeight || 320;
    var maxL = (parent.clientWidth || window.innerWidth) - w - 8;
    var maxT = (parent.clientHeight || window.innerHeight) - h - 8;
    var left = cx - pr.left + 16;
    var top = cy - pr.top + 12;
    box.style.left = Math.max(8, Math.min(left, maxL)) + "px";
    box.style.top = Math.max(8, Math.min(top, maxT)) + "px";
  }

  function selectionPayload(kind, id){
    var doc = currentDoc();
    if (!doc) return null;
    var obj = kind === "element" ? byId(doc.elements, id) : byId(doc.relations, id);
    var anns = annsFor(doc, kind, id).filter(function(a){ return !isAnnDeleted(doc, a.id); }).map(function(a){ return effAnn(doc, a); }).map(function(a){
      return {
        id: a.id, type: a.type, severity: a.severity, title: a.title,
        body: a.body, status: effStatus(doc, a), author: a.author, aiHint: a.aiHint || undefined
      };
    });
    return { doc: doc.docId, rev: doc.rev, target: { kind: kind, id: id }, object: obj, annotations: anns };
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
  function copySelection(kind, id){
    var payload = selectionPayload(kind, id);
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
  function fieldValue(id){ var el = document.getElementById(id); return el ? String(el.value) : ""; }
  function toggleEdit(){
    editing = !editing;
    document.body.classList.toggle("editing", editing);
    var b = document.getElementById("btn-edit");
    if (b) b.textContent = editing ? "退出编辑" : "编辑";
    updateEditPending();
    if (selected) renderInspector(selected.kind, selected.id);
    showToast(editing ? "编辑模式：改文本/坐标后点「暂存修改」" : "已退出编辑模式");
  }
  function applyEditUi(kind, id){
    var doc = currentDoc();
    if (!doc) return;
    if (kind === "element") {
      var name = fieldValue("e-name").trim();
      var summary = fieldValue("e-summary").trim();
      if (!name) { alert("名称不能为空"); return; }
      if (!summary) { alert("职责不能为空"); return; }
      setEditOp("/elements/" + id + "/name", name);
      setEditOp("/elements/" + id + "/summary", summary);
      var tech = fieldValue("e-tech").trim();
      if (tech) setEditOp("/elements/" + id + "/tech", tech);
      var viewId = doc.viewId || doc.defaultViewId;
      if (viewId) {
        var x = Number(fieldValue("e-pin-x")), y = Number(fieldValue("e-pin-y"));
        if (isFinite(x) && isFinite(y)) setEditOp("/views/" + viewId + "/layout/pins/" + id, [x, y]);
      }
    } else {
      var s = fieldValue("e-summary").trim();
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
        var box = document.getElementById("inspector");
        if (box) {
          var pre = document.getElementById("edit-diff");
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
    wrap.addEventListener("dblclick", function(ev){ zoomAt(ev.clientX, ev.clientY, 1.35); });
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
    window.addEventListener("keydown", function(ev){ if (ev.key === "Escape" && !pinned) clearSelection(); });
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
        var px = document.getElementById("e-pin-x"), py = document.getElementById("e-pin-y");
        if (px && py && selected && selected.id === nodeDrag.id) { px.value = String(x); py.value = String(y); }
        nodeDrag = null;
        showToast("位置已暂存（" + x + ", " + y + "），导出/写回生效");
      });
      el.addEventListener("pointercancel", function(){
        if (nodeDrag && nodeDrag.el === el) { el.style.transform = ""; nodeDrag = null; }
      });
    })(nodeEls[q]);
  }
  var ex = document.getElementById("btn-export"); if (ex) ex.addEventListener("click", exportPatch);
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

  const nav = views
    .map((v) => `<button data-doc="${esc(keyOf(v))}">${esc(labelOf(v))}</button>`)
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
    '<button id="btn-ann-save" class="pri" hidden title="把批注改动直接写回 .cvn.yaml（需 pnpm edit:serve）">写回批注</button>',
    "</header>",
    '<div id="shell">',
    `<aside id="views">\n      ${nav}\n</aside>`,
    "<main>",
    `<div id="stage-wrap"><div id="stage">\n${sections}\n</div></div>`,
    '<div id="tip">滚轮缩放 · 拖拽平移 · 双击放大 · 点击元素/连线标注</div>',
    '<div id="inspector" hidden></div>',
    "</main>",
    "</div>",
    '<footer><span>由 covenant 构建</span><span>只读语义 + 本地批注 · 导出后交给 CLI/Agent 校验入库</span><span>语义副本内嵌于 #covenant-data</span></footer>',
    `<script id="covenant-data" type="application/json">${safeJson({ version: "0.1.0", docs })}</script>`,
    `<script>${SCRIPT}</script>`,
    "</body>",
    "</html>",
  ].join("\n");
}
