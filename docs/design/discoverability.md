# 可发现性设计：陌生 Agent 如何读懂 `.cvn`

> **用途**：回答"`.cvn` 不是主流格式，陌生 Agent 凭什么知道怎么读、能做什么"，并定下文件自描述、仓库入口、工具化三层机制与优先级。
> **目标读者**：实现者（CLI/MCP/文档）、第一次接触本格式的 Agent 与新人。
> **状态**：v0，核验于 2026-11-03。
> **关联**：[format-spec-v0.md](format-spec-v0.md)、[interaction-and-ai-loop.md](interaction-and-ai-loop.md)、[gate-spec-v0.md](gate-spec-v0.md)。

---

## 1. 问题定义

`.cvn` 是自定义扩展名。一个陌生 Agent（无先验知识、无本仓库上下文）第一次遇到它时，必须能在**不读源码、不猜**的前提下回答四个问题：

1. 这是什么文件？
2. 它回答什么业务问题？
3. 我该用什么工具读/校验它？
4. 我能对它做什么（只读？标注？提补丁？）

**只靠"格式设计得好"不足以回答**——可发现性是独立的设计维度。

---

## 2. 三层机制

### L1 文件自描述（无工具也能看懂）

| 机制 | 内容 | 作用 |
|------|------|------|
| 首键版本 | `covenant: 0.1` 必须是第一个键 | 一眼识别格式与版本 |
| 语义 ID | `id: payments/containers` + `profile: c4-container@1` | 知道这是什么类型的图 |
| 内嵌说明 | `meta.title` / `purpose` / `non_goals` / `ai.summary` | 不用问人就知道这张图回答什么问题、**不**回答什么 |
| Schema 指针 | 首行注释 `# yaml-language-server: $schema=https://…/kernel.schema.json` | 编辑器直接补全；人也能看到 schema 地址 |
| 人类可读 | YAML + `summary` 字段 | 不解析也能读懂大概 |

**原则**：一个只会读文本的 Agent，仅凭文件内容就应能说出"这是一张 C4 容器视图，用于说明支付域的服务划分"。

### L2 仓库入口（无工具也能找到路）

| 文件 | 内容（严格 ≤ 20 行） |
|------|----------------------|
| `AGENTS.md`（根） | ① 架构契约在 `arch/`；② 先读 `arch/README.md`；③ 执行 `covenant digest arch/` |
| `arch/README.md` | 格式一句话 + schema 链接 + 三条常用命令 + "禁止手改坐标/人工批注" |
| `llms.txt`（可选） | 给 LLM 的极简入口清单 |

**原则**：入口文件**只做指针，不复述内容**——复述必然过期。

### L3 工具化（不用自己解析）

| 形式 | 是什么 | 陌生 Agent 如何发现 | 优先级 |
|------|--------|---------------------|:---:|
| **CLI** | 可执行命令 `covenant digest/check/annotate/patch` | 读 `AGENTS.md`；`--help` | **M1** |
| **MCP Server** | 按 Model Context Protocol 暴露 tools/resources 的进程 | Agent 配置连接后 `list_tools` 自动发现 | M4 |
| **Skill** | Markdown 说明书 + 可选脚本，按需加载 | 宿主 skill 目录 | M5 |

**原则**：**MCP 是礼物，不是前提。** 没有它时，L1+L2+CLI 必须已经够用。

---

## 3. 三层的关系与失败模式

| 配置 | 结果 |
|------|------|
| 只有 L1 | Agent 读得懂，但不会校验、不知道能改什么 |
| 只有 L3（有 MCP） | 没连工具的 Agent 完全懵；工具挂了协作瘫痪 |
| L1+L2 | **最低可用**：能读懂、能找到命令 |
| L1+L2+L3 | 完整：零解析成本 |

**必须有 L1+L2；L3 是增强，不是替代。**

---

## 4. 陌生 Agent 的 60 秒上手路径

```
1. 读到 arch/README.md（20 行）
2. 跑 `covenant digest arch/ --budget 1200` → 拿到语义摘要
3. 要改？跑 `covenant check arch/` → 拿 finding + fix_hint
4. 提交补丁（base_rev + intent）→ 等校验与批准
```

这四步必须写进 `AGENTS.md`，且**每一步都能在 60 秒内完成**。

---

## 5. 格式选择与可发现性的关系

| 候选 | 可发现性 | 可维护性 | 结论 |
|------|----------|----------|------|
| YAML（`.cvn`） | 中（扩展名不主流） | 高（可注释、diff 干净） | 主格式 |
| YAML（`.cvn.yaml`） | **高**（工具认 `.yaml`） | 高 | **推荐改名**（Q10） |
| JSON（`.cvn.json`） | 高 | 中（无注释、diff 噪声） | 仅导出 |
| YAML+JSON 双轨 | 高 | **低**（必然漂移） | ❌ |

**推荐**：语义层 YAML；文件命名 `<name>.cvn.yaml`；JSON 只做导出与交换；JSON Schema 作为机器契约。

> 改名成本现在最低（只有 3 个示例文件），实现后就贵了——所以需要尽早定（Q10）。

---

## 6. 优先级

| 阶段 | 交付 | 验收 |
|:----:|------|------|
| M1 | L1 文件自描述 + L2 `AGENTS.md`/`arch/README.md` + CLI `digest/check` | 给一个陌生 Agent 只读 `arch/README.md` + 跑两条命令，能正确说出图的用途并提交一个合法补丁草案 |
| M2 | 渲染产物里的自描述（HTML 标题/说明/schema 链接） | 打开 HTML 不看代码就知道这是什么 |
| M4 | MCP server（薄封装 CLI） | Agent 连上后 `list_tools` 能发现 6 个能力 |
| M5 | Skill（说明书 + 常见任务脚本） | 新宿主接入 ≤ 10 分钟 |

---

## 7. 待验证

- "60 秒上手"未测试；需要一次真实的陌生 Agent 实验（给定仓库、不给提示，看它能否完成任务）。
- `.cvn.yaml` 双后缀是否为最佳折中，未与 `.cvn` / `.arch.yaml` 做对比实验。
- MCP 工具描述（description）的措辞直接影响 Agent 是否会用对，M4 需实测。

## 实现状态（2026-11-03）

| 层级 | 状态 | 入口 |
|------|------|------|
| L1 文件自描述 | ✅ | `.cvn.yaml` + `schema/kernel.schema.json` |
| L2 仓库入口 | ✅ | `AGENT.md`、`arch/README.md`、`packages/README.md` |
| L3 CLI | ✅ | `check` / `render` / `build` / `apply` / `patch-check` / `diff` / `index` / `verify` |
| L-MCP | ✅ | `pnpm mcp`（8 个工具，stdio，零第三方依赖） |
| Skill | ✅ | `skills/covenant/SKILL.md`（一页上手：铁律 / 工具 / 典型任务 / 错误对照） |

> 结论：陌生 Agent 有两条路——读 `SKILL.md`（一页），或直接 `tools/list`（机器可读）。MCP 不是前提，是礼物。
