# 交互与 AI 闭环 v0（用户场景落地）

> **用途**：把"用户打开生成好的本地 HTML → 在架构图上标注 → AI 读懂并执行动作"这个真实场景，落成可实现的交互模型、数据回流通道与 AI 契约。
> **目标读者**：实现者（编辑器 / CLI / MCP）、产品决策者。
> **状态**：提案 v0，核验于 2026-11-03。**本文件是 Q2 用户答复的正式化。** §4.5「viewer interaction v1」于同日按实装补写（多小窗/颜色/引导线），v1.1 增补段级批注、防闪色、分组侧栏。
> **关联文档**：[format-spec-v0.md](format-spec-v0.md)（批注模型）；[engine-architecture-v0.md](engine-architecture-v0.md)（渲染形态）；[open-questions.md](open-questions.md)（决策记录）。

---

## 1. 场景原文与拆解

> 用户：**"用户打开生成好的本地 html，对架构图进行一些交互（对框/线/文本等元素做标注），然后 AI 能够看到并读懂用户的意思，进行一些自己的动作，比如修改架构图，或者按照架构图进行开发。"**

拆成三步，每步都有独立的技术选择：

| 步 | 动作 | 技术核心 | 失败模式 |
|----|------|----------|----------|
| S1 生成 | CLI/Agent 产出 `arch.html`（自包含） | 单文件打包、离线可用 | 依赖 CDN / 字体 / 网络 → 打不开 |
| S2 标注 | 人在图上选元素、钉批注、圈区域 | 命中测试 + 批注面板 + 本地持久化 | 关掉页面标注丢失 |
| S3 回流与行动 | 变更回到 `.cvn`，AI 读取并执行 | 写回通道 + AI 投影 + 校验 + 批准 | 静默覆盖、AI 误解、无审计 |

**S3 是整个设计里唯一有真正难点的一步**——因为浏览器 `file://` 页面**不能直接写本地文件**。

---

## 2. 写回通道：三条，按环境自动降级

| 通道 | 何时可用 | 体验 | 取舍 |
|------|----------|------|------|
| **C1 导出补丁**（下载 `.cvn.patch.json`） | 任何浏览器、任何环境 | 点"导出变更"→ 下载 → `covenant apply` | **永远可用，作为默认兜底**；多一步 |
| **C2 File System Access API** | Chromium 系、用户授权目录 | 选一次项目目录，之后直写 | 非通用（Firefox/Safari 不支持）；权限需教育 |
| **C3 本地服务**（`covenant serve`） | 开发态 | HTML 由 localhost 提供，标注 POST 直写磁盘，AI 实时可见 | 需要起服务；但**这是开发态最佳体验** |

**自动降级规则**：
```
页面启动时探测：
  if (window.__COVENANT_SERVER__)  → 用 C3（同源 POST）
  else if (showDirectoryPicker 可用) → 提供 C2 按钮（可选）
  else                              → C1 导出按钮（必现）
```
> 关键：**C1 永远存在**。用户"双击本地 HTML"的场景必须 100% 可用，不能因环境退化就没法保存。

---

## 3. 自包含 HTML 的硬要求

| 要求 | 数值/规则 | 理由 |
|------|-----------|------|
| 单文件 | 一个 `.html`，无外链 | 用户明确说"打开生成好的本地 html" |
| 体积 | 目标 < 500 KB（gzip 前），首屏 < 1s | 架构图通常 < 300 元素，够用 |
| 离线 | 零 CDN、零网络请求 | 内网/断网可用 |
| 字体 | 系统字体栈优先；可选内嵌子集 | 避免字体缺失导致布局漂移 |
| 数据 | `.cvn` 编译为 JSON 内联进 `<script type="application/json">` | 同源自包含 |
| 模式 | `readonly` / `annotate` / `dev` | 评审 vs 编辑 vs 开发态 |
| 持久化 | 标注先写 `localStorage`（带 doc rev + 时间戳） | 防误关丢数据 |
| 安全 | 所有标注文本渲染前转义 | 防 XSS（标注内容是用户/AI 输入） |

**生成命令草图**：

```bash
covenant build arch/ -o dist/arch.html          # 单文件（默认，离线可标注）
covenant bundle arch/ -o dist/site              # 文件夹站点（第二模式：index.html + manifest v3 + views/*.svg）
covenant serve dist --edit --open              # 开发态：C3 编辑写回（loopback + token；无热更新，不与 MCP 同进程）
```

---

## 4. 人侧标注交互模型

### 4.1 可选择的对象（与语义层一一对应）

| 对象 | 交互 | 生成的目标 |
|------|------|-----------|
| 元素（框/圆/圆柱） | 单击选中 → 侧栏"新建批注" | `target: {kind: element, id}` |
| 关系（线/箭头） | 点线（加宽命中区）→ 批注 | `target: {kind: relation, id}` |
| 文本标签 | 双击文本 → 批注"这段描述有问题" | `target: {kind: element, id, aspect: label}` |
| 区域 | 按住 `Shift` 框选 → 批注 | `target: {kind: region, view, rect}` |
| 整图 | 工具栏"对整图提意见" | `target: {kind: document}` |

### 4.2 批注表单（最小字段）

```
类型   [risk | question | decision | todo | defect | smell]
严重度 [blocker | high | medium | low]
标题   （一句话）
正文   （可多行）
给 AI 的指令 ai_hint（关键字段！写成"AI 能照做"的祈使句）
关联   （可选：代码路径 / ADR / 外部链接）
```

> **`ai_hint` 是本产品最重要的一个输入框**：它是人类把"意图"显式交给 AI 的唯一结构化出口。UI 上应给示例与模板（"优先 X；禁止 Y；改动后必须保持 Z"）。

### 4.3 标注生命周期（人侧可见）

```
open ──"我确认了解"──> ack ──"已解决"──> resolved
  │                                        │
  └─"不修了"──> wontfix          "被新决策取代"──> superseded（并链到 ADR）
```
视图上以角标显示 `open` 数量；侧栏按状态/严重度/类型/作者过滤；可一键导出为 Markdown 清单或 GitHub Issue。

### 4.4 明确不做（v0）

- **不允许在 HTML 里直接改语义**（改名字、加节点）→ 必须走"AI/CLI 补丁 + 批准"。原因：浏览器端没有校验器与审计，直接改会产生非法文档。
- **不允许自由手绘笔迹**进入语义层；若要，只进 `view.canvas` 视觉层（后期）。

### 4.5 viewer interaction v1：多小窗、段级批注、分组侧栏（2026-11-03 实装）

> 本节记录 `packages/render/src/html.ts` 已实现并受 `html.dom.test.ts` 覆盖的查看器交互；以代码与测试为准。
> v1.1 增补：段级批注（`target.segment`）、悬停防闪色（色忆 + 区域感知）、侧栏文档分组、弧长锚点引导线。

**状态机（单窗）**

| 状态 | 进入 | 行为 | 关闭条件 |
|---|---|---|---|
| `hover`（预览） | 指针进入元素/边/段热区 | 打开小窗 + 同色高亮锚点 | 移出形状/窗口后 **120ms** 定时关闭；`relatedTarget` 落在任一 `.cvn-win` 内或再次进入形状会取消计时；进入新的 hover 目标会先收掉其它 hover 窗 |
| `clicked`（固定） | 左键点击元素/边/段热区 | 窗口保留（移开不关）；可继续点其他对象 | 点画布/画布外空白、Esc（仅未钉住）；× 只关自己 |
| `pinned`（📌 钉住） | 点击窗口标题栏 📌 | 点空白/Esc 也不关闭；再点取消 | 仅 ×（或切图时统一清理） |

补充规则：

- **多窗并存**：点 A 再点 B 不关闭 A，直接再开一窗（hover/clicked/pinned 可同时存在）；每个窗独立引导线与颜色。
- **置顶**：按下窗口任意位置 → 该窗移到 DOM 末尾并提升 `z-index`（仅当不在末尾时才移动，避免输入框失焦）；画布内窗口 `z-index` 从 20 起递增。
- **拖拽**：按住标题栏移动（位移 > 3px 才算拖拽），坐标 clamp 在舞台内；拖拽过程实时更新引导线。
- **切图**：切换文档时关闭全部窗口（含 📌 钉住）并清空批注内联编辑态，避免"切回来表单自动复现/窗口被隐式钉死"。
- **表单**：「＋ 新增批注」在窗口内默认**折叠**，点击展开；提交后收起；切到别的对象时新窗重新默认折叠。
- **悬停区域感知**：形状/段热区 `pointerleave` 时若 `relatedTarget` 在 `.cvn-win` 内则不关；窗口自身 `pointerleave` 回到锚定对象或另一窗口也不关（防边界振荡）。
- **防闪色（色忆）**：`hoverColorMemo[(kind,id,segment)] = {color, ts}`；400ms 内同一目标 hover 窗重开且该色仍未被占用则复用同色，否则重新分配（修复"悬停不离开却一直闪不同颜色"的 P0）。
- **hover 互斥**：进入新的 hover 目标时 `closeOtherHoverWins()` 立即收掉旧预览，避免多个预览窗叠加。

**颜色（确定性）**

- 固定 8 色调色板：`#2563eb #dc2626 #059669 #d97706 #7c3aed #db2777 #0891b2 #65a30d`。
- 取色规则：优先取当前未被占用的颜色（按调色板顺序扫描），8 色占满后循环复用；不随主题/文档变化。
- 同色贯穿一窗：窗口边框、标题条、色点（win-dot）、锚点高亮、引导线全部使用该窗颜色；锚点高亮通过 CSS 变量 `--hl` 注入。
- 新窗默认级联偏移 18px（最多 8 档循环），避免与现存窗口完全重叠。
- **色忆（防闪色）**：hover 窗关闭时记录 `(kind,target,segment) → color + 时间戳`；400ms 内同目标重开且该色未被其它现存窗占用时复用，否则重新分配；过期记忆（>10s）在分配/清理时丢弃，避免无限增长。

**引导线（guide line）**

- 载体：独立 SVG overlay `#insp-guides`（`position:absolute; inset:0; pointer-events:none; z-index:15`），虚线 `5 4`、线宽 1.5、圆头。
- 端点：窗口**最近边中点** → 锚点（元素中心 / 整条边按**弧长 t=0.5** 的中点（`polylineMidpoint`，不是端口/箭头）；段窗用该段中点）。
- 更新时机：窗口拖拽与内容变化（表单展开）、缩放/平移（`applyTransform`）、窗口 resize（未手动缩放时 fitView）、侧栏折叠（fitView）、窗口打开/关闭/置顶。关闭窗口时删除自己的线。
- 坐标：锚点按 `translate + scale` 换算到舞台坐标系；窗口端按 `style.left/top` 与 `offsetWidth/Height` 计算，保证缩放/平移下仍贴合。

**边界与已知局限**

- **jsdom 只验证结构与状态**：`getBoundingClientRect`/`offsetParent`/真实 CSS 布局在 jsdom 中返回 0 或缺失，测试断言 DOM、状态、引导线属性与事件结果，不验证视觉手感；真实浏览器验收仍未完成（见 `arch/system.cvn.yaml` 的 `a.01JAYS3KV0003`）。
- 窗口无最小化/吸附/键盘焦点管理；窗口数量不设上限（颜色循环复用）；引导线不做避让与旋转窗适配。
- 纯键盘可达性只覆盖 Esc 关窗；元素/边的键盘选中不在 v1 范围。
- 写回仍只有两条：C1 离线导出 `.patch.json`/`edits.json`（file:// 兜底）与 C3 `serve --edit` 直写（loopback + token + 写前校验/备份/审计）；**不做 C2 浏览器直写**（Q9）。

**段级批注（segment，v1.1）**

- 段定义：`annotation.target = {kind:"relation", id, segment?}`；`segment` 是渲染折线 `points[k] → points[k+1]` 的 0-based 下标（`EdgeGeom.segmentCount = points.length - 1`）；省略 = 整条边（旧行为不变，见 format-spec §8.1）。
- build 期把每条关系的**有效折线**（junction 视图为 2 点直线，与静态渲染一致）写入内联数据 `segments`；浏览器运行时给每个 `.edge` 注入透明 `.seg-hit[data-seg]` 热区（**不改静态 SVG → 黄金图不变**）。
- 命中段 → 窗口键 `(relation, id, segment)`；点/悬停都用段窗；未命中段热区（整边命中区/标签）→ 旧整边窗。
- 段窗内容：本段批注 + 折叠的「整条边批注（n）」（旧批注仍可查看/改状态）；「新建批注」默认范围＝本段，可切「整条边」（target 不带 segment）。
- badge：按 `(relation, segment)` 分开计数；整边角标沿用原位置，段角标画在段中点；本地未保存批注同规则。
- 段索引是**布局相关**的路径下标（随 rev/布局漂移）；越界由渲染/构建期 `annotation/segment-range` warning 提示，不阻断。

**侧栏文档分组（v1.1）**

- `docGroup(view)` 优先级：显式 `meta.group` → source 路径（`arch/` → 系统契约；`examples/covenant-self` → 自身架构；`examples/` 其他 → 示例演示；`templates/` → 模板）→ `doc.id` 命名空间 → 其他。
- 组序 `GROUP_ORDER`：自身架构 → 系统契约 → 示例演示 → 模板 → 其他；空组不渲染；组标题不可点击，组内按钮缩进，当前激活视图所在组标题高亮。
- 切换分组后仍可正常切图/缩放/小窗（回归测试覆盖）。

**边界与已知局限（v1.1 补充）**

- 段索引只用于定位，布局变化可能指向别的物理段；当前仅对越界给 warning，无法检测"漂移但未越界"。
- 分组依赖构建期传入的文档来源信息（`meta.group` / DocView 路径）；缺失时退化为 `doc.id` 命名空间推断；bundle manifest v3 暂未携带 source path（需要时再扩）。
- 真实浏览器（非 jsdom）仍待人工验收（对应 `arch/system.cvn.yaml` 的 `a.01JAYS3KV0003`）。

**代码与测试参照**：`packages/render/src/html.ts`（docGroup/GROUP_ORDER ~L30-70、段几何/弧长中点 `relationSegments`/`polylineMidpoint` ~L95-200、悬停色忆 ~L388-580、窗口/段窗 ~L700-1090、段热区与事件命中 ~L1360-1400、壳与侧栏 ~L1720-1790）；`packages/render/src/html.dom.test.ts`（表单折叠、悬停/多窗/钉住/引导线、段热区/段窗/导出、防闪色、侧栏分组 ~L780-1470）。

### 4.6 查看器内部模块图（对应 `arch/system.cvn.yaml` 的 `v.viewer` / `v.viewer-flow`）

> 前端面板的完整业务架构已独立成视图：`v.viewer`（15 元素/19 边，查看器内部全量）与 `v.viewer-flow`（写回链路，12 元素/14 边）。

| 模块（元素） | 职责 | 关键实现 |
|---|---|---|
| `e.viewer` 查看器外壳 | 装配画布/侧栏/小窗/批注编辑/导出，路由指针与键盘事件 | `html.ts` 主 IIFE + `projectDoc` 数据投影 |
| `e.doc-data` 内嵌产物数据 | docs 的 elements/relations/annotations/views/layout/anchors/centers/segments | `<script id="covenant-data">` + `projectDoc` |
| `e.sidebar` 侧栏文档分组 | docGroup 优先级 + GROUP_ORDER + 组标题不可点/高亮 | `docGroup` / `GROUP_ORDER` / `renderShell` |
| `e.inspector` 小窗系统外壳 | 装配窗口管理器/颜色/引导线，驱动段窗与表单折叠 | `wins[]` 状态 + `openWindow` |
| `e.win-manager` 窗口管理器 | wins[] 三态（hover/clicked/pinned）、级联偏移、置顶、关闭/钉住、切图清空 | `openWindow` / `activateWin` / `closeWin` |
| `e.color-sys` 颜色系统 | 8 色调色板 + 400ms 色忆 + 占用检查 + 同色贯穿 | `colorFor` / `hoverColorMemo` |
| `e.guide-overlay` 引导线 overlay | `#insp-guides` SVG：窗口最近边 → 锚点（弧长 t=0.5 / 段中点），随拖拽/缩放/平移/resize/侧栏折叠更新 | `guidePoints` / `updateGuides` / `polylineMidpoint` |
| `e.seg-annot` 段级批注 | 运行时 `.seg-hit` 热区（不改静态 SVG）、段窗、badge 按段计数 | `relationSegments` / `drawBadges` / `seg-hit` 注入 |
| `e.annot-editor` 批注编辑流 | 内联编辑（保存/返回/删除撤销/回收桶）、状态流转、表单折叠、localStorage 暂存 | `renderWin` 批注区 + `saveAnnEdit` / `submit` |
| `e.canvas` 画布交互 | 缩放 0.15–4 / 平移 / 双击适配 / 节点拖拽改 pins（编辑态） | `applyTransform` / `fitView` / `zoomAt` |
| `e.export` 导出 | 补丁 JSON（下载）/ 编辑 JSON（edits.json） | `exportPatch` / `exportEdits` |

写回链路：`e.annot-editor → e.serve`（`POST /api/edit`、`POST /api/patch`）与 `e.export → e.patchfile`（离线 C1）；`e.guide-overlay/e.canvas/e.win-manager → e.doc-data` 只读数据。仍无网络通道/不做 C2 直写（Q9）。

---

## 5. AI 侧：如何"看到并读懂"

### 5.1 AI 拿到的三件东西

| 输入 | 内容 | 作用 |
|------|------|------|
| ① 语义图 | `digest(doc)` | 知道有哪些元素、关系、约束 |
| ② 批注 | 未决批注全文（含 `ai_hint`、`regions` 内元素清单） | **知道人想说什么** |
| ③ 变更 | `semantic diff`（若人/其他 AI 改过） | 知道发生了什么 |

### 5.2 读懂规则（写进 AI 契约）

1. **优先级**：`ai_hint` > `body` > `title` > 批注类型。
2. **必须复述**：AI 先输出"我理解你要 X，将改动元素 A/B，不动 C"——**再执行**。
3. **region 批注**要给上下文：把区域内的元素清单与相邻关系一起喂给 AI，否则"这块有问题"无法定位。
4. **不确定就问**：`type: question` 的批注，AI 的回答必须以 `thread` 追加，不得自行改 `status`。
5. **禁止**：改 `author: human:*` 的批注、改 `meta.owners`、删除历史 thread。

### 5.3 AI 动作三类

| 类 | 输出 | 门禁 |
|----|------|------|
| **A. 改图** | `change` 补丁（RFC 6902 + intent + related_annotations） | L0–L6 校验 + 语义 diff + 人批准（breaking 强制） |
| **B. 按图开发** | 任务清单 / 脚手架 / 测试骨架，每条引用 `element id` 与批注 id | 人确认范围；不得扩大改动面 |
| **C. 回答/审查** | 只在批注 `thread` 追加分析，不改文档 | 无（只读） |

> B 是关键价值：因为图有稳定 ID，AI 产出的代码可以直接标注"本文件实现 `e.payments` 的 `r.pay-outbox` 契约"，后续可反向校验（L5/L6）。

---

## 6. 闭环时序（文字版）

```
人                          HTML(浏览器)                    CLI/服务                 AI
│ 打开 arch.html              │                              │                      │
│ 选中 e.payments 新建批注     │ 写入 localStorage            │                      │
│ 点"导出变更"                │ 下载 .cvn.patch.json          │                      │
│                            │                              │ covenant apply       │
│                            │                              │  → 校验 → 写 .cvn     │
│                            │                              │  → digest + 批注 ────►│
│                            │                              │                      │ 复述理解
│                            │                              │  ◄──── 复述 + 计划     │
│ 批准                        │                              │  ← 人批准             │
│                            │                              │  ◄──── 补丁(A)        │
│                            │                              │ 校验/语义 diff        │
│                            │                              │  写回 .cvn，重建 HTML │
│ 打开新 arch.html 看到变更    │ ◄──── 新 HTML ────────────────│                      │
```

**关键不变量**：`arch.html` 永远是 `.cvn` 的**派生物**（可重建）；`.cvn` 永远是权威源。任何"只在 HTML 里发生的修改"都是未提交状态。

### 6.1 "Agent 更新 HTML" 的正确含义（重要）

用户描述的主循环是：

> **Agent 生成 HTML → 人审查并标注 → Agent 读懂 → 更新 HTML → 开发时对齐 `.cvn`**

这个循环完全成立，但**"更新 HTML" 必须是"改 `.cvn` 后重新生成 HTML"，而不是直接编辑 HTML**。否则 HTML 会变成第二个事实源，图与代码立刻开始漂移——这正是我们要解决的问题本身。

正确的顺序：

```
人标注 ──► 变更回流到 .cvn（权威）──► 校验通过 ──► Agent 依据新 .cvn 重建 HTML
                                                        │
                                                        └──► 开发时以 .cvn 为契约对齐代码
```

**三条回流通道**（按场景选）：

| 场景 | 通道 | 人的动作 | Agent 何时看到 |
|------|------|----------|----------------|
| 离线单文件（双击打开） | **C1 导出补丁** | 点"导出变更"下载 patch | 人把 patch 交给 Agent / CLI 执行 apply 后 |
| 协作态（`covenant serve`，**推荐**） | **C3 本地服务** | 无需动作 | **标注即落盘，Agent 实时可见** |
| 用户有目录写权限需求 | ~~C2 File System Access~~ | — | **已决定不做（Q9）** |

> **Q9 决策**：不做浏览器直写。原因是 C3 已经覆盖"Agent 立刻知道"的场景，而 C2 只有 Chromium 支持、且绕过校验（需额外暂存区）。离线场景用 C1 兜底。

---

## 7. 合并与冲突

- 批注 id 用 **ULID**（时间有序、全局唯一）→ 多人/多端离线标注后合并，几乎不冲突。
- 合并策略：**按 id 取并集**；同 id 不同内容 → 后到者进 `thread` 并标记 `merge_conflict: true`（不丢数据）。
- `.cvn` 元素 id 是手写 slug → 冲突时**拒绝自动合并**，要求人裁决（元素重名是设计问题，不应自动修）。
- 所有写回都是**一次事务**：写临时文件 → 校验 → 原子替换（沿用 Memoria 的 sidecar/manifest 思路）。

---

## 8. 安全与权限

| 面 | 措施 |
|----|------|
| HTML 输出 | 无网络、无外部脚本；CSP `default-src 'none'; style-src 'unsafe-inline'` |
| 标注文本 | 渲染前转义；导出 Markdown 时同样转义 |
| AI 通道 | 默认关闭且当前无网络通道（MCP 为 stdio；`ai` 子命令仅本地）；若未来引入云端模型，须显式配置 + 首次调用前打印内容摘要并确认 |
| 文件写回 | 只写项目根内白名单路径；拒绝 `..` 穿越 |
| 审计 | 每次 apply/patch 记录 `{who, when, base_rev, ops, findings, approved_by}` |

---

## 9. M3 验收标准（该场景可验收的定义）

1. 双击 `dist/arch.html`（断网、无服务）→ 能看、能选中框/线/文本、能新建 6 类批注、关掉再开 localStorage 恢复。
2. 点"导出变更"得 `.cvn.patch.json`；`covenant apply` 后 `.cvn` 出现新批注，且校验通过。
3. `covenant digest` 输出里能看到新批注与 `ai_hint`（≤ 1200 token）。
4. 模拟 AI：按 `ai_hint` 生成补丁 → 校验通过 → 语义 diff 标出 material/breaking → 人批准后写回 → 重建 HTML 可见。
5. 人工批注被 AI 篡改时，校验报 `annotation/immutable`（error）。

---

## 10. 相关决策（均已拍板）

- **Q6 ✅ 项目目录**：`build` 默认按项目目录生成单个 HTML（仍支持单文档生成）。
- **Q9 ✅ 不做 C2（File System Access）**：只保留 C1 导出补丁 + C3 本地服务，减少权限与兼容复杂度。
- **Q10 ✅ `.cvn.yaml`**：HTML 产物与文件名无关，但生成器需按双后缀识别源文件。
