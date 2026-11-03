# 模块 Owner 编制与粒度规范（Module Ownership）

> 状态：adopted（2026-11-03）· 关联 [agent-team-development.md](agent-team-development.md)（Index-First 范式）、ADR-0003
> 目的：让"一个模块 = 一个 owner = 一个目录 = 一份元语料 = 一组 FRAS 条目"，服务于 Agent 上下文、索引（AOCI/FRAS）维护与人类检索。

---

## 1. 粒度怎么定（可量化，不拍脑袋）

一个 **owner 域**（owned domain）的目标边界：

| 维度 | 阈值 | 依据 |
|---|---|---|
| 源码体积 | **1,500–3,000 行** / owner | 单个 owner 的上下文预算（含 README/测试/文档） |
| 单文件 | **≤300 行** | 超过即拆为同目录多文件 + `index.ts` barrel |
| 包数量 | ≤4 个包 / owner | 跨包切换成本 |
| 耦合 | 域内依赖为主；跨域依赖 ≤3 个方向 | 降低协调成本 |
| 测试 | 每个包至少有测试目录/文件；域整体可独立跑 `vitest` | 可验证 |
| 元语料 | 每包 `README.md` 五段（R2） | 索引锚点 |

**拆分信号**（任一满足即拆目录）：
1. 单文件 >300 行；
2. 一个 `index.ts` 同时承担 ≥3 类职责（如"解析 + 校验 + 渲染"）；
3. 两个 owner 需要频繁改同一文件（写域冲突）；
4. 文件在 FRAS 里 R/A 字段超过 6 个（说明耦合过重）。

**合并信号**：<300 行且无人独立使用的包，可并入相邻包（需 ADR）。

## 2. 目录契约（文件夹替代"单文件堆一堆"）

```
packages/<pkg>/src/
  index.ts        # barrel：只做 re-export，不写业务逻辑（≤80 行）
  <submodule>.ts  # 单职责、≤300 行
  <submodule>/    # 需要时用子目录（同样有 index.ts）
  *.test.ts       # 测试可与实现同目录（不受 300 行约束，但 >400 行建议拆）
```

- 对外只通过 `index.ts` 导出；跨包禁止深路径 import（`@covenant/x/src/...` 不允许）。
- 每个子目录/包必须有 README 五段；新增文件必须补 FRAS 条目。
- 目录即索引边界：Agent 先读目录 + README，再读单个文件，避免上下文爆炸。

## 3. 团队编制（work groups）

| 组 | 域名 | Owner | 包（写域） | 说明 |
|---|---|---|---|---|
| `core-semantics` | `core` | **core-owner** | `core`、`profile`、`validate` | 契约模型、剖面、校验；不改渲染/CLI |
| `visualization` | `viewer` | **viz-owner** | `layout`、`render` | 布局、SVG、HTML 查看器；黄金图守卫 |
| `authoring` | `authoring` | **tools-owner** | `patch`、`diff`、`indexer`、`ai`、`adr`、`editor` | 补丁/编辑/索引/ADR/语义 diff |
| `interfaces` | `interface` | **iface-owner** | `cli`、`mcp` | 命令入口与 MCP 工具；不写业务逻辑 |
| `governance` | `architecture` | **arch-guard**（只读） | 无代码写域；只写 `docs/audits/` | 规范/耦合/索引/README 审计，发整改单 |
| `planning` | `planning` | **todo-scribe** | 仅 `todo/` | 原话、计划、决策、开放问题 |

- **共享文件只有 Lead 可改**：`arch/index.yaml`、根 `package.json`、`docs/` 全局文档、`covenant.yaml`。
- Owner 完成拆分后由 **Lead / index-keeper** 统一 `pnpm index --write`，避免并发写冲突。
- 跨域修改必须由 Lead 转派并声明 write scope（借用需写清原因/影响/归还计划）。

## 4. 每个 owner 的开工清单

1. 读 `packages/README.md` + 自己域内每个包的 `README.md`；确认职责边界；
2. 列出现有公开 API 与超 300 行文件；
3. 拆分：同目录多文件 + barrel，**不改行为**（SVG/HTML 字节级不变；黄金测试不动）；
4. 更新本域包 README（五段，接口变化时同步）；
5. 跑 `pnpm typecheck` + 本域 `pnpm exec vitest run packages/<pkg>`；**不要**跑全仓 `pnpm verify`（索引由 Lead 统一刷新）；
6. 回报：文件行数前后、公开 API diff、测试结果、未决问题。

## 5. 当前基线（2026-11-03 量化）

| 包 | 文件 | 行数 | 超 300 行文件 |
|---|---:|---:|---|
| render | 6 | 2241 | html.ts 868、index.ts 575 |
| cli | 8 | 1751 | index.ts 758 |
| validate | 2 | 989 | index.ts 463 |
| layout | 3 | 921 | index.ts 570 |
| patch | 6 | 688 | 已拆分：parse/text/audit/gate/apply/index 均 ≤300 |
| profile | 1 | 859 | index.ts 859 |
| mcp | 3 | 526 | index.ts 400 |
| editor | 2 | 238 | — |
| adr | 2 | 210 | — |
| diff | 2 | 201 | — |
| ai | 2 | 228 | — |
| core | 3 | 241 | — |
| indexer | 2 | 157 | — |

> 2026-11-03 实测修正：上表旧数字为初始快照；`patch` 已按本规范拆成 6 文件（均 ≤300），其余包实测 diff 201 / editor 238 / adr 210 / ai 228 / indexer 157，均 <300 未拆。\n> 注意：本仓库目前**没有 XERJ 向量检索后端**；索引能力=FRAS（AOCI 风格）。XERJ 可作为后续增强，不影响本规范的目录/元语料约束。

## 6. 与 Indexer / RAG 的配合

- **目录/文件级**：FRAS 的 F（职责）/R（依赖）/S（隐性约束）就是检索锚点；拆分越细，命中越准。
- **文档-代码对应**：每个包 README 五段 + FRAS 条目，构成"模块语料"；RAG 检索先命中语料，再下钻源码。
- **减少 git diff 依赖**：索引按内容哈希（`source_sha256`）判定新鲜度，不依赖行号/历史；拆分文件后仍可定位（路径 + 条目），git 只是可选审计。
- **AOCI**：`arch/index.yaml` 即 FRAS 载体；维护节奏：每个任务完成 → 更新条目 → `pnpm index --write`。
- **XERJ（待接入）**：若后续接入，仅作为底层检索后端，读写隔离，由 indexer 角色独占写入。
## 7. 子代理模式与 token 预算

不是所有子任务都需要 `standard`。按任务复杂度分配模式，并用 `tool_filter` 白名单进一步收敛：

| 任务类型 | 建议 mode | 工具白名单（示例） | 说明 |
|---|---|---|---|
| 只读扫描/统计/格式化检查/跑测试并汇总 | `mechanical` | `glob, grep, read, pwsh` | 只允许终端/读取，禁止写代码与网络；最省 token |
| 单文件/单包实现与重构 | `standard` | 默认 | 需要判断与编辑 |
| 架构/等价性/协议判断 | `deep` | 默认 | 高推理成本，仅关键裁决用 |
| DSH 插件/预设维护 | `creator` | 默认 | 仅 Creator 能力需要 |

约束：
- `mechanical` 子代理**不负责**架构裁决与语义修改；报告里必须给出命令与原始输出摘要，由 Lead 复核；
- 给子代理的 prompt 仍要写清写域；只读任务显式写"不要修改任何文件"；
- 能用一条 `pwsh` 命令解决的，不 spawn 子代理（上下文创建本身也有成本）。
