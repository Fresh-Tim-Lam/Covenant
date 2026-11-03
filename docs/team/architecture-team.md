# 本项目架构团队（Covenant self-architecture team）

> 目的：让**用户直接对 Covenant 自身架构图提同步需求**，由一个常驻小团队负责把话落到 `.cvn.yaml`、修图纸、跑门禁、回预览。
> 用户接口人：Lead（你直接说需求即可，Lead 派单给 owner）。

## 1. 编制

| 角色 | 域 | 负责 | 可写范围 |
|---|---|---|---|
| **Lead** | 协调 | 拆解、派单、验收、汇总、push/release | 全部（最终验收） |
| **arch-owner** | architecture | 自身架构图的**语义正确性**：`arch/system.cvn.yaml`、`examples/covenant-self.cvn.yaml` 的元素/关系/视图/批注目标；对照代码与 design 文档同步 | `arch/**`、`examples/covenant-self.cvn.yaml`、`docs/design/**` |
| **diagram-owner** | visualization | **图面质量**：布局/连线/标签/端口/查看器交互；bundle 与主查看器一致性 | `packages/layout/**`、`packages/render/**` |
| todo-scribe | planning | 把需求原话/计划/决策记入 `todo/` | `todo/` |
| arch-guard（只读） | governance | 架构/规范/索引审计 | `docs/audits/**` |

边界：arch-owner 不改渲染代码；diagram-owner 不改 `.cvn.yaml` 语义；两者都不改批注 `status`（人类专属）。

## 2. 你怎么用（对接协议）

直接对 Lead 说，例如：

- “把 `covenant-self` 图里的 bundle/kit 补进架构，再加一条 CLI→kit 的关系”
- “`system.cvn.yaml` 里 serve 的写回路径不对，按现在的 `/api/patch` 改”
- “这张图太乱：悬浮窗遮挡、线穿过框，让图面 owner 修”

Lead 流程：

1. 建任务（write scope + 验收）→ owner 领取；
2. **arch-owner** 先给只读审计/拟改清单（避免乱改）；
3. Lead 批准 → 落盘 `.cvn.yaml` / 修代码；
4. 自动验证：`pnpm check arch examples`、`pnpm index`、`pnpm verify`、`pnpm build:html`、`pnpm build:bundle`；
5. **回报**：变更文件 + 证据 + 预览路径（`dist/covenant.html` / `http://127.0.0.1:4173/`）；
6. 你验收；不满意退回重做（任务 reopen）。

## 3. 主动巡检（不用你催）

- **代码结构变更后**（新包/新命令/新发布物）：arch-owner 巡检 `arch/system.cvn.yaml` 是否过期，1 个任务内出同步方案；
- **图面回归后**（布局/渲染改动、密集图可读性）：diagram-owner 巡检黄金图与查看器交互；
- **发布/分发范式变化**（kit、bundle、GitHub Release）：arch-owner 同步 `distribution`/`bundle` 相关元素与关系。

## 4. 当前任务板

| 任务 | Owner | 内容 |
|---|---|---|
| task-7 | arch-owner | 架构契约审计：自身架构图与代码/文档同步（只读→拟改） |
| task-8 | diagram-owner | 图面质量诊断：布局/渲染/交互 P0/P1（只读→修复） |

## 5. 汇报格式（owner → Lead）

`状态 / 变更文件 / 复现命令或证据 / 风险 / 下一步 / 是否需用户拍板`
—— 禁止“已修复”而无证据；黄金图变化必须先给人工比对结论。

## 6. 模块架构责任人（一人一模块）

> 每个模块有一位架构责任人，负责该模块在架构图中的**语义正确性**（元素/关系/摘要/批注目标），不负责图面美观（那是 diagram-owner 的）。
> 责任人变更代码后必须检查 `arch/system.cvn.yaml` 与 `examples/covenant-self.cvn.yaml` 中该模块的表示是否仍准确；不准确时通过 Lead 派给 arch-owner 同步。

| 模块/包 | 架构责任人 | 代码 owner | 架构图中对应元素 |
|---|---|---|---|
| core（类型/解析/工具） | **core-owner** | core-owner（代码） | e.core |
| profile（C4/DFD/ER 等剖面） | **core-owner** | core-owner（代码） | e.profile |
| validate（校验规则 L1–L3） | **core-owner** | core-owner（代码） | e.validate |
| layout（分层布局/路由） | **diagram-owner** | diagram-owner（代码） | e.layout |
| render（SVG/HTML 渲染/查看器） | **viewer-owner** | viewer-owner（代码） | e.render / e.viewer |
| patch（门禁/审计/写回） | **tools-owner** | tools-owner（代码） | e.patch |
| diff（语义 diff） | **tools-owner** | tools-owner（代码） | e.diff |
| indexer（FRAS 索引） | **tools-owner** | tools-owner（代码） | e.indexer |
| ai（AI 简报/补丁建议） | **tools-owner** | tools-owner（代码） | e.ai |
| adr（架构决策记录） | **tools-owner** | tools-owner（代码） | e.adr |
| editor（编辑流） | **tools-owner** | tools-owner（代码） | e.editor |
| cli（命令行入口 13 子命令） | **iface-owner** | iface-owner（代码） | e.cli |
| mcp（MCP 9 工具） | **iface-owner** | iface-owner（代码） | e.mcp |
| serve（本地 HTTP + 写回 API） | **iface-owner** | iface-owner（代码） | e.serve |
| bundle（文件夹站点） | **iface-owner** | iface-owner（代码） | e.bundle |
| kit（可交付包构建） | **iface-owner** | iface-owner（代码） | e.kitbuild / e.kit |
| CI/Release（GitHub Actions） | **iface-owner** | Lead | e.ci / e.github |
| 审计日志（.audit） | **tools-owner** | tools-owner（代码） | e.audit |
| 文件系统（.cvn 项目文件） | **arch-owner** | — | e.docs |
| JSON Schema（L1 契约） | **arch-owner** | — | e.schema |

### 责任人职责

1. **主动巡检**：改完自己模块的代码后，检查架构图中该模块的元素/关系/摘要是否仍准确；
2. **批注结案**：模块相关批注得到解答后，通过 Lead 提出结案 patch；
3. **发现不一致**：通过 Lead 派给 arch-owner 同步架构图；
4. **不需要**：亲自改 `.cvn.yaml`（那是 arch-owner 的）、亲自改图面布局（那是 diagram-owner 的）。

### Lead 巡检节奏

- 每次 push 前检查：本轮改动是否影响了任何模块的架构表示；
- 每次 release 前：全量 `pnpm check arch examples` + 人工看 `dist/arch.html` 三视图。