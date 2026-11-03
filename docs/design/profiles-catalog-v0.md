# 剖面注册表 v0（Profile Catalog）

> **用途**：把 [format-spec-v0.md](format-spec-v0.md) 的抽象三层结构落成**可实现的表**——每个剖面的词表、关系矩阵、必填属性、内置规则、布局与样式。M1 直接按本表实现，不再做设计讨论。
> **目标读者**：实现者（profile 包）、校验器作者、写图的 Agent。
> **状态**：提案 v0，核验于 2026-11-03。规则类型词表为**闭集**，新增需走扩展流程。
> **关联文档**：[format-spec-v0.md](format-spec-v0.md)（字段定义）、[diagram-taxonomy.md](diagram-taxonomy.md)（为何是这些图）、[glossary.md](../reference/glossary.md)。

---

## 1. 注册表总览

MVP 剖面 = 10 个绘图剖面 + 2 个非图一等对象（ADR、约束）。**实现顺序即交付顺序**。

| # | 剖面 | 回答的问题 | 元素 kinds | 关系 kinds | 默认布局 | 状态 |
|---|------|-----------|-----------|-----------|----------|------|
| 0 | `kernel@1` | 所有剖面的公共基线 | —（不直接使用） | — | — | 必选 |
| 1 | `c4-context@1` | 系统边界与外部 | person, software-system, external-system | uses | elk-LR | M1 |
| 2 | `c4-container@1` | 服务/存储划分 | person, container, datastore, queue, external-system | calls, reads, writes, publishes, subscribes | elk-LR | M1 |
| 3 | `c4-component@1` | 容器内部模块 | component, interface, container-ref | calls, implements, depends-on | elk-LR | M2 |
| 4 | `dfd@1` | 数据怎么流 | external-entity, process, data-store | flow, bidir-flow | elk-LR | M1 |
| 5 | `er@1` | 数据怎么存 | entity, attribute | has-attr, relates | elk-stress | M2 |
| 6 | `flowchart@1` | 处理步骤与分支 | start, end, process, decision, io, predefined, subprocess | flow | elk-TB | M1 |
| 7 | `sequence@1` | 交互时序 | actor, participant | message, return | sequencer | M2 |
| 8 | `state@1` | 状态与迁移 | initial, state, choice, final, composite | transition | elk-LR | M2 |
| 9 | `deployment@1` | 跑在哪 | node, artifact, datastore, external-system | communicates, calls | elk-TB | M2 |
| 10 | `graph@1` | 依赖/调用影响面 | module, package, file, function, external | imports, calls, depends-on | elk-stress | M3 |
| — | `decision@1`（非图） | 为什么这样决策 | ADR 文档 schema | — | — | M2 |
| — | `constraints`（内建） | 不变量 | 规则类型闭集（§6） | — | — | M1 |

> **注意**：`c4-context/container/component` 是**同一家族的不同缩放级别**，不是三种独立记法；共享元素族（person/container/datastore…）可跨文档 `imports`。
> **非图对象**：ADR 与约束不是"图"，但同样是一等契约，进入同一项目管理与校验。

---

## 2. 公共基线 `kernel@1`

所有剖面自动继承：

| 规则 | 内容 |
|------|------|
| ID 格式 | `e.<slug>` / `r.<slug>` / `f.<slug>` / `v.<slug>` / `k.<slug>`；`a.<ULID>`。`slug` = `^[a-z][a-z0-9-]{0,62}$` |
| 唯一性 | 文档内按前缀唯一；跨文档由 `imports` 命名空间隔离 |
| 必填 | element: `id/kind/name/summary`；relation: `id/kind/from/to/summary`；view: `id/title` |
| 批注 | `author` 由工具写入；`author: human:*` 不可被 AI 修改；`thread` 只追加 |
| 未知字段 | 非 `x-` 前缀 → L1 error（防拼写错误静默丢数据） |
| 扩展 | 字段 `x-<vendor>-*`；剖面 `x-<vendor>-<name>@<n>` |
| 时间 | ISO 8601 带时区；不参与渲染几何 |

---

## 3. C4 家族

### 3.1 `c4-context@1`

> **实现状态（2026-11-03）**：已注册；check 覆盖 software-system 唯一、外部系统无关系警告、上下文级禁 tech 警告。

**目的**：只表达"系统是什么、外部有谁、谁用它"。**不表达技术栈、不表达内部结构**。

| 元素 kind | 必填 props | 说明 |
|-----------|-----------|------|
| `person` | — | 角色/用户群 |
| `software-system` | `scope: in` | 本系统（文档内恰好 1 个） |
| `external-system` | — | 外部系统 |

**关系矩阵**

| kind | from → to | 语义 |
|------|-----------|------|
| `uses` | person → software-system / external-system | 人使用系统 |
| `uses` | software-system → external-system | 系统依赖外部 |
| `uses` | external-system → software-system | 外部调用本系统 |

**内置规则**
- `exactly-one-of-kind`：`software-system` 恰好 1 个（error）
- `no-rel`：`person → person` 禁止（error）
- `reachable-from`：每个外部系统至少 1 条关系（warning）
- `forbid-prop`：`software-system` 上出现 `tech`（warning，上下文图不标技术）

**布局**：elk，`direction: RIGHT`，`rank_gap: 140`（人或系统分层）

### 3.2 `c4-container@1`

**目的**：服务划分、数据归属、外部依赖。示例见 `examples/payments-arch.cvn.yaml`。

| 元素 kind | 必填 props | 说明 |
|-----------|-----------|------|
| `person` | — | 用户/角色 |
| `container` | `tech` | 可独立部署单元（服务/应用/BFF） |
| `datastore` | `tech`, `storage_kind: rdbms\|kv\|object\|search\|file` | 数据存储 |
| `queue` | `tech` | 消息/事件通道 |
| `external-system` | — | 外部系统 |

**关系矩阵**

| kind | from → to | 语义 |
|------|-----------|------|
| `calls` | person/container → container/external-system | 同步调用 |
| `reads` | container → datastore | 读 |
| `writes` | container → datastore/queue | 写（queues 仅允许 outbox 式写） |
| `publishes` | container → queue | 发布事件 |
| `subscribes` | container → queue | 订阅事件（方向统一指向 queue） |

**内置规则**
- `required-prop`：container/datastore/queue 必须有 `tech`（error）
- `implication`：`writes` 的目标 kind ∈ {datastore, queue}（error）
- `no-rel`：`datastore → datastore`、`queue → queue`（error）
- `reachable-from`：每个 datastore 至少被 1 条 reads/writes 命中（warning）
- `layer-order`（可选，文档自定义）：通常 `person < gateway < service < datastore`

**布局**：elk，`direction: RIGHT`，`rank_gap: 110`，`node_gap: 70`

### 3.3 `c4-component@1`

> **实现状态（2026-11-03）**：已注册；check 覆盖 component 必须带 parent、depends-on 无环、孤立组件警告。

**目的**：单个容器内部的组件与接口。示例：M2。

| 元素 kind | 必填 props | 说明 |
|-----------|-----------|------|
| `component` | `parent`（容器 id）, `tech`(可选) | 组件 |
| `interface` | — | 对外/对内接口 |
| `container-ref` | `ref`（外部容器 id） | 引用的其他容器 |

**关系矩阵**：`calls`（component→component/interface/container-ref）、`implements`（component→interface）、`depends-on`（任意→任意，弱依赖）

**内置规则**
- `required-parent`：`component.parent` 必须指向本文档的 container（error）
- `acyclic`：`depends-on` 禁止环（error）
- `reachable-from`：每个 component 至少被 1 条关系命中（warning）

**布局**：elk，`direction: RIGHT`

---

## 4. `dfd@1`（数据流图）

**目的**：数据从哪来、经过什么处理、存到哪。**不含控制流、不含时序**。示例见 `examples/order-dfd.cvn.yaml`。

**记法变体（必须显式声明，混用即歧义）**：`notation: demarco | gane-sarson`

| 元素 kind | 必填 props | 符号（demarco / gane-sarson） |
|-----------|-----------|------------------------------|
| `external-entity` | — | 矩形 / 矩形 |
| `process` | `number`（如 "1"） | 圆 / 圆角矩形 |
| `data-store` | `storage_kind` | 开放矩形 / 平行线 |

**关系矩阵**

| kind | from → to | 语义 |
|------|-----------|------|
| `flow` | external→process, process→external, process→data-store, data-store→process | 单向数据流 |
| `bidir-flow` | process ↔ external | 请求/响应（符号上为双向箭头） |

**内置规则**
- `no-direct-relation`：`process → process` 禁止直连（warning，DeMarco 要求经存储或分层）
- `data-store-reachable`：每个 data-store 至少有一条入边与一条出边（error）
- `required-prop`：process 名称必须是"动词+名词"（启发式：至少 2 个词，warning）
- `balanced-leveling`（v1，需要分层）：子图输入输出必须与父图边界一致

**布局**：elk，`direction: RIGHT`，`rank_gap: 100`

---

## 5. `er@1`（数据模型）

> **实现状态（2026-11-03）**：er@1 已注册到 packages/profile，支持 check（词表/矩阵/必填/3 条专有规则）；渲染未做 ER 专用样式（属性仍按矩形绘制）。

**目的**：实体、属性、主键、基数。**两种记法**：`notation: chen | crowfoot`

> **实现简化（已知取舍）**：v0 统一用"边 + cardinality"表达联系；Chen 记法的菱形联系在**渲染层**呈现为菱形节点，语义仍是边。这样避免两套模型。此取舍需在 M2 复核。

| 元素 kind | 必填 props |
|-----------|-----------|
| `entity` | `pk: [attrName...]`（至少 1） |
| `attribute` | `parent`（entity id）, `type` |

**关系矩阵**

| kind | from → to | 附加 props |
|------|-----------|-----------|
| `has-attr` | entity → attribute | — |
| `relates` | entity → entity | `cardinality: {from: 1\|N, to: 1\|N}`, `optional: bool` |

**内置规则**
- `required-prop`：entity 必须有 `pk`（error）
- `required-parent`：attribute 必须有 parent 且指向 entity（error）
- `cardinality-consistency`：`from: N → to: N` 必须标记为 `associative: true`（warning，提示需要关联实体）
- `unique-id`：同一 entity 下 attribute 名唯一（error）

**布局**：elk-stress（ER 是网状）；`direction` 忽略

---

## 6. `flowchart@1`（流程图 / ISO 5807）

> **实现状态（2026-11-03）**：已注册，check 覆盖 start 唯一 / end 无出边 / start 可达 / decision 分支数与分支标签；渲染支持 start-end 胶囊、decision 菱形、io 平行四边形；方向默认 DOWN。

**目的**：处理步骤、判断分支、循环。

| 元素 kind | 符号 | 必填 |
|-----------|------|------|
| `start` / `end` | 圆角矩形 | — |
| `process` | 矩形 | — |
| `decision` | 菱形 | `question` |
| `io` | 平行四边形 | — |
| `predefined` | 双竖线矩形 | `ref` |
| `subprocess` | 预定义过程 | `ref` |

**关系矩阵**：`flow`（任意 → 任意，除 `end` 为终点）

**内置规则**
- `exactly-one-of-kind`：`start` 恰好 1 个（error）
- `reachable-from`：所有节点从 start 可达（error）
- `no-outgoing`：`end` 无出边（error）
- `decision-branches`：decision 至少 2 条出边，且每条带 `label`（error）
- `label-required`：decision 出边必须标注（是/否）

**布局**：elk，`direction: DOWN`（自上而下）

---

## 7. `sequence@1`（序列图）

> **实现状态（2026-11-03）**：专用 sequencer 布局（参与者列 + 消息行 + 生命线）；check 覆盖端点类型、return 配对/顺序/方向、sync 缺 return 警告；渲染区分 sync（实线）/reply（虚线）/async。

**目的**：一次交互中谁调谁、顺序、同步/异步。

| 元素 kind | 必填 |
|-----------|------|
| `actor` | `name` |
| `participant` | `name`, `tech`(可选) |

**关系 kinds**：`message`（`order` 由数组顺序隐式决定；`kind: sync\|async\|reply`）、`return`（与某条 sync 配对）

**内置规则**
- `endpoint-exists`：from/to 必须是本文档 participant/actor（error）
- `order-consistency`：`return` 必须在其对应 sync 之后（error）
- `reply-pairing`：每个 sync 建议有 return（warning）
- `no-self-return`：return 不得跨参与者反序（error）

**布局**：**专用 sequencer**（非 ELK）：x = 参与者顺序，y = 消息序号；支持 `activate/deactivate` 生命线（v1）

---

## 8. `state@1`（状态机）

> **实现状态（2026-11-03）**：已注册；check 覆盖 initial 唯一、final 无出边、可达性（含可达 final）、(from,trigger,guard) 冲突、composite 子状态 initial；initial/final 渲染为胶囊。

**目的**：状态、事件、非法迁移。

| 元素 kind | 必填 |
|-----------|------|
| `initial` / `final` | — |
| `state` | `name` |
| `choice` | — |
| `composite` | `name`, `regions`(可选) |

**关系**：`transition`（`trigger`、`guard`、`action` 均可选；`from`/`to`）

**内置规则**
- `exactly-one-of-kind`：每个 region 恰好 1 个 `initial`（error）
- `no-outgoing`：`final` 无出边（error）
- `reachable-from`：所有 state 从 initial 可达、且可达某个 final（warning）
- `transition-conflict`：同一 `(from, trigger, guard)` 不得有两条不同目标（error）
- `composite-initial`：composite 必须有 initial（error）

**布局**：elk，`direction: RIGHT`

---

## 9. `deployment@1`（部署）

> **实现状态（2026-11-03）**：已注册；check 覆盖 artifact/datastore 的 node 父级、跨环境 calls 警告、空节点警告；parent 参与布局分层，渲染在 meta 行显示 @节点名。

**目的**：节点、运行环境、制品落位、节点间链路。

| 元素 kind | 必填 |
|-----------|------|
| `node` | `env: dev\|stage\|prod`, `os`(可选) |
| `artifact` | `parent`（node id）, `tech` |
| `datastore` | `parent`（node id）, `storage_kind` |
| `external-system` | — |

**关系**：`communicates`（node ↔ node，带 `protocol`、`network`）、`calls`（artifact → artifact）

**内置规则**
- `required-parent`：artifact/datastore 必须有 node parent（error）
- `no-cross-env-call`：`calls` 跨 env 直接调用（warning，提示需网关）
- `node-must-have-artifact`：node 若无 artifact/datastore（warning）

**布局**：elk，`direction: DOWN`（节点在上、制品在内）

---

## 10. `graph@1`（依赖 / 调用图）

> **实现状态（2026-11-03）**：已注册；check 覆盖 module/package/file/function 必须有 path、imports 成环警告（可用根部 x-allow-cycles: true 关闭）。

**目的**：代码级影响面、分层违规。通常由代码派生（M3 导入器），也可手写。

| 元素 kind | 必填 |
|-----------|------|
| `module` / `package` / `file` / `function` | `path`（模块路径/文件） |
| `external` | `name` |

**关系**：`imports`、`calls`、`depends-on`

**内置规则**
- `acyclic`（默认开启）：`imports` 禁止环（warning，可用 `allow_cycles: true` 关闭）
- `required-prop`：module 必须有 `path`（error）
- `forbid-import`（文档自定义）：如 `ui/**` 不得 import `infra/**`

**布局**：elk-stress（大图）或 `dagre`（分层）

---

## 11. 非图一等对象

### 11.1 `decision@1`（ADR）

> **实现状态（2026-11-03）**：已实现 `@covenant/adr` + `covenant adr`：front-matter 校验、文件名编号一致、supersedes 链与目标存在性；真实 ADR 见 `docs/design/adr/`。accepted ADR 必须被文档 `links.kind=adr` 引用，已由 `covenant adr` 跨仓库校验。

不是图，但同属契约。文件：`adr/NNNN-<slug>.md`，头部 front-matter：

```yaml
adr: 0007
title: 采用 Outbox 模式替代跨库同步事务
status: accepted          # proposed | accepted | superseded | rejected
date: 2026-11-03
deciders: [human:lily]
supersedes: []
related: [a.01JAX9K3Q7P2, e.payments]
```

**规则**：`accepted` 的 ADR 必须至少被 1 条 `links.kind=adr` 引用（warning）；被 supersede 的必须写 `supersedes` 链（error）。

### 11.2 约束（内建，无剖面）

直接写在文档 `constraints:`，规则类型见 §12。

---

## 12. 规则类型词表（闭集 v0）

校验器只需实现这 **12** 个字面量（下表共 12 行，`no-outgoing` / `no-incoming` 分列）；自定义规则走 `x-` 扩展或 M5 的 `expr`。

| type | 参数 | 语义 |
|------|------|------|
| `acyclic` | `on: {kind: relation, kinds}` | 指定关系类型无环 |
| `no-direct-relation` | `on: {from_kind, to_kind, relation_kind?}` | 禁止某类元素直连 |
| `implication` | `if`, `then` | 条件成立则必须满足结论 |
| `layer-order` | `layers: [[kind\|id...]...]`, `forbid_backward` | 层级顺序，禁止反向依赖 |
| `exactly-one-of-kind` | `kind`, `scope: document\|view` | 某 kind 恰好一个 |
| `reachable-from` | `from: kind`, `direction: forward\|backward` | 可达性 |
| `required-prop` | `kind`, `props: [name...]` | 必填属性 |
| `required-parent` | `kind`, `parent_kind` | 必须有指定类型的父容器 |
| `no-outgoing` / `no-incoming` | `kind` | 终点/起点约束 |
| `data-store-reachable` | `on: {kind: data-store}` | 存储必须可读可写 |
| `code-binding-resolves` | `on: {element}` | `links.kind=code` 可解析（L5） |

**Finding 稳定性**：同一文档的 finding 必须按 `(level, code, element_id, path)` 排序输出，保证可比对。

**闭集 v0 的已知表达力缺口**（诚实记录，避免示例写出无法校验的规则）：

| 缺口 | 例子 | 计划 |
|------|------|------|
| 信任边界穿越 | "跨 `f.trusted` 的 flow 必须标 `network: untrusted`" | v1：引入 `expr` 谓词（CEL 子集） |
| 跨视图一致性 | "上下文图里的系统必须出现在容器图" | v1：L4 跨文档规则 |
| 度量型约束 | "p99 < 200ms" 无法从图推出 | 永不校验；只作为 `constraints` 文本 + 外部指标锚点 |
| 按 id 限定作用域 | `no-direct-relation` 只支持 kind 级，不支持 `from_id` | v1，按需 |

> 规则：**示例文件不得使用闭集外的规则类型**；需要表达时，先扩展本表并升版本号。

---

## 12.1 `fix_hint` 模板（GAP-04 关闭）

> M1 验收要求：每条 finding 必须带可执行的 `fix_hint`，否则 AI 只能猜、闭环退化。
> `auto_fixable: true` 仅限**不改变语义**的修复（补必填、删失效链接）；应用前必须 dry-run 展示语义 diff。

| # | type | finding code | `fix_hint` 模板 | auto_fixable |
|:-:|------|--------------|-----------------|:---:|
| 1 | `acyclic` | `rule/cycle` | 检测到环 `{cycle}`。移除其中一条依赖，或引入中间层（interface/adapter）打断；候选边：`{edges}` | ❌ |
| 2 | `no-direct-relation` | `rule/forbidden-direct` | `{from}` → `{to}` 不允许直接 `{relation_kind}`。改为经 `{suggested_kind}` 中转 | ❌ |
| 3 | `implication` | `rule/implication-failed` | 条件 `{trigger}` 成立，则必须 `{requirement}`；当前为 `{actual}` | 视 `then` 而定 |
| 4 | `layer-order` | `rule/layer-violation` | 边 `{edge_id}` 从 `{from_layer}` 指向 `{to_layer}`，违反分层；应反向，或经 `{allowed_mediator}` | ❌ |
| 5 | `exactly-one-of-kind` | `rule/exact-cardinality` | 本文档 `{kind}` 有 `{count}` 个，应为 1。保留 `{candidate_keep}`，其余合并或删除 | ❌ |
| 6 | `reachable-from` | `rule/unreachable` | `{node}` 从 `{root}` 不可达。补一条 `{suggested_relation}`，或删除该孤立元素 | ❌ |
| 7 | `required-prop` | `rule/missing-prop` | `{element}` 缺少 `{prop}`（`{profile}` 必填）。示例值：`{example}` | ✅ 补空模板值 |
| 8 | `required-parent` | `rule/orphan` | `{element}` 缺少 parent（应为 `{parent_kind}`）。补 `parent: {candidate_parent}` 或移入容器 | ✅ 若唯一候选 |
| 9 | `no-outgoing` | `rule/unexpected-outgoing` | `{element}`（`{kind}`）不应有出边。删除边 `{edge_id}` | ✅ |
| 10 | `no-incoming` | `rule/unexpected-incoming` | 同 9，方向相反 | ✅ |
| 11 | `data-store-reachable` | `rule/store-unreachable` | 存储 `{store}` 缺少 `{missing}` 侧数据流。补一条 `{suggested_flow}` | ❌ |
| 12 | `code-binding-resolves` | `code/binding-missing` | 锚点 `{anchor}` 无法解析（文件或符号不存在）。更新路径，或移除该 link | ✅ 仅移除失效 link |

**finding 字段要求**（对应 `format-spec §7`）：`code / level / severity / element_id / message / fix_hint / auto_fixable`。
`message` 给人看，`fix_hint` 给 AI 照着做——两者都必须包含**具体 id**，不得出现"请检查配置"这类空话。

---

## 13. 剖面扩展规则（新增第 N+1 种图）

1. 新建 `profiles/<name>@1.yaml`，`extends: kernel@1`。
2. 声明 `vocabulary`（元素/关系 kind）、`required`、`relation_matrix`、`rules`（只能引用 §12 的闭集或 `x-` 扩展）。
3. 提供 1 正 1 反示例文档，入 `tests/profiles/<name>/`。
4. 在本文档 §1 注册表**登记**（日期/剖面/用途/维护者）。
5. 不需要改内核；若必须改内核 → 说明内核抽象有缺陷，需评审。

---

## 14. 实现顺序与验收

| 步 | 剖面 | 验收 |
|----|------|------|
| 1 | `kernel@1` + 规则引擎 | 正反例全过；finding 顺序稳定 |
| 2 | `c4-container@1` | `examples/payments-arch.cvn.yaml` 全过 |
| 3 | `dfd@1` | `examples/order-dfd.cvn.yaml` 全过（含记法变体校验） |
| 4 | `er@1` + `flowchart@1` | 各 1 正 1 反 |
| 5 | `c4-context/component`、`state` | 同上 |
| 6 | `sequence`（需专用布局） | 渲染验收 |
| 7 | `deployment`、`graph` | 同上 |

**Definition of Done（每个剖面）**：词表实现 + 关系矩阵校验 + ≥3 条内置规则 + 正反例测试 + 黄金 SVG（M2 起）。
