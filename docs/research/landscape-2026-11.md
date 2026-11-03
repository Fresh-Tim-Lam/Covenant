# 市面同类工作与开源项目调研（2026-11）

> **用途**：回答"有没有类似的工作/开源项目、差距在哪、我们能复用什么"，为 Covenant 的定位与取舍提供依据。
> **目标读者**：项目负责人（决策）、AI Agent（实现时的技术选型依据）。
> **状态**：调研快照，核验于 2026-11-03；链接与许可可能变化，以各自仓库为准。
> **关联文档**：[diagram-taxonomy.md](../design/diagram-taxonomy.md)（图类型全景）；[format-spec-v0.md](../design/format-spec-v0.md)（格式提案）。

---

## 0. 结论前置

1. **有大量局部重合，没有一整套等价物。** 现有工作分成两条互不越界的线：**白板线**（有画面、无语义）和**图即代码线**（有语义、无批注/无自由画布）。你的需求同时要"能像飞书画板一样自由标注"和"像代码一样可校验、可被 AI 读写"，**这个交集目前是空的**。
2. **最接近的三个项目**：Archi（元模型 + 校验，但只做 ArchiMate）、Structurizr（架构即代码 + 视图，但只做 C4）、Excalidraw/tldraw（画布与批注体验好、格式开放，但零语义）。它们各自缺的那一块，正好互补。
3. **"图类型全覆盖"这件事，业界没有一张清单，也不该有。** 标准是分层的：UML 14 种 / SysML 9 种 / ArchiMate 分层视图 / BPMN / DMN / DFD(ISO 5807) / ER / IDEF0-1X / C4 / 42010。**正确的工程答案是「通用图内核 + 可扩展记法剖面 + 校验器」，而不是把图类型枚举完。** 详见 [diagram-taxonomy.md](../design/diagram-taxonomy.md)。

---

## 1. 六条技术路线

### 1.1 白板 / 无限画布底座（有画面，无语义）

| 项目 | 是什么 | 格式 | 对我们的价值 |
|------|--------|------|--------------|
| [Excalidraw](https://excalidraw.com/)（[仓库](https://github.com/excalidraw/excalidraw)） | 手绘风白板，MIT | `.excalidraw`（[JSON，有公开 schema](https://docs.excalidraw.com/docs/codebase/json-schema)） | **批注体验与"自由圈画"的参照**；JSON 结构简单，可作为 `canvas` 视觉层的借鉴 |
| [tldraw](https://tldraw.dev/) | 可嵌入的无限画布 SDK，`.tldr` 文件 | 自有快照格式 | 画布内核做得最扎实；但其 SDK 商用授权需按其许可确认，**不建议作为语义层的底座** |
| [draw.io / diagrams.net](https://www.drawio.com/)（[仓库](https://github.com/jgraph/drawio)） | 通用绘图，Apache-2.0 | `mxGraph` XML | 图形库与导出能力值得借鉴；XML 模型无类型系统，语义弱 |
| [Penpot](https://penpot.app/) | 开源设计/白板，MPL-2.0 | 基于 SVG | 证明"SVG 作为一等载体"可行 |
| Figma / FigJam、Miro、[飞书画板](https://www.feishu.cn/product/board) | 商业产品 | 封闭 | 体验标杆：评论钉在对象上、@人、状态流转——**批注模型抄它们的交互，不抄数据** |

**共性缺口**：元素只是"矩形/文本/箭头"，没有 `kind` 语义、没有关系矩阵、没有约束，**机器无法判断"这条箭头是否合法"**。AI 只能看截图或读几千个 drawable，token 爆炸且不可靠。

### 1.2 图即代码 / Diagrams-as-Code（有语义，无自由画布、无元素级批注）

| 项目 | 语义强度 | 备注 |
|------|----------|------|
| [Mermaid](https://mermaid.js.org/intro/) | 弱-中（语法即语义，但无元模型） | 生态最大、Markdown 内联最方便，**但表达力有损、布局不可控**；适合作为"导出目标"而非"事实源" |
| [D2](https://d2lang.com/)（[TALA 开源](https://d2lang.com/blog/tala-is-open-source/)） | 中 | 布局引擎质量高（Dagre/ELK/TALA），**是我们布局选型的重要参照** |
| [PlantUML](https://plantuml.com/) | 中（UML 为准） | 覆盖广、老牌；语法非结构化，程序化生成困难 |
| [Graphviz DOT](https://graphviz.org/) | 弱 | 纯图，无领域语义；仍是最稳的布局后端之一 |
| [Structurizr DSL](https://structurizr.com/)（[DSL 仓库](https://github.com/structurizr/dsl)） | **强**（C4 元模型 + workspace 单一事实源 + 多视图） | **最接近我们"语义层"的设计**：元素定义一次、视图引用、支持 ADR；但只覆盖 C4 |
| [LikeC4](https://likec4.dev/) | **强**（C4 + 自定义规格 + React 查看器） | 现代、类型化、可校验；**是我们最直接的对标对象**；缺批注与自由画布 |
| [diagrams](https://diagrams.mingrammer.com/) | 弱（Python 生成，云图标导向） | 说明"程序化生成"需求真实存在 |

**共性缺口**：**看不懂"人的意见"**。它们能画、能改，但没法在元素上开一条讨论串记录"这里为什么这样设计/这里有问题"，也没有把批注作为一等数据交给 AI 消费。

### 1.3 建模标准与元模型（语义的唯一权威来源）

| 标准 | 图类型数 | 元模型 | 对我们的意义 |
|------|---------|--------|--------------|
| [UML 2.5.1](https://www.omg.org/spec/UML/) | 14 种（类/对象/包/组件/组合结构/部署/制品/用例/活动/状态机/序列/通信/交互概览/时序） | 有，[MOF](https://www.omg.org/spec/MOF/) 四层 | **"Tier-1 剖面 + 元模型"的现成范本**：UML 本身就是一个可被约束的元模型 |
| [SysML](https://www.omg.org/spec/SysML/) v1.6（9 种）/ v2（新 API + 文本记法） | 9 种 | 有 | v2 的"文本记法 + API"证明**机器可读是系统工程界的共识方向** |
| [ArchiMate 3.2](https://www.opengroup.org/archimate-forum/archimate-overview) | 分层视图（业务/应用/技术） | 有 | 关系矩阵（谁能连谁）是"消歧义"的最佳实践 |
| [BPMN 2.0](https://www.omg.org/spec/BPMN/) / [DMN](https://www.omg.org/spec/DMN/) | 流程 / 决策 | 有 | 流程类图的语义基准 |
| DFD（ISO 5807 / Yourdon-DeMarco / Gane-Sarson） | 1 类多记法 | 无正式元模型 | **最常被误用的图**：两种记法符号不同、语义不同，混用即歧义 |
| ER（Chen 1976；crow's foot） | 1 类多记法 | 弱 | 同上 |
| IDEF0 / IDEF1X（ISO/IEC 31320） | 2 类 | 有 | 多数人漏掉的"功能分解/数据建模"标准 |
| [C4 model](https://c4model.com/) | 4 层 + 动态/部署 | 轻元模型 | 现代软件架构事实标准，**我们第一期的主剖面** |
| [CALM](https://calm.finos.org/)（FINOS） | 架构即代码 | **有 JSON Schema** | 金融界"架构即代码"标准，**格式设计可直接对照** |
| ISO/IEC/IEEE 42010 | 架构描述规范 | 有（视点/视图） | 提醒我们：**视图必须由视点约束**，这就是 profile 的理论依据 |

### 1.4 架构建模与架构治理工具

| 工具 | 一句话 | 借鉴点 |
|------|--------|--------|
| [Archi](https://www.archimatetool.com/) | 开源 ArchiMate 建模，有完整校验 | **元模型校验器**的产品形态 |
| [Structurizr](https://structurizr.com/) | C4 workspace + 视图 + 决策记录 | 定义/视图分离、ADR 一等公民 |
| [LikeC4](https://likec4.dev/) | C4 as code + 校验 + 实时预览 | 类型化规格、开发者体验 |
| IcePanel / Eraser | 商业架构协作 | 评审流、@人、状态；数据封闭 |
| [arc42](https://arc42.org/) | 架构文档模板 | 文档与图如何互链 |
| [ADR](https://adr.github.io/) | 决策记录（Nygard） | **批注的终态之一是 ADR**：问题 → 决策 → 冻结 |
| [ArchUnit](https://www.archunit.org/) / [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | 架构约束即测试 | **图与代码一致性校验**的实现思路（fitness function） |

### 1.5 AI 生成图示（2024–2026 的热点，但普遍是一次性生成）

- [tldraw make-real](https://makereal.tldraw.com/)：手绘 → 可交互 UI，证明"图 → 代码"链路可行。
- [Mermaid Chart](https://www.mermaidchart.com/)：LLM 生成 Mermaid + 修复语法。
- Excalidraw 的 text-to-diagram / Mermaid 导入：**生成完即结束，没有回写与校验闭环**。
- 各类 MCP 图示工具（如 [drawarch-mcp](https://www.npmjs.com/package/drawarch-mcp)）：把"画图"暴露成工具调用，但**输出仍是自由图形，不是可校验语义**。

**共性缺口**：AI 只被当成"生成器"，没被当成"需要被约束、也需要约束别人的协作者"。**没有"补丁 + 校验 + 语义 diff + 人工批准"的闭环**——而这正是我们最核心的差异化。

### 1.6 图数据交换格式

| 格式 | 用途 | 取舍 |
|------|------|------|
| [GraphML](http://graphml.graphdrawing.org/) / [GEXF](https://gexf.net/) | 通用图交换 | 无领域语义，只能做导出 |
| [XMI](https://www.omg.org/spec/XMI/) | UML/SysML 模型交换 | 极其冗长，不适合人读 |
| [JSON-LD](https://json-ld.org/) / RDF/OWL | 本体与语义网 | 概念正确但工程过重，可作可选导出 |
| SysML v2 API & Services | 模型仓库 API | 未来互操作方向 |
| OpenAPI / AsyncAPI | 接口契约 | **"契约"思想的近邻**：我们想做的是"架构图的 OpenAPI" |

---

## 2. 直接对标矩阵

> 评分：✅ 完整支持 / ◐ 部分支持 / ✗ 不支持。此表是"我们是否有生存空间"的核心证据。

| 能力 \ 项目 | 飞书画板 | FigJam | Excalidraw | tldraw | draw.io | Mermaid | D2 | Structurizr | LikeC4 | Archi |
|---|---|---|---|---|---|---|---|---|---|---|
| 自由画布 / 手绘 | ✅ | ✅ | ✅ | ✅ | ✅ | ✗ | ✗ | ✗ | ◐ | ✗ |
| 元素有语义类型 | ✗ | ✗ | ✗ | ✗ | ◐ | ◐ | ◐ | ✅ | ✅ | ✅ |
| 开放文本格式 | ✗ | ✗ | ✅ | ✅ | ◐ | ✅ | ✅ | ✅ | ✅ | ◐ |
| 元素级批注/讨论串 | ✅ | ✅ | ◐ | ◐ | ◐ | ✗ | ✗ | ✗ | ✗ | ✗ |
| 机器可校验约束 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ | ◐ | ✅ | ✅ |
| 确定性可编程渲染 | ✗ | ✗ | ◐ | ◐ | ◐ | ✅ | ✅ | ◐ | ✅ | ✗ |
| AI 友好投影（低 token） | ✗ | ✗ | ✗ | ✗ | ✗ | ◐ | ◐ | ◐ | ◐ | ✗ |
| 图类型可扩展（剖面） | ✗ | ✗ | ✗ | ✗ | ◐ | ✗ | ✗ | ✗ | ◐ | ✗ |
| 批注 → AI 可消费 | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

**读法**：没有任何一列同时满足「自由画布 + 语义 + 批注 + 校验 + AI 投影」。左半边（画布）和右半边（语义）基本互斥，中间那列（批注 × AI）**全空**。

---

## 3. 五个空白点（我们的机会）

1. **语义与画布的统一**：一份文档里既有可校验的语义图，又有自由批注与圈画。目前所有工具二选一。
2. **元素级批注作为一等数据**：批注不是"对话气泡"，而是带 `target / severity / status / ai_hint / 链接到 ADR 或代码` 的结构化对象，可导出为任务、可被 AI 直接处理。
3. **人机闭环**：AI 产出**语义补丁**而非重绘整图；校验器拒绝非法修改；人看**语义 diff** 批准。现有 AI 图示工具全是"一次性生成"。
4. **记法可扩展的元模型**：不是"支持 N 种图"，而是"支持定义第 N+1 种图"。UML 的 MOF 思路，但面向 AI 与网页。
5. **图 ↔ 代码一致性**：图上的元素绑定代码锚点，可执行 fitness 规则（分层、依赖方向、禁止跨库）。目前只在 ArchUnit 这类代码侧工具里，且无图。

---

## 4. 可直接复用的东西

| 需求 | 复用对象 | 方式 |
|------|----------|------|
| 自动布局 | ELK.js / Dagre / D2 的 TALA 思路 | 依赖库，不自己造 |
| 画布交互 | tldraw / Excalidraw 的交互范式 | 参考交互，不耦合格式 |
| C4 语义 | Structurizr / LikeC4 的元模型 | 对齐其元素类型命名，便于导入 |
| 标准元模型 | UML / ArchiMate / BPMN 的关系矩阵 | 作为剖面定义的内容来源 |
| 格式设计 | CALM（JSON Schema）、Structurizr workspace | 对照字段设计 |
| 架构即测试 | ArchUnit / dependency-cruiser | 一致性校验的执行器 |
| 文档互链 | AOCI FRAS（F/R/A/S） | `.cvn` 元素直接映射为 FRAS 条目 |
| 导出互操作 | Mermaid / SVG / PNG / GraphML | 只做导出，不做事实源 |

---

## 5. 定位一句话

> **Covenant = 白板的表达力 × 图即代码的语义 × 代码评审的闭环。**
> 不做"又一个画图工具"，做**人机共用的架构契约层**：人在这里表达意见，AI 在这里读取约束并提交可校验的修改。

风险与反面意见记录在 [open-questions.md](../design/open-questions.md)（含"为什么不直接用 Structurizr + 批注插件"的论证）。
