# docs/conventions/ — 契约性规范

> **用途**：存放人机都必须遵守的**契约性规则**（怎么放文件、怎么管文档、怎么改规范）。与 `docs/design/` 的区别：design 说"为什么这样设计"，conventions 说"你必须怎么做"。
> **目标读者**：人 + AI Agent。
> **状态**：生效中（核验于 2026-11-03）；随项目变更需走元规则。
> **关联**：[../../AGENT.md](../../AGENT.md)（接入指南）、[../README.md](../README.md)（文档索引）。

## 何时读哪份

| 你要做的事 | 读这份 |
|-----------|--------|
| 创建 / 移动 / 删除任何文件 | [directory-organization.md](directory-organization.md) | 目录组织契约（文件放哪、命名、边界） |
| 新增模块 / 团队协作 / 索引维护 | [agent-team-development.md](agent-team-development.md) |
| 模块该多大、谁来负责？ | [module-ownership.md](module-ownership.md) | 粒度阈值 / 目录契约 / owner 编制 / 拆分信号 | 索引优先的模块化 Agent 协同开发范式（ADR-0003） |
| 新增 / 移动 / 删除文档、改索引 | [docs-management.md](docs-management.md) |
| 制定 / 修改**任何规范**（含本目录） | [meta-rules.md](meta-rules.md) |

## 待补充（不提前写）

以下规范**等对应产物出现后**再写，避免"为不存在的东西定规矩"：

| 规范 | 触发条件 |
|------|----------|
| `version.md` | M1 建 `src/` 后有版本事实源文件 |
| `logging.md` | M1 有第一个日志出口 |
| `naming.md` | M1 有第一段真实代码（当前命名规则暂并入本节下方） |

## 当前命名底线（临时）

- 文件名：kebab-case 英文语义（中文文件名先转英文）。
- 代码标识符 / 提交信息：英文；文档正文、注释：中文。
- 图内 `name`：中英均可，同一张图内保持一致。
