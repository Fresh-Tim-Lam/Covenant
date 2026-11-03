# docs/ — 文档中心

> **用途**：Covenant 的文档总索引。任何文档只能落在下表的唯一位置，新增/移动必须同步本表。
> **目标读者**：项目负责人（人）与 AI Agent。
> **关联文档**：[README.md](../README.md)（项目总览）；[conventions/docs-management.md](conventions/docs-management.md)（本目录的维护规则）；[design/open-questions.md](design/open-questions.md)（决策记录）。

## 子目录职责

> 按 [conventions/docs-management.md](conventions/docs-management.md) §5：索引**不写硬计数**（必然过期），文件清单见下。

| 目录 | 职责 | 状态 |
|------|------|------|
| `research/` | 外部调研与对标（市面项目、标准、论文） | 见下 |
| `design/` | 设计提案、格式规范、引擎架构、决策记录 | 见下 |
| `prompts/` | 可复制到其他项目的范式与提示词模板 | 见下 |
| `conventions/` | 契约性规范（目录、文档、元规则） | 见下 |
| `guides/` | 操作指引（how-to） | 待 M1 |
| `reference/` | 参考说明（术语表、硬约束） | 见下 |
| `sessions/` | 历史对话/交接记录 | 空 |
| `example/` | 示例图与测试语料 | 暂由仓库根 `examples/` 承担 |
| `tmp/` | 少量诊断记录 | 空 |

## 当前文档清单

### research/

- [landscape-2026-11.md](research/landscape-2026-11.md) —— 市面同类工作与开源项目全景调研 + 差距分析。

### design/

- [diagram-taxonomy.md](design/diagram-taxonomy.md) —— 软件工程图示类型全景分类、核心集、以及"为什么穷举必错"。
- [format-spec-v0.md](design/format-spec-v0.md) —— `.cvn` 文件格式 v0 提案（三层 schema、内核字段、剖面、校验、批注）。
- [profiles-catalog-v0.md](design/profiles-catalog-v0.md) —— **10 个剖面的实现级定义**（词表/关系矩阵/必填/规则/布局）+ 规则类型闭集；M1 直接照此实现。
- [engine-architecture-v0.md](design/engine-architecture-v0.md) —— 渲染引擎架构 v0（分层、管线、确定性、测试、互操作）。
- [interaction-and-ai-loop.md](design/interaction-and-ai-loop.md) —— "打开本地 HTML → 标注 → AI 读懂 → 改图/开发"的交互模型、写回通道与 AI 契约。
- [ai-trust-boundary.md](design/ai-trust-boundary.md) —— 信任分级、prompt 注入威胁模型、补丁门禁与红队验收用例。
- [walkthrough-golden-path.md](design/walkthrough-golden-path.md) —— 端到端黄金路径（含精确输出契约），M1/M3 验收依据。
- [self-hosting-bootstrap.md](design/self-hosting-bootstrap.md) —— 自举三段式、扩展顺序、停止条件、防自嗨规则；据此把 M1 改为纵向切片。
- [gate-spec-v0.md](design/gate-spec-v0.md) —— 把规范 §9 变成可执行门禁：检查项、命令、退出码、豁免机制、**门禁自身的防假通过断言**。
- [discoverability.md](design/discoverability.md) —— 陌生 Agent 如何读懂 `.cvn`：文件自描述 / 仓库入口 / CLI·MCP·Skill 三层可发现性。
- [open-questions.md](design/open-questions.md) —— 决策记录 D1–D4 / Q5–Q10（全部已定）+ 反方论证。

### conventions/

- [README.md](conventions/README.md) —— 规范索引与"何时读哪份"。
- [directory-organization.md](conventions/directory-organization.md) —— 顶层目录职责、临时文件铁律、落位决策流程。
- [docs-management.md](conventions/docs-management.md) —— docs 子目录、命名、头部三要素、单一事实源、索引维护。
- [meta-rules.md](conventions/meta-rules.md) —— 如何制定/修改规范本身（结论落盘、状态标记、只写可判定规则）。

### reference/

- [glossary.md](reference/glossary.md) —— 术语表（文档/剖面/批注/补丁/语义 diff 等），人机共用。
- [hard-constraints.md](reference/hard-constraints.md) —— 12 条硬约束（H1–H12）与违反分级；任何实现与 AI 行为都不得违反。

### prompts/

- [README.md](prompts/README.md) —— 范式 MD 编写决策（P1–P6）与两份文档的结构说明。
- [paradigm-declaration-v2.md](prompts/paradigm-declaration-v2.md) —— **范式宣言 v2（可复制）**：三契约、代价、不适用场景、失败模式。
- [paradigm-spec-v2.md](prompts/paradigm-spec-v2.md) —— **范式规范 v2（可校验）**：目录/索引/图示三契约细则、判定编号（D/I/G/P）、0→1 流程、自检清单、5 个附录模板。

### 本目录根文件

- `README.md`（本文件）—— 总索引。
- [to-dolist.md](to-dolist.md) —— 活跃待办（含 M1–M5 清单）。

### 仓库其他契约目录

- [../schema/README.md](../schema/README.md) —— 机器可校验的 JSON Schema（L1 契约），M1 由 `@covenant/core` 直接引用。
- `../examples/` —— 示例 `.cvn` 契约图（C4 / DFD / 自举）。

## 文档书写约定（临时，待 conventions 定稿后迁入）

1. 文件名 kebab-case 英文语义。
2. 每份文档前 1–3 行必须有 `用途 / 目标读者 / 关联文档` 三要素。
3. 设计/规范类文档标注 `状态` 与 `核验日期`。
4. 同一知识只维护一份权威源，其他位置只放指针或标注来源的摘要。
5. 新增/移动文档必须同步本索引。
