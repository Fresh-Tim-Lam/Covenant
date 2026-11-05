/**
 * 看板「图上增删元素」运行时分片（由 packages/render/src/html.ts 的 SCRIPT 模板以
 * `${SCRIPT_EDIT_ELEMENTS}` 注入到同一个 IIFE 作用域）。
 *
 * 边界（task-21 / AGENTS.md L12）：
 *   1. 只进暂存，**不修改 DATA.docs**（那是构建产物副本，只读语义）；
 *   2. 新增/删除由 html.ts 的 buildPatchFor 追加到 patch ops（add /elements/-、remove /elements/<id>），
 *      走「导出补丁 JSON / 写回」老 patch 通道；**不碰** editOps 的 set 编辑通道；
 *   3. 被批注 / relation / frame 引用的元素禁止暂存删除（否则 kernel/dangling-ref 会拒）；
 *   4. 分片内容不得含反引号或 `${`（否则会截断 html.ts 的模板字符串）。
 *
 * DOM 契约（element-edit.test.ts 依赖）：
 *   双击空白 → `#create-win.cvn-create-win`；字段 `#ce-name/#ce-kind/#ce-summary/#ce-tech`，
 *   按钮 `#ce-create/#ce-cancel`；顶栏计数 `#elem-pending`；占位 `.pending-add`；待删 `.pending-remove`。
 */
export const SCRIPT_EDIT_ELEMENTS = `
  // ===== 图上增删元素（script-edit-elements.ts 注入）=====
  // 暂存按 docId 分桶：{ [docId]: { adds: [{id,kind,name,summary,tech?,props?}], removes: [id] } }
  var elemEditOps = {};
  function elemEditStateFor(doc){
    if (!doc) return { adds: [], removes: [] };
    if (!elemEditOps[doc.docId]) elemEditOps[doc.docId] = { adds: [], removes: [] };
    return elemEditOps[doc.docId];
  }
  function currentElemEditState(){ return elemEditStateFor(currentDoc()); }

  // —— 顶栏待办计数（动态插入，避免占用 html.ts 的冻结行数）——
  function ensureElemPendingEl(){
    var el = document.getElementById("elem-pending");
    if (el) return el;
    el = document.createElement("span");
    el.id = "elem-pending";
    el.className = "sub";
    el.hidden = true;
    var anchor = document.getElementById("edit-pending");
    var parent = anchor && anchor.parentNode ? anchor.parentNode : document.querySelector("header");
    if (parent) parent.insertBefore(el, anchor && anchor.parentNode ? anchor.nextSibling : null);
    return el;
  }
  function updateElemPending(){
    var el = ensureElemPendingEl();
    if (!el) return;
    var st = currentElemEditState();
    var n = st.adds.length + st.removes.length;
    el.textContent = "图上暂存 " + n;
    el.hidden = n === 0;
  }

  // —— 暂存视觉：待新增 = 虚线占位；待删除 = 降饱和 ——
  function refreshPendingAddVisuals(){
    var svg = currentSvg();
    if (!svg) return;
    var old = svg.querySelectorAll(".pending-add");
    for (var r = 0; r < old.length; r++) if (old[r].parentNode) old[r].parentNode.removeChild(old[r]);
    var st = currentElemEditState();
    for (var i = 0; i < st.adds.length; i++){
      var a = st.adds[i];
      var x = 24 + (i % 3) * 176, y = 24 + Math.floor(i / 3) * 56;
      var g = document.createElementNS(SVGNS, "g");
      g.setAttribute("class", "pending-add");
      g.setAttribute("data-id", a.id);
      g.setAttribute("pointer-events", "none");
      var rect = document.createElementNS(SVGNS, "rect");
      rect.setAttribute("x", String(x)); rect.setAttribute("y", String(y));
      rect.setAttribute("width", "150"); rect.setAttribute("height", "40");
      rect.setAttribute("rx", "8"); rect.setAttribute("fill", "#f8fafc");
      rect.setAttribute("stroke", "#2563eb"); rect.setAttribute("stroke-dasharray", "5 4");
      var text = document.createElementNS(SVGNS, "text");
      text.setAttribute("x", String(x + 10)); text.setAttribute("y", String(y + 24));
      text.setAttribute("fill", "#2563eb"); text.setAttribute("font-size", "12");
      var label = String(a.name || a.id);
      if (label.length > 12) label = label.slice(0, 12) + "…";
      text.textContent = "＋ " + label;
      g.appendChild(rect); g.appendChild(text); svg.appendChild(g);
    }
  }
  function refreshPendingRemoveVisuals(){
    var svg = currentSvg();
    if (!svg) return;
    var marked = svg.querySelectorAll(".pending-remove");
    for (var i = 0; i < marked.length; i++) marked[i].classList.remove("pending-remove");
    var st = currentElemEditState();
    for (var j = 0; j < st.removes.length; j++){
      var el = svg.querySelector('[data-id="' + st.removes[j] + '"]');
      if (el) el.classList.add("pending-remove");
    }
  }
  function refreshElemPendingUi(){ updateElemPending(); refreshPendingAddVisuals(); refreshPendingRemoveVisuals(); }

  // —— patch 通道：buildPatchFor 通过 pushPendingElementOps 追加，其它导出/写回自动带上 ——
  function pendingElementOps(doc){
    var st = elemEditStateFor(doc);
    var out = [];
    for (var i = 0; i < st.adds.length; i++){
      var a = st.adds[i];
      var value = { id: a.id, kind: a.kind, name: a.name, summary: a.summary };
      if (a.tech) value.tech = a.tech;
      if (a.props) value.props = a.props;
      out.push({ op: "add", path: "/elements/-", value: value });
    }
    for (var j = 0; j < st.removes.length; j++) out.push({ op: "remove", path: "/elements/" + st.removes[j], value: null });
    return out;
  }
  function pushPendingElementOps(doc, ops){
    var list = pendingElementOps(doc);
    for (var i = 0; i < list.length; i++) ops.push(list[i]);
    return list.length;
  }
  function isPendingElementRemove(doc, id){ return elemEditStateFor(doc).removes.indexOf(id) >= 0; }

  // —— 新建元素表单（复用 .cvn-win 外壳）——
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
  function closeCreateForm(){
    var el = document.getElementById("create-win");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }
  function openCreateForm(at){
    closeCreateForm();
    var main = document.querySelector("main");
    if (!main) return;
    var doc = currentDoc();
    var kinds = elementKindOptions();
    var techDefault = "";
    var tpl0 = templateForKind(doc, kinds[0]);
    if (tpl0 && tpl0.tech) techDefault = String(tpl0.tech);
    var opts = "";
    for (var i = 0; i < kinds.length; i++) opts += '<option>' + esc(kinds[i]) + '</option>';
    var el = document.createElement("div");
    el.className = "cvn-win cvn-create-win";
    el.id = "create-win";
    el.innerHTML =
      '<div class="insp-head" id="ce-head"><span class="grip" aria-hidden="true" title="新建元素"></span><span class="hint">新建元素（只进暂存）</span>' +
      '<span class="insp-actions"><button class="insp-close" id="ce-close" title="关闭">×</button></span></div>' +
      '<div class="insp-body form ce-form">' +
      '<label>名称（必填）</label><input id="ce-name" data-field="ce-name" placeholder="例如：订单服务">' +
      '<label>类型 kind</label><select id="ce-kind" data-field="ce-kind">' + opts + '</select>' +
      '<label>职责 summary</label><textarea id="ce-summary" data-field="ce-summary" placeholder="留空则与名称相同"></textarea>' +
      '<label>技术 tech</label><input id="ce-tech" data-field="ce-tech" value="' + esc(techDefault) + '">' +
      '<div class="cvn-create-actions"><button id="ce-create">创建</button><button type="button" id="ce-cancel">取消</button></div>' +
      '<p class="hint">创建只进暂存：导出/写回补丁并通过门禁后才真正落盘。</p>' +
      '</div>';
    main.appendChild(el);
    el.hidden = false;
    el.style.zIndex = "40";
    var rect = main.getBoundingClientRect ? main.getBoundingClientRect() : { left: 0, top: 0 };
    var cx = at && isFinite(at.clientX) ? at.clientX : rect.left + 80;
    var cy = at && isFinite(at.clientY) ? at.clientY : rect.top + 80;
    var maxL = (main.clientWidth || 900) - 350, maxT = (main.clientHeight || 600) - 300;
    el.style.left = Math.max(8, Math.min(cx - rect.left + 12, Math.max(8, maxL))) + "px";
    el.style.top = Math.max(8, Math.min(cy - rect.top + 10, Math.max(8, maxT))) + "px";
    document.getElementById("ce-close").addEventListener("click", function(ev){ ev.stopPropagation(); closeCreateForm(); });
    document.getElementById("ce-cancel").addEventListener("click", function(ev){ ev.stopPropagation(); closeCreateForm(); });
    document.getElementById("ce-create").addEventListener("click", function(ev){ ev.stopPropagation(); submitCreateElement(); });
    var kindEl = document.getElementById("ce-kind");
    if (kindEl) kindEl.addEventListener("change", function(){
      var tpl = templateForKind(currentDoc(), String(this.value));
      var techEl = document.getElementById("ce-tech");
      if (techEl && tpl && tpl.tech) techEl.value = String(tpl.tech);
    });
    var nameEl = document.getElementById("ce-name");
    if (nameEl && nameEl.focus) nameEl.focus();
  }

  /** newId() 产出 a.<大写 Crockford>；元素 id 需匹配 schema ^e\\.[a-z][a-z0-9-]{0,62}$ */
  function newElementId(){
    var raw = String(newId()).slice(2).toLowerCase().replace(/[^a-z0-9-]/g, "z");
    if (!/^[a-z]/.test(raw)) raw = "e" + raw;
    return "e." + raw;
  }
  function elementNameTaken(doc, name){
    var els = (doc && doc.elements) || [];
    for (var i = 0; i < els.length; i++) if (els[i].name === name) return true;
    var st = elemEditStateFor(doc);
    for (var j = 0; j < st.adds.length; j++) if (st.adds[j].name === name) return true;
    return false;
  }
  function submitCreateElement(){
    var doc = currentDoc();
    if (!doc) return;
    var nameEl = document.getElementById("ce-name");
    var name = nameEl ? String(nameEl.value).trim() : "";
    if (!name) { alert("名称必填"); return; }
    if (elementNameTaken(doc, name)) { alert("已存在同名元素：" + name); return; }
    var kindEl = document.getElementById("ce-kind");
    var kind = kindEl ? String(kindEl.value) : "container";
    if (!kind) kind = "container";
    var sumEl = document.getElementById("ce-summary");
    var summary = sumEl ? String(sumEl.value).trim() : "";
    if (!summary) summary = name;
    var techEl = document.getElementById("ce-tech");
    var tech = techEl ? String(techEl.value).trim() : "";
    var rec = { id: newElementId(), kind: kind, name: name, summary: summary };
    if (tech) rec.tech = tech;
    var tpl = templateForKind(doc, kind);
    if (tpl && tpl.props && Object.keys(tpl.props).length) rec.props = JSON.parse(JSON.stringify(tpl.props));
    var st = elemEditStateFor(doc);
    st.adds.push(rec);
    closeCreateForm();
    refreshElemPendingUi();
    showUndoToast("已暂存新增元素「" + name + "」", "撤销");
    pushUndo(function(){
      var s2 = elemEditStateFor(doc);
      s2.adds = s2.adds.filter(function(x){ return x.id !== rec.id; });
      refreshElemPendingUi();
    });
  }

  // —— 暂存删除（只对 kind=element；被引用时拦住）——
  function deleteBlockReason(doc, id){
    var anns = visibleAnns(doc);
    var n = 0;
    for (var i = 0; i < anns.length; i++){
      var t = anns[i].target || {};
      if (t.kind === "element" && t.id === id) n++;
    }
    if (n) return "该元素被 " + n + " 条批注引用，先处理批注再删除";
    var rels = (doc && doc.relations) || [];
    var m = 0, first = "";
    for (var j = 0; j < rels.length; j++){
      var from = String(rels[j].from || "").split(":")[0];
      var to = String(rels[j].to || "").split(":")[0];
      if (from === id || to === id) { m++; if (!first) first = String(rels[j].id || ""); }
    }
    if (m) return "该元素被 " + m + " 条关系引用（如 " + first + "），先删除关系再删除元素";
    var frames = (doc && doc.frames) || [];
    for (var k = 0; k < frames.length; k++){
      var members = frames[k].members || [];
      if (members.indexOf(id) >= 0) return "该元素是框 " + String(frames[k].id || "") + " 的成员，先移出框再删除";
    }
    return "";
  }
  function stageToggleRemove(id){
    var doc = currentDoc();
    if (!doc) return;
    var st = elemEditStateFor(doc);
    var idx = st.removes.indexOf(id);
    if (idx >= 0){
      st.removes.splice(idx, 1);
      refreshElemPendingUi();
      showToast("已恢复元素（撤销暂存删除）");
      return;
    }
    var addIdx = -1;
    for (var i = 0; i < st.adds.length; i++) if (st.adds[i].id === id) addIdx = i;
    if (addIdx >= 0){
      st.adds.splice(addIdx, 1);
      refreshElemPendingUi();
      showToast("已撤销新增元素");
      return;
    }
    var why = deleteBlockReason(doc, id);
    if (why) { showToast(why); return; }
    st.removes.push(id);
    refreshElemPendingUi();
    showUndoToast("已暂存删除元素 " + id + "（导出时生成 remove）", "撤销");
    pushUndo(function(){
      var s2 = elemEditStateFor(doc);
      s2.removes = s2.removes.filter(function(x){ return x !== id; });
      refreshElemPendingUi();
    });
  }

  // —— 事件入口（html.ts 只做一行接线：dblclick / keydown）——
  function onCanvasDblclick(ev){
    var t = ev.target;
    if (t && t.closest && t.closest(".node, .edge, .cvn-win")) { zoomAt(ev.clientX, ev.clientY, 1.35); return; }
    openCreateForm(ev);
  }
  function onElementKeydown(ev){
    var t = ev.target;
    var tag = t && t.tagName ? String(t.tagName).toUpperCase() : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    if (ev.key !== "Delete" && ev.key !== "Backspace") return;
    if (!selected || selected.kind !== "element") return;
    ev.preventDefault();
    stageToggleRemove(selected.id);
  }

  ensureElemPendingEl();
`;
