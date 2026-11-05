# Changelog

格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；版本遵循语义化版本。

## [Unreleased]

### Changed — AI 作者模式（ADR-0005）

- 信任边界口径修正：**AI 是架构作者**，可增删改元素/关系（补丁通道门禁本就放行，本次消除文档-实现漂移并正式化为决策）。
- 批注保护不变：AI 不得删除/修改人工批注、不得流转批注状态、不得写 `ai_hint`。
- 待新增关系 overlay 改为正交路由（端口出线 + 中间通道 + 箭头），与正式边同一视觉语言。
- 新增交互用例规范 v0（docs/design/interaction-usecases-v0.md）与 ADR-0005。

## [0.4.0] — 2026-11-05

图上编辑闭环 + 写回增强 + 治理机械化。

### Added — 图上编辑
- 图上增删元素：双击空白开创建表单，选中 Delete 暂存删除，可撤销；被批注/关系/框引用的元素拒绝删除（防 `kernel/dangling-ref`）。
- 图上增删关系：元素窗口「⇒ 连线」进入连线模式，点目标元素建关系（kind/summary）；选中关系 Delete 暂存删除。
- 两类暂存均接入补丁通道：「导出补丁 JSON」「导出全部补丁」「本地写回」自动带上 add/remove ops。

### Added — 写回与分发
- 本地编辑服务写回前先 `GET /api/rev` 取服务端真实 rev 并 rebase（连续写回不再被 `patch/stale` 拒绝）。
- `covenant apply-bundle` + 看板「导出全部补丁」（`covenant-all.patches.json`）批量落盘多文档。

### Added — 治理与认知
- 文件粒度棘轮（`pnpm granularity`）：新文件源码 ≤300 行/测试 ≤400 行，存量只减不增。
- 派发漂移审计 `pnpm agent:audit`（A1–A9）：版本单一事实源、派发记录合并判定、审计基线与自测。
- AOCI 仓库认知层：独立 MCP 实例 + 全量 194 文件认知索引（F/R/A/S + source_sha256，verify aligned）。
- 自身架构新增 `v.dev-support`（开发支撑服务视图）。

### Fixed
- 画布平移/小窗拖拽期间误触发其它元素悬浮窗（指针封印状态机补 `panning`）。
- ✓ 核验按钮静默失效（作用域 `doc` 未定义 + `docId`/`key` 选择器失配）。
- E9：`covenant apply` 关系 add 被追加进 elements 块（改走 `appendRelations`）；门禁元素 add 误用 relation 词表校验。
- CLI 版本号三处硬编码 0.1.0 与 package.json 漂移（收敛到 `COVENANT_VERSION`，A9 审计强制）。

### Changed
- 测试基线 362 → 386；`html.ts` 拆分出 viewer/ 运行时分片（1977 → 1892 行，棘轮只减不增）。

## [0.3.0] — 2026-11-04

发布管理修复与治理基线（发布工作流版本派生、审计基线、粒度检查、dev-support 视图）；详见 `docs/releases/v0.3.0.md`。

## [0.1.0] — 2026-11-03

首个可用版本：格式 + 渲染引擎 + 人机协作闭环 + 自举 + 可发现性。

### Added — 格式与校验

- `.cvn.yaml` 文本格式（Tier-0 kernel / Tier-1 profile / Tier-2 文档），YAML 1.2 CORE_SCHEMA，禁用锚点/别名。
- `schema/kernel.schema.json`（JSON Schema 2020-12）+ L1/L2/L3 三层校验器（ajv）。
- 10 个剖面：`c4-container@1` / `c4-context@1` / `c4-component@1` / `dfd@1` / `er@1` / `flowchart@1` / `deployment@1` / `graph@1` / `sequence@1` / `state@1`，各带词表、关系矩阵与专有规则。
- 文档级/元素级 `links` 字段（adr/url 形式校验；accepted ADR 跨文档引用检查）。
- 批注模型：`status` 状态机、`ai_hint`（仅人类可写）、`author` 身份约束。

### Added — 布局与渲染

- 分层布局：DFS 破环 → Kahn 分层 → barycenter 交叉最小化 → 长边顶部通道。
- 形状语义：菱形（decision）、胶囊（start/end/initial/final）、平行四边形（io）、胶囊属性（ER）、虚线（外部系统/容器引用）。
- 标签全局避让：节点障碍 + 已放标签互斥 + 候选位移。
- 序列图专用 sequencer：参与者列、生命线、sync/reply/async 消息。
- 自包含单文件 HTML：内联 SVG + 内嵌语义 JSON + 标注表单 + 状态流转 + 导出补丁；零外部请求。
- 查看器 UX（2）：禁用文字拖选（仅表单可选中），检查器新增「复制」按钮（复制选中对象语义+批注 JSON，带 toast 反馈）。
- 查看器 UX：顶栏视图切换 + 全屏画布；滚轮缩放（指针为中心）、左键拖拽平移、双击放大、`适应/1:1` 控件；标注面板改为跟随点击位置的悬浮窗（Esc 关闭）。
- 接线出口垂直短引线：所有边沿端口法线先走 20px stub 再折线（避免平行框边接入）；新增与无关框 ≥12px 间距避让（`clearPath`）。
- 接线点分配（边-框接入）：每条边独立端口、同侧按对端位置排序、最小间距 16px；端口数超过侧边长度时自动扩展框的宽/高（保持中心）。
- 接线点拓扑渲染（`present.node_style: junction`）：节点画成"真实交点"（圆点，不是框）、边为点间直线；**线与线交叉但不相交**处自动画跳线弧（半圆）；边标签统一加胶囊底（`edge-label-bg`）保证压线可读。
- 边标签语义化：`transition` 显示 `trigger [guard]`、ER `relates` 显示基数、`communicates` 显示 protocol/network；序列图消息带序号。
- 黄金 SVG 测试（14 张）防视觉回归。

### Added — 工具链

- CLI：`check` / `render` / `build` / `apply` / `patch-check` / `diff` / `index` / `adr` / `ai` / `serve` / `doctor`。
- 补丁闭环：`patch-check` 门禁（AI 不得冒充 human、不得写 `ai_hint`、不得改状态、`base_rev` 乐观锁）→ `apply` 保留注释、rev+1、write-ahead 审计。
- 语义 diff：`cosmetic` / `material` / `breaking` 三分类。
- FRAS 索引：I1 覆盖、I2 新鲜度/孤儿、I3 可读性；`--write` 只更新哈希。
- ADR 校验：front-matter、文件名编号一致、supersedes 链、accepted 引用。
- `@covenant/ai`：`ai brief`（未决批注/ai_hint/待答问题）、`ai annotate`（生成合法补丁）。
- MCP stdio server：9 个工具（brief/check/read_doc/render/build/patch_check/apply/diff/index）。
- `covenant serve`：只读静态托管，真实浏览器验收。
- 编辑态短时本地服务（方案 B）：`pnpm edit:serve`（=`serve --edit --open`）→ 页面「预览并写回」→ 统一 diff → 确认写回；loopback + token + human-only + 备份/审计；无服务时仍可导出 edits.json 走 CLI（ADR-0004）。
- 批注删除/撤销/回收桶：每条批注加「×」删除（持久批注导出为 `remove /annotations/<id>`，本地新增直接移除）；删除/恢复带「撤销」toast 与回收桶；patch 新增 human-only remove 操作。
- 模块 owner 编制：`docs/conventions/module-ownership.md` + `team/owns.yaml`；`packages/patch` 拆为 6 文件（均 ≤300 行，行为不变）。
- `covenant-kit` 可交付包：`pnpm package:kit` 生成单文件 CLI + 预构建查看器 + 模板/示例/文档/schema；zip + sha256；两套分发范式（本地可信 vs GitHub 公开）落规范。
- `covenant bundle`：文件夹打包输出；**交互版壳页**（内联 SVG、图列表切换、滚轮缩放/拖拽/双击、点选对象看详情与批注）；manifest.json/annotations.json/views/*.svg 供无 JS 与工具使用。
- 视图导航改回左侧可滚动侧栏（224px、滚轮可滚、☰ 折叠并记住状态）；修复导航按钮未绑定点击（旧选择器 `nav button`）导致"其他架构图点不动"的 bug。
- 悬浮窗坐标修复：拖拽/定位统一用 offsetParent 坐标（此前视口坐标与 `style.left/top` 混用，起手会向下跳一个顶栏高度）；拖拽位移与起手位置连续。
- 悬浮窗可拖拽（拖窗头移动）+ 左上角「📌 钉住」：钉住后点击别处/背景不关闭（Esc 也不关），再点取消；关闭按钮复位钉子。
- 编辑态拖拽位置：编辑模式下直接拖动节点 → 暂存 pins（坐标自动回填），不再只能手填 X/Y。
- HTML 编辑态：顶栏「编辑」→ 改文本属性/X/Y 坐标 → 暂存 → 导出 edits.json（无需本地服务）；字段含元素 name/summary/tech、关系 summary、视图 pins。
- 编辑 diff 双通道：优先 `git diff --no-index`（无需 git init），无 git 时回退内置 LCS 文本 diff；`diffKind` 标注来源。
- `covenant edit`：受控语义编辑（元素文本属性 / 关系 summary / 视图 pins）→ 生成待审查新文件 + 统一 diff；`--accept` 写回 + rev+1 + 备份 + 审计。
- `covenant doctor`：12 项环境自检（含版本一致性与 BOM 检查）。
- `pnpm cleanroom`：干净目录复制 → 重装 → verify。
- `pnpm verify`：契约校验 + 索引 + ADR + 全量测试。

### Added — 文档与自举

- `arch/`：仓库自身的契约（14 元素 / 18 关系 / 3 条真实缺口批注）+ FRAS 索引。
- `covenant.yaml` 项目清单；`arch/README.md` 目录契约。
- 2 条真实 ADR（单文件 HTML、TypeScript workspace）。
- `docs/quickstart.md` + `examples/quickstart/mini.cvn.yaml`（5 分钟闭环）。
- `skills/covenant/SKILL.md`（一页 Agent 上手）、`AGENT.md`、`packages/README.md`。
- 设计文档：格式、剖面目录、引擎架构、交互与 AI 闭环、信任边界、门禁、可发现性、图种taxonomy。

### Tests

- 206 个测试（14 个测试文件，11 个包 + cli/mcp/adr/doctor/serve/golden）。

### Known limitations

- 序列图无 `activate/deactivate`、`loop/alt`、消息编号。
- 状态机 `composite` 无正交区域；`transition` 的 action 不渲染（trigger/guard 已上标签）。
- 部署图无真正嵌套容器（用 `@节点名` 标注）。
- `links` 的 code/issue 目标不校验存在性。
- 真实浏览器交互尚未由人类验收（已验证 jsdom 行为）。
- 编辑 v0：已含 HTML 编辑态（导出 edits.json，不直连后端）；未做拖拽节点、增删元素/关系、与 patch-check 的整合；`--accept` 会丢 YAML 注释（有 .bak 备份）。
- 仓库尚未 `git init`，未附 AGPL-3.0 原文。
