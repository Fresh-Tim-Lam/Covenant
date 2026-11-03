# ALLELab 试点 — 需求收件箱

> 试点工作区：`D:\AAA_Work\ALLELab`（成熟 DSH 多 agent 团队，30 个角色）
> Covenant 侧入口：`D:\AAA_Project\Covenant\todo\inbox\ALLELab\`
> 规则总纲：上级目录 [../README.md](../README.md)、模板 [../_TEMPLATE.md](../_TEMPLATE.md)

## 1. 组织事实（不重复造轮子）

ALLELab 的事实源与看板（以其 `AGENTS.md` 为准）：

| 内容 | 位置 |
|---|---|
| 角色契约 | `D:\AAA_Work\ALLELab\agents\org.json` |
| 团队装配 | `D:\AAA_Work\ALLELab\team\team-spec.json` |
| 业务待办看板 | `D:\AAA_Work\ALLELab\dashboard\data\tasks.json` |
| 工作日志 | `D:\AAA_Work\ALLELab\dashboard\data\worklog.json`（append-only） |
| 上下文交接 | `D:\AAA_Work\ALLELab\docs\team-handoff\` |
| 组织章程 | `D:\AAA_Work\ALLELab\docs\team\DSH-TEAM-ORG.md` |

**本 inbox 不替代上述任何机制**；它只负责"把架构团队对 Covenant 的需求/问题原话收进来"，再由 Covenant 侧归并排期。

## 2. 谁可以写、写什么

建议由 **架构质量组** 的 owner 角色追加（其余角色可选）：

| ALLELab 角色 | 建议提交内容 |
|---|---|
| `coursepack-architect` | 目标架构图范围、缺口、验收标准 |
| `arch-data-owner` / `arch-kg-owner` / `arch-generation-owner` / `arch-serve-owner` | 各自领域图的元素/关系/批注缺口 |
| `arch-evidence-verifier` | 证据不足、需补充 `path:line` 的问题 |
| `arch-context-steward` | 上下文/RAG/索引需求 |
| `reviewer` | 使用体验问题（只读视角） |

**只写新文件**：`YYYY-MM-DD-<role>-<slug>.md`，从 `../_TEMPLATE.md` 复制。
不要改别人的文件，不要改 Covenant 的 `requests.md` / `plan.md` / `decisions.md`。

## 3. 证据要求（沿用 ALLELab 纪律）

- 每条需求带 `path:line` 或可复现命令；不接受"感觉不行"；
- 读代码只读不写；单次排查 ≤15 文件 / ≤1200 行（ALLELab §2 片区分界）；
- 截图放 `D:\AAA_Work\ALLELab\.screenshots\` 或 `D:\AAA_Project\Covenant\dist\`，文件里写相对路径。

## 4. 跨工作区落盘方式（二选一）

1. **直接写**：`D:\AAA_Project\Covenant\todo\inbox\ALLELab\<file>.md`（若该路径对团队可写）；
2. **交接式**（若跨工作区写被限制）：文件先写到 `D:\AAA_Work\ALLELab\docs\team-handoff\covenant-requirements\`，由 Covenant Lead 定期搬入 inbox，并在文件头记 `moved-from`。

## 5. 试点项目的选择

见 [PROJECTS.md](PROJECTS.md)。默认推荐 **`coursepack-omp-main`**（架构质量组当前主战场，`docs/architecture/**` 已有分区 owner）。

## 6. 归并后

- todo-scribe 将 inbox 文件归并为 Covenant `requests.md` 的 R-xxx、`plan.md` 的 T-xxx；
- 原文件顶部加 `> 已归并：R-xxx / T-xxx（日期）`，不删除；
- 涉及需要 ALLELab 团队执行的部分，回写其 `dashboard/data/tasks.json` 由对应角色跟进（两套跟踪互不替代）。

## 7. 启动动作（现在）

1. 团队确认试点子目录（默认 `coursepack-omp-main`）；
2. 指定 2–3 名需求作者（建议 `coursepack-architect` + 一个 arch-owner + `arch-evidence-verifier`）；
3. 按模板追加第一批需求（见 [2026-11-03-pilot-kickoff.md](2026-11-03-pilot-kickoff.md) 的问题清单）。
