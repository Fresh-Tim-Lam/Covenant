# `.cvn` 格式规范 v0（提案）

> **用途**：定义 Covenant 的权威文件格式——语义图如何被表达、校验、投影为画面、被人批注、被 AI 读写。
> **目标读者**：实现者（引擎/CLI/MCP）、写图的人、写图的 Agent。
> **状态**：提案 v0（未冻结）。字段可能调整；`covenant: 0.1` 为草案版本号。
> **关联文档**：[diagram-taxonomy.md](diagram-taxonomy.md)（剖面来源）；[engine-architecture-v0.md](engine-architecture-v0.md)（如何渲染）。

---

## 1. 十条设计公理

| # | 公理 | 后果 |
|---|------|------|
| A1 | **语义 ≠ 画面** | 坐标、颜色、手绘笔迹都是投影，可从语义重算 |
| A2 | **一切皆有稳定 ID** | 元素/关系/批注/约束都可被引用、被 diff、被 AI 定位 |
| A3 | **文本优先、可 diff、可合并** | YAML canonical，禁止二进制混入语义层 |
| A4 | **单一事实源** | 元素只定义一次，视图只引用；跨文档用 `imports` |
| A5 | **剖面锁定语义** | `kind` 来自剖面词表；未知 `kind` 是错误而非静默忽略 |
| A6 | **校优先于画** | 校验器是一等组件，渲染器可替换 |
| A7 | **批注一等公民** | 批注是结构化数据（目标/类型/严重度/状态/AI 提示），不是聊天气泡 |
| A8 | **AI 只能提交可校验补丁** | 全量重写禁止；补丁带意图与前置条件，经校验与语义 diff 后由人批准 |
| A9 | **确定性渲染** | 同输入 + 同布局引擎版本 = 同输出，可黄金测试 |
| A10 | **开放扩展** | `x-` 前缀扩展字段与剖面，不破坏兼容 |

---

## 2. 三层 Schema

```
Tier-0 内核 kernel@1        节点 / 关系 / 容器 / 批注 / 约束 / 视图 / 链接      —— 与记法无关，极稳定
Tier-1 剖面 profile@n       词表(kind) + 关系矩阵 + 必填属性 + 校验规则 + 样式  —— 可增，不改进内核
Tier-2 文档 *.cvn           实例：elements / relations / views / annotations
```

对应 OMG 的 MOF 四层（M3 元元模型 / M2 元模型 / M1 模型 / M0 实例）——**UML 能覆盖 14 种图，靠的就是这层结构，而不是图表清单。**

---

## 3. 项目与文件布局

> **扩展名决定（Q10，2026-11-03，已执行）**：语义文件采用 **`<name>.cvn.yaml`** 双后缀——主流工具认 `.yaml`（语法高亮/补全），`.cvn` 标记语义类型。下文为书写方便仍简写为 `.cvn`，实现与示例一律用 `.cvn.yaml`。
> **迁移**：3 个示例已改名，全仓引用已同步（2026-11-03）。

> **YAML 解析口径（GAP-03 已关闭，2026-11-03）**：
> 1. 解析器使用 YAML 1.2 **CORE_SCHEMA**——`DEFAULT_SCHEMA` 会把 ISO 时间戳解析成 `Date` 对象，导致 schema 的 `type: string` 失败；
> 2. **版本字段必须加引号**：`covenant: "0.1"`（不引号会被解析成数字 `0.1`）；
> 3. 时间字段一律写成带时区的 `date-time`（如 `2026-11-03T00:00:00+08:00`），`2026-11-03` 这种纯日期不通过 L1；
> 4. 禁止 YAML 锚点/别名（L0 直接报错）。

单文件也能用；推荐项目目录（多图共享定义、可整体校验）：

```
arch/                          # 架构契约目录（建议与 src/ 同仓）
├─ covenant.yaml               # 项目清单（唯一入口）
├─ views/
│  ├─ 01-context.cvn
│  ├─ 02-containers.cvn
│  └─ 03-data-flow.cvn
├─ shared/
│  └─ services.cvn             # 共享元素定义（被 import）
├─ adr/
│  └─ 0007-outbox.md
└─ .cvn-cache/                 # 渲染缓存/索引（gitignore，可再生产物）
```

`covenant.yaml`：

```yaml
covenant: 0.1
project: payments-platform
roots: { code: ../repos/payments }
profiles: [c4-context@1, c4-container@1, dfd@1, er@1, sequence@1, deployment@1]
documents:
  - views/01-context.cvn
  - views/02-containers.cvn
  - views/03-data-flow.cvn
adr_dir: adr
```

---

## 4. 文档骨架（完整示例见 `examples/`）

```yaml
covenant: 0.1                       # 规范版本（必填）
id: payments/containers             # 文档身份，命名空间路径（必填，全局唯一）
profile: c4-container@1             # 默认剖面（必填）

meta:
  title: 支付平台容器视图
  purpose: |                        # 必填：这张图回答什么问题
    说明支付域的服务划分、数据归属与外部依赖。
  non_goals: [部署细节, 时序细节]    # 推荐：明确"不表达什么"，消除 AI 过度推断
  audience: [human, ai]
  status: draft                     # draft | review | frozen | deprecated
  rev: 3
  owners: [human:lily]
  updated: 2026-11-03
  ai:
    summary: |                      # 供 AI 快速定位的 1-3 句摘要
      支付编排由 payments 服务承担，账本独立存储，对账走异步 outbox。
    budget_tokens: 1200             # digest 的预算提示

imports:
  - from: ../shared/services.cvn
    select: [elements]              # 只导入定义，不导入视图

elements:                           # 元素定义（本文件权威）
  - id: e.payments
    kind: container                 # 来自剖面词表
    name: Payments Service
    tech: Kotlin / Spring
    summary: 支付授权、捕获、退款编排
    tags: [critical, pii]
    props: { scaling: horizontal, replicas: 3 }
    constraints:
      - id: c.p99
        text: 授权接口 p99 < 200ms
        kind: metric                  # metric | manual | test
        ref: dashboards/payments-auth
    links:
      - { kind: code, ref: "pay/*/PaymentService.kt#capture" }
      - { kind: adr, ref: adr/0007-outbox.md }

relations:                          # 关系（有向，可带端口）
  - id: r.pay-ledger
    kind: writes                    # 来自剖面的关系矩阵
    from: e.payments
    to: e.ledger
    summary: 记账写入（outbox 异步）
    props: { protocol: postgres, sync: false, retries: 5 }
    constraints:
      - id: c.no-2pc
        text: 禁止两阶段提交
        kind: manual

views:                              # 可渲染投影（同一元素可出现在多视图）
  - id: v.main
    title: 容器视图
    include: { elements: [e.*], relations: [r.*] }
    exclude: { tags: [internal-only] }
    layout:
      engine: elk                   # elk | dagre | none
      direction: RIGHT
      spacing: { rank: 90, node: 60 }
      pins: { e.payments: [320, 160] }   # 人工微调（唯一进入语义层的坐标）
    present:
      notation: c4
      theme: covenant-light
      annotations: { status: [open], severity: [high, medium] }
      node_style: junction        # box（默认框）| junction（点+线；交叉画跳线弧）

annotations:                        # 一等公民：人的问题记录
  - id: a.01JAX9K3Q7
    target: { kind: relation, id: r.pay-ledger }
    type: risk                      # risk|question|decision|todo|defect|smell
    severity: high
    title: 跨库事务隐患
    body: |
      账本与支付库分属不同实例，当前实现依赖本地事务 + 补偿任务；
      补偿失败会丢失对账数据。
    status: open                    # open|ack|resolved|wontfix|superseded
    author: human:lily
    created: 2026-11-03T10:12:00+08:00
    links: [ { kind: adr, ref: adr/0007-outbox.md } ]
    ai_hint: 优先 outbox；禁止引入两阶段提交；改动需保持幂等
    thread:
      - { author: ai:claude, at: 2026-11-03T10:20:00+08:00, text: 已核对 outbox 方案，见 ADR-0007 §3 }

constraints:                        # 机器可校验的文档级规则（封闭规则类型）
  - id: k.no-cycle
    type: acyclic
    on: { kind: relation, kinds: [writes, reads] }
    severity: error
  - id: k.store-only
    type: implication
    if:   { kind: relation, kind_is: writes }
    then: { target_element_kind_in: [datastore, queue] }
    severity: error
  - id: k.layering
    type: layer-order
    layers: [[web], [service], [datastore]]   # 层成员可以是 element kind，也可以是显式 id 列表（如 [[e.web], [e.gateway]]）
    forbid_backward: true
    severity: error
```

---

## 5. 内核字段表

### 5.1 Element（节点）

| 字段 | 必填 | 说明 |
|------|:---:|------|
| `id` | ✓ | 命名空间 slug：`e.<name>`，文档内唯一，永不复用 |
| `kind` | ✓ | 剖面词表中的元素类型 |
| `name` | ✓ | 人读名称 |
| `summary` | ✓ | 一句话职责（AI 主入口） |
| `tech` / `props` | | 技术栈与剖面自定义属性（受剖面 schema 约束） |
| `constraints[]` | | 元素级不变量（`id/text/kind/ref`） |
| `links[]` | | 外部锚点：`code` / `adr` / `issue` / `doc` / `url` / `metric` |
| `tags[]` | | 过滤与规则用 |
| `parent` | | 所属容器（层级图/组合结构） |
| `ports[]` | | 端口（组件/部署/硬件图需要） |
| `x-*` | | 扩展字段 |

### 5.2 Relation（边）

| 字段 | 必填 | 说明 |
|------|:---:|------|
| `id` | ✓ | `r.<name>` |
| `kind` | ✓ | 剖面关系矩阵中的类型（`reads/writes/calls/streams/...`） |
| `from` / `to` | ✓ | 元素 id，或 `e.x:port.y` 形式 |
| `summary` | ✓ | 这条关系做什么（AI 主入口） |
| `props` | | `protocol / sync / retries / payload ...` |
| `constraints[]` | | 关系级不变量 |
| `routing` | | `orthogonal | bezier | straight`（视觉层偏好） |
| `waypoints` | | 人工折点（唯一进入语义层的路径数据） |

### 5.3 Group / Frame（容器、泳道、边界、分区）

用 `elements` 上的 `kind: frame` + `parent` 表达，或独立 `frames:` 块。用于：系统边界、信任边界（threat 剖面）、泳道、部署分区。

### 5.4 Annotation（批注，见 §8）

### 5.5 Constraint（文档级规则，见 §7）

### 5.6 View（视图）

| 字段 | 说明 |
|------|------|
| `id` / `title` | 视图身份与标题 |
| `profile` | 可覆盖文档默认剖面（多剖面文档） |
| `include` / `exclude` | 选择器：`e.*`、`tag:critical`、显式 id 列表 |
| `layout` | `engine` / `direction` / `spacing` / `pins` |
| `present` | 记法、主题、批注过滤、编号开关、节点风格（`node_style`） |
| `layout.pins` / 路由 | 端口按侧分配（每边独立接入点、最小间距 16px、不足时扩框）；pins 人工坐标优先 |
| `canvas` | 可选的自由层：`ink`（笔迹引用）、`embeds`（图片/嵌入）、`viewport` |

---

## 6. 剖面定义（Tier-1）

剖面本身也是文件（可放在仓库 `profiles/` 或内置）：

```yaml
profile: dfd@1
extends: kernel@1
notation:                          # 记法变体（消歧义的关键）
  variants: [demarco, gane-sarson]
  default: demarco
vocabulary:                        # 允许的 element.kind
  element: [external-entity, process, data-store, data-flow-label]
  relation: [flow, bidir-flow]
required:                          # 必填属性（按 kind）
  process: [number, verb-phrase-name]
  data-store: [storage-kind]
relation_matrix:                   # 谁能连谁（消歧义核心）
  flow: { from: [external-entity, process], to: [process, data-store] }
  bidir-flow: { from: [process], to: [external-entity, data-store] }
rules:                             # 引用内置规则类型
  - type: no-process-to-process-direct
  - type: data-store-must-be-reachable
style:                             # 视觉令牌（渲染器消费）
  tokens: { process: { shape: circle, fill: tok.process } }
layout: { engine: elk, direction: RIGHT }
```

**关键约束**：剖面只能**收紧**内核，不能新增语法；新增 `kind` 必须进 `vocabulary`；未知 `kind` 报 `profile/vocabulary` 错误。

---

## 7. 校验分级与 Finding 结构

| 级 | 名称 | 检查内容 | 可跳过 |
|---|------|----------|:---:|
| L0 | parse | YAML 语法、禁止锚点/别名/自定义 tag、禁止重复键 | ✗ |
| L1 | schema | 内核字段类型、必填项、`x-` 之外未知字段 | ✗ |
| L2 | kernel | ID 唯一、引用不悬空、父子无环、relation endpoint 存在 | ✗ |
| L3 | profile | kind 在词表内、关系符合矩阵、必填 props 齐全、剖面规则 | ✗ |
| L4 | cross-doc | imports 可解析、跨文档 ID 冲突、定义与视图一致 | 可 `--offline` 跳过 |
| L5 | code | `links.kind=code` 的锚点可解析（文件/符号存在） | 可跳过 |
| L6 | fitness | `constraints:` 中的架构规则（分层、禁止依赖、基数） | 可跳过 |

Finding：

```yaml
{ code: profile/relation-matrix, level: L3, severity: error,
  element_id: r.bad, message: "dfd: process -> process 不允许直接 flow",
  fix_hint: "引入 data-store 或改为 external-entity", auto_fixable: false }
```

**返回码约定**（给 CI 与 AI）：`0` 无 error；`1` 有 error；`2` 仅 warning；`3` 工具/IO 失败。**同一输入必得同一 finding 序列**（确定性）。

---

## 8. 批注模型（核心差异化）

### 8.1 目标

批注可锚定到：`element` / `relation` / `view` / `region`（视图内矩形）/ `document`。

```yaml
- id: a.<ULID>                    # 机器生成，避免合并冲突
  target: { kind: element|relation|view|region|document, id: ..., view: v.main, rect: [x,y,w,h] }
  type: risk|question|decision|todo|defect|smell
  severity: blocker|high|medium|low
  title: 一句话结论
  body: 详细描述（含证据）
  status: open|ack|resolved|wontfix|superseded
  author: human:<name> | ai:<agent>
  created / updated: ISO8601
  links: [adr|issue|code|doc]
  ai_hint: 给 AI 的处理约束（人类写给 AI 的最重要一条）
  thread: [ { author, at, text } ]   # 追加式讨论，不覆盖
  resolution: { by, at, ref }        # 关闭时必填
```

### 8.2 规则

- **append-only 语义**：`thread` 只追加；`status` 变更写入 `resolution`；历史不删。
- **人工批注 AI 不可改**：AI 只能追加 thread 或新建 `author: ai:*` 批注；修改 `author: human:*` 的批注 = 校验错误。
- **`ai_hint` 是接口**：人写约束，AI 消费；这是"人给 AI 的提示与约束"落地的最小单元。
- **可导出**：`covenant export --format md|github-issues|jira`，批注 → 任务。
- **可渲染**：视图上以角标/图钉显示，按 `status/severity/type` 过滤；`open` 数量进 digest 摘要。

### 8.3 生命周期

```
open ──ack──> open ──resolve──> resolved
  │                              │
  ├──wontfix                     └── (ADR 冻结时可 superseded)
  └── 转 ADR：decision 类型批注 + links.adr
```

**架构问题 → 批注 → ADR** 是完整闭环：临时讨论留在批注，长期结论冻结为 ADR 并 `links` 回批注。

---

## 9. 布局与坐标

- 坐标**只存在于视图**（同一元素在不同视图位置可不同）。
- 优先级：`pins`（人工）> 布局引擎计算结果。人拖动 = 写 `pins`，不破坏语义。
- 布局引擎可替换；**只约束接口**：`layout(doc, view) -> Map<elementId, Rect>`。
- 笔迹/图片在 `view.canvas`，可外置引用（大文件不入语义层）。

---

## 10. AI 契约（读 / 写 / 审）

### 10.1 读：三种投影，按预算选

| 投影 | 内容 | 量级 | 用途 |
|------|------|------|------|
| `digest` | 元素+关系（摘要）+ 未决批注 + 规则清单 | ~10 token/元素 | Agent 开工、全局理解 |
| `context --task "..."` | 与任务相关的子图 + 相关约束 + 相关批注 | 可控 budget | 改某模块前 |
| `spatial` | 坐标表 + 邻接表 + 出入度 | 中 | 排查布局/重叠/视觉问题 |

`digest` 格式示例（稳定、可解析）：

```
# payments/containers (c4-container@1 rev3, 8 elements, 11 relations)
E e.payments [container] Payments Service (Kotlin/Spring) — 支付授权/捕获/退款编排  !open:2
E e.ledger   [datastore] Ledger (Postgres) — 记账账本
R e.payments -writes(async,postgres)-> e.ledger — 记账写入(outbox)
! a.01JAX9K3Q7 risk/high 跨库事务隐患 → r.pay-ledger  hint:优先 outbox
K k.no-cycle acyclic(writes,reads)
```

### 10.2 写：只接受补丁

```yaml
change:
  doc: payments/containers
  base_rev: 3
  intent: 把记账写入改为 outbox 异步
  related_annotations: [a.01JAX9K3Q7]
  ops:                      # RFC 6902 JSON Patch，作用于文档模型
    - { op: replace, path: /relations/r.pay-ledger/props/sync, value: false }
    - { op: add, path: /elements/-,
        value: { id: e.outbox, kind: container, name: Outbox Relay, summary: 异步转发账本事件 } }
    - { op: add, path: /relations/-,
        value: { id: r.pay-outbox, kind: publishes, from: e.payments, to: e.outbox, summary: 事件发布 } }
```

**硬性约束**：`base_rev` 不匹配即拒绝（乐观锁）；补丁必须通过 L0–L6；不允许改 `meta.owners` 与 `author: human:*` 的批注；坐标改动需 `intent` 显式说明。

### 10.3 审：语义 diff 而非文本 diff

```yaml
diff:
  cosmetic: [moved e.payments, recolored r.1]          # 可自动通过
  material: [{type: add-element, id: e.outbox}, ...]   # 需人看
  breaking: [{type: remove-element, id: e.legacy, inbound: 3}]  # 强制人批准
```

规则：**`breaking` 必须人工批准**；`material` 需评论或静默超时后批准；`cosmetic` 自动通过。这让"AI 改了架构"变成可审计的事件，而不是一次静默重画。

---

## 11. 版本与兼容

- 文档 `covenant: 0.1` = 规范主/次版本；**同主版本内向后兼容**。
- 剖面独立版本：`c4-container@1`；主版本变化 = 破坏性，需迁移脚本。
- 文档 `meta.rev` 每次语义变更 +1（cosmetic 不变）。
- `status: frozen` 的文档：任何 material/breaking 改动需 owner 批准并升 rev。
- 未识别字段：`x-*` 保留；其他未知字段 = L1 错误（防拼写错误静默丢数据）。

---

## 12. 互操作映射（只做导入导出，不做事实源）

| 来源 | 导入 | 导出 | 备注 |
|------|------|------|------|
| Mermaid | ◐ 尽力（flowchart/sequence/ER） | ✓ | 语义有损，导出时标注 |
| D2 | ◐ | ✓ | 布局可对齐 |
| Structurizr DSL | ✓（C4 映射天然） | ✓ | 最优先的互操作对象 |
| LikeC4 | ◐ | ◐ | 同为 C4 |
| draw.io / Excalidraw | ◐ 只作画布层 | ✓ | 语义不导入 |
| GraphML / GEXF | ✓（通用图） | ✓ | 给图分析工具 |
| SysML XMI / UML XMI | ✗（v0 不做） | ◐ | 过度冗长 |
| PNG / SVG / PDF | ✗ | ✓ | 交付物 |

---

## 13. 决策状态

格式层相关决策**均已拍板**：Q5 轻量 L5、Q6 项目目录、Q7 语言、Q10 扩展名 `.cvn.yaml`；技术栈 D1、交付形态 D2。见 [open-questions.md](open-questions.md)。

---

## links（同源引用，v0.1）

顶层与元素级都允许 `links` 数组，用于把契约和代码/决策/工单连起来：

| kind | ref 形式 | 语义 |
|------|---------|------|
| `code` | 文件路径或符号 | 代码绑定 |
| `adr` | 4 位编号 `0001`，或 `adr/0001-xxx.md` | 决策引用 |
| `issue` / `doc` / `url` / `metric` | 各自标识 | 外部引用 |

校验（L2）：`adr` 必须是 4 位编号或 `NNNN-slug.md` 路径；`url` 必须以 `http(s)://` 开头。
`covenant adr` 会额外检查：accepted 的 ADR 至少被一条文档 `links.kind=adr` 引用。
