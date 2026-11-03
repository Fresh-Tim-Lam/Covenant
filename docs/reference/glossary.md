# 术语表（Glossary）

> **用途**：统一 Covenant 的核心术语，避免人机协作时"同一个词指两件事"。
> **目标读者**：人 + AI Agent（读任何设计文档前先看这里）。
> **状态**：随格式 v0 维护；格式冻结时同步冻结。
> **关联文档**：[format-spec-v0.md](../design/format-spec-v0.md)、[diagram-taxonomy.md](../design/diagram-taxonomy.md)。

## A. 文档与结构

| 术语 | 英文 | 定义 | 易混 |
|------|------|------|------|
| **契约图** | covenant / document | 一个 `.cvn` 文件：一组元素定义 + 视图 + 批注 + 规则 | 不等于"一张图" |
| **元素** | element | 图上的有语义对象（服务、存储、外部系统、处理过程…），有稳定 `id` | 不叫"框/节点"（那是渲染结果） |
| **关系** | relation | 元素之间的有向连接，类型来自剖面关系矩阵 | 不叫"箭头" |
| **Frame** | frame | 容器：系统边界、信任边界、泳道、部署分区 | 不是普通元素 |
| **端口** | port | 元素上可被连接的锚点（组件图/部署图需要） | — |
| **视图** | view | 从同一份元素定义投影出的可渲染子集 + 布局 + 呈现设置 | **不是**独立文件 |
| **项目清单** | project manifest | `covenant.yaml`：列出文档、共享定义、剖面、代码根 | — |
| **共享定义** | shared definitions | 被多个文档 `imports` 的元素定义（单一事实源） | — |

## B. 语义与校验

| 术语 | 英文 | 定义 |
|------|------|------|
| **内核** | kernel | Tier-0 通用图模型（元素/关系/批注/约束/视图），与记法无关 |
| **剖面** | profile | Tier-1 记法定义：词表、关系矩阵、必填属性、校验规则、样式、布局默认 |
| **记法变体** | notation variant | 同一剖面的不同符号体系（如 DFD 的 `demarco` / `gane-sarson`），**必须显式声明** |
| **关系矩阵** | relation matrix | 剖面里"哪种元素能连到哪种元素"的约束表——消歧义核心 |
| **规则** | constraint / rule | 文档级可执行检查（如 `acyclic`、`layer-order`），有封闭规则类型词表 |
| **Finding** | finding | 校验产出的一条问题：`{code, level, severity, element_id, message, fix_hint}` |
| **校验分级** | validation level | L0 parse / L1 schema / L2 kernel / L3 profile / L4 cross-doc / L5 code / L6 fitness |
| **代码绑定** | code binding | 元素 `links.kind=code` 指向源码路径/符号，可被 L5 校验 |
| **适应度函数** | fitness function | 架构约束的可执行测试（L6），如"web 层不得直接依赖 store 层" |
| **锚点** | anchor | 元素/批注指向外部对象（代码/ADR/Issue/文档/URL/指标）的链接 |

## C. 批注与协作

| 术语 | 英文 | 定义 | 关键约束 |
|------|------|------|----------|
| **批注** | annotation | 钉在元素/关系/视图/区域/文档上的结构化问题记录 | 一等公民，可 diff、可导出 |
| **线程** | thread | 批注下的追加式讨论 | **只追加，不覆盖** |
| **AI 指令** | `ai_hint` | 人写给 AI 的祈使句约束（"优先 X；禁止 Y"） | 是唯一被当作**指令**消费的字段 |
| **严重度** | severity | blocker / high / medium / low | 与"类型"正交 |
| **批注类型** | annotation type | risk / question / decision / todo / defect / smell | 决定终态（question→回答；decision→ADR） |
| **状态** | status | open / ack / resolved / wontfix / superseded | 变更写 `resolution`，不删历史 |
| **决策记录** | ADR | 架构决策记录（Markdown） | 批注的终态之一，双向 `links` |

## D. AI 与变更

| 术语 | 英文 | 定义 |
|------|------|------|
| **AI 投影** | projection | 面向 AI 的语义压缩输出，三种：`digest` / `context` / `spatial` |
| **摘要投影** | digest | 每元素约 10 token 的全局摘要（元素+关系+未决批注+规则） |
| **任务上下文** | context | 按任务裁剪的子图 + 相关约束 + 相关批注，受 token 预算约束 |
| **空间投影** | spatial | 坐标表 + 邻接表，用于排查布局/重叠问题 |
| **补丁** | patch | 对文档模型的 RFC 6902 JSON Patch + `intent` + `base_rev` |
| **语义 diff** | semantic diff | 按语义而非文本比较两版文档，分 `cosmetic` / `material` / `breaking` |
| **外观变更** | cosmetic | 移动/换色/改主题——可自动通过 |
| **实质变更** | material | 增删元素、改关系、改属性——需人看 |
| **破坏性变更** | breaking | 删除仍有入边引用的元素等——**必须人工批准** |
| **批准** | approval | 人对 material/breaking 变更的显式确认，记入审计 |

## E. 版本与生命周期

| 术语 | 英文 | 定义 |
|------|------|------|
| **规范版本** | spec version | `covenant: 0.1`，主版本兼容 |
| **剖面版本** | profile version | `c4-container@1`，主版本变更即破坏性 |
| **文档修订** | rev | 语义变更 +1；外观变更不变 |
| **冻结** | frozen | `meta.status: frozen`，material/breaking 需 owner 批准 |
| **ULID** | ULID | 时间有序的全局唯一 ID，用于批注（离线并发合并友好） |
| **单一事实源** | single source of truth | 同一知识只有一处权威定义，其他地方只放指针 |

## F. 与 AOCI 的映射（便于复用既有索引体系）

| AOCI FRAS | Covenant 对应 |
|-----------|---------------|
| F（File 职责） | `meta.purpose` + 元素 `summary` |
| R（必读依赖） | `relations` 中 `calls/reads` 的出边 |
| A（上层调用者） | `relations` 的入边 |
| S（隐性约束） | `constraints:` + 批注的 `ai_hint` |

> 也就是说：**一个 `.cvn` 天然就是一张可读的 FRAS 索引图**，不需要另建一套。
