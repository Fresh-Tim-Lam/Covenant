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
