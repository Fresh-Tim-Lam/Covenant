# 活跃待办

> **用途**：Covenant 唯一活跃待办清单。完成项移入历史或删除；不做长期归档（归档归 `docs/design/`）。
> **目标读者**：人 + AI Agent。
> **状态**：M0 收尾（2026-11-03）。shell 仍不可用；M1 已按纵向切片重排（见 self-hosting-bootstrap §6），需换会话执行。
> **关联文档**：[design/open-questions.md](design/open-questions.md)（决策）、[design/self-hosting-bootstrap.md](design/self-hosting-bootstrap.md)（自举计划）。

## M0 已完成（提案期）

- [x] 市面调研与对标矩阵（research/landscape-2026-11.md）
- [x] 图示全景分类 + "够不够用"判据（design/diagram-taxonomy.md）
- [x] 格式 v0 提案（design/format-spec-v0.md）
- [x] 引擎架构 v0（design/engine-architecture-v0.md）
- [x] 交互与 AI 闭环（design/interaction-and-ai-loop.md）
- [x] AI 信任边界与注入防护（design/ai-trust-boundary.md）
- [x] 端到端黄金路径（design/walkthrough-golden-path.md）
- [x] 术语表（reference/glossary.md）
- [x] 12 条硬约束（reference/hard-constraints.md）
- [x] 10 个剖面实现级定义 + 规则类型闭集（design/profiles-catalog-v0.md）
- [x] 自举：用 Covenant 描述 Covenant（examples/covenant-self.cvn.yaml），暴露 6 个真实缺口
- [x] 示例图（examples/payments-arch.cvn.yaml、order-dfd.cvn.yaml）
- [x] 自举与迭代计划（design/self-hosting-bootstrap.md）
- [x] 范式宣言 v2（prompts/paradigm-declaration-v2.md）
- [x] L1 JSON Schema（schema/kernel.schema.json）
- [x] 可执行门禁规格（design/gate-spec-v0.md，含防假通过断言）
- [x] 可发现性设计（design/discoverability.md）
- [x] **可点击原型**（examples/prototype/arch-prototype.html）：批注 + AI digest + 导出补丁 + **Agent 演练（复述→补丁→校验失败→修正→语义 diff→批准）**

## 下一步：范式文档（不依赖 shell）

- [x] 写 `docs/prompts/paradigm-spec-v2.md`（11 节 + 5 附录，含 D/I/G/P 判定编号）
- [x] 附录模板：目录 README / FRAS / 图示骨架 / 批注 / ADR（见 spec 附录 A–E）
- [ ] 拿一个真实新项目试跑 spec §7 的 0→1 流程，验证"1 天可落地"（未验证）
- [ ] 旧两份 v1 文档标注为历史（在仓库外，需用户操作或授权写父目录）

## 决策（Q5–Q10 已全部拍板，2026-11-03）

- [x] Q5 轻量 L5 代码绑定
- [x] Q6 项目目录（`arch/` + `covenant.yaml`）
- [x] Q7 文档中文 / 代码英文
- [x] Q8 AGPL-3.0 + 商业双许可
- [x] Q9 不做浏览器直写（导出补丁 + `serve` 覆盖）
- [x] Q10 扩展名 `.cvn.yaml`
- [ ] 项目名 `Covenant` 未被否决，暂保留（若要改，M1 前告知）

## 许可落地（M1）

- [ ] 放入 **AGPL-3.0 原文**（必须原文，不可改写/摘要）+ `COMMERCIAL.md` 商业授权说明
- [ ] `THIRD_PARTY_NOTICES.md`（随依赖引入生成）

## M1（纵向切片）——进行中

> 已定：Q5 只做轻量 L5、Q7 文档中文/代码英文、Q10 双后缀 `.cvn.yaml`。
> 依据 [self-hosting-bootstrap.md](design/self-hosting-bootstrap.md) §6：**先让一个剖面走通全链路**，再横向加剖面。

### 已完成并验证（2026-11-03）

| 项 | 验证方式与结果 |
|----|----------------|
| pnpm monorepo（5 个 workspace 项目） | `pnpm install` 成功（esbuild 构建脚本已白名单） |
| 包 `core` / `profile` / `validate` / `cli` | `pnpm typecheck` → exit 0 |
| 解析：YAML 1.2 CORE_SCHEMA + 锚点禁令 | `pnpm check examples` → 3 文件 OK |
| 校验 L1（schema）/ L2（完整性）/ L3（剖面） | 同上：**0 error / 0 warning** |
| `c4-container@1` + `dfd@1` 词表/矩阵/必填 | `packages/profile/src/index.ts` |
| 单测 8 条（含 finding 顺序稳定性） | `pnpm test` → 8 passed |
| 门禁自检 A1（扫描 0 文件 → exit 4） | `pnpm covenant check docs` → exit 4 |
| Q10 改名 `.cvn.yaml` + 全仓引用更新 | 3 个示例 + 9 个文件引用 |
| GAP-03 YAML 口径 | CORE_SCHEMA（时间戳保持字符串）；`covenant: "0.1"` 必须加引号 |

### 已完成（追加，2026-11-03）

| 项 | 验证方式与结果 |
|----|----------------|
| `@covenant/layout` 确定性分层布局 | 5 条单测（含回边破环、无重叠、pins、route） |
| `@covenant/render` SVG 渲染 | 4 条单测（骨架/确定性/角标/转义） |
| `covenant render` 出图 | 3 张 SVG：payments 1146×418 / self 1486×562 / dfd 1406×398 |
| 视觉核对 | SVG→PNG（resvg）人工查看，发现并修复"残留 pins 导致节点重叠""标签叠字" |
| **GAP-01** | 决策改为**不引入 ELK**：自研分层布局、构建期算坐标 → ELK 体积风险消除 |
| **自包含 HTML（可标注）** | `pnpm build:html examples` → 45.2 KB / 3 图 / 0 外部请求；点选 → 批注表单 → localStorage → 角标实时更新 → 导出 `.patch.json` |
| HTML 交互验证 | **jsdom 无头测试 2 条**：点节点出表单、提交写 localStorage 并出角标、导出补丁含 `base_rev`/`ops`/`ai_hint` |
| **`covenant apply`** | 补丁落盘：**文本块插入保留注释** + 写前校验 + 原子替换 + write-ahead 审计（intent/commit 两条） |
| apply 端到端演练 | 示例副本 rev 3→4、批注落盘、`check` 仍 0 error；dry-run 不写盘；12 条补丁单测 |
| **补丁门禁** | `covenant patch-check`：10 类规则（越权/ai_hint/过期/目标/重复 ID/enum…）；已接入 `apply` 默认路径，**未通过门禁不落盘** |
| 门禁对抗演练 | 人类补丁 PASS；AI 干净补丁 PASS；**AI 冒充 human + 写 ai_hint → 2 错拒绝**；过期基线 → 拒绝；被拒后文件 rev 未变 |
| **批注状态流转** | `replace /annotations/<id>/status`：open→ack→resolved→open；写 `updated` 与 `resolution`；**AI 不得改状态**（`gate/status-actor`） |
| 状态流转演练 | rev 4→5：add → 人类 resolve → `resolution: {"by":"human:lily",...}`；AI 同补丁被门禁拒绝；`check` 仍 0 error |
| **HTML 状态按钮** | 图上看批注 → 确认/已解决/不修/重开 → 导出补丁合并 `replace /status`；jsdom 测试覆盖；HTML 47.6 KB |
| 跨进程闭环演练 | jsdom 操作 `dist/covenant.html`（点 e.recon → 已解决 → 导出）→ CLI `patch-check` PASS → `apply` rev 3→4 → `check` 0 error |
| **语义 diff** | `covenant diff a b`：cosmetic / material / breaking 分类；breaking → exit 1 + "需要人工批准"；13 条单测 |
| diff 演练 | 改 tech（material）+ 改名（cosmetic）+ 改关系类型（breaking）→ 输出 1/1/1 且 exit 1；同文件 → 0 变更 exit 0 |
| **视图选择器** | `include/exclude`（`*`、`e.*`、`tag:xxx`、精确 id）真正生效；`render --view`；`build` 一份文档多入口（`doc#view`） |
| 多视图演练 | 同一文档两视图：core 含 DB 不含 PSP，public 反之；`build` 出 2 个入口；同时修掉"视图缺 layout 导致坐标 NaN"的真 bug |
| **渲染质量 v2** | barycenter 交叉最小化（6 轮扫描保留最优）+ 跨层长边顶部通道 + 长边标签下移；自举图对比明显更干净 |
| v2 回归测试 | +3 条：长边通道在节点带之上、barycenter 使 a→d/b→c 反转顺序、缺省参数不产生 NaN |
| **自举 `arch/`** | `arch/system.cvn.yaml`（14 元素 / 18 关系 / 3 条真实缺口批注）+ `covenant.yaml` 项目清单；`covenant check arch` 通过 |
| **FRAS 索引** | `arch/index.yaml`：14 个源文件的 F/R/A/S；`covenant index` → I1–I3 PASS；`--write` 只更新哈希 |
| 本地 CI 等价物 | `pnpm verify` = `check arch examples` + `index` + `test` |
| **`er@1` 剖面** | entity/attribute + has-attr/relates；3 条专有规则（父级/重名/N:N 警告）；`examples/order-er.cvn.yaml` 通过；95 单测 |
| **CI 流水线** | `.github/workflows/verify.yml`（install → typecheck → verify）；**未实际运行**（仓库未 `git init`） |
| **标签避让** | 候选位移 + 节点障碍 + 已放标签互斥；自举图/ER 图对比明显改善；4 条测试 |
| **MCP server** | `packages/mcp`：8 工具（check/read_doc/render/build/patch_check/apply/diff/index），stdio 零依赖；真实子进程冒烟 PASS |
| **Agent Skill** | `skills/covenant/SKILL.md`：铁律 / 工具表 / 典型任务 / 错误对照 |
| **黄金 SVG** | 7 个断言（5 示例 + 多视图 2 个 + 自举）；正向/反向/恢复三次验证；`pnpm golden` 更新 |
| **ER 视觉** | attribute 渲染为胶囊、entity 近方形；由黄金测试锁定 |
| **@covenant/ai** | `ai brief`（未决批注+ai_hint+问题）与 `ai annotate`（生成 gate 可接受补丁）；AI 端到端 rev 3→4 |
| HTML 结构核验 | DOCTYPE ✓、3 个内联 SVG、无 `<script src>` / `<link>`、http 引用仅 SVG xmlns |

### 未完成（M1 剩余 / M2 起步）

- [x] **标签避让**：全局放置（节点为障碍 + 已放标签互斥 + 候选位移），99 单测
- [ ] **补丁通道 M4 剩余**：删除批注、多人冲突合并、把 breaking 判定接入 `apply` 的批准流程
- [ ] 真实浏览器（非 jsdom）验收：视觉与交互手感
- [x] `er@1` 剖面注册：词表/矩阵/必填 + 3 条专有规则（attribute-parent / duplicate-attribute / N:N associative 警告），示例 `examples/order-er.cvn.yaml`
- [x] 索引契约 I1–I3（FRAS 生成器）：`covenant index` / `--write`，覆盖/新鲜度/可读性 7 条测试
- [ ] 门禁 D1–D5 与 A2/A3 fixture
- [x] **GAP-05（最小版）**：apply 已实现 write-ahead（intent → rename → commit）；崩溃回放/回滚待 M4
- [ ] 许可原文（AGPL-3.0 + `COMMERCIAL.md`）与 `git init`
- [x] **规范自用**：`AGENT.md`、`arch/` 自举契约、FRAS 索引、`.github/workflows/verify.yml` 均已就位（workflow 未实际运行——仓库未 git init）

## M2（渲染与呈现）

- [ ] 自包含 HTML 支持多视图切换、批注只读展示
- [x] 黄金 SVG 基准（7 张：5 示例 + 多视图 2 + 自举）
- [ ] 自举图替换范式 MD 里的 Mermaid 占位图（P2）

## M3（交互闭环）

- [ ] 自包含 HTML 编辑器：选中框/线/文本、6 类批注、localStorage、导出补丁
- [ ] `covenant apply` + `covenant digest`
- [ ] 按 [interaction-and-ai-loop.md](design/interaction-and-ai-loop.md) §9 验收

## M4 / M5

- [ ] 语义 diff + 补丁协议 + MCP server
- [ ] 代码绑定 L5、fitness L6、Structurizr/Mermaid 互操作

## 文档债

- [ ] 决定后把 `open-questions.md` 中 Q5–Q9 迁入 `docs/conventions/` 并关闭
- [ ] 格式 v0 冻结后写迁移说明（v0 → v1）
| **接线点拓扑 + 跳线弧 + 标签胶囊** | `present.node_style: junction`（点节点/点间直线/交叉跳线弧）；所有边标签加胶囊底；示例 `examples/topology-junction.cvn.yaml` + 黄金图；236 tests |
| **编辑态拖拽位置** | 编辑模式拖动节点 → 暂存 pins 并回填 X/Y；jsdom 回归测试；修掉 pointer capture 吞 click 的悬浮窗回归 |
| **悬浮窗钉住/拖拽** | 检查器窗头可拖动；左上角 📌 钉住 → 点背景/Esc 不关闭；jsdom 测试（钉住/关闭/拖窗） |
| **边-框端口分配** | 每条边独立接入点（同侧排序、16px 最小间距）；端口不足按维度扩框；layout 测试 + 黄金 15 张更新；247 tests |
| **悬浮窗坐标修复** | 定位/拖拽统一 offsetParent 坐标；jsdom 断言拖拽位移与起手位置连续（不跳变） |
| **左侧侧栏 + 导航点击修复** | 顶栏改可滚动侧栏（224px，滚轮自然滚动，☰ 折叠持久化）；修复导航绑定旧选择器导致其他图点不动；切换测试 + 结构测试 |
| **批注删除/撤销/回收桶** | 每条批注「×」删除；持久批注导出 remove（human-only gate）；localStorage 回收桶 + 撤销 toast；253 tests/verify 绿 |
| **模块 owner 编制** | 粒度规范/目录契约/写域表；`team/owns.yaml`；patch 拆分完成（6 文件 ≤300）；core/viz/iface/guard 任务待续 |
| **接线出口 stub + 框线间距** | 端口法线 20px 垂直短引线；中间线段与无关框 ≥12px（clearPath）；layout 新增 2 条测试；黄金 15 张重生成 |
| **子代理模式分配** | mechanical+tool_filter 跑只读/验证省 token；standard 做实现；deep 做架构；creator 做 DSH；能用单命令就不 spawn |
| **bundle 文件夹打包** | `covenant bundle examples -o dist/site`：壳页+manifest+16 views SVG+annotations；build:bundle 脚本；AGENT 表格；提案文档 v0.1 已实现 |
| **bundle 交互壳** | index.html 内联 SVG+数据；图列表/缩放/平移/双击/点选详情+批注面板；jsdom 实测通过；静态 views/*.svg 保留 |
