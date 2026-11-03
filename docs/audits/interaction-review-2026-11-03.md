# 交互验收报告（2026-11-03）

> 验收人：Lead（interaction-owner agent 卡死被中断；本报告为 Lead 第一轮验收，含已修 P0）
> 对象：`dist/site/index.html`（bundle 交互壳，16 views）、`dist/covenant.html`（主查看器，服务 `127.0.0.1:4173`）
> 方法：jsdom 执行产物内联脚本 + 源码复核；**jsdom 不能验证 CSS 布局手感、真实指针捕获、触摸/触控板手势**，这些需人工在浏览器确认。

> **更新（16:19）**：bundle 已改为复用主查看器（`index.html = 与 dist/covenant.html 同款查看器`），原先"简化壳"删除；本节下方对简化壳的 P0 修复记录作为历史保留，功能现与主查看器一致（悬浮窗/钉住/批注编辑/删除撤销/缩放拖拽）。

## 一、bundle 壳

| 检查项 | 期望 | 实测（jsdom/源码） | 结论 |
|---|---|---|---|
| 图列表 | 16 项、点击切换、高亮 | 16 个 `#nav button`；点击后 `#stage svg` 替换、`document.title` 变化、按钮 `on` | ✅ |
| 缩放/平移/双击 | 滚轮/拖拽/双击工作 | 事件绑定存在，transform 走 `stage.style`；jsdom 可断言绑定与状态，不可验视觉 | ⚠️ 需人工确认手感 |
| 点选对象 | 显示对象详情 + 该对象批注 | 点 `e.core` 后 `#details` 出现名称/职责/技术/批注（0） | ✅ |
| 批注可见性 | 图上有批注的对象应可见 | **原实现 `showBadges:false` 且壳不画角标 → 图上完全看不出批注** | ❌→已修：改为 `showBadges:true` |
| 缩放复位 | 有 −/＋/适配 按钮 | 原实现无；只能滚轮 | ❌→已修：右上角 −/＋/适配 |
| 深链 | 可分享 `#doc` | 原实现无 | ❌→已修：切换写入 `location.hash`，加载按 hash 定位（当前格式 `#doc#view`，后续可规范为 `#doc/view`） |
| 无 JS 兜底 | 静态也能看图 | `views/*.svg` 保留 | ✅ |
| 搜索/过滤 | 图多时可搜 | 无 | P2 |
| 键盘/无障碍 | Tab/方向键/aria | 无 | P1 |
| 触摸/触控板双指缩放 | 移动端可用 | 无（仅 wheel/pointer 鼠标） | P1 |
| 锚点跳转 | 在批注面板点批注能定位对象 | 无 | P2 |
| 体积 | 壳页别过大 | index 145 KB（内联 16 SVG + 对象/批注数据），views 又存一份 | P2：可改懒加载/压缩（但 `file://` fetch 受限是内联的原因） |

## 二、主查看器（dist/covenant.html）

| 检查项 | 实测 | 结论 |
|---|---|---|
| 侧栏滚动/折叠 | 224px、`overflow-y:auto`、`#btn-nav` + localStorage | ✅ |
| 点选节点/连线 | click → 悬浮窗 + `.sel` 高亮 | ✅ |
| 悬浮窗拖拽/钉住/关闭 | 标题栏拖拽（offsetParent 坐标）、📌 两态 aria、未钉住点空白关闭 | ✅ |
| 批注编辑 | 底部表单区复用、保存/← 返回、`#ae-*` 预填 | ✅ |
| 删除/撤销/回收桶 | × → 本地移除/回收桶、toast 撤销、导出 remove | ✅ |
| 写回按钮 | 仅 `__CVN_EDIT__` 页面且 pending>0 显示 | ✅ |
| `editingAnn` 切换选中 | 未强制清理，切回可能残留编辑态 | P1 已知 |
| 钉住状态持久化 | 会话内，不持久 | P2（可选） |
| 真实浏览器手感 | jsdom 只验证事件与 DOM，不验证 CSS/指针捕获 | ⚠️ 需人工验收 |

## 三、整改建议（按优先级）

**P0（已修）**
1. bundle 图上批注不可见 → `showBadges:true`；
2. bundle 无缩放复位 → 右上角 −/＋/适配；
3. bundle 无深链 → hash 定位。

**P1（待定）**
4. 主查看器切换对象时清理 `editingAnn`；
5. bundle 键盘可达性（Tab 选中列表、方向键平移、`+/-` 缩放、Esc 适配）；
6. bundle 触摸/触控板 pinch 支持。

**P2（待定）**
7. bundle 图列表搜索/按文档分组、锚点跳转；
8. bundle hash 格式规范为 `#doc/view` 并兼容旧格式；
9. bundle 壳体积优化（按需注入 SVG，服务模式 fetch、file:// 回退内联）。

## 四、说明

- 真实浏览器（Chrome/Edge）下的 CSS 布局、拖拽手感、pointer capture、滚动惯性仍需人工验收；
- bundle 仍为**只读**（不提供编辑/写回），是否加写回见 todo Q13；
- interaction-owner agent 因长时间卡死被中断，未产出报告；本报告由 Lead 完成，后续可重派 agent 做第二轮真实浏览器交互验收。
