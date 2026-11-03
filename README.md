# Covenant — 契约式软件架构图示语言

> **状态**：M0 完成，**M1/M3/M4 前半已完成**——`core` / `profile` / `validate` / `layout` / `render` / `patch` / `diff` / `indexer` / `cli` 全部实现并验证（typecheck 0、**191 单测**、4 个示例 0 error、多视图）；剖面 10 个：c4-container / c4-context / c4-component / dfd / er / flowchart / deployment / graph / sequence / state；布局 v2（barycenter + 长边通道）+ 标签避让；**已自举**：`arch/` 用自己的契约描述本仓库，FRAS 索引 I1–I3 通过，`pnpm verify` 是本地 CI 等价物（`.github/workflows/verify.yml` 已就绪，仓库未 git init 故未运行）。闭环带门禁：HTML 标注与状态流转 → 导出补丁 → `patch-check` → `apply`（保留注释/rev+1/审计）→ `check`；`diff` 提供 breaking 批准分级。**ADR**：`pnpm adr` 校验决策记录 + 跨文档引用（2 条已落地）；**`links`**：adr/url 引用可判定；**AI 协作**：`pnpm ai brief` 生成评审简报、`pnpm ai annotate` 生成合法补丁；**可发现性**：`pnpm mcp` 提供 9 个 MCP 工具，`skills/covenant/SKILL.md` 让陌生 Agent 一页上手。
> **快速开始**：`pnpm install` → `pnpm check examples` → `pnpm build:html examples -o dist/covenant.html`（双击标注）→ `pnpm patch-check <doc> <patch> --actor human:you` → `pnpm apply <doc> <patch>` → `pnpm test`。
> **已定决策**：① 技术栈 TypeScript 全栈 ② 交付形态 = 自包含本地 HTML 优先 ③ MVP = 12 件套图 ④ 先提案后实现 ⑤ Q5–Q10 全部拍板（轻量 L5 / 项目目录 / 中文文档英文代码 / AGPL-3.0 + 商业双许可 / 不做浏览器直写 / `.cvn.yaml`）。见 [docs/design/open-questions.md](docs/design/open-questions.md)。
> **上手**：先读 [AGENT.md](AGENT.md)；想动手双击 [examples/prototype/arch-prototype.html](examples/prototype/arch-prototype.html)。
> **一句话**：把「架构图」从**插图**变成**可校验、可批注、可被人和 AI 共同读写的契约**。

---

## 1. 问题

当前人机协作画架构图，卡在三种工具的夹缝里：

| 类型 | 代表 | 强项 | 致命缺口 |
|------|------|------|----------|
| 白板 / 画布 | 飞书画板、FigJam、Miro、Excalidraw | 自由、好看、能圈能画 | **没有语义**：图是像素，AI 读不懂，机器查不了 |
| 图即代码 | Mermaid、D2、PlantUML、Structurizr | 文本可 diff、AI 能生成 | **不能自由画、不能就某个框写问题**，布局不可控 |
| 建模工具 | Archi、Enterprise Architect、IcePanel | 有元模型、能校验 | 封闭、重、AI 不友好、批注与开发流程脱节 |

于是"人给 AI 讲架构"只能靠长段自然语言 + 截图，**歧义与漂移无法收敛**。

## 2. 主张

Covenant 由三件东西组成，缺一不可：

1. **开放文本格式 `.cvn`** —— 语义图（节点/关系/约束/批注）是权威事实源；画面只是投影。
2. **确定性网页渲染引擎** —— 同一输入必得同一输出（可做黄金测试、可被 AI 预判），SVG 优先、可编程生成。
3. **人机协作契约** —— 人直接在图上钉批注记录架构问题；AI 读结构化摘要、只产出可校验的补丁；双方共用一套校验器。

## 3. 三条设计公理

- **语义 ≠ 画面**：画面是投影，语义是真身。AI 读语义（10 个 token/节点），人看画面。
- **校优先于画**：先能判定"这张图对不对/和代码是否一致"，再谈好不好看。
- **批注是一等公民**：架构问题必须钉在出问题的那个元素/关系上，可导出为任务、可被 AI 读取处理。

## 4. 关键判断：图类型没有"完整清单"

UML 2.5.1 有 14 种图，SysML 1.6 有 9 种，另有 ArchiMate、BPMN、DMN、DFD（ISO 5807）、ER（Chen）、IDEF0/IDEF1X、C4、arc42、威胁模型、依赖图……**穷举必漏，且标准仍在演进**。

因此 Covenant 不赌"图类型清单"，而赌**三层结构**：

```
Tier-0 通用图内核（节点/边/端口/容器/批注/约束/视图）—— 与记法无关
Tier-1 记法剖面（dfd / er / flowchart / c4 / sequence / state / bpmn-lite / class / deployment / threat / graph …）
Tier-2 具体文档（.cvn 实例）
```

新增一种图 = 新增一个剖面（声明允许的元素类型、关系矩阵、必填属性、校验规则、布局默认值），**内核不动**。这才是"没有歧义"的真正机制——歧义来自**语义未定义**，不来自**图种类不够多**。

详见 [docs/design/diagram-taxonomy.md](docs/design/diagram-taxonomy.md)。

## 5. 文档入口

| 你想知道 | 读这份 |
|----------|--------|
| **想 5 分钟跑通？** | [docs/quickstart.md](docs/quickstart.md)（写契约 → 校验 → 出图 → 标注 → 补丁 → 落盘） |
| 版本改了什么？怎么贡献/报漏洞？ | [CHANGELOG.md](CHANGELOG.md)、[CONTRIBUTING.md](CONTRIBUTING.md)、[SECURITY.md](SECURITY.md) |
| **团队项目里怎么部署编辑态？** | [docs/guides/agent-team-edit-deployment.md](docs/guides/agent-team-edit-deployment.md)（一键启动 / 安全边界 / 降级 / 回滚） |
| **验收证据在哪？** | [ACCEPTANCE.md](ACCEPTANCE.md)（目标逐条映射到命令与实测结果） |
| **第一次进仓库，从哪开始？** | [AGENT.md](AGENT.md)（接入指南：现状 / 技术栈 / 边界 / 陷阱） |
| 文件放哪？文档怎么管？ | [docs/conventions/](docs/conventions/README.md)（目录、文档、元规则） |
| 市面上有没有类似的开源项目？差距在哪？ | [docs/research/landscape-2026-11.md](docs/research/landscape-2026-11.md) |
| 软件工程到底有多少种图？我漏了哪些？ | [docs/design/diagram-taxonomy.md](docs/design/diagram-taxonomy.md) |
| 文件格式长什么样？ | [docs/design/format-spec-v0.md](docs/design/format-spec-v0.md) |
| 有没有机器可校验的 schema？ | [schema/README.md](schema/README.md)（`kernel.schema.json`） |
| 每种图具体怎么定义（词表/关系矩阵/规则）？ | [docs/design/profiles-catalog-v0.md](docs/design/profiles-catalog-v0.md) |
| 渲染引擎怎么设计？ | [docs/design/engine-architecture-v0.md](docs/design/engine-architecture-v0.md) |
| **「打开本地 HTML → 标注 → AI 读懂 → 改图/开发」怎么落地？** | [docs/design/interaction-and-ai-loop.md](docs/design/interaction-and-ai-loop.md) |
| 批注进 AI 会不会被注入攻击？ | [docs/design/ai-trust-boundary.md](docs/design/ai-trust-boundary.md) |
| 端到端到底长什么样（含精确输出）？ | [docs/design/walkthrough-golden-path.md](docs/design/walkthrough-golden-path.md) |
| 名词解释 | [docs/reference/glossary.md](docs/reference/glossary.md) |
| 哪些是绝对不能违反的？ | [docs/reference/hard-constraints.md](docs/reference/hard-constraints.md) |
| 还能看个具体例子吗？ | [examples/payments-arch.cvn.yaml](examples/payments-arch.cvn.yaml)（C4）、[examples/order-dfd.cvn.yaml](examples/order-dfd.cvn.yaml)（DFD）、[examples/covenant-self.cvn.yaml](examples/covenant-self.cvn.yaml)（自举） |
| **想先动手体验？** | 双击 [examples/prototype/arch-prototype.html](examples/prototype/arch-prototype.html)（零依赖，点框/线钉批注、看 AI 读到什么、导出补丁） |
| 已经定了什么？还剩什么要拍板？ | [docs/design/open-questions.md](docs/design/open-questions.md) |
| 新的「契约优先 Agent 开发」范式宣言？ | [docs/prompts/paradigm-declaration-v2.md](docs/prompts/paradigm-declaration-v2.md) |
| 先做哪种图、怎么自举扩展？ | [docs/design/self-hosting-bootstrap.md](docs/design/self-hosting-bootstrap.md) |

## 6. 与 Memoria / AOCI 的关系

- **结构范式**沿用 Memoria：`src/ tests/ docs/ scripts/ resources/ artifacts/` + 每目录 README + `AGENT.md` 单一事实源体系（**文档骨架已生成，代码骨架待 M1**）。
- **索引角色**：`.cvn` 天生就是 AOCI FRAS 的图版本——每个元素的 `summary`（F）、关系（R/A）、`constraints`（S）可直接映射。
- **Agent 协作**：本仓库实行"索引优先 + 图即契约"：改架构先改 `.cvn`，校验通过再改代码。
