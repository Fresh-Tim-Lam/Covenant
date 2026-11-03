# todo/ — 用户原话与计划维护区

> **用途**：Covenant 项目的"防上下文丢失"工作区——逐字留存用户需求原话，维护可执行任务计划、已决决策与待确认问题。
> **维护者**：todo-scribe（常驻 todo agent，由 lead 派发）。**只写本目录**，不改仓库其他文件、不改代码、不跑会写文件的命令。
> **本目录不是产品事实源**：事实源是 `arch/`、`examples/` 下的 `.cvn.yaml` 与 `schema/`；本目录只记录过程与计划，一切实现以代码和 `.cvn.yaml` 为准。
> **创建**：2026-11-03（会话采样时刻 13:44 +08:00）；**最近更新**：2026-11-03（新增 `inbox/` 外部需求收件箱）。

## 文件清单

| 文件 | 作用 | 写入方式 |
|---|---|---|
| [requests.md](requests.md) | 用户原话逐字收集（R-xxx） | **只追加**，不改旧内容 |
| [plan.md](plan.md) | 任务计划表（T-xxx：状态 / 验收 / 证据 / 依赖 / 负责） | 状态与证据随进展更新 |
| [open-questions.md](open-questions.md) | 需用户确认的问题（Q-xxx） | 回答后补"结论 + 日期"，问题本身不删 |
| [decisions.md](decisions.md) | 已确定决策（D-xxx，含来源与"受挑战"状态） | 只追加；变更用"取代 / 受挑战"标注 |
| README.md | 本说明 | 规则变更时更新 |
| [inbox/](inbox/) | **外部团队需求收件箱（append-only）**：一团队一目录，团队只写新文件，todo-scribe 归并 | 团队只追加；todo-scribe 归并 |

## 更新规则（硬性）

1. **原话只追加**：`requests.md` 已写入的引用块不得改写、删减、润色，包括标点与错别字。需要纠正时只能新增一条"更正记录"。
2. **引用与整理分离**：用户原话一律放在 `>` 引用块内；归纳、解读、现状核对写在引用之外，并标明"整理"或"核对"，不得与原话混排。
3. **不臆造**：用户没说过的话不写；无法确定的标"待确认"，不替用户做决定。
4. **时间口径**：日期用 `YYYY-MM-DD HH:mm` + `+08:00`；无法确定发言时刻时写"时间未提供"，只记录录入时刻。
5. **plan 证据制**：完成项必须写证据（文件路径 / 命令 / 输出摘要）；只做过静态检查的必须标"仅静态、未运行"，不得写成"已通过"。
6. **决策变更留痕**：已定决策不静默改写；变更须新增条目，并标注 `取代 D-xxx` 或 `受挑战`。
7. **范围纪律**：本 agent 仅修改 `todo/`；不改代码/文档/schema，不执行写文件类命令（只读检查可用）。


## 外部需求收件箱（`inbox/`，append-only）

首个试点：`D:\AAA_Work\ALLELab`（DSH 团队）→ [inbox/ALLELab/](inbox/ALLELab/)。

规则：
1. 外部团队**只写** `inbox/<team>/YYYY-MM-DD-<role>-<slug>.md`（从 [inbox/_TEMPLATE.md](inbox/_TEMPLATE.md) 复制），不改别人的文件、不改本目录其它四件套；
2. 需求字段：id / team / author / date / project / kind / severity / **status: new** / title / evidence（`path:line`）；
3. 只收"需求/问题/证据"，不收设计方案；
4. todo-scribe 每周（或累计 ≥5 条）归并进 `requests.md`（保原话、编 R-xxx）与 `plan.md`（T-xxx），并在原文件顶加 `> 已归并：R-xxx / T-xxx`（不删除原文件）；
5. 分诊状态：`new → triaged（accepted/deferred/wontfix/duplicate）→ planned → done`；wontfix 必须写理由；
6. inbox 与 ALLELab 自己的 `dashboard/data/tasks.json`、`docs/team-handoff/` 并行，不互相替代。
## 当前摘要

- **原话**：已录入 40 条（R-001 ~ R-040）：R-001~R-005、R-007~R-040 为用户原话（lead 转引；R-020 为两条短消息），R-006 为 Q3 的 lead 决定（注明用户未直接回答）；R-004 附仓库外路径。
- **计划**：T0 ~ T49。已完成：T3/T4 编辑 v0、T10 范式+模块门禁、T14 junction 渲染、T16 pointer 回归、T17 悬浮窗钉住+拖拽、T18 端口分配+扩框、T19 拖拽坐标、T20 左侧侧栏+点击绑定、T22 模块 owner 编制+patch 拆分、T23 批注删除/撤销/回收桶、T24 悬浮窗关闭语义+钉子两态、T25 小窗标题栏+grip、T26 批注内容编辑、T27 接线 stub+线框间距、T28 小窗上下分离、T29 端口/断开排查（结案：非缺陷）、T30 子代理模式/token 策略、T31 自身架构图批注处理、T32 批注编辑复用底部表单区、T33 编辑态「← 返回」按钮、T34 编辑态保存/确定可见性、T35 bundle（复用主查看器 + version 3 manifest）、T36 交互验收（agent 卡死→Lead 接手；报告落盘 + P0 修复）、T38 todo 外部需求收件箱 + ALLELab 试点、T40 可交付 kit Package、T41 GitHub 分发范式与骨架、T43 线路绕框/交点圆点/胶囊车道、T44 画布变宽已接受、T45 段级批注、T46 引导线弧长中点、T47 hover 闪色状态机、T48 看板侧栏分组（dist 已重建，`views-group` 12/标题 4）、T49 一人一模块架构责任制；**进行中：T42 首发 v0.1.0 Release**（本地就绪 + 远端已推送，Release 产物待确认）；进行中：T15、T6、T1/T2/T7/T8；待办：T39 ALLELab 团队确认与首批需求归并、T37 交互 P1/P2 改进 + 真实浏览器验收、T31b（仅浏览器人工验收）、T22b（4 组重派）、T13（C 通道）、T11（只读守卫）；阻塞：T12；T0/T9 待办。**待用户**：真实浏览器验收（含段热区手感，a.01JAYS3KV0003）+ v.libs 是否拆（Q16）；3 条批注已 12/12 resolved。
- **风险**：`pnpm edit` 抢占；`edit --accept` 丢注释；坐标是 layout 坐标非拖拽；`edits.json` 需人工转移；`edit` 与 `patch-check` 两套校验；模块五段门禁只验标题；常驻守卫写域；本地编辑服务 token/loopback；junction 标签避让弱、需手排 pins；pointer 捕获需防回归；钉住不持久化；actor 优先级需防回归（已修）；扩框对称可能压邻居；端口排序启发式；悬浮窗坐标须统一 offsetParent（已修）；选择器改名必须全量搜索；动态重渲染 detached 需 isConnected/stopPropagation（已修）；用户可能仍在看旧构建；编辑表单同容器误绑定（已加 data-act 守卫）；`editingAnn` 未清理（可优化）；clearPath 已扩全段但仍需密集图回归；线-线间距仅端口层+ lane；**bundle 只读无写回（Q13）**；**bundle index 较大（199 KB，P2 懒加载）**；**manifest v3 与 v2 不兼容（仅文档记录）**；**画布变宽已接受（R-037，不压缩）**；**system 主图偏密（可选 v.libs 拆分，Q16）**；**段索引布局漂移（P1：layout 改动会改段序号）**；**真实浏览器段热区手感待验（P1）**；**junction 箭头压点节点（P2）**；**fit 下圆点偏小（P2）**；**Release 产物待确认（tag 推送/Release 创建）**；**kit 必须自带 schema 根锚点（已修）**；**两套范式安全边界不同（勿把本地特权套到公开渠道）**；**ALLELab 试点依赖外部确认（Q14）**；**跨工作区写权限待验证**；**inbox 与 ALLELab 看板两套跟踪需防漂移**；**interaction-owner 卡死（agent 长任务需预算/超时策略）**；**真实浏览器人工验收未做**；**4 子代理中途失败（原因未明）**；并发写域检测缺失；**AOCI 可用、XERJ 未接入**；行数基线会漂移。
- **待拍板**：见 [open-questions.md](open-questions.md)：**Q1、Q2、Q5、Q11、Q12 已解决；Q3 已解决**（git init 由 R-033 批准，仅剩 C 时机）；**Q9 部分关闭**（git init ✅，只剩只读守卫）；**Q10**（junction）决定 T15；**Q13**（bundle 是否写回）决定 bundle 后续范围；**Q14**（ALLELab 试点三问）决定 T39；**Q15 部分关闭**（git init ✅、LICENSE=MIT ✅、npm 暂缓，仅剩包名/是否发 npm）；**Q16** system 是否拆 v.libs（保持）；待确认：Q4、Q6–Q10、Q13、Q14、Q16。

## 变更记录

| 日期 | 变更 | 记录人 |
|---|---|---|
| 2026-11-03 | 创建 `todo/`，录入 R-001 ~ R-003、T0 ~ T9、Q1 ~ Q8、D-001 ~ D-009 | todo-scribe |
| 2026-11-03（lead 实测同步） | 编辑后端 v0 落地：T3/T4 → 进行中、T6 → 进行中（部分）；新增 D-010/D-011 与 R-01~R-04 四条风险；Q1/Q2/Q3 按 v0 现状细化 | todo-scribe |
| 2026-11-03（lead 实测同步 #2） | 前端编辑态 v0 + 导出 edits.json + human-only 门禁：新增 D-012（Q9 不推翻）、D-010 补充，R-05~R-07；T3/T6 状态更新；Q2 收窄 | todo-scribe |
| 2026-11-03（lead 实测同步 #3） | 追加 R-004（Index-First 范式纳入规范）；T10 已完成、T11 待办、T12 阻塞；新增 D-013/D-014、todo/Q9；风险新增仓库外引用、门禁只验标题、守卫写域 | todo-scribe |
| 2026-11-03（lead 实测同步 #4） | 追加 R-005（Q1/Q2 用户拍板）与 R-006（Q3 口径由 lead 定）；ADR-0004 B 通道落地（`serve --edit`、一键脚本、部署指引）；T3/T4 → 已完成（v0）、新增 T13（C 通道）；新增 D-021/D-022/D-023，D-012 被取代、D-005 受挑战解除；Q1/Q2 关闭、Q3 收窄 | todo-scribe |
| 2026-11-03（lead 实测同步 #5） | 追加 R-007（junction 点节点/跳线弧/标签胶囊）；T14 已完成（v0）、T15 待办；新增 D-024、todo/Q10；风险新增 junction 标签避让与手排 pins | todo-scribe |
| 2026-11-03（lead 实测同步 #6） | 追加 R-008（点击无反应/悬浮窗消失回归）；新增 T16 已完成（pointer capture 修复 + 边命中路径 + 回归用例）；T15 → 进行中（编辑态拖拽节点已支持）；新增 D-026；238 tests/verify 由 lead 实测 | todo-scribe |
| 2026-11-03（lead 实测同步 #7） | 追加 R-009（小窗拖拽 + 📌 钉住）；新增 T17 已完成；新增 D-027；Q10 备注拖拽已可用/钉住持久化可选；240 tests/verify 由 lead 实测 | todo-scribe |
| 2026-11-03（lead 实测同步 #8） | git diff 后端补齐：`edit-flow.ts` diff 双通道（`git diff --no-index` 优先、无需 init；LCS 兜底；`diffKind`）+ actor 优先级修复（`req→edits→默认`）；`edit-flow.test.ts` 5 条；新增 D-028、Q3 备注更新；245 tests/verify 由 lead 实测；三链路目标具备可验证证据 | todo-scribe |
| 2026-11-03（lead 实测同步 #9） | 追加 R-010（每线独立接入点/16px 最小间距/自适应扩框）；新增 T18 已完成（layout 端口分配 + `routePorts`/`routeAbovePorts` + 黄金 15 张重生成）；新增 D-029；风险新增"扩框对称生长可能压邻居""端口排序为启发式"；247 tests/verify 由 lead 实测 | todo-scribe |
| 2026-11-03（lead 实测同步 #10） | 追加 R-011（小窗拖拽起手跳变）；新增 T19 已完成（定位/拖拽统一 offsetParent 坐标 + 父容器 clamp；回归断言位移连续 50/40）；新增 D-030；风险新增"坐标须统一 offsetParent"；247 tests/verify 由 lead 实测 | todo-scribe |
| 2026-11-03（lead 实测同步 #11） | 追加 R-012（顶栏改左侧侧栏 + 别的架构图点不动/滚不动）；新增 T20 已完成（aside#views 224px 可滚动 + ☰ 折叠 localStorage + 绑定改 `#views button`；含并入 T21）；新增 D-031；风险新增"选择器改名必须全量搜索"教训；Q5 已决；249 tests/verify 由 lead 实测 | todo-scribe |
| 2026-11-03（lead 实测同步 #12） | 追加 R-013（招聘模块 owner + 文件组织/索引/RAG）与 R-014（批注删除/撤销/回收桶）；新增 T22 已完成（module-ownership.md + owns.yaml + patch 拆 6 文件 ≤300；index 32）、T22b 待办（4 组重派）、T23 已完成（del-ann/trash/undo + removeAnnotationBlocks + human-only remove）；新增 D-032/D-033；风险新增 4 子代理失败/并发写域/AOCI-XERJ/行数基线四条；253 tests/verify 由 lead 实测 | todo-scribe |
| 2026-11-03（lead 实测同步 #13） | 追加 R-015（未钉住不关闭 + 钉子多状态样式）；新增 T24 已完成（document 级 click 关闭规则 + isConnected/stopPropagation 防护 + 钉子两态样式/aria/title；html.dom 13 条）；新增 D-034；风险新增"动态重渲染 detached 误关（已修）"；255 tests/verify 由 lead 实测 | todo-scribe |
| 2026-11-03（lead 实测同步 #14） | 追加 R-016（悬浮窗小窗顶栏 + grip）；新增 T25 已完成（.insp-head 38px sticky 标题栏 + .grip + insp-drag + 整条可拖 + 动作靠右；html.test:185 结构断言）；新增 D-035；风险新增"用户可能仍在看旧构建（pin title 旧，提示刷新/重开 dist）"；256 tests/verify 由 lead 实测 | todo-scribe |
| 2026-11-03（lead 实测同步 #15） | 追加 R-017（批注可编辑）；新增 T26 已完成（查看器内联编辑 + patch `replace /annotations/<id>` 整块 + gate human-only/身份字段保护 + 保注释；patch 37 条、html.dom 14 条含新增）；新增 D-036；风险新增"编辑表单同容器误绑定（data-act 守卫）""editingAnn 未清理（可优化）"；259 tests/verify 由 lead 实测 | todo-scribe |
| 2026-11-03（lead 实测同步 #16） | 追加 R-018（接线出口垂直 stub + 线-框间距）；新增 T27 已完成（ROUTE_STUB=20 / clearPath 12px 两轮 / 首尾垂直 / junction 不适用；layout.test 2 条；黄金 15 重生成）；新增 D-037；风险新增"clearPath 仅中间折点、密集图仍可能贴边""线-线间距仅端口层+ lane"；261 tests/verify 由 lead 实测 | todo-scribe |
| 2026-11-03（lead 实测同步 #17） | 追加 R-019（小窗上下两部分）与 R-020（意外端口/断开）；新增 T28 已完成（#inspector flex column + .insp-head flex:0 0 38px 去 sticky + .insp-body 独立滚动；html.test 断言更新）、T29 待确认（只读排查无 covenant serve 残留，需报错原文）；新增 D-038（修订 D-035 sticky 做法）、Q11；261 tests/verify 由 lead 实测 | todo-scribe |
| 2026-11-03（同步 #18） | **R-020 结案**：用户确认"意外断开=API 余额不足"（非 Covenant/端口缺陷）→ T29 已完成（非缺陷）、Q11 已解决；"意外端口"未复现；风险项标注结案；D-038 备注记一句 | todo-scribe |
| 2026-11-03（lead 实测同步 #19） | 追加 R-021（子代理模式不一律 standard，终端类用快速模式省 token）；新增 T30 已完成（module-ownership §7：mechanical+tool_filter / standard / deep / creator、单命令优先、Lead 复核；to-dolist 一行）；新增 D-039；261 tests/verify 由 lead 实测 | todo-scribe |
| 2026-11-03（lead 实测同步 #20） | 追加 R-022（处理自身架构图批注）；新增 T31 已完成（9 条→7 resolved/2 open；annotation-resolution 文档；apply human:you 两文档 rev→2；fallbackLabelPoint + parse.test 回归；264 tests/verify 由 lead 实测）、T31b 待办（region 锚点 + 浏览器人工验收）；新增 D-040、Q12；风险新增"region 锚点格式缺口""浏览器人工验收未做" | todo-scribe |
| 2026-11-03（lead 实测同步 #21） | 追加 R-023（批注编辑复用底部"新增批注"表单区）；新增 T32 已完成（单一表单区复用、列表不插编辑块、保存/取消恢复现场、li.editing 高亮 + scrollIntoView；html.dom 15 条含保存/取消用例）；新增 D-041；editingAnn 风险备注更新；266 tests/verify 由 lead 实测 | todo-scribe |
| 2026-11-03（用户确认 #22） | 追加 R-024（坐标漂移已解决）；**region 结案**：批注 open→resolved（covenant-self rev 2→3）、T31 → 8 resolved/1 open、T31b 仅保留浏览器人工验收、Q12 已解决；D-040 更新；风险项改"已结案"；265 tests/verify 由 lead 实测 | todo-scribe |
| 2026-11-03（lead 实测同步 #23） | 追加 R-025（编辑态需要返回按钮取消编辑）；新增 T33 已完成（`.edit-head` 标题行 + `← 返回` 按钮；取消不保存恢复新增表单；按钮区仅保存；html.dom:475 断言）；新增 D-042；266 tests/verify 由 lead 实测 | todo-scribe |
| 2026-11-03（lead 实测同步 #24） | 追加 R-026（编辑态怎么没有确定/保存 → 可见性）；新增 T34 已完成（保存移入 sticky 标题行右侧 `[保存] [← 返回]`、保存主按钮、移除底部 acts 行；html.dom:431/433 断言）；新增 D-043；T33 备注"保存已移入标题行"；**265 tests/verify** 由 lead 实测（原记 266 为笔误，2026-11-03 15:35 更正） | todo-scribe |
| 2026-11-03（lead 实测同步 #25） | 追加 R-027（确认 bundle 方向 + 质疑审计手搓）与 R-028（bundle 壳无法交互 + 招交互 agent）；新增 T35 已完成（bundle 交互壳：列表切换/缩放/平移/双击/点选详情+批注面板；index 145 KB/16 views；jsdom 实测 svg/16 按钮/e.core 详情/切视图）、T36 进行中（interaction-owner/task-6，写域 docs/audits，报告未落盘）；新增 D-044（bundle 双输出与交互壳）、D-045（审计手搓五理由）、Q13；风险新增 bundle 只读/dist 残留脚本/T36 未落盘；267 tests/verify 由 lead 实测 | todo-scribe |
| 2026-11-03（lead 同步 #26） | 三条静态核对已处理：①补 `packages/cli/src/bundle.test.ts`（可复跑，1 条）→ **268 tests**，T35 证据补入；②删除 `dist/site/_script_extract.js`；③`team/owns.yaml` + `team/README.md` 加入 `interaction` 组/interaction-owner（写域 docs/audits）；T36 仍进行中（验收报告待落盘）；风险三条标记已处理 | todo-scribe |
| 2026-11-03（lead 同步 #27） | **T36 收尾**：interaction-owner 卡死（task-6 未领取、无产出）→ interrupt，Lead 验收并落盘 `docs/audits/interaction-review-2026-11-03.md`；P0 修复 3 条（bundle badge `showBadges:true` / −+适配 缩放复位 / hash 深链 `#doc#view`）；T36 → 已完成、新增 T37 待办（P1/P2 + 真实浏览器验收）；新增 D-046；风险新增"interaction-owner 卡死→agent 长任务需预算/超时策略"；268 tests/verify 由 lead 实测 | todo-scribe |
| 2026-11-03（lead 同步 #28） | 追加 R-029（用户澄清 bundle 不是新版查看器、交互全没了）；**T35 修订**：bundle `index.html` 直接复用主查看器（`renderHtml(views)`），manifest 升 **version 3（entries）**，views/manifest/annotations 保留为文件夹资产；简化壳（含其 P0 修复）被取代（历史保留）；新增 **D-047**（不做简化壳、复用主查看器），D-046 标注已被取代；风险新增"index 199 KB 需懒加载（P2）""bundle.test.ts 仍断言 v2/旧壳标记需更新"（**后者已被 #29 更正**）；268 tests/verify 由 lead 实测 | todo-scribe |
| 2026-11-03（lead 更正 #29） | 更正静态判断：`bundle.test.ts` **已随 v3 更新并通过**（断言 `version===3`/`entries`/index `#views`+`#inspector`；`vitest run` 1 passed / 全仓 268 passed）→ 移除"测试需更新"风险，仅保留 **index 199 KB（P2 懒加载）**；新增 **manifest v3 与 v2 不兼容的迁移说明**（仅文档记录）；T35 证据更新 | todo-scribe |
| 2026-11-03（lead 同步 #30） | 追加 R-030（todo 外部需求收件箱 + ALLELab 试点）；新增 **T38 已完成**（`todo/inbox/` append-only、一团队一目录、模板/状态机/归并节奏、ALLELab 事实源映射/可写角色、PROJECTS 候选、kickoff 6 问 + 首个建议需求；README 增章节）、**T39 待办**（外部确认子目录/作者/落盘方式后归并首批）；新增 **D-048**、Q14；风险新增"试点依赖外部确认""跨工作区写权限待验证""两套跟踪需防漂移"；文档/流程变更，不触发构建 | todo-scribe |
| 2026-11-03（lead 实测同步 #31） | 追加 R-031（打包成可交付 Package）+ R-032（本地可信 vs GitHub 公开两套范式）；新增 **T40 已完成**（`scripts/build-kit.mjs` → kit：单文件 CLI 670KB + viewer + schema + 模板/示例/docs；zip 191,383 B + sha256；干净目录仅 `node bin/covenant.mjs` 跑通 check/build/bundle）、**T41 已完成**（distribution-paradigm 规范 + Issue/PR 模板 + verify.yml kit 构建/artifact + CONTRIBUTING 分发章节 + index 33 条）、**T42 待办**（首发 Release 依赖 git init/LICENSE/npm 包名）；新增 **D-049**、Q15；风险新增"发布三阻塞""kit 需自带 schema 根锚点""两套范式安全边界不同"；268 tests/verify 由 lead 实测 | todo-scribe |
| 2026-11-03（lead 同步 #32） | 追加 R-033（批准 git init / License 已选 / 发 Release；原话空格原样）；**T42 → 进行中**（本地 release 就绪：commit 86136c9 + tag v0.1.0 + LICENSE MIT + release notes + release.yml + zip/sha + .gitignore 清理）；新增 **D-050**（首发 MIT + Release-only + tag 触发 workflow）；**Q15 部分关闭**（git init ✅、LICENSE=MIT ✅、npm 暂缓）；风险新增"远端/gh 缺失阻塞推送"+"zip/sha 口径跨环境不同（已在 #34 更正）" | todo-scribe |
| 2026-11-03（lead 实测同步 #33） | 追加 R-034（交点圆点：空心=几何交叉、实心=真实连接，取消跳线弧）、R-035（胶囊感知车道 25/最大胶囊宽+10/扩画布）、R-036（长边只走间隙、绕框）；新增 **T43 已完成**（14 快照 P0/P1 全 0、282 tests、jsdom 49/49、15 黄金更新、arch rev3/self rev5、重建 dist、commit 9e0ca14 推送 CI success）；新增 **D-051**；`docs/to-dolist.md` L141"跳线弧"→"交点圆点"；T42 更新（remote 已配/推送成功，Release 待确认）；风险新增"画布变宽 4447×1483（可选通道行打包）""junction 箭头压点节点（P2）""fit 下圆点偏小（P2）"；待用户：3 条批注结案 + 浏览器验收 a.01JAYS3KV0003 | todo-scribe |
| 2026-11-03（lead 口径更正 #34） | 更正产物口径：①**以字节为准**（covenant.html 249,956 B≈244.1 KiB，构建打印 231.2 KB；arch.html 161,574 B≈157.8 KiB，打印 151.5 KB；site/index 249,956 B；打印值是 UTF-16 字符数口径）；②**圆点分文件**（covenant.html 218/11；arch.html 269/5，不合成）；③**kit zip 三口径**（本地最新 191,667/`89627c2d…`；早期本地 191,383/`680dc0ac…` 已覆盖；GitHub Release 194,425 B，附 CI sha）→ **不跨环境钉 zip sha，发布以 Release 附件为准**；T40/T43/D-049/D-051/R-031/R-033 记录同步 | todo-scribe |
| 2026-11-03（lead 实测同步 #35） | 追加 R-037（"看我架构图更新的；画布变宽完全能接受"）；新增 **T44 已完成**（接受"胶囊留距→画布变宽"取舍、不压缩；system 4447×1483 / self 3431×860，渲染复核无穿框、布局达标；`dist/review/*.png/svg`）；新增 **D-052**、**Q16**（system 是否拆 v.libs）；风险：画布变宽改"已接受"，新增"system 主图偏密（可选 v.libs 拆分）"；待用户：3 批注结案 + 浏览器验收 + v.libs 是否拆 | todo-scribe |
| 2026-11-03（lead 实测同步 #36） | 追加 R-038（多段连线=多数据元素、可加段级批注；小窗连边中点）、R-039（hover 一次悬停一直闪色，需状态设计）；新增 **T45 已完成**（`annotation.target.segment` 契约 + layout segmentCount/Midpoint + render 段 badge/热区 + gate/segment·segment-kind + viewer 多段窗/热区/导出；`3abbb20`+`64fa645`）、**T46 已完成**（引导线弧长 t=0.5，`00e96e2`）、**T47 已完成**（hover 色忆 400ms + relatedTarget 区域感知 + 目标键收敛，`64fa645`）；新增 **D-053**（段=polyline 下标、gate 不验上界 P1 warning）、**D-054**（hover 状态机）；批注 **12/12 resolved**（`53297bc`）；多小窗设计入自身架构（system **rev4** `v.viewer`、self **rev8**、design §4.5，`586bbfe`）；**open-questions 清理已解决项**（Q3 已解决 / Q9 部分关闭，git init 由 R-033 批准）；风险新增"段索引布局漂移（P1）""真实浏览器段热区手感待验（P1）"；基线 **317 tests** / verify / CI success（`64fa645`） | todo-scribe |
| 2026-11-03（lead 同步 #37） | 追加 R-040（"架构图看板"命名约定；左栏按组分类；架构团队一人一模块）；新增 **T48 进行中**（viewer-owner：`html.ts` 已实现 `GROUP_ORDER`（自身架构/系统契约/示例演示/模板/其他）/`docGroup`/`groupFromId`/`.views-group`，**dist 待重建；已被 #38 更正**）、**T49 已完成**（`docs/team/architecture-team.md` §6 模块架构责任人：20 行表格 + 职责四条，commit `ea738b6`）；新增 **D-055**（看板命名 + 一人一模块责任制）；**Q16 保持**（v.libs 待定） | todo-scribe |
| 2026-11-03（lead 更正 #38） | **T48 → 已完成**：dist 已重建（commit `ba5157a`），`dist/covenant.html` **296,708 B** @21:04:54，`views-group` **12** / `views-group-title` **4** / `data-group` 3（静态复核一致）；移除风险"T48 分组仅源码、dist 未重建"；口径更正：covenant-self **rev 8**（非 7）、covenant.html **296,708 B**（打印 274.4 KB 为字符数口径）、arch.html 静态实测 **235,671 B**（lead 报 234,767，**待确认**） | todo-scribe |
