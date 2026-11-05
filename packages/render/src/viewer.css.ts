/**
 * 看板样式表（自 packages/render/src/html.ts 拆出）
 *
 * 为什么单独成文件：html.ts 曾超 2100 行，样式与运行时逻辑混在一处，
 * 任何样式改动都要在千行模板里定位（AGENTS.md L12 / E2）。
 * 本块为纯静态 CSS，无插值、无逻辑，边界清晰，故优先迁出。
 */
export const CSS = `
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
#views button.views-doc{padding-left:16px}
.views-group{margin:0 0 10px}
.views-group:last-child{margin-bottom:0}
.views-group-title{font-size:11px;font-weight:600;color:#94a3b8;padding:3px 9px 5px;letter-spacing:.03em;user-select:none;-webkit-user-select:none}
.views-group.on>.views-group-title{color:var(--accent)}
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
.trash{margin-top:10px;border:1px dashed var(--line);border-radius:8px;background:#fafafa}
.trash summary{cursor:pointer;padding:6px 10px;font-size:12px;color:#64748b;user-select:none;list-style:none}
.trash summary::before{content:"▸ ";font-size:10px}
.trash[open] summary::before{content:"▾ "}
.trash summary:hover{color:#334155;background:#f1f5f9;border-radius:6px}
.trash .anns{padding:0 10px 8px}
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
.verify-top-btn{font:inherit;font-size:12px;padding:2px 7px;border:1px solid var(--line);border-radius:6px;background:#fff;cursor:pointer;color:#16a34a;font-weight:600}
.verify-top-btn.on{background:#16a34a;border-color:#16a34a;color:#fff}
.verify-top-btn:not(.on){opacity:.55}
.verify-top-btn:not(.on):hover{opacity:1;border-color:#16a34a}
#toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%) translateY(8px);background:#0f172a;color:#fff;padding:7px 14px;border-radius:8px;font-size:12.5px;opacity:0;pointer-events:none;transition:opacity .15s,transform .15s;z-index:50}
#toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
.edit-box{margin-top:12px;border-top:1px dashed var(--line);padding-top:10px}
.edit-box label{display:block;font-size:12px;color:var(--muted);margin:7px 0 3px}
.edit-box input,.edit-box textarea{width:100%;font:inherit;font-size:12.5px;padding:5px 8px;border:1px solid var(--line);border-radius:6px}
.edit-box textarea{min-height:46px;resize:vertical}
.edit-box .row{display:flex;gap:8px}
.edit-box .row>div{flex:1}
.edit-box button{margin-top:9px;width:100%;font:inherit;font-size:12.5px;padding:7px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer}
/* —— 多小窗 / 同色引导线 / 彩色锚点高亮 / 折叠表单 —— */
.cvn-win{position:absolute;left:16px;top:16px;z-index:20;width:360px;max-width:calc(100vw - 24px);max-height:calc(100% - 24px);display:flex;flex-direction:column;overflow:hidden;background:var(--panel);border:2px solid var(--line);border-radius:10px;box-shadow:0 14px 36px rgba(15,23,42,.2)}
.cvn-win[hidden]{display:none}
.cvn-win,.cvn-win input,.cvn-win textarea,.cvn-win select{user-select:text}
.cvn-win .insp-head{border-bottom-width:2px;border-bottom-style:solid}
.win-dot{width:9px;height:9px;border-radius:50%;flex:0 0 9px;box-shadow:0 0 0 2px #fff,0 0 0 3px rgba(15,23,42,.12)}
#insp-guides{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none;z-index:15}
#insp-guides[hidden]{display:none}
#insp-guides line{stroke-width:1.5;stroke-dasharray:5 4;stroke-opacity:.85}
.node.hl rect,.node.hl polygon,.node.hl ellipse,.edge.hl path{stroke:var(--hl)!important;stroke-width:2.5!important}
.ann-form{margin-top:14px;border-top:1px solid var(--line);padding-top:10px}
.ann-form-head{display:flex;align-items:center;justify-content:space-between;gap:8px}\n.ann-form-toggle{display:flex;align-items:center;gap:6px;font:inherit;font-size:12.5px;font-weight:600;padding:4px 0;border:0;background:transparent;color:#334155;cursor:pointer;text-align:left;flex:1}
.ann-form-toggle:hover{border-color:var(--accent);color:var(--accent)}
.ann-form-chev{font-size:11px;color:var(--muted);width:10px;display:inline-block}
.ann-form-actions{display:flex;gap:6px;align-items:center}\n.f-submit-btn{font:inherit;font-size:12px;font-weight:600;padding:3px 12px;border:1px solid #2563eb;border-radius:6px;background:#2563eb;color:#fff;cursor:pointer;white-space:nowrap}\n.f-submit-btn:hover{background:#1d4ed8}\n.f-cancel-btn{font:inherit;font-size:12px;padding:3px 10px;border:1px solid var(--line);border-radius:6px;background:#fff;cursor:pointer;color:#64748b;white-space:nowrap}\n.f-cancel-btn:hover{background:#f1f5f9}\n.ann-form-body{margin-top:8px}
.ann-form-body[hidden]{display:none}
/* 运行时多段热区：永远透明、不吃 hover/彩色高亮的路径样式，只负责命中 */
.edge path.seg-hit{stroke:transparent!important;stroke-width:10px!important;stroke-opacity:1!important}
.whole-edge-box{margin-top:10px;border:1px dashed var(--line);border-radius:8px;padding:8px;background:#fafafa}
.whole-edge-box>button{font:inherit;font-size:12px;padding:3px 9px;border:1px solid var(--line);border-radius:6px;background:#fff;cursor:pointer;color:#334155}
.whole-edge-box>button:hover{border-color:var(--accent);color:var(--accent)}
.whole-edge-body{margin-top:8px}
.whole-edge-body[hidden]{display:none}
.whole-edge-actions{margin-top:6px}
/* 实现状态 chip（implemented 灰 / partial 蓝 / planned 琥珀 / not_connected 灰 / unknown 琥珀） */
.impl-chip{display:inline-block;padding:1px 7px;border-radius:999px;font-size:11px;line-height:1.6;border:1px solid transparent;font-weight:600}
.impl-implemented{background:#f1f5f9;color:#475569;border-color:#e2e8f0}
.impl-partial{background:#dbeafe;color:#1d4ed8;border-color:#bfdbfe}
.impl-planned{background:#fef3c7;color:#b45309;border-color:#fde68a}
.impl-not_connected{background:#f8fafc;color:#94a3b8;border-color:#e2e8f0}
.impl-unknown{background:#fffbeb;color:#b45309;border-color:#fde68a}
.impl-note{font-size:11px;color:var(--muted);margin-left:4px}
/* 结构化证据列表（不画进 SVG） */
.evidence{list-style:none;margin:8px 0 0;padding:0}
.evidence li{display:flex;align-items:center;gap:6px;font-size:11.5px;padding:3px 0;border-bottom:1px dashed #eef2f7}
.evidence li:last-child{border-bottom:0}
.ev-kind{flex:0 0 auto;font-size:10px;padding:0 5px;border-radius:4px;background:#e2e8f0;color:#475569}
.ev-kind.ev-code{background:#e0f2fe;color:#0369a1}
.ev-kind.ev-doc{background:#ede9fe;color:#6d28d9}
.ev-path{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:#334155}
.copy-evidence{flex:0 0 auto;font:inherit;font-size:11px;padding:1px 7px;border:1px solid var(--line);border-radius:5px;background:#fff;cursor:pointer;color:#475569}
.copy-evidence:hover{border-color:var(--accent);color:var(--accent)}
/* —— 图上增删元素（script-edit-elements.ts）：待新增虚线占位 / 待删除降饱和 / 创建表单 —— */
.pending-add{pointer-events:none}
.pending-add rect{fill:#f8fafc;stroke:#2563eb;stroke-dasharray:5 4}
.pending-add text{fill:#2563eb;font-size:12px}
.node.pending-remove,.edge.pending-remove{opacity:.42;filter:grayscale(1)}
.node.pending-remove text{opacity:.55;text-decoration:line-through}
#elem-pending{color:#b45309}
.cvn-create-win{width:340px}
.ce-form{margin-top:0;border-top:0;padding-top:0}
.cvn-create-actions{display:flex;gap:8px;margin-top:12px}
.cvn-create-actions button{flex:1;width:auto;margin-top:0;font:inherit;font-size:13px;padding:7px;border-radius:6px;cursor:pointer;border:1px solid var(--accent);background:var(--accent);color:#fff}
.cvn-create-actions #ce-cancel{background:#fff;color:#334155;border-color:var(--line)}
`;
