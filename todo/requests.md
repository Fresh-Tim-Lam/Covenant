# 用户原话收集（requests）

> **规则**：用户原话**逐字**保留在 `>` 引用块内，不改标点、不改错别字、不删空格；整理与核对一律写在引用之外。
> **收集状态**：R-001 ~ R-003 已录入；三条均为 lead 在派单中**逐字转引**的用户消息，todo-scribe 未直接读取原始会话记录。
> **待核对**：若后续拿到原始消息，只在文末"核对记录"追加差异，**不修改**下方任何引用块。
> **录入时刻**：2026-11-03 13:44 +08:00（会话采样时刻）；用户发言时刻均未提供。

---

## R-001 禁用文字拖选 / 独立复制按钮 / 用户可编辑 + git diff / 派 todo agent

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 13:44 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 禁用文字拖拽选择，留单独的复制按钮，因为会影响架构图拖拽移动;架构图还得能够用户自己编辑，后端处理好git diff，这个机制你们自行安排， 为了防止上下文丢失， 你可以派出todo agent，进行计划“原话收集”和整理，他的工作区是todo文件夹

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 画布上要**禁用文字拖拽选择**——它会抢占拖拽手势；表单/检查器内应仍能选中文字。
  2. 用**独立的"复制"按钮**替代文字选择作为复制手段。
  3. 架构图要支持**用户自己编辑**；编辑范围（位置 / 标签 / 元素 / 关系）用户未说明，见 Q1。
  4. **后端处理好 git diff**：编辑如何落盘、如何产出可审查的 diff；机制由团队自行安排（见 D-009），但不得绕过补丁门禁（D-003）。
  5. 设立 **todo agent** 做"原话收集 + 整理"，工作区为 `todo/`。
  - 对应任务：T1 / T2 / T3 / T4 / T5。
- **现状核对**（2026-11-03 13:47 +08:00，只读静态检查，**未在真实浏览器实测**）：
  - `packages/render/src/html.ts:152-154` 已有 `#stage-wrap,header,#views,footer,#tip{user-select:none}`、`svg text{user-select:none}`，检查器与表单保持 `user-select:text`；
  - 检查器内已有**复制按钮**：`html.ts:352` 生成、`html.ts:357-358` 绑定、`html.ts:532-542` 复制"对象语义 + 批注"JSON（失败时降级 `fallbackCopy`）；
  - `dist/covenant.html` 已于 2026-11-03 13:46:16 重建（138,113 字节），`user-select` / `insp-copy` / `copy-btn` 均已出现在产物中；
  - **仍未实现**：图上编辑能力、后端落盘、git diff；仓库**未 `git init`**（`git rev-parse --is-inside-work-tree` → `fatal: not a git repository`，同日实测）。

---

## R-002 视图交互与左右栏空间

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 13:44 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 架构图没办法双击进入  缩放/左键拖拽 ，而且右栏完全可以做成悬浮小窗，跟随点击的位置，留出更多空间给架构图，左栏也得做留空间处理，要么可以伸展/调宽，要么做成顶栏

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 实际体验中"**双击进入**、缩放、左键拖拽"不可用或不明显；"双击进入"到底指进入什么（放大聚焦 / 编辑态 / 全屏），用户未说明，见 Q4。
  2. **右栏改为悬浮小窗**，跟随点击位置出现，把空间让给架构图。
  3. **左栏也要省空间**：可伸展/调宽，或改成顶栏（见 Q5）。
  4. 设计目标：画布面积最大化；面板不长期遮挡图上内容。
  - 对应任务：T7 / T8 / T9；先用 T0 确认用户打开的是哪一份构建产物。
- **现状核对**（2026-11-03 13:47 +08:00，只读静态检查，**未实测**）：
  - `html.ts:544-580` 已挂滚轮缩放（L545）、左键拖拽平移（L549）、双击放大 1.35（L567）、缩放按钮；提示文案 `html.ts:639`"滚轮缩放 · 拖拽平移 · 双击放大 · 点击元素/连线标注"；
  - 检查器已按点击坐标定位：`html.ts:494-502` `placeInspector`，`html.ts:444` 在点选后调用；默认隐藏；
  - 视图导航已是**顶部**按钮条（`#views`，`html.ts:108`），与用户说的"左栏"不完全对应；
  - 用户反馈"不可用"与源码现状不一致 → 优先怀疑其打开的是**旧构建或不同产物**，T0 负责复现确认。

---

## R-003 不要为看图开监听端口

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 13:44 +08:00）
- **来源**：用户消息（lead 逐字转引；上下文为查看/验证渲染产物）
- **原话**：

> 不需要开监听端口吧，直接告诉我html然后我点开不行么

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 交付方式要求"给我 HTML 文件、我双击打开"，不接受为了**看图**启动本地监听服务。
  2. 与 R-001 第 4 点存在张力：编辑落盘 + git diff 通常需要后端或目录写权限，而"不开端口"限制了本地服务方案；必须请用户选择通道（Q2）。
  3. 与既定决策 D2（自包含 HTML 双击打开）一致；但与 Q9（浏览器不直写）叠加后，"用户可编辑"的落盘方式成为**必须拍板**的问题。
  - 对应任务：T4、T0；对应问题：Q2。

## R-004 把"纯 Agent 团队开发基础设施"思想整理成规范并立即执行

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 14:03 +08:00）
- **来源**：用户消息（lead 逐字转引）；附文件路径 `D:\AAA_Project\docs\Ideas\纯agent团队开发基础设施新范式.md`（**仓库外**，只读参考）
- **原话**：

> @D:\AAA_Project\docs\Ideas\纯agent团队开发基础设施新范式.md 这个得整理思想纳入规范，从现在就得开始做

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 把"索引优先的模块化 Agent 协同开发范式（Index-First Agent Dev）"整理成**规范**，并**从现在开始立即落地执行**（不是只写文档）。
  2. 规范要可执行：硬约束 R1–R5、角色写域、工作流预设、索引维护参数、代价与反模式。
  3. 附文件在**仓库外**（`D:\AAA_Project\docs\Ideas\`），只读参考；规范正文落到仓库内 `docs/conventions/`。
  - 对应任务：T10（已完成，由 lead 实测）、T11（待办）、T12（阻塞）；对应决策：D-013、D-014；对应问题：todo/Q9。
- **现状核对**（2026-11-03 14:03 +08:00，只读静态检查，**未运行 pnpm**）：
  - `docs/conventions/agent-team-development.md` 存在（6,686 B @14:01:38）；`docs/design/adr/0003-index-first-agent-development.md` 为 `status: accepted`（ADR 目录共 3 条）；
  - `scripts/check-module-docs.mjs`（1,550 B @14:02:26）+ `package.json` 已有 `modules` 脚本，`verify` 链已含 `pnpm modules`；
  - **13/13** 个 `packages/*/README.md` 均含五段（`## 职责` / `## 依赖` / `## 公共接口` / `## 设计取舍` / `## 约束`），逐目录脚本核对通过；
  - `arch/index.yaml` 已有 `scripts/check-module-docs.mjs` 条目（L231–238），全文件 26 条 FRAS 条目；`arch/system.cvn.yaml` links 引用 `0003`（L215）；
  - `AGENT.md` L11 新增"索引优先的 Agent 开发范式"章节、L88 命令表新增 `pnpm modules`；`docs/conventions/README.md` 已挂链接；
  - 门禁与 `pnpm verify` 的**实际通过结果由 lead 实测**（modules PASS 13 模块 / FRAS 26 条 / ADR 3 条 / 227+ tests 绿），todo-scribe **未复跑**。

## R-005 Q1 编辑边界 + Q2 落盘通道拍板（两条原话）

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 14:09 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话（一）**：

> 编辑边界：先只做"位置 + 标签/说明"（推荐），还是这轮就要能增删元素/关系，----增删元素/关系以后做

- **原话（二）**：

> 落盘通道：选 A / B / C 哪条？我搞错了，看来还是需要跑编辑态短时本地服务（得准备好用户一键启动的脚本以及用户在 别的agent团队把控下的项目  部署的系统化指引），B，后续可以加上C

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. **Q1 已拍板**：v0 编辑边界 = **位置 + 标签/说明**；**增删元素/关系以后做**（本轮不做）。
  2. **Q2 已拍板**：选 **B（编辑态短时本地服务）**；附两条交付要求：①用户**一键启动脚本**；②"别的 Agent 团队把控的项目"里的**系统化部署指引**。
  3. **C（File System Access API）后续再加**（非本轮）。
  - 对应任务：T3 / T4（已完成 v0，含 B 通道）、T13（方案 C，待办）；对应决策：D-021（B）、D-023（Q1 边界）；对应问题：Q1 / Q2 已决。
- **现状核对**（2026-11-03 14:09 +08:00，只读静态检查，**未运行 pnpm**）：
  - ADR-0004 `docs/design/adr/0004-edit-server-short-lived.md` 为 `status: accepted`，`arch/system.cvn.yaml` L217 links `0004`（ADR 共 4 条）；
  - `packages/cli/src/serve.ts` 已含编辑模式：`POST /api/edit`、注入 `window.__CVN_EDIT__`、仅 loopback、token 校验（无/错 token → 401）、写回走 `performEdit`；
  - `packages/cli/src/edit-flow.ts` 抽出共享落盘流程（CLI 与 serve 共用）；`package.json` 有 `edit:serve` = `serve dist --edit --open`；
  - `docs/guides/agent-team-edit-deployment.md` 存在（一键启动/安全写域/协作/降级/回滚/FAQ）；`packages/cli/src/serve.edit.test.ts` 6 条用例（注入 / 401 / 预览 / 写回 rev+1+备份 / 404 / AI 422）；
  - FRAS 27 条；前端 `html.ts` 已含「预览并写回 / 确认写回」（L643–673、L773）；
  - 实际通过结果（233 tests、`pnpm verify` 全绿）**由 lead 实测**，todo-scribe **未复跑**。

## R-006 Q3 口径（用户未直接回答，由 lead 决定）

- **日期**：2026-11-03（录入时刻 14:09 +08:00）
- **来源**：**lead 决定；用户未直接回答**（用户原话只是复述了 Q3 的问题文本，未给出选择）
- **决定**（引用外归纳，**非用户原话**）：
  1. **文本统一 diff**：内置 LCS 生成 unified diff，**不依赖 git**（无 git 仓库也可用）。
  2. **回写 `.cvn.yaml`**：单一事实源 + `meta.rev+1` + 备份 + 审计。
  3. **不擅自 `git init`**：等用户明确批准（todo/Q9(b)）。
  - 对应决策：D-022；对应任务：T4（已完成 v0）、T12（阻塞于 git init 批准）。
- **状态**：已由 lead 决定并实现（**由 lead 实测**），**用户尚未直接确认**；Q3 剩余部分（是否批准 `git init`、何时加 C）仍待用户拍板。

## R-007 节点/边语义：真实交点 + 不相交跳线弧 + 边标签胶囊

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 14:15 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 定义节点（真实相交的交点，不是不相交的交点，另外，不相交的交点得有特殊样式表示比如一个半圆/圆弧）（不是框）之间的线为边， 边上的文字得用胶囊装起来保证可读性

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. **节点 = 真实相交的交点**（连线真正汇合处），**不是框**。
  2. **不相交的交叉点**要有特殊样式表示（**半圆/圆弧"跳线"**），以区分"真实相交"与"只是视觉交叉"。
  3. **边 = 节点之间的线**。
  4. **边上的文字用胶囊承载**，保证可读性（压线也可读），并保留语义标签（transition / 基数 / 协议等）。
  - 对应任务：T14（已完成 v0，由 lead 实测）、T15（待办）；对应决策：D-024；对应问题：todo/Q10。
- **现状核对**（2026-11-03 14:15 +08:00，只读静态检查，**未运行 pnpm / render**）：
  - `schema/kernel.schema.json` L210 `"node_style": { "enum": ["box", "junction"] }`；`packages/core/src/types.ts` L89-90；
  - `packages/render/src/index.ts`：L418-419 读取 `present.node_style`；L527 junction 画 `r="6"` 圆点（真实交点）；L155 二次贝塞尔"跳线弧"；L506 `edge-label-bg` 胶囊；
  - 示例 `examples/topology-junction.cvn.yaml`（`graph@1` + junction，1,697 B @14:14:26）；黄金 `packages/render/src/__golden__/topology-junction.svg`（3,725 B @14:14:32；golden 共 **15** 张；静态核对含 `edge-label-bg`、`r="6"`、`Q` 跳线弧）；
  - 测试：`packages/render/src/render.test.ts` L202-250（"边标签带胶囊背景"、"junction 模式：节点为点，交叉处有跳线弧，边是点间直线"）；
  - 文档：`docs/design/format-spec-v0.md` L151/L236（`node_style`）、`examples/README.md` L15、`CHANGELOG.md` L26、`docs/to-dolist.md` L141；
  - 渲染计数（`r="6"` 6 个 / `Q` 3 处 / `edge-label-bg` 4 个）、236 tests、`pnpm verify` 全绿、`build:html` 16 docs **均为 lead 实测**，todo-scribe 未复跑（静态见 examples 下 14 个 `.cvn.yaml`，docs 计数口径可能按视图计）。

## R-008 回归反馈：悬浮小窗不见了、点击框没反应

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 14:19 +08:00）
- **来源**：用户消息（lead 逐字转引；上一轮 bug 反馈）
- **原话**：

> 之前的右栏我说做成悬浮小窗，怎么现在没了，我点击框都没有反应

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 用户在新构建上**点击节点无反应**；
  2. 之前要求的**右栏悬浮小窗**不再出现 → 怀疑是**回归**。
  - 根因（由 lead 实测）：加"拖拽平移"时在 `pointerdown` 立即 `setPointerCapture`，浏览器把后续 `click` 的 target 重定向到画布容器，节点/连线 click 处理器收不到。
  - 修复：`pointerdown` 只记起点，移动 >4px 才捕获，`pointerup` 释放；单击=选中、拖拽=平移；另加边透明 `stroke-width=10` 命中路径。
  - 对应任务：T16（已完成，由 lead 实测）、T15（进行中：编辑态拖拽节点已支持）；对应决策：D-026。
- **现状核对**（2026-11-03 14:19 +08:00，只读静态检查，**未运行 pnpm**）：
  - `packages/render/src/html.ts` L686-710：`pointerdown` 仅记录起点（L691 注释明确"不能立即 setPointerCapture"），移动 `>4` 才 `setPointerCapture`（L699），`pointerup` 释放（L706）；
  - 编辑态节点拖拽：`html.ts` L733-749（节点自身 pointerdown/move/up，捕获 + 更新 pins）；
  - 边命中路径：`packages/render/src/index.ts` L459 `<path ... stroke="transparent" stroke-width="10" pointer-events="stroke"/>`；
  - 回归测试：`packages/render/src/html.dom.test.ts` L215"pointerdown→pointerup→click 后仍打开悬浮检查器"、L229"拖拽后记录 pins，并出现在导出的 edits.json"；
  - 产物：`dist/covenant.html` 178,495 B @14:18:48（lead 报告 163.5 KB，**口径待对**）；**238 tests / verify 全绿 / build:html 16 docs 为 lead 实测**，todo-scribe 未复跑。

## R-009 悬浮小窗：可拖拽 + 钉子钉住

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 14:20 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 小窗允许拖拽，左上角加个钉子的图标 表示点击别的地方这个小窗不消失

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. **悬浮检查器窗口允许拖拽移动**。
  2. **左上角加"钉子"图标**：钉住（pin）后，点击别的地方/空白，小窗**不消失**。
  - 对应任务：T17（已完成，由 lead 实测）；对应决策：D-027；Q10 备注（钉住状态是否持久化，可选）。
- **现状核对**（2026-11-03 14:20 +08:00，只读静态检查，**未运行 pnpm**）：
  - `packages/render/src/html.ts`：L128 `.insp-head{cursor:grab}`；L129-130 `.pin-btn` / `.pin-btn.on` 高亮；L386 窗头生成 `📌` 钉住按钮；L389 `×` 关闭时 `pinned=false` 复位；L392-399 钉住切换 + toast；L401-418 窗头 pointerdown 拖拽（`left/top` 更新、`Math.max(4, …)` 防负值、按钮区域不触发）；
  - 钉住守卫：`clearSelection` L554 与 `placeInspector` L563 在 `pinned` 时不关闭/不跳位；Esc 关闭受 `!pinned` 限制（L761）；
  - 测试：`packages/render/src/html.dom.test.ts` L275"钉住后点击背景不关闭；× 关闭并复位"、L296"拖拽窗头可移动窗口"；
  - 产物：`dist/covenant.html` 180,266 B @14:19:49（lead 报告 165.1 KB，**口径待对**）；**240 tests / verify 全绿 / build:html 16 docs 为 lead 实测**，todo-scribe 未复跑。

## R-010 框的线接入点：每线独立端口 + 最小间距 + 自适应扩框

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 14:25 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 框的线接入点可以有很多，保证每条线一个接入点，这样可以避免线重合（各个连线之间避免重合，保留最小间距），如果接入点不够，这个框的宽高自适应调整

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 框（元素）上**每条连线要有独立接入点**，避免多条线共用一点导致重合。
  2. 同侧多线之间**保留最小间距**（不要挤在一起）。
  3. **接入点不够时，框的宽/高自适应调整**（按维度扩展，容纳端口）。
  - 对应任务：T18（已完成，由 lead 实测）；对应决策：D-029。
- **现状核对**（2026-11-03 14:25 +08:00，只读静态检查，**未运行 pnpm**）：
  - `packages/layout/src/index.ts`：L423-425 `PortSide` / `PORT_GAP = 16` / `PORT_PAD = 12`；L472-486 `PortNeed` + `addNeed`（每条边按几何方向分侧收集需求）；L493+ 按侧分配；L496 `needLen = (list.length - 1) * PORT_GAP + 2 * PORT_PAD`（即 `(n-1)*16+24`，不足则扩该维度）；L515-522 同侧按对端中心排序后居中线性排布；L542/L555 使用 `routeAbovePorts` / `routePorts`；L583 `route` 保留兼容；L602 `routePorts`、L613 `routeAbovePorts`；
  - 测试：`packages/layout/src/layout.test.ts` L249"同一侧的平行边使用不同端口，且保持最小间距"、L260"端口数超过侧边长度时自动扩展该维度（保持最小间距）"；
  - 黄金 15 张已按新路由重生成（`packages/render/src/__golden__/*.svg` @14:24:02）；
  - 文档：`docs/design/format-spec-v0.md` L237（端口按侧分配/16px/不足扩框）、`CHANGELOG.md` L26、`docs/to-dolist.md` L144；
  - 全仓 **247 tests**、`pnpm verify` 全绿（index 27 / adr 4 / modules 13）、build:html 16 docs **为 lead 实测**；todo-scribe 未复跑。

## R-011 修复：小窗拖拽起手坐标跳变

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 14:26 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 小窗拖拽坐标映射有问题，进入拖拽状态时小窗往下闪到一个位置才拖拽移动

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 悬浮小窗**拖拽起手瞬间坐标跳变**（向下一段）后才开始跟随鼠标。
  - 根因（由 lead 实测）：拖拽用 `getBoundingClientRect()`（**视口坐标**）写 `style.left/top`（**offsetParent 坐标**），`main` 在顶栏下方 → 每次起手先跳一个顶栏高度。
  - 修复：定位与拖拽统一用 **offsetParent 坐标**——`placeInspector` 用 `client - parentRect` 换算并 clamp；拖拽起点取 `style.left/top`（缺省回退 `offsetLeft/offsetTop`），位移按父容器边界 clamp。
  - 对应任务：T19（已完成，由 lead 实测）；对应决策：D-030。
- **现状核对**（2026-11-03 14:26 +08:00，只读静态检查，**未运行 pnpm**）：
  - `packages/render/src/html.ts` L570-584 `placeInspector`：`parent = box.offsetParent || document.body`、`pr = parent.getBoundingClientRect()`、`left = cx - pr.left + 16` / `top = cy - pr.top + 12`，再按 `parent.clientWidth/Height` clamp（L578-583）；
  - 拖拽块 L406-422：起点 `l: px(box.style.left) || box.offsetLeft`、`t: px(box.style.top) || box.offsetTop`（L411-412），位移按父容器 `maxL/maxT` clamp（L419-422）；
  - 回归测试：`packages/render/src/html.dom.test.ts` L296-311"拖拽窗头可移动窗口"——断言位移连续（`beforeLeft + 50` / `beforeTop + 40`，`toBeCloseTo`，不能跳变）；
  - 全仓 **247 tests**、`pnpm verify` 全绿、build:html 16 docs / 165.7 KB、生成脚本 `node --check` 通过 **均为 lead 实测**；todo-scribe 未复跑。
  - 附注（静态）：`placeInspector` L573-576 有 `parent`/`pr` 重复声明（`var` 可重复声明，功能等价），可后续清理。

## R-012 导航改左侧侧栏 + 修复"别的架构图点不动/滚不动"

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 14:30 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 顶栏设计有点丑，还是改成左侧侧栏吧，而且现在别的架构图不可点，滚轮也滚不动该栏

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. **顶栏视图 chips 改回左侧侧栏**（顶栏"有点丑"）。
  2. **"别的架构图"按钮点不动**（切换视图/文档失效）。
  3. **该栏滚轮无法滚动**（列表滚不动）。
  - 根因（由 lead 实测）：视图按钮的点击绑定仍用旧选择器 `querySelectorAll("nav button")`，而按钮已移到 `#views` 下 → 监听器数量为 0，"别的架构图点不动"（且**无报错**）；改为 `#views button` 后修复。
  - 修复：`#shell` 内 `aside#views`（224px、`overflow-y:auto`、原生滚轮、`overscroll-behavior:contain`）+ ☰ 折叠（localStorage 持久化）。
  - 对应任务：T20（已完成，含并入的 T21 折叠持久化）；对应决策：D-031。
- **现状核对**（2026-11-03 14:30 +08:00，只读静态检查，**未运行 pnpm**）：
  - `packages/render/src/html.ts`：L112 `#shell{display:flex;flex:1;min-height:0}`；L113 `#views{width:224px;flex:0 0 224px;display:flex;flex-direction:column;…}`；L114-116 按钮纵向全宽/换行/`.on` 高亮；L117 `body.nav-collapsed #views{display:none}`；L241 与 L504 绑定均为 **`#views button`**（无 `nav button` 残留）；L818-824 localStorage `covenant:viewer:nav` + `nav-collapsed` 切换；L871 `☰ #btn-nav`；L887 `<aside id="views">`；
  - 测试：`html.test.ts:174`"views 在 shell 内、纵向滚动、有折叠按钮"（断言 shell/btn-nav/overflow-y:auto/nav-collapsed）；`html.dom.test.ts:314`"点击第二个视图按钮 → 对应 section 显示、旧 section 隐藏"；
  - 顺手清理：`placeInspector` 重复 `var parent/pr` 已删（现 L575-576 各一次）；
  - 全仓 **249 tests**、`pnpm verify` 全绿、build:html 16 docs / 166.4 KB、`node --check` 通过 **均为 lead 实测**；todo-scribe 未复跑（静态实测 `dist/covenant.html` 181,608 B @14:30:24，与 lead 报的 KB 口径待对）。

## R-013 招聘模块 owner + 文件组织/索引/RAG 要求

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 14:45 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 你得开始招聘agent/团队进行专门的模块负责了，负责的粒度和内容得科学分析判断，文件组织得符合规范（可以用一个文件夹替代旧式的单文件装一堆代码，避免单文件爆agent上下文，，便于indexer（自带AOCI + XERJ两个工具）维护（因为这样，可以不需要指明行列，减少git diff依赖，还有助于结合模块代码对应文档，进行RAG维护), 以及对应开发人员查询检索（可以结合RAG手段））

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. **开始招聘 agent/团队**做专门的模块负责（模块 owner）。
  2. owner 的**粒度与职责内容要科学分析判断**（不能拍脑袋）。
  3. **文件组织要符合规范**：可用"一个文件夹"替代"单文件装一堆代码"，**避免单文件爆 agent 上下文**。
  4. 便于 **indexer 维护**（用户提到 indexer 自带 **AOCI + XERJ** 两个工具）：这样可**不需要指明行列、减少 git diff 依赖**，并**结合模块代码对应文档做 RAG 维护**。
  5. 也便于**开发人员查询检索**（可结合 RAG）。
  - 对应任务：T22（已完成 v0：编制 + patch 拆分）、T22b（其余 4 组待重派）；对应决策：D-032。
  - **口误澄清/范围记录**：用户原话中的"上下文，，"为双逗号，按原样保留；AOCI 当前可用、**XERJ 尚未接入**（不得写成已接入）。
- **现状核对**（2026-11-03 14:45 +08:00，只读静态检查，**未运行 pnpm**）：
  - `docs/conventions/module-ownership.md`（5,605 B @14:43:49）：§1 粒度阈值（owner 域 1500–3000 行、单文件 ≤300、包 ≤4、跨域依赖 ≤3 方向）、拆/合信号、§2 目录契约（文件夹 + barrel）、§3 团队编制、§4 owner 开工清单、§5 当前基线、§6 与 Indexer/RAG 配合；
  - `team/README.md`（1,209 B）+ `team/owns.yaml`（1,117 B）：登记 **6 条目**（core-semantics / visualization / authoring / interfaces / governance / planning），共享文件只有 lead 可写、owner 写域不重叠、`split_threshold_lines: 300`、`owner_budget_lines: [1500,3000]`；
  - 拆分落地：`packages/patch/src/` 6 文件 + barrel，实测行数 **apply 161 / audit 25 / gate 216 / index 21 / parse 85 / text 180**（全部 ≤300；patch 测试 35 条）；`arch/index.yaml` 32 条；
  - 团队状态（`list_agents`）：lead + todo-scribe + 5 个 owner（core-owner/viz-owner/tools-owner/iface-owner/arch-guard）；共享任务板：task-3（authoring）**completed**，task-1/2/4/5 仍 **pending**（对应 4 个 owner 中途失败后待重派）；
  - **未决/风险**：4 个子代理中途失败（原因未明）；AOCI 可用、**XERJ 未接入**。

## R-014 批注删除按钮 + 撤销/回收桶

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 14:45 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 这些批注（我引用不是说这个有问题，只是指明我指代的对象类型）需要增加一个小“x"按钮删除避免误添加， 并且可以增加撤销操作或者回收桶避免误删

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 批注需要**小"x"删除按钮**，避免误添加后无法清理。
  2. 需提供**撤销操作或回收桶**，避免误删。
  - 实现（由 lead 实测）：批注「×」→ 持久批注导出 `remove /annotations/<id>`（patch 门禁 **human-only**，AI 删除被 `gate/remove-actor` 拒）；本地新增直接移除；已存批注移入**回收桶**可恢复；操作带「撤销」toast；patch 新增 `removeAnnotationBlocks`（保留注释，删空规范化 `annotations: []`）。
  - 对应任务：T23（已完成，由 lead 实测）；对应决策：D-033。
- **现状核对**（2026-11-03 14:45 +08:00，只读静态检查，**未运行 pnpm**）：
  - `packages/render/src/html.ts`：L133-138 `.del-ann`/`.trash`/`.trash-restore`/`#toast.undoable`；L202-228 `deleted` 数组 + `isAnnDeleted`/`visibleAnns`/`pendingCount`；L332-359 `undoStack`/`pushUndo`/`deleteAnn`/恢复；L416 过滤已删；L434+ 回收桶 UI；L561 导出 `remove` op；
  - `packages/patch/src/text.ts` L67 `removeAnnotationBlocks`；`apply.ts` L19/L109 使用；`gate.ts` L90 `gate/remove-actor`（AI 不得删批注）；
  - 测试：`packages/patch/src/patch.test.ts`（35 条，含 `gate/remove-actor` L404）、`packages/render/src/html.dom.test.ts`（11 条）；
  - 全仓 **253 tests**、`pnpm verify` 全绿（index 32 / adr 4 / modules 13）、build:html 16 docs / 171.3 KB **均为 lead 实测**；todo-scribe 未复跑（静态实测 `dist/covenant.html` 186,822 B @14:42:24，lead 报 171.3 KB，口径待对）。

## R-015 悬浮窗关闭语义补全 + 钉子两态样式

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 14:50 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 窗口钉子的功能没做完（未钉住的时候窗口不会正常关闭），而且钉子这种多状态ui得有不同样式表示状态

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. **未钉住时点击别处应正常关闭**悬浮窗（此前只覆盖"钉住不关"，未覆盖"未钉住要关"，选中/空白目标判断不全）。
  2. **钉子是多状态控件**，需要**不同视觉样式**表达状态（未钉住 vs 钉住）。
  - 修复（由 lead 实测）：新增 **document 级点击处理**——未钉住时点画布空白/画布外一律关闭；点节点/连线由其自身 click 处理（切换选中）；点检查器/工具条/悬浮提示/下载链接不关闭；补 `isConnected` 防护与「撤销」按钮 `stopPropagation`，避免元素在处理器中被重渲染后"误关"。
  - 两态样式：未钉住=灰/半透明/去饱和；钉住=蓝底高亮 + 轻微旋转 + 圆点 + 阴影；`aria-pressed` true/false；hover 中间态；title 文案随状态变化。
  - 对应任务：T24（已完成，由 lead 实测）；对应决策：D-034。
- **现状核对**（2026-11-03 14:50 +08:00，只读静态检查，**未运行 pnpm**）：
  - `packages/render/src/html.ts`：L131-134 两态样式（`.pin-btn` 基础/`:hover` 中间态/`.on` 旋转+阴影/`::after` 圆点）；L453 `📌` 初始 `aria-pressed="false"`；L461-471 `paintPin()` 同步 class + `aria-pressed` + `title` 文案随状态变化；L612-620 document 级 click（`pinned` 直返、`isConnected` 防护、排除 `#inspector, #toast, header`、`a[download]`、`.node, .edge`，其余 `clearSelection()`）；L376 撤销按钮 `stopPropagation`，L502/L506 删除/恢复按钮 `stopPropagation`；
  - 测试：`html.dom.test.ts` 共 **13 条**，新增 L388"未钉住：点画布空白正常关闭"、L401"钉住：点空白不关闭；取消钉住后再点空白关闭"（断言 aria-pressed/class）；
  - 全仓 **255 tests**、`pnpm verify` 全绿（index 32 / adr 4 / modules 13）、build:html 16 docs / 172.1 KB、`node --check` 通过 **均为 lead 实测**；todo-scribe 未复跑（静态实测 `dist/covenant.html` 187,925 B @14:48:52，lead 报 172.1 KB，口径待对）。

## R-016 悬浮窗小窗顶栏（可拖拽标题栏 + grip）

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 14:52 +08:00）
- **来源**：用户消息（lead 逐字转引；用户贴出当前 DOM 片段后提出）
- **原话**：

> <div class="insp-head"><button class="pin-btn on" id="insp-pin" title="钉住：点击别处不关闭">📌</button><span class="hint">元素 · e.builder</span><span class="insp-actions"><button class="copy-btn" id="insp-copy" title="复制该对象的语义与批注 JSON">复制</button><button class="insp-close" id="insp-close" title="关闭">×</button></span></div>这个得做成一个小窗内顶栏，保证用户有位置拖拽到

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 悬浮窗头部要成为真正的**"小窗标题栏"**：**固定高度**、**整条可拖拽**（含专用 grip 把手）、**标题不挤占拖拽区**、**动作按钮靠右不换行**。
  2. 用户贴的 HTML 中 `pin-btn on` 配旧 title，是**旧构建/旧 DOM**；新构建中 `title` 与 `aria-pressed` 随状态更新（`paintPin`）。→ 提示用户先刷新/重新打开最新 `dist`。
  - 对应任务：T25（已完成，由 lead 实测）；对应决策：D-035。
- **现状核对**（2026-11-03 14:52 +08:00，只读静态检查，**未运行 pnpm**）：
  - `packages/render/src/html.ts`：L126 `.insp-head{position:sticky;top:0;z-index:3;height:38px;min-height:38px;margin:-10px -14px 8px;padding:0 10px;background:linear-gradient(#f8fafc,#f1f5f9);border-bottom:1px solid var(--line);border-radius:10px 10px 0 0;cursor:grab;…}`；L127 `:active{cursor:grabbing}`；L128 `.hint{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`；L129 `.grip` 点阵把手（radial-gradient）；L130 `.insp-actions{margin-left:auto}`；L455 markup：`<div class="insp-head" id="insp-drag"><span class="grip" aria-hidden="true" title="按住拖动窗口">…`；L475-478 窗头 `pointerdown` 拖拽（`closest("button")` 排除按钮）；
  - 测试：`html.test.ts:185`"有专用拖拽顶栏（固定高度 + grip + 动作区靠右）"（断言 `insp-drag`/`grip`/`height:38px`/`cursor:grab`/`actions margin-left:auto`）；
  - 全仓 **256 tests**、`pnpm verify` 全绿（index 32 / adr 4 / modules 13）、build:html 16 docs / 172.5 KB、`node --check` 通过 **均为 lead 实测**；todo-scribe 未复跑（静态实测 `dist/covenant.html` 188,409 B @14:51:15，lead 报 172.5 KB，口径待对）。

## R-017 批注内容可编辑

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 14:54 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 批注得能够编辑

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 已有批注要能在查看器里**编辑内容**（标题/正文/类型/严重度/ai_hint），并**落盘到 `.cvn.yaml`**。
  - 实现（由 lead 实测）：查看器每条批注新增「编辑」按钮 → 就地展开表单（类型/严重度/标题/正文/ai_hint）→ 保存/取消；保存后列表即时更新并进入本地待导出状态；后端 patch 新增 `replace /annotations/<id>`（整块替换、文本级、保留注释），gate 规则 **human-only**（AI → `gate/edit-actor`）、不得改 target/author/created/status（`gate/edit-target`/`edit-author`/`edit-created`/`edit-status`），title/type/severity 校验；apply 后 rev+1、复验。
  - 实现期修 bug：①编辑表单按钮误命中 `.acts button` 状态处理器（status 被写成 null）→ 加 `data-act` 守卫；②检查器列表未应用编辑覆盖 → 改用 `effAnn`。
  - 对应任务：T26（已完成，由 lead 实测）；对应决策：D-036。
- **现状核对**（2026-11-03 14:54 +08:00，只读静态检查，**未运行 pnpm**）：
  - `packages/render/src/html.ts`：L139 `.edit-ann`、L140-141 `.ann-edit`；L206 `editingAnn`；L234 `effAnn`；L369 `saveAnnEdit`；L455 列表 `.map(effAnn)`；L463 `isEditingThis`；L470 编辑表单；L478「编辑」按钮；L550-560 编辑/保存/取消 handler（`stopPropagation`）；**L580 `data-act` 守卫**（编辑表单按钮不走状态流转）；L628 导出 `replace` op；
  - `packages/patch/src/parse.ts`：L49/L55/L63-73/L78 解析 `edits`（`replace /annotations/<id>` 整块）；`text.ts:64` `replaceAnnotationBlocks`；`gate.ts` L101 `edit-actor`、L109 `edit-target`、L112 `edit-author`、L115 `edit-created`、L118 `edit-status`；`apply.ts` L18/L114 应用；
  - 测试：`patch.test.ts:447`"人类可编辑；AI 被拒；改 author/created/status 被拒"、`:467`"应用后字段更新、注释保留、rev+1、身份字段不变"（patch 共 **37** 条）；`html.dom.test.ts` 共 **14** 条（新增 1 条编辑→保存→列表更新→导出 replace）；
  - 全仓 **259 tests**、`pnpm verify` 全绿（index 32 / adr 4 / modules 13）、build:html 16 docs / 173.1 KB、`node --check` 通过 **均为 lead 实测**；todo-scribe 未复跑（静态实测 `dist/covenant.html` 193,119 B @14:54:29，lead 报 173.1 KB，口径待对）。

## R-018 接线出口垂直 stub + 线-框间距

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 14:56 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 框的接线出口得保证一小段垂直于框边缘的线，以免一些连线平行框边接入，另外，除了线与线之间的间隔保证，框线之间也有

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 每条边离开/进入框时，先走一小段**垂直于框边**的引线（stub），避免连线平行贴边接入。
  2. 除**线-线间距**外，**线-框之间**也要保证最小间距。
  - 实现（由 lead 实测）：`routePorts(start,end,fromSide,toSide,lane)` 沿端口法线先走 `ROUTE_STUB=20px` 再正交折线（首/末段保证垂直）；`clearPath(points,nodes,fromId,toId,margin=12)` 扫描中间线段，若穿过/贴近"无关框"的扩展矩形（12px）则整体平移到框外，**两轮迭代**、首尾 stub 不破坏；`routeAbovePorts` 也过 `clearPath`；junction 模式改用点与点直线（不适用此规则）。
  - 对应任务：T27（已完成，由 lead 实测）；对应决策：D-037。
- **现状核对**（2026-11-03 14:56 +08:00，只读静态检查，**未运行 pnpm**）：
  - `packages/layout/src/index.ts`：L604 `export const ROUTE_STUB = 20`；L606 `ROUTE_MARGIN = 12`；L625-640 `routePorts` 注释 + 端口法线 stub（`p1/p2` 沿 `sideNormal` 偏移 20px）；L542/L555 `clearPath(routeAbovePorts(...))` / `clearPath(routePorts(...))`；L660-701 `clearPath`（`for pass < 2` 两轮、`i = 2 .. len-4` 只调中间折点、水平/垂直段按扩展矩形平移、`dedupe` 收尾）；junction 不适用：`packages/render/src/index.ts` L433-442 junction 边为点与点直线；
  - 测试：`layout.test.ts:292`"首尾段必须是垂直/平行于端口法线的短引线（≥18px）"、`:311`"中间线段与无关框保持 ≥12px 间距（扩展矩形不穿透）"；
  - 黄金 15 张按新路由重生成（`packages/render/src/__golden__/*.svg` @14:55:51）；
  - 全仓 **261 tests**、`pnpm verify` 全绿（index 32 / adr 4 / modules 13）、build:html 16 docs / 179.8 KB **均为 lead 实测**；todo-scribe 未复跑（静态实测 `dist/covenant.html` 195,822 B @14:56:14，lead 报 179.8 KB，口径待对）。

## R-019 小窗顶栏与主体分上下两部分

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 15:01 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 小窗顶栏设计有问题，小窗应该是分成上下两部分，一个是顶栏一个是主体，而不是让顶栏悬浮在主体之上

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 小窗应**分成上（顶栏）下（主体）两部分**，顶栏**悬浮在主体之上**是错误做法。
  - 修复（由 lead 实测）：`#inspector` 改 **flex 列布局**（`display:flex;flex-direction:column`），顶栏 `.insp-head` 固定 `flex:0 0 38px`（取消 sticky/负边距/悬浮），主体 `.insp-body{flex:1;min-height:0;overflow:auto;padding:10px 14px 14px}` **独立滚动**；markup 把内容包进 `.insp-body`。
  - 对应任务：T28（已完成，由 lead 实测）；对应决策：D-038。
- **现状核对**（2026-11-03 15:01 +08:00，只读静态检查，**未运行 pnpm**）：
  - `packages/render/src/html.ts`：L124 `#inspector{…display:flex;flex-direction:column;…}`；L126 `.insp-head{display:flex;align-items:center;gap:6px;flex:0 0 38px;height:38px;padding:0 10px;background:linear-gradient(…);border-bottom:1px solid …}`（**无 sticky/负边距**）；L127 `.insp-body{flex:1;min-height:0;overflow:auto;padding:10px 14px 14px}`；L503 markup `…</div><div class="insp-body">…`（内容包进主体）；
  - 测试：`html.test.ts:185` 断言更新为含 `'<div class="insp-body">'`、`flex-direction:column`，且 `not.toContain("position:sticky")`；
  - 全仓 **261 tests**、`pnpm verify` 全绿、build:html 16 docs / 179.8 KB **均为 lead 实测**；todo-scribe 未复跑。

## R-020 "意外端口 / 意外断开"（**已结案：非技术缺陷**）

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 15:01 +08:00；结案 15:04 +08:00）
- **来源**：用户消息（lead 逐字转引，两条）
- **原话**：

> 意外端口

> 意外断开

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 用户反馈疑似"端口被占用 / 连接意外断开"，**未提供报错原文或截图**，具体指哪个 URL/操作未知。
  - 排查（由 lead 只读实测）：静态查看无需端口（`file://` 直接打开）；编辑模式 `pnpm edit:serve` 默认 **4173**，启动时打印带 token 的 URL；当前监听端口检查只有无关进程 `node server.mjs`(14311)，**无 covenant serve 残留**；若端口被占可用 `pnpm edit:serve -- --port <新端口>`。
  - 对应任务：T29；对应问题：todo/Q11。
- **现状核对**（2026-11-03 15:01 +08:00，**未运行 pnpm / 未复跑端口检查**）：以 lead 只读排查结论为准；todo-scribe 未独立验证端口占用情况。
- **结案（2026-11-03 15:04 +08:00，用户确认）**：
  - 用户原话（lead 转引）：> 意外断开是因为我api余额不足
  - 结论：**"意外断开" = API 余额不足所致，与 Covenant / 端口 / 本地服务无关，非技术缺陷，不修复**。
  - **"意外端口"未复现**、无报错原文；若日后再次出现，需用户提供具体 URL / 报错原文（见 todo/Q11）。
  - 对应：T29 已改为**已完成（非缺陷）**；Q11 标记已解决；D-038 备注已记一句。

## R-021 子代理模式分配：不一律 standard，终端类用快速模式省 token

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 15:04 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 注意子agent的模式分配不一定是标准模式，可以分配只使用终端的快速模式节约token

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 子代理**不要一律用 `standard`**；只读/终端类任务用**轻量快速模式**（mechanical + 工具白名单）以节约 token。
  - 落规范（由 lead 实测）：`docs/conventions/module-ownership.md` 新增 **§7「子代理模式与 token 预算」**——`mechanical + tool_filter(glob/grep/read/pwsh)` 做只读扫描/统计/测试汇总；`standard` 做实现；`deep` 做架构裁决；`creator` 做 DSH；**能用单条 pwsh 解决的不 spawn**；mechanical 不负责架构裁决与语义修改，报告须给命令与原始输出摘要、由 Lead 复核。
  - `docs/to-dolist.md` 增加一行；后续 spawn 按此选模式（如 arch-guard 类只读审计 = mechanical + 只读白名单）。
  - 对应任务：T30（已完成，由 lead 实测）；对应决策：D-039。
- **现状核对**（2026-11-03 15:04 +08:00，只读静态检查，**未运行 pnpm**）：
  - `docs/conventions/module-ownership.md` L94 `## 7. 子代理模式与 token 预算`；L96 "不是所有子任务都需要 `standard`…用 `tool_filter` 白名单进一步收敛"；L100 模式表：只读扫描/统计/跑测试汇总 → `mechanical` + `glob, grep, read, pwsh`（只允许终端/读取，禁止写代码与网络，最省 token）；L106 "`mechanical` 子代理**不负责**架构裁决与语义修改；报告里必须给出命令与原始输出摘要，由 Lead 复核"；
  - `docs/to-dolist.md` L150 子代理模式分配行。

## R-022 处理 Covenant 自身架构图上的批注（人类 + AI 标注）

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 15:16 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 我在covenant自身架构图上标注了一些内容，还有一些ai自己标注的，也是要解决的

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 用户/ AI 在 **Covenant 自身架构图**（`arch/system.cvn.yaml`、`examples/covenant-self.cvn.yaml`）上标注的批注**都要处理**（解决或明确保留原因）。
  - 处理结果（由 lead 实测）：**9 条 → 7 resolved / 2 open**，新增 `docs/guides/annotation-resolution-2026-11-03.md`；用 `covenant apply --actor human:you` 更新状态（arch rev 1→2、covenant-self rev 1→2）。
  - 已 resolved：`a.01JAYS3KV0001`（标签密集 → `fallbackLabelPoint` 环扩张 + 测试）、`a.01JAYS3KV0002`（跨层交叉范围 → v0 只做相邻层 barycenter、长边走顶部通道不计数，已知取舍）、`a.01JAY0S3KV01`（单文件体积 → 未引入 ELK，179.8 KB < 500 KB 预算）、`a.01JAY0S3KV03`（Norway → CORE_SCHEMA + `packages/core/src/parse.test.ts` 回归）、`a.01JAY0S3KV04`（fixHint 复核通过）、`a.01JAY0S3KV05`（原子替换+审计 → intent→rename→commit write-ahead，接受风险）、`a.01JAY0S3KV06`（默认离线 → 产品决策，仅 `serve --ai` 外发）。
  - 保持 open：`a.01JAYS3KV0003`（真实浏览器验收，需用户按 dist 手工验收）、`a.01JAY0S3KV02`（region 批注坐标漂移，真实格式缺口，提案：按 element/frame id 稳定锚点，v0.2 讨论）。
  - 对应任务：T31（已完成）、T31b（待办：region 锚点设计 + 浏览器人工验收）；对应决策：D-040；对应问题：todo/Q12。
- **现状核对**（2026-11-03 15:16 +08:00，只读静态检查，**未运行 pnpm**）：
  - `docs/guides/annotation-resolution-2026-11-03.md`（2,992 B @15:15:09）：§一 已解决 7 条、§二 保持 open 2 条、§三 复核命令（264 tests / verify / build:html）；
  - 批注状态实测：`arch/system.cvn.yaml` rev **2**、3 条批注（2 `status: "resolved"` + 1 `status: open`）；`examples/covenant-self.cvn.yaml` rev **2**、6 条批注（5 resolved + 1 open）→ 合计 **9 条 / 7 resolved / 2 open**；
  - 代码证据：`packages/render/src/index.ts` L209-210 `fallbackLabelPoint` 环扩张回退、L237 调用；`render.test.ts:256`"重复主位置/候选相同时，标签按环扩张铺开且两两不重叠"；`packages/core/src/parse.test.ts`（1,348 B @15:14:21，2 条用例）；
  - 附注：`packages/validate/src/index.ts` 静态见 `fixHint` **21** 处（文档写 20 处，可能是引用计数差 1，**待对**）；
  - 全仓 **264 tests**、verify 全绿（index 32 / adr 4 / modules 13）、build:html 179.8 KB **均为 lead 实测**；todo-scribe 未复跑（静态实测 `dist/covenant.html` 195,900 B @15:15:52，与 179.8 KB 口径待对）。

## R-023 批注编辑复用底部"新增批注"表单区，编辑完恢复现场

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 15:19 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 编辑界面顶掉下方"新增批注"界面复用就好了，编辑完恢复现场

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 批注编辑**不要占用列表内空间**；**复用底部"新增批注"表单区**——点编辑时该区域切换为编辑表单（预填），**保存/取消后恢复"新增批注"现场**。
  - 实现（由 lead 实测）：底部表单区改为**单一复用区**：默认渲染"新增批注"；当 `editingAnn` 命中某条批注时，同一位置渲染"编辑批注"（类型/严重度/标题/正文/ai_hint + 保存/取消），**不再在 `<li>` 内插入编辑块**；保存/取消后 `editingAnn=null` 重新渲染 → 恢复"新增批注"表单；被编辑 `<li class="editing">` 高亮；编辑表单渲染后 `scrollIntoView`。
  - 清理：移除列表内 `.ann-edit` 结构与样式，改用 `.edit-form/.edit-acts`。
  - 对应任务：T32（已完成，由 lead 实测）；对应决策：D-041。
- **现状核对**（2026-11-03 15:19 +08:00，只读静态检查，**未运行 pnpm**）：
  - `packages/render/src/html.ts`：L142 `.edit-form{border-color:#bfdbfe;background:#f8fafc}`、L143 `.edit-acts{margin-top:8px}`；L208 `editingAnn`；L378 保存读取 `#ae-title`；L390 保存后 `editingAnn=null`；L465 `isEditingThis`；L467 被编辑 `<li class="editing">` 高亮；L488 定位 `editTarget`；**L491-497 同一表单区渲染"编辑批注"（`.form.edit-form` + `#ae-title` + `.edit-acts` 的 `ann-save`/`ann-cancel`）**；L499-504 默认渲染"新增批注"（`#f-title`）；L511-513 编辑时 `scrollIntoView`；L563 编辑按钮设 `editingAnn`；L571 取消按钮复位并重渲染；
  - 测试：`html.dom.test.ts` 共 **15 条**——L421"编辑持久批注 → 保存后列表更新、导出整块 replace"（L440 `#ae-title` 为 null、L441 `#f-title` 恢复）、L475"取消编辑：不改数据并恢复新增表单"（L484-487 断言）；
  - 全仓 **266 tests**、verify 全绿（index 32 / adr 4 / modules 13）、build:html 16 docs / 180.5 KB **均为 lead 实测**；todo-scribe 未复跑（静态实测 `dist/covenant.html` 196,255 B @15:19:08，lead 报 180.5 KB，口径待对）。

## R-024 region 批注坐标漂移已解决（用户确认结案）

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 15:20 +08:00）
- **来源**：用户消息（lead 逐字转引；用户确认）
- **原话**：

> 坐标漂移已经解决

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 用户确认 `a.01JAY0S3KV02`（region 批注坐标漂移 / todo/Q12）**已解决**，**结案**；不再作为格式缺口跟踪。
  - lead 已执行（由 lead 实测）：`covenant apply --actor human:you` 将该批注 open→**resolved**（`examples/covenant-self.cvn.yaml` rev 2→3，带 `.audit` 留痕）；更新 `docs/guides/annotation-resolution-2026-11-03.md`（该条移入"结案"，注明"若重现再按 element/frame id 锚点方案处理"）；黄金图按新 rev/状态重生成；264→**265 tests**、verify 全绿、build:html 180.5 KB。
  - 当前自身架构图批注只剩 **1 条 open**：`a.01JAYS3KV0003`（真实浏览器人工验收）。
  - 对应任务：T31b（region 锚点设计部分关闭，仅保留浏览器人工验收）；对应决策：D-040 更新；对应问题：todo/Q12 → 已解决。
- **现状核对**（2026-11-03 15:20 +08:00，只读静态检查，**未运行 pnpm**）：
  - `examples/covenant-self.cvn.yaml`：`rev: 3`（L14），6 条批注**全部 resolved**（L206/224/241/258/278/293）；`arch/system.cvn.yaml` 仍有 1 条 `status: open`（a.01JAYS3KV0003）→ 合计 **9 条 / 8 resolved / 1 open**；
  - `docs/guides/annotation-resolution-2026-11-03.md`（2,944 B @15:19:29）：§二 已改为"结案/保持 open"，region 条目标注"用户确认已解决"，并注明重现时按 element/frame id 锚点处理；
  - 黄金 15 张重生成（@15:19:37）；全仓 **265 tests**、verify 全绿（index 32 / adr 4 / modules 13）、build:html 16 docs / 180.5 KB **均为 lead 实测**；todo-scribe 未复跑（静态实测 `dist/covenant.html` 196,259 B @15:19:57，lead 报 180.5 KB，口径待对）。

## R-025 编辑态需要「返回」按钮取消编辑

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 15:31 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 编辑需要有返回按钮取消编辑

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 批注编辑态需要明确的**「返回」按钮**来取消编辑；**取消不保存**，直接恢复"新增批注"现场。
  - 实现（由 lead 实测）：编辑表单顶部改为**标题行**：左侧「编辑批注」，右侧 **「← 返回」** 按钮（`.edit-head .ann-cancel`）；点击不保存、`editingAnn=null`、重新渲染恢复"新增批注"表单；按钮区只保留「保存」——**取消 ≠ 保存**，语义分离。
  - 对应任务：T33（已完成，由 lead 实测）；对应决策：D-042。
- **现状核对**（2026-11-03 15:31 +08:00，只读静态检查，**未运行 pnpm**）：
  - `packages/render/src/html.ts`：L143-146 `.edit-head`（flex 两端对齐）+ `.edit-head .ann-cancel` 样式；L495 编辑表单标题行 `<div class="edit-head"><h3>编辑批注</h3><button class="ann-cancel" … title="取消编辑，返回新增批注">← 返回</button></div>`；L501 按钮区仅 `ann-save`「保存」；L573 `querySelectorAll(".ann-cancel")` 绑定取消；
  - 测试：`html.dom.test.ts:475`"取消编辑：不改数据并恢复新增表单"——L483 `.ann-cancel` 存在、L484 文本含"返回"、L487-488 数据未变、L489 `#ae-title` 消失、L490 `#f-title` 恢复；DOM 共 **15** 条；
  - 全仓 **266 tests**、verify 全绿（index 32 / adr 4 / modules 13）、build:html 16 docs / 180.3 KB **均为 lead 实测**；todo-scribe 未复跑（静态实测 `dist/covenant.html` 196,636 B @15:31:28，lead 报 180.3 KB，口径待对）。

## R-026 编辑态要有清晰可见的「保存/确定」

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 15:32 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 而且编辑状态怎么没有确定/保存

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 用户进入编辑态**没看到"确定/保存"**——实际按钮存在，但位于**表单底部、易滚出视野**；要求保存/确定在编辑态**清晰可见**。
  - 实现（由 lead 实测）：把「保存」从表单底部移到**编辑标题行右侧**，与「← 返回」并排：`[保存] [← 返回]`，**保存为主按钮**（蓝底白字）、返回为次按钮；标题行 **sticky**（表单内滚动时保存仍可见），并使用 `.edit-actions` 布局；**移除底部 `.acts edit-acts` 行**，避免"按钮沉底看不见"。
  - 对应任务：T34（已完成，由 lead 实测）；对应决策：D-043。
- **现状核对**（2026-11-03 15:32 +08:00，只读静态检查，**未运行 pnpm**）：
  - `packages/render/src/html.ts`：L143 `.edit-head{…position:sticky;top:0;z-index:1;background:#f8fafc;…}`；L145 `.edit-actions{display:flex;gap:6px;align-items:center}`；L146-147 `.edit-head .ann-save`（蓝底白字主按钮）；L148-149 `.edit-head .ann-cancel`（次按钮）；**L497 标题行 markup `<div class="edit-head"><h3>编辑批注</h3><div class="edit-actions"><button class="ann-save">保存</button><button class="ann-cancel">← 返回</button></div></div>`**；L503 编辑表单结束（**无底部 `.acts edit-acts`**）；L571 `.ann-save` 绑定；
  - 测试：`html.dom.test.ts:421` 编辑用例 L431 `saveBtn = querySelector(".ann-save")`、L433 `textContent` 含"保存"；既有保存/取消流程不变；DOM 共 **15** 条；
  - 全仓 **265 tests**、verify 全绿（index 32 / adr 4 / modules 13）、build:html 16 docs / 180.8 KB **均为 lead 实测**；todo-scribe 未复跑（静态实测 `dist/covenant.html` 196,937 B @15:32:28 ≈ 196,9xx B，lead 报 180.8 KB，口径待对）。
  - **更正（2026-11-03 15:35，lead）**：原先写 **266 tests 是笔误**，`pnpm test`/`pnpm verify` 实测 **265 passed**；dist 196,9xx B 对应 **180.8 KB**（原 180.7 KB 随更正）。其余内容不变。

## R-027 确认 bundle 方向 + 质疑"审计为什么手搓"

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 16:09 +08:00；用户原话为上一轮）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 1：确认方向；3：为什么要手搓

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. **①确认方向**：确认 bundle（文件夹打包）方向，并已实现**交互版原型**（见 R-028 / T35）。
  2. **③质疑"为什么要手搓"**（指审计/落盘为何不用 git 而自己实现）：已在对话回答，**结论记入 D-045**（审计不依赖 git 的五条理由；git 仅作可选补充，`git diff --no-index` 已在用）。
  - 对应决策：D-045（审计手搓 vs git）；D-044（bundle 双输出与交互壳）。
- **现状核对**（2026-11-03 16:09 +08:00，只读静态检查，**未运行 pnpm**）：审计实现证据见 `packages/patch/src/apply.ts`（intent→commit 两阶段）与 `.audit/*.jsonl`；diff 走 `git diff --no-index`（D-028）——详见 D-045。

## R-028 bundle 壳要能交互 + 招交互验收 agent

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 16:09 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 你这个bundle壳无法交互，招交互agent交互反馈

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. bundle 壳此前只是**静态看图**；要求**可交互**（缩放/平移/点选/详情/批注面板）。
  2. **招聘"交互验收 agent"**专门给交互反馈。
  - 实现（由 lead 实测）：`covenant bundle` 升级为**交互版**：index.html 内联 **16 个 SVG + manifest 数据**；左侧图列表切换、滚轮缩放、拖拽平移、双击放大、点节点/连线 → 右侧对象详情（名称/职责/技术/连接）+ 该对象批注列表（severity/type/status/author/body）；同时保留 `views/*.svg`（无 JS 可用）、`manifest.json`、`annotations.json`。jsdom 实测：svg 注入 ✓、16 个列表按钮 ✓、点 `e.core` 显示详情 ✓、切换视图后 SVG 与标题变化 ✓。
  - **招聘 interaction-owner**（standard，写域仅 `docs/audits/`，任务 task-6）：只读验收 bundle 交互壳 + 主查看器（缩放/平移/双击、悬浮窗/钉住、批注编辑/删除撤销、写回按钮可见性），产出 `docs/audits/interaction-review-2026-11-03.md`，按 P0/P1/P2 给 5–10 条建议并注明 jsdom 局限；**当前 agent 运行中**。
  - 对应任务：T35（已完成）、T36（进行中）；对应决策：D-044；对应问题：todo/Q13。
- **现状核对**（2026-11-03 16:09 +08:00，只读静态检查，**未运行 pnpm**）：
  - `packages/cli/src/index.ts`：L42 命令帮助；L271-272 注释（交互版：缩放/拖拽/点选/批注面板）；L273 `cmdBundle`；L355 写 `views/<safe>.svg`；L400 `manifest`（version 2）；L402 `manifest.json`；L403-407 `annotations.json`；L409+ 壳 HTML（L416 `#nav button`、L420 `#stage svg`、L435 提示"滚轮缩放 · 拖拽平移 · 双击放大 · 点击元素查看"、L460-481 `showObject`（对象详情 + 批注列表）、L483-490 `selectDoc`、L494-500 wheel 缩放、L501-511 指针拖拽、L512-516 dblclick、L517-525 点 `.node/.edge` → 详情、L528+ 列表按钮）；L539 输出 `bundled … (N views, interactive index.html + views/*.svg + manifest)`；L1046-1047 命令分发；
  - 产物实测：`dist/site/index.html` **145,250 B**（≈145 KB）@16:04:38，含 16 个内联 `<svg>`、`滚轮缩放/双击放大/批注（` 等标记；`manifest.json` 48,563 B（version 2）、`annotations.json` 9,745 B、`views/*.svg` **16** 个；
  - **附注**（2026-11-03 16:09 静态）：`dist/site/_script_extract.js`（156,054 B @16:05:35）疑为 jsdom 实测时提取脚本的**临时残留**；`docs/audits/` 目录尚不存在（T36 产物未落盘）；`team/owns.yaml` 当时 6 组、未见 interaction-owner 条目；
  - 全仓 **267 tests**、verify 全绿、bundle 产物 index 145 KB / 16 views **均为 lead 实测**；todo-scribe 未复跑。
  - **跟进（2026-11-03 16:13，lead 处理）**：①已补可复跑测试 `packages/cli/src/bundle.test.ts`（spawn CLI 打包临时目录，断言 index.html/manifest version 2/views/*.svg/annotations.json/objects+annotations 字段/index 含 SVGS 与 data-id）→ 全仓 **268 tests**；②`dist/site/_script_extract.js` **已删除**；③`team/owns.yaml` + `team/README.md` 已加入 `interaction` 组 / interaction-owner（写域 `docs/audits/`）；④`docs/audits/interaction-review-2026-11-03.md` **仍待 agent 完成**（task-6 running），不提前宣称完成。
- **执行记录（2026-11-03 16:15，T36 收尾）**：
  - **agent 卡死 → Lead 接手**：interaction-owner **长时间卡死（task-6 未领取、无产出）**，已 **interrupt**；Lead 直接完成第一轮验收并落盘 `docs/audits/interaction-review-2026-11-03.md`（含 jsdom 局限说明）。
  - **P0 修复（lead 实测）**：①bundle 图上批注不可见 → 渲染 `showBadges:true`（`views/*.svg` 已含 badge，静态实测 16 views 中 9 个含 badge 标记）；②bundle 无缩放复位 → 右上角「− / + / 适配」按钮（`index.ts` L421-423/L438）；③bundle 无深链 → 切换写 `location.hash`、加载按 hash 定位（当前 `#doc#view`，P2 规范为 `#doc/view`；`index.ts` L488/L542）。
  - **实测**：jsdom 注入 svg、16 列表、点 `e.core` 出详情、切图后 SVG/title 变化均通过；`dist/site` rebuild 成功（`index.html` 148,292 B @16:14:31、16 views）；全仓 **268 tests**、verify 全绿（index 32 / adr 4 / modules 13）。
  - **剩余（P1/P2 → T37）**：主查看器切选中清 `editingAnn`；bundle 键盘可达性；触摸/触控板 pinch；列表搜索/分组；锚点跳转；壳体积优化；bundle 是否加写回 = Q13。

## R-029 bundle 应复用主查看器，而不是简化壳

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 16:20 +08:00）
- **来源**：用户消息（lead 逐字转引；用户澄清 bundle 疑问）
- **原话**：

> 你新做的那个到底是什么，是类似于index.html吗，为什么之前的小窗， 缩放拖拽等设计全没了

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 用户把 bundle 壳当成主查看器的"新版"，发现**悬浮窗/缩放拖拽等交互"消失"**；要求 **bundle 也具备主查看器体验**。
  - 修复（由 lead 实测）：`covenant bundle` 改为 **index.html 直接复用主查看器**（`renderHtml(views)`）——悬浮窗、📌钉住、批注编辑（底部表单复用/保存/←返回）、删除/撤销/回收桶、左侧侧栏、缩放/平移/双击**全部与 `dist/covenant.html` 一致**；`views/*.svg`、`manifest.json`、`annotations.json` 继续作为**文件夹资产**保留。
  - manifest 升 **version 3**（entries）；jsdom 实测：16 个 `#views` 按钮、`#inspector` 存在、点节点后悬浮窗可见且含 `#f-title` 编辑表单。
  - 文档：交互验收报告加"bundle 已改复用主查看器"更新段；bundle 提案文档同步；`dist/site` 已 rebuild（index 199 KB）。
  - 对应任务：T35（修订）；对应决策：D-047。
- **现状核对**（2026-11-03 16:20 +08:00，只读静态检查，**未运行 pnpm**）：
  - `packages/cli/src/index.ts`：L16 import `renderHtml`；L261/L370 `renderHtml(views, { title: … })`；L273 注释"文件夹打包（index.html = 主查看器同款体验，另存 manifest/annotations/views）"；L354 `views/<safe>.svg`；L373-374 `manifest.json` = `{ version: 3, generatedAt, entries: docs }`；L378 `annotations.json`；L383 输出"index.html=主查看器同款 + views/*.svg + manifest/annotations"；
  - 产物实测：`dist/site/index.html` **199,340 B**（≈199 KB）@16:19:08、`manifest.json` 11,837 B（**version 3**）、`annotations.json` 9,745 B、`views/*.svg` 16 个；index 内含 `id="views"`、`id="inspector"`、`f-title`、`pin-btn`、`insp-body`、`data-act`（与主查看器同款）✓；
  - 文档：`docs/audits/interaction-review-2026-11-03.md` L7 已有"更新（16:19）：bundle 已改为复用主查看器…"；`docs/design/html-output-bundle-proposal.md` 已更新（3,070 B @16:20:00）；
  - 全仓 **268 tests**、verify 全绿 **均为 lead 实测**；todo-scribe 未复跑。
  - **测试更新（2026-11-03 16:22，lead 更正）**：`packages/cli/src/bundle.test.ts` **已随本轮实现更新**（1,729 B @16:18:39）——断言 `manifest.version === 3`（L25）、`entries.length > 0` / `first.svg` / `first.annotations`（L26-32）、index 含 `id="views"` / `id="inspector"`（主查看器标志，L33-34）+ `btn-export`/`data-id`（L35-36）；`pnpm exec vitest run packages/cli/src/bundle.test.ts` → **1 passed**，全仓 **268 passed**（lead 实测）。**更正此前"测试仍断言 v2/旧壳标记"的静态判断**（读到旧快照，已作废）。
  - **兼容性记录（manifest v3）**：`bundle/manifest.json` 现为 **v3（`entries`）**，与旧 **v2（`docs`）不兼容**——若外部工具曾按 v2 读取，需迁移（键名 `docs` → `entries`，字段 `svg`/`annotations` 保留）；**当前仅文档记录，不改 schema 兼容层**（如需兼容旧读取方，后续可加版本分支/迁移脚本）。

## R-030 todo 外部需求收件箱：ALLELab 试点

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 16:36 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 试点项目是在""D:\AAA_Work\ALLELab"公司目录之下的子目录，团队是dsh里面该工作区的团队，你现在就可以完善todo文件夹组织/规范  设计

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. **试点项目**位于 `D:\AAA_Work\ALLELab` 公司目录之下的**子目录**；
  2. 使用**该工作区的 DSH 团队**（不是 Covenant 团队）；
  3. **现在完善 `todo/` 文件夹组织/规范设计**（外部团队需求如何进 todo、如何归并）。
  - lead 已落盘（**不改外部工作区**）：
    - `todo/README.md`：新增「外部需求收件箱（inbox/，append-only）」章节 + 文件表一行；更新"最近更新"；
    - 新增 `todo/inbox/`：`README.md`（目录约定、模板字段 id/team/author/date/project/kind/severity/status:new/title/evidence、状态机 `new→triaged→planned→done`、归并节奏每周或 ≥5 条、与 ALLELab `dashboard/tasks.json`/`docs/team-handoff` 并行不替代）、`_TEMPLATE.md`（需求文件模板：原话/场景/期望/证据/影响面 + front-matter）；
    - 新增 `todo/inbox/ALLELab/`（试点）：`README.md`（ALLELab 事实源映射：`agents/org.json`、`team/team-spec.json`、`dashboard/data/tasks.json`、worklog、`docs/team-handoff`、`DSH-TEAM-ORG.md`；可写角色 coursepack-architect / arch-*-owner / arch-evidence-verifier / arch-context-steward / reviewer；证据要求 path:line、单次 ≤15 文件/≤1200 行；跨工作区落盘二选一：直接写 Covenant inbox 或走 `docs/team-handoff` 由 Lead 搬入）、`PROJECTS.md`（候选：推荐 `coursepack-omp-main`；备选 wanwei-agents/cua-project/dashboard）、`2026-11-03-pilot-kickoff.md`（6 个待团队回答的问题 + 首个建议需求：把 coursepack-omp-main 架构事实落成 `.cvn.yaml` + 用批注记录 audits 已知问题 + 验证一键写回/CI 校验）。
  - 待用户/团队确认：试点子目录（默认 `coursepack-omp-main`）、首批 2–3 名需求作者、跨工作区落盘方式（直接写 vs handoff）。
  - 对应任务：T38（已完成）、T39（待办）；对应决策：D-048；对应问题：todo/Q14。
- **现状核对**（2026-11-03 16:36 +08:00，只读静态检查，**未运行 pnpm**）：
  - 文件实测：`todo/inbox/README.md` 3,221 B @16:35:18、`todo/inbox/_TEMPLATE.md` 841 B @16:35:18、`todo/inbox/ALLELab/README.md` 3,309 B @16:35:35、`PROJECTS.md` 1,398 B @16:35:35、`2026-11-03-pilot-kickoff.md` 2,413 B @16:35:45；
  - `todo/inbox/README.md`：L5 原则（原话不加工、一团队一入口、append-only、证据带路径）；L30-38 front-matter 字段（team/severity/status:new/evidence）；L53 状态机 `new→triaged(accepted/deferred/wontfix/duplicate)→planned(T-xxx)→done/rejected`；L55 团队只写 new；L61 每周或 ≥5 条归并；L67 与 ALLELab 看板/交接并行不替代；
  - `todo/inbox/ALLELab/README.md`：L13-17 事实源映射（org.json/team-spec.json/dashboard data/worklog/team-handoff）；L28-30 可写角色；L39-40 证据要求（path:line、≤15 文件/≤1200 行）；L46 handoff 方式；L56 回写 tasks.json 但两套跟踪互不替代；L61 指定 2–3 名作者建议；
  - `2026-11-03-pilot-kickoff.md`：L10 "需要团队回答的问题" 6 条（试点项目/范围、需求作者、首批原型输入、验收标准、交付形态、落盘权限）+ L32 首个建议需求；
  - 全仓 **268 tests**、verify 全绿（index 32 / adr 4 / modules 13）**均为 lead 实测**；todo-scribe 未复跑（本需求为**文档/流程**变更，不触发构建）。

## R-031 Covenant 应打包成可交付 Package（派给别的团队）

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 17:17 +08:00；用户原话为上一轮）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 我还以为你把这个Covenant打包成可交付物Package然后我派给别的团队呢

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. 用户期望 Covenant 是**可交付物 Package**，能**派给别的团队**（对方拿到即可用，不依赖本仓库/dev 环境）。
  - lead 已落盘：新增 `scripts/build-kit.mjs`（esbuild 打包**单文件 CLI** + 模板/示例/docs/schema + 预构建 viewer），产出 `dist/covenant-kit-0.1.0/`；`Compress-Archive` 得 `dist/covenant-kit-0.1.0.zip`（191,383 B）+ `.sha256`；**可移植性实测**：复制到干净临时目录、仅用 `node bin/covenant.mjs` 跑通 `check`/`build`/`bundle`（无需 pnpm/网络）；修复点：kit 必须自带 `schema/` 作为仓库根锚点。
  - 对应任务：T40（已完成）、T42（待办：首发 Release，依赖 git init/LICENSE/包名）；对应决策：D-049。

## R-032 两套分发范式：本地可信 vs GitHub 公开

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 17:17 +08:00）
- **来源**：用户消息（lead 逐字转引）
- **原话**：

> 对于我本机，agent团队可以随意拿本地封装好的包使用服务，甚至飞进来扔需求，但是到时候发到github，就不一样了，是稍微不同的范式

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. **本机/内网**：agent 团队可随意拿**本地封装好的包**使用服务，甚至"飞进来扔需求"（直接写 inbox）——**可信模式**。
  2. **发到 GitHub**：**不一样**，是**另一套范式**（公开、不可信、Issue/PR、Release 资产、CI 门禁）。
  - lead 已落盘：`docs/guides/distribution-paradigm.md`（本地可信：kit + `edit:serve` + 直写 inbox；GitHub：Release 资产 + Issue 模板 + CI 门禁；含共享不变量/schema 兼容/发布检查清单）；GitHub 侧骨架 `.github/ISSUE_TEMPLATE/requirement.yml`、`bug.yml`、`.github/PULL_REQUEST_TEMPLATE.md`；`verify.yml` 增加 kit 构建 + artifact 上传；`CONTRIBUTING.md` 增加分发章节；`package.json` 增加 `package:kit`；`arch/index.yaml` 增 `scripts/build-kit.mjs` 条目（**33 条**）。
  - 对应任务：T41（已完成）、T42（待办：首发 v0.1.0 Release）；对应决策：D-049；对应问题：todo/Q15（git init / LICENSE / 包名）。
- **现状核对**（2026-11-03 17:17 +08:00，只读静态检查，**未运行 pnpm**）：
  - `scripts/build-kit.mjs` 5,571 B @16:52:06；kit 产物 `dist/covenant-kit-0.1.0/`：`bin/covenant.mjs` **670,266 B**、`bin/covenant.cmd` 40 B、`viewer/covenant.html` 60,707 B、`schema/kernel.schema.json` 14,334 B、`schema/README.md` 2,919 B、`templates/team-starter/{covenant.yaml,arch/system.cvn.yaml}`、`examples/{payments-arch,topology-junction,quickstart/mini}.cvn.yaml`、`docs/{format-spec,module-ownership,edit-and-deploy}.md`、`inbox-template/{README,_TEMPLATE}.md`、`README.md` 1,926 B、`VERSION` 6 B；
  - `dist/covenant-kit-0.1.0.zip` **191,383 B** @16:52:07；`dist/covenant-kit-0.1.0.zip.sha256` 89 B，内容 `680dc0ac7073e159b99332f476d4be0db760778cc1ffd41e9ebf193d7ec6bde0  covenant-kit-0.1.0.zip`；
  - `docs/guides/distribution-paradigm.md` 4,169 B @17:15:17（两模式对比表 L5-17、共享不变量 L19-25、本地模式 L27+）；`.github/ISSUE_TEMPLATE/requirement.yml` 1,464 B、`bug.yml` 1,221 B、`.github/PULL_REQUEST_TEMPLATE.md` 815 B @17:15:17-43；`.github/workflows/verify.yml` L35-42（Build kit + Upload artifact `covenant-kit` → `dist/covenant-kit-*`）；`CONTRIBUTING.md` L77-80 分发章节；`package.json` L4 `private: true`、L14 `package:kit`；`arch/index.yaml` L298 `- file: scripts/build-kit.mjs`（全索引 **33** 条）；
  - 全仓 **268 tests**、verify 全绿（index 33 / adr 4 / modules 13）**均为 lead 实测**；todo-scribe 未复跑（静态核对产物/文件存在）。

## R-033 批准 git init、License 已选、发 Release

- **日期**：2026-11-03（发言时刻：时间未提供；录入时刻 17:25 +08:00）
- **来源**：用户消息（lead 逐字转引；Q15 部分关闭）
- **原话**（逐字，空格原样）：

> 批准  许可选过了   发release

- **整理**（引用外，todo-scribe 归纳，非用户原话）：
  1. **批准 `git init`**；
  2. **LICENSE 已选定**（按"许可选过了"落 **MIT**）；
  3. **要求发 Release**。
  - lead 已执行（**本地 release 全就绪，未推送**）：①`git init -b main` + 初始提交 `86136c9 chore: initial public snapshot v0.1.0` + annotated tag **v0.1.0**，工作区干净；②**LICENSE = MIT**（Copyright 2026 ALLELab），`package.json` 增 `"license": "MIT"`（仍 `private: true`，**暂不发 npm**）；③`docs/releases/v0.1.0.md` 发布说明（功能/快速开始/质量基线/已知边界/反馈）；④`.github/workflows/release.yml`：push tag `v*` → verify → build kit → zip+sha256 → 创建 GitHub Release（附 zip + sha256，body 用 `docs/releases/<tag>.md`）；⑤本地发布资产 `dist/covenant-kit-0.1.0.zip` + `.sha256`；⑥发布前安全清理 `.gitignore`（`.audit/`、`team/dispatch-log.jsonl`、`team/access-log.jsonl`、`team/memory/`、`team/trajectory/`、`.vite/`）。
  - **未能执行**：本机**无 gh CLI、无 git remote**，无法自动创建/推送 GitHub 仓库与 Release；需用户提供远端仓库 URL（或安装 gh 并登录）。
  - 对应任务：T42（进行中：本地就绪，待 push）；对应决策：D-050；对应问题：todo/Q15（部分关闭）。
- **现状核对**（2026-11-03 17:25 +08:00，只读静态检查，**未运行 pnpm**）：
  - git：`rev-parse --is-inside-work-tree` = true；`git log --oneline -1` = **86136c9**；`git tag -l` = **v0.1.0**（annotated，subject "Covenant v0.1.0 — first deliverable release"）；`git status --porcelain` = **空（工作区干净）**；`git remote -v` = **空（无 remote）**；
  - `LICENSE` 首行 `MIT License`、`Copyright (c) 2026 ALLELab`；`package.json` L3 `"license": "MIT"`、L5 `"private": true`；
  - `docs/releases/v0.1.0.md` **2,352 B** @17:21:01；`.github/workflows/release.yml` **1,024 B** @17:22:35（`on.push.tags: v*`、permissions contents:write、verify → build kit → zip+sha256sum → softprops/action-gh-release@v2，附 zip + sha256，`body_path: docs/releases/${ref_name}.md`）；
  - `.gitignore` L38-43：`.audit/`、`team/dispatch-log.jsonl`、`team/access-log.jsonl`、`team/memory/`、`team/trajectory/`、`.vite/`（另有 `.vitest/` L11）；
  - 发布资产**实测（17:25:22 重建）**：`dist/covenant-kit-0.1.0.zip` **191,667 B**、`.sha256` = `89627c2dca3c719baa7b0b54d5ad2a7529dd16009c7b605ed11eae3e23c5d0ef`；**与 lead 报告（191,383 B / `a6fe6836…`）不一致**——差异应为 16:52 与 17:25 两次构建之间文件变更（如 docs/LICENSE 等），**以当前磁盘实测为准，口径待对**；
  - FRAS **33** 条；全仓 **268 tests**、verify 全绿（index 33 / adr 4 / modules 13）**均为 lead 实测**；todo-scribe 未复跑。

---

## 核对记录

> 用于记录"转引 vs 原始消息"的差异，只追加，不改上方引用块。

| 日期 | 核对项 | 结果 |
|---|---|---|
| 2026-11-03 | R-001 ~ R-003 转引 | 尚未拿到原始会话逐字记录，无法逐字节核对；以上引用以 lead 转引为准 |
| 2026-11-03 13:57 +08:00 | R-001"现状核对"中的产物大小 / mtime（原记 138,113 B @13:46:16） | 已过时：`dist/covenant.html` 于 13:57:03 重建为 145,875 B（lead 报告 132.1 KB，口径待对）。以 [plan.md](plan.md) T0/T3 最新证据为准；上方引用块与整理文字不改（引用只追加） |
| 2026-11-03 14:03 +08:00 | R-004 转引 | 未拿到原始消息，以 lead 转引为准；`@` 路径、路径后空格、中文标点均按转引保留（脚本逐字符串核对通过）。附文件在**仓库外**，规范正文以仓库内 `docs/conventions/agent-team-development.md` 为准 |
| 2026-11-03 14:15 +08:00 | R-005 ~ R-007 转引 | 均未拿到原始消息，以 lead 转引为准；R-007 的括号层级、"/"、中文标点与"为边， "后空格按转引保留（脚本逐字符串核对通过） |
| 2026-11-03 14:19 +08:00 | R-008 转引 | 未拿到原始消息，以 lead 转引为准；"点击框都没有反应"为口语表述，按原样保留 |
| 2026-11-03 14:20 +08:00 | R-009 转引 | 未拿到原始消息，以 lead 转引为准；"钉子的图标 表示"的中间空格按原样保留（脚本逐字符串核对通过） |
| 2026-11-03 14:25 +08:00 | R-010 转引 | 未拿到原始消息，以 lead 转引为准；括号内并列条件与"（各个连线之间避免重合，保留最小间距）"按原样保留 |
| 2026-11-03 14:26 +08:00 | R-011 转引 | 未拿到原始消息，以 lead 转引为准；"往下闪到一个位置才拖拽移动"为口语表述，按原样保留 |
| 2026-11-03 14:30 +08:00 | R-012 转引 | 未拿到原始消息，以 lead 转引为准；"顶栏设计有点丑""滚轮也滚不动该栏"为口语表述，按原样保留 |
| 2026-11-03 14:45 +08:00 | R-013 / R-014 转引 | 未拿到原始消息，以 lead 转引为准；R-013 的"上下文，，"双逗号、全半角括号混用、`AOCI + XERJ` 原文与 R-014 的 `“x"` 引号混用均按原样保留（脚本逐字符串核对通过） |
| 2026-11-03 14:50 +08:00 | R-015 转引 | 未拿到原始消息，以 lead 转引为准；括号内说明与"多状态ui"（无空格）按原样保留 |
| 2026-11-03 14:52 +08:00 | R-016 转引 | 未拿到原始消息，以 lead 转引为准；用户贴出的 HTML 片段（含 `pin-btn on` 旧 title）按原样保留，属**旧构建 DOM**，新构建 title/aria 随状态更新 |
| 2026-11-03 14:54 +08:00 | R-017 转引 | 未拿到原始消息，以 lead 转引为准；"批注得能够编辑"按原样保留 |
| 2026-11-03 14:56 +08:00 | R-018 转引 | 未拿到原始消息，以 lead 转引为准；"框线之间也有"（省略宾语）按原样保留 |
| 2026-11-03 15:01 +08:00 | R-019 / R-020 转引 | 未拿到原始消息，以 lead 转引为准；R-020 为两条独立短消息（"意外端口""意外断开"），按两段引用保留；均无报错原文/截图 |
| 2026-11-03 15:04 +08:00 | R-021 转引 | 未拿到原始消息，以 lead 转引为准；"子agent"（无空格）按原样保留 |
| 2026-11-03 15:16 +08:00 | R-022 转引 | 未拿到原始消息，以 lead 转引为准；"covenant自身架构图"（无空格）按原样保留；fixHint 计数差异（文档 20 / 静态 21）已在 R-022 现状核对标注待对 |
| 2026-11-03 15:19 +08:00 | R-023 转引 | 未拿到原始消息，以 lead 转引为准；"新增批注"引号与"编辑完恢复现场"按原样保留 |
| 2026-11-03 15:20 +08:00 | R-024 转引 | 未拿到原始消息，以 lead 转引为准；"坐标漂移已经解决"按原样保留（用户确认，非转述） |
| 2026-11-03 15:31 +08:00 | R-025 转引 | 未拿到原始消息，以 lead 转引为准；"返回按钮取消编辑"按原样保留 |
| 2026-11-03 15:32 +08:00 | R-026 转引 | 未拿到原始消息，以 lead 转引为准；"怎么没有确定/保存"按原样保留（用户未看到保存按钮，属可见性问题） |
| 2026-11-03 16:09 +08:00 | R-027 / R-028 转引 | 未拿到原始消息，以 lead 转引为准；R-027 编号式原话"1：…；3：…"与 R-028 "bundle壳"（无空格）均按原样保留 |
| 2026-11-03 16:20 +08:00 | R-029 转引 | 未拿到原始消息，以 lead 转引为准；"小窗， 缩放拖拽"中逗号后空格按原样保留 |
| 2026-11-03 16:36 +08:00 | R-030 转引 | 未拿到原始消息，以 lead 转引为准；原话中 `""D:\AAA_Work\ALLELab"`（双引号叠用/半角）与"规范  设计"（双空格）均按原样保留 |
| 2026-11-03 17:17 +08:00 | R-031 / R-032 转引 | 未拿到原始消息，以 lead 转引为准；R-031"Covenant打包成可交付物Package"（无空格）与 R-032"发到github"（小写）均按原样保留 |
| 2026-11-03 17:25 +08:00 | R-033 转引 | 未拿到原始消息，以 lead 转引为准；原话"批准  许可选过了   发release"**空格按原样保留**（"批准"后 2 空格、"选过了"后 3 空格、release 小写）；另：zip/sha 与 lead 报告值不一致（见 R-033 现状核对，口径待对） |
