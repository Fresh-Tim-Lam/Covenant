/**
 * 看板「图上增删关系」运行时分片（由 packages/render/src/html.ts 的 SCRIPT 模板以
 * `${SCRIPT_EDIT_RELATIONS}` 注入到同一个 IIFE 作用域）。
 *
 * 边界（task-22 / 与 script-edit-elements.ts 同款纪律）：
 *   1. 只进暂存，**不修改 DATA.docs**（构建产物副本，只读语义）；
 *   2. ops 由 buildPatchFor 经 pushPendingRelationOps 追加（add /relations/-、remove /relations/<id>），
 *      走 patch 通道；**不碰** editOps 的 set 通道；
 *   3. 被批注引用的关系禁止暂存删除（含段级批注，annotation.target.id 命中即算），
 *      否则 kernel/dangling-ref 拒收；
 *   4. 暂存新增 / 待删除的元素不参与连线（from/to 必须是已存在元素）；
 *   5. schema 硬约束：relation 必填 id/kind/from/to/summary（summary 非空），
 *      id 匹配 ^r\.[a-z][a-z0-9-]{0,62}$，additionalProperties=false；
 *   6. 分片内容不得含反引号或 ${（否则会截断 html.ts 的模板字符串）。
 *
 * DOM 契约（relation-edit.test.ts 依赖）：
 *   元素窗口顶栏 `.connect-top-btn` 进入连线模式；点击目标 `.node` 弹 `#relform-win`；
 *   字段 `#rf-kind/#rf-summary`，按钮 `#rf-create/#rf-cancel`；
 *   顶栏计数 `#rel-pending`；暂存新关系 overlay `.pending-add-rel`；待删关系 `.pending-remove-rel`。
 */
export const SCRIPT_EDIT_RELATIONS = `
  // ===== 图上增删关系（script-edit-relations.ts 注入）=====
  var relEditOps = {};
  function relEditStateFor(doc){
    if (!doc) return { adds: [], removes: [] };
    if (!relEditOps[doc.docId]) relEditOps[doc.docId] = { adds: [], removes: [] };
    return relEditOps[doc.docId];
  }
  function currentRelEditState(){ return relEditStateFor(currentDoc()); }

  // —— 顶栏待办计数（动态插入到 #elem-pending 旁，不占 html.ts 冻结行数）——
  function ensureRelPendingEl(){
    var el = document.getElementById("rel-pending");
    if (el) return el;
    el = document.createElement("span");
    el.id = "rel-pending";
    el.className = "sub";
    el.hidden = true;
    var anchor = document.getElementById("elem-pending");
    var parent = anchor && anchor.parentNode ? anchor.parentNode : document.querySelector("header");
    if (parent) parent.insertBefore(el, anchor ? anchor.nextSibling : null);
    return el;
  }
  function updateRelPending(){
    var el = ensureRelPendingEl();
    if (!el) return;
    var st = currentRelEditState();
    var n = st.adds.length + st.removes.length;
    el.textContent = "关系暂存 " + n;
    el.hidden = n === 0;
  }

  // —— 视觉：暂存新关系 = 虚线直线 overlay；待删关系 = 边降饱和 ——
  function refreshPendingRelVisuals(){
    var svg = currentSvg();
    if (!svg) return;
    var old = svg.querySelectorAll(".pending-add-rel");
    for (var r = 0; r < old.length; r++) if (old[r].parentNode) old[r].parentNode.removeChild(old[r]);
    var marked = svg.querySelectorAll(".pending-remove-rel");
    for (var m = 0; m < marked.length; m++) marked[m].classList.remove("pending-remove-rel");
    var st = currentRelEditState();
    var doc = currentDoc();
    for (var i = 0; i < st.adds.length; i++){
      var a = st.adds[i];
      var ga = svg.querySelector('.node[data-id="' + a.from + '"]');
      var gb = svg.querySelector('.node[data-id="' + a.to + '"]');
      if (!ga || !gb) continue;
      // 线路路由底层：与正式边同源——layout 注入的 route() 选端口出线，clearPath() 避开无关框
      var ba = nodeRouteBox(ga, doc, a.from), bb = nodeRouteBox(gb, doc, a.to);
      if (!ba || !bb) continue;
      var pts = route(ba, bb, i);
      pts = clearPath(pts, nodesRouteRects(svg, doc), a.from, a.to);
      var ln = document.createElementNS(SVGNS, "path");
      ln.setAttribute("class", "pending-add-rel");
      ln.setAttribute("data-id", a.id);
      ln.setAttribute("d", pts.map(function(p, k){ return (k === 0 ? "M" : "L") + p.x + " " + p.y; }).join(" "));
      ln.setAttribute("stroke", "#2563eb");
      ln.setAttribute("stroke-width", "2");
      ln.setAttribute("fill", "none");
      ln.setAttribute("stroke-dasharray", "6 4");
      ln.setAttribute("marker-end", "url(#cvn-arrow)");
      ln.setAttribute("pointer-events", "none");
      var tip = document.createElementNS(SVGNS, "title");
      tip.textContent = "待新增关系 " + a.kind + "：" + a.summary;
      ln.appendChild(tip);
      svg.appendChild(ln);
    }
    for (var j = 0; j < st.removes.length; j++){
      var edge = svg.querySelector('.edge[data-id="' + st.removes[j] + '"]');
      if (edge) edge.classList.add("pending-remove-rel");
    }
  }
  function refreshRelPendingUi(){ updateRelPending(); refreshPendingRelVisuals(); }

  // —— patch 通道：buildPatchFor 经 pushPendingRelationOps 追加 ——
  function pendingRelationOps(doc){
    var st = relEditStateFor(doc);
    var out = [];
    for (var i = 0; i < st.adds.length; i++){
      var a = st.adds[i];
      out.push({ op: "add", path: "/relations/-", value: { id: a.id, kind: a.kind, from: a.from, to: a.to, summary: a.summary } });
    }
    for (var j = 0; j < st.removes.length; j++) out.push({ op: "remove", path: "/relations/" + st.removes[j], value: null });
    return out;
  }
  function pushPendingRelationOps(doc, ops){
    var list = pendingRelationOps(doc);
    for (var i = 0; i < list.length; i++) ops.push(list[i]);
    return list.length;
  }

  /** newId() 产出 a.<大写 Crockford>；关系 id 需匹配 schema ^r\\.[a-z][a-z0-9-]{0,62}$ */
  function newRelationId(){
    var raw = String(newId()).slice(2).toLowerCase().replace(/[^a-z0-9-]/g, "z");
    if (!/^[a-z]/.test(raw)) raw = "r" + raw;
    return "r." + raw;
  }

  // —— 连线模式 ——
  var connectingFrom = null;
  function startConnecting(fromId){
    var doc = currentDoc();
    if (!doc) return;
    var why = elementUsableForConnect(doc, fromId);
    if (why) { showToast(why); return; }
    connectingFrom = fromId;
    document.body.classList.add("connecting");
    showToast("连线模式：点击目标元素（Esc 或点空白取消）");
  }
  function cancelConnecting(){
    if (!connectingFrom) return;
    connectingFrom = null;
    document.body.classList.remove("connecting");
  }
  /** 元素是否可用于连线：已存在、未暂存删除、未暂存新增 */
  function elementUsableForConnect(doc, id){
    if (isPendingElementRemove(doc, id)) return "该元素已暂存删除，先撤销删除再连线";
    var st = elemEditStateFor(doc);
    for (var i = 0; i < st.adds.length; i++) if (st.adds[i].id === id) return "该元素尚未写回（暂存新增），先写回再连线";
    if (!byId((doc && doc.elements) || [], id)) return "元素不存在：" + id;
    return "";
  }
  function completeConnecting(ev){
    var doc = currentDoc();
    var fromId = connectingFrom;
    var t = ev.target && ev.target.closest ? ev.target.closest(".node") : null;
    var toId = t ? t.getAttribute("data-id") : "";
    if (!fromId){ return; }
    if (!toId){ cancelConnecting(); showToast("已取消连线"); return; }
    if (toId === fromId){ showToast("起点与终点不能是同一个元素"); return; }
    var why1 = elementUsableForConnect(doc, fromId);
    if (why1){ showToast(why1); cancelConnecting(); return; }
    var why2 = elementUsableForConnect(doc, toId);
    if (why2){ showToast(why2); cancelConnecting(); return; }
    connectingFrom = null;
    document.body.classList.remove("connecting");
    openRelationForm({ from: fromId, to: toId }, ev);
  }

  // —— 关系表单（复用 .cvn-win 外壳）——
  function relationKindOptions(doc){
    var rels = (doc && doc.relations) || [];
    var seen = {}, out = [];
    for (var i = 0; i < rels.length; i++){
      var k = String(rels[i].kind || "");
      if (!k || seen[k]) continue;
      seen[k] = 1; out.push(k);
    }
    out.sort();
    return out.length ? out : ["calls"];
  }
  function closeRelationForm(){
    var el = document.getElementById("relform-win");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }
  function openRelationForm(pair, at){
    closeRelationForm();
    var main = document.querySelector("main");
    if (!main) return;
    var doc = currentDoc();
    var kinds = relationKindOptions(doc);
    var opts = "";
    for (var i = 0; i < kinds.length; i++) opts += '<option>' + esc(kinds[i]) + '</option>';
    var el = document.createElement("div");
    el.className = "cvn-win cvn-create-win";
    el.id = "relform-win";
    el.innerHTML =
      '<div class="insp-head"><span class="grip" aria-hidden="true" title="新建关系"></span><span class="hint">新建关系（只进暂存）</span>' +
      '<span class="insp-actions"><button class="insp-close" id="rf-close" title="关闭">×</button></span></div>' +
      '<div class="insp-body form ce-form">' +
      '<p class="hint">' + esc(pair.from) + ' ⇒ ' + esc(pair.to) + '</p>' +
      '<label>类型 kind</label><select id="rf-kind">' + opts + '</select>' +
      '<label>职责 summary（必填）</label><textarea id="rf-summary" placeholder="这条关系表达什么数据/调用？"></textarea>' +
      '<div class="cvn-create-actions"><button id="rf-create">创建</button><button type="button" id="rf-cancel">取消</button></div>' +
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
    document.getElementById("rf-close").addEventListener("click", function(ev){ ev.stopPropagation(); closeRelationForm(); });
    document.getElementById("rf-cancel").addEventListener("click", function(ev){ ev.stopPropagation(); closeRelationForm(); });
    document.getElementById("rf-create").addEventListener("click", function(ev){ ev.stopPropagation(); submitCreateRelation(pair); });
    var sumEl = document.getElementById("rf-summary");
    if (sumEl && sumEl.focus) sumEl.focus();
  }
  function submitCreateRelation(pair){
    var doc = currentDoc();
    if (!doc) return;
    var sumEl = document.getElementById("rf-summary");
    var summary = sumEl ? String(sumEl.value).trim() : "";
    if (!summary) { alert("summary 必填：写清这条关系表达什么"); return; }
    var kindEl = document.getElementById("rf-kind");
    var kind = kindEl ? String(kindEl.value) : "calls";
    if (!kind) kind = "calls";
    var rec = { id: newRelationId(), kind: kind, from: pair.from, to: pair.to, summary: summary };
    var st = relEditStateFor(doc);
    st.adds.push(rec);
    closeRelationForm();
    refreshRelPendingUi();
    showUndoToast("已暂存新增关系 " + pair.from + " ⇒ " + pair.to, "撤销");
    pushUndo(function(){
      var s2 = relEditStateFor(doc);
      s2.adds = s2.adds.filter(function(x){ return x.id !== rec.id; });
      refreshRelPendingUi();
    });
  }

  // —— 暂存删除关系（Delete 键；被批注引用拦截）——
  function relationDeleteBlockReason(doc, id){
    var anns = visibleAnns(doc);
    var n = 0;
    for (var i = 0; i < anns.length; i++){
      var t = anns[i].target || {};
      if (t.kind === "relation" && t.id === id) n++;
    }
    if (n) return "该关系被 " + n + " 条批注引用（含段级批注），先处理批注再删除";
    return "";
  }
  function stageToggleRelRemove(id){
    var doc = currentDoc();
    if (!doc) return;
    var st = relEditStateFor(doc);
    var idx = st.removes.indexOf(id);
    if (idx >= 0){
      st.removes.splice(idx, 1);
      refreshRelPendingUi();
      showToast("已恢复关系（撤销暂存删除）");
      return;
    }
    var addIdx = -1;
    for (var i = 0; i < st.adds.length; i++) if (st.adds[i].id === id) addIdx = i;
    if (addIdx >= 0){
      st.adds.splice(addIdx, 1);
      refreshRelPendingUi();
      showToast("已撤销新增关系");
      return;
    }
    var why = relationDeleteBlockReason(doc, id);
    if (why) { showToast(why); return; }
    st.removes.push(id);
    refreshRelPendingUi();
    showUndoToast("已暂存删除关系 " + id + "（导出时生成 remove）", "撤销");
    pushUndo(function(){
      var s2 = relEditStateFor(doc);
      s2.removes = s2.removes.filter(function(x){ return x !== id; });
      refreshRelPendingUi();
    });
  }

  // —— 事件入口（html.ts 只做一行接线：keydown 追加调用）——
  function onRelationKeydown(ev){
    var t = ev.target;
    var tag = t && t.tagName ? String(t.tagName).toUpperCase() : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (t && t.isContentEditable)) return;
    if (ev.key !== "Delete" && ev.key !== "Backspace") return;
    if (!selected || selected.kind !== "relation") return;
    ev.preventDefault();
    stageToggleRelRemove(selected.id);
  }

  ensureRelPendingEl();
`;
