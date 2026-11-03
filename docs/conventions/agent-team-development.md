# 索引优先的模块化 Agent 协同开发范式（Index-First Agent Dev）

> **状态**：adopted（2026-11-03，ADR-0003）· **适用**：本仓库及用 Covenant 管理的项目
> **一句话**：不是写完代码再建索引；是在设计目录、划分模块时，就把"可被索引、可被检索"作为第一约束。

---

## 1. 核心命题

把**知识库结构**与**代码组织结构**统一成一套契约：

1. 代码组织从一开始就服务检索（模块化、目录即语义边界、目录自带元语料）；
2. 索引不是事后补的 RAG，而是开发规范的一部分，随 Git 版本受控；
3. 人和 Agent 共用同一套结构：人读目录与 README，Agent 读 FRAS 索引，不靠口头交接。

**四层结构**：

```
目录/模块契约（人工维护，最高约束）
        ↓
FRAS 高层索引（本项目：arch/index.yaml；机器只维护 source_sha256）
        ↓
源码 + 测试 + 文档（模块 owner 负责）
        ↓
Agent 团队（角色固定、写域隔离、按阶段推进）
```

Covenant 目前没有向量检索后端；本范式在 Covenant 里的落地形态是 **FRAS + 门禁 + 角色分工**，向量层（如 XERJ）是可选增强，不是前提。

---

## 2. 五条硬约束（R1–R5）

### R1 模块化与目录契约
- **一个能力一个包/目录**；禁止"万能 util 大文件"。
- 单文件 ≤ 300 行；超过必须拆（阈值可经 ADR 调整）。
- 目录层级 ≤ 4；目录名 kebab-case；包名 `@covenant/<能力>`。
- 新能力优先"新模块 + 新 README"，而不是往旧文件塞。

### R2 目录元语料（每个模块一份，强制）
每个模块目录必须有 `README.md`，固定五段：

| 段落 | 必须回答 |
|---|---|
| `## 职责` | 这个模块只做什么（一句话 + 边界） |
| `## 依赖` | 依赖谁、被谁依赖（只写方向与原因） |
| `## 公共接口` | 对外导出的稳定 API（函数/类型/命令） |
| `## 设计取舍` | 为什么这样拆、放弃了什么、已知代价 |
| `## 约束` | 不能做的事（禁止跨包读内部、禁止改门禁等） |

**门禁**：`pnpm modules` 校验；缺 README 或缺段落 → 失败，`pnpm verify` 直接红。

### R3 FRAS 高层索引（强制）
- 每个受管源文件在 `arch/index.yaml` 有一条：`F`（职责）、`R`（必须配套阅读的依赖）、`A`（上层调用者）、`S`（代码无法推导的隐性约束/取舍）。
- 机器只维护 `source_sha256`（`pnpm index --write`）；**语义由人确认**。
- 覆盖（I1）、新鲜度/孤儿（I2）、可读性（I3）任一失败 → `pnpm verify` 红。

### R4 读写隔离
- 只有 **`pnpm index --write`** 才能写哈希；Agent 不得手改 `source_sha256`。
- 语义编辑走"**先 diff、后合入**"：`covenant edit --diff` 预览 → `--accept` 写回（备份 + 审计）。
- 索引损坏/不同步 = 全团队检索能力瘫痪，必须可回滚（Git 或 `.audit` 快照）。

### R5 分层角色与写域
- **Lead**：拆解目标、派单、验收、发布决策；不写模块业务代码。
- **需求解读 agent**：把用户原话转成结构化需求/约束/验收（写入 `todo/` 与规格）。
- **架构守卫 agent**：**只读**审计（耦合、边界、README 缺失、索引失败、重复劳动）；不写业务代码。
- **模块 owner**：只在自己目录写；跨目录修改需 Lead 批准并声明 write scope。
- **Indexer 角色**：独占索引维护（`index --write`）与覆盖巡检。
- **todo-scribe**：只写 `todo/`（原话/计划/决策/开放问题）。
- 任何两个 Agent 的写域不得重叠；重叠即停手，交 Lead 调度。

---

## 3. 工作流预设（阶段化，可切换）

### P1 新模块
需求解读 → 架构守卫评审目录契约 → Lead 派模块 owner → 骨架 + README + FRAS 条目 → 实现 + 测试 → `pnpm index --write` → 验收。

### P2 定位 / 重构
**先索引后搜索**：`arch/index.yaml` 的 F/R/A/S 定位 → 只读相关文件 → 写失败测试 → 改 → `pnpm index` 确认新鲜度。

### P3 接口 / 格式变更
ADR → `covenant diff`（breaking 检测）→ 兼容窗口 → 迁移脚本/文档 → 索引同步。

### P4 性能 / 渲染优化
基准先行 → 改 → 黄金图/基准对比 → 重复验证（≥2 次）→ 记录取舍。

**公共门禁**：`pnpm verify`（契约 + FRAS + ADR + 模块文档 + 测试），发布前加 `pnpm cleanroom` 与 `pnpm covenant doctor`。

---

## 4. 索引维护节奏（可调参）

| 参数 | 当前值 | 调整方式 |
|---|---|---|
| 模块粒度 | 一能力一包（12 个包） | ADR 记录拆分/合并 |
| README 必填段 | 五段 | 修改 `scripts/check-module-docs.mjs` + 本文 |
| FRAS 必填 | F/R/S（A 可空） | 修改 schema/门禁 |
| 更新频率 | 每次提交前 `pnpm index`；阶段末 `--write` 并人工审 diff | 按阶段提高/降低 |
| 增量触发 | 内容哈希（无 git）；git 化后改 `git diff --name-only` | git init 后 |

---

## 5. 代价与反模式（必须正视）

**代价**：前期规范成本高；拆分粒度需要持续调参；索引是关键依赖（需快照/回滚）；架构守卫只能守底线，不能替代顶层设计。

**反模式**（出现即整改）：
- 大文件/万能 util；无 README 的新目录；索引攒着不更新；Agent 越界写其他模块；
- 先实现后补文档（应：先 README + FRAS，再实现）；
- 用"检索没找到"当"不存在"（必须报告查询范围）。

---

## 6. 与 Covenant 现状的映射

| 范式要素 | 现状 | 差距 / 下一步 |
|---|---|---|
| 目录元语料 | `packages/README.md` + 本轮新增 `packages/*/README.md` | 新包必须自带 README；`pnpm modules` 已生效 |
| FRAS 索引 | `arch/index.yaml`（25 条）+ `pnpm index` 门禁 | 增量触发等 git 化 |
| 角色分工 | Lead + todo-scribe 常驻；模块 owner 按包 | 架构守卫 agent 待常驻（只读审计） |
| 工作流 | verify / cleanroom / doctor / golden / diff 已有 | 预设模板写成可勾选清单 |
| 编辑隔离 | `covenant edit`（human-only，diff 预览，备份审计） | 与 `patch-check` 整合 |
| Git 驱动 | 未 `git init`（待用户） | init 后接 `git diff` 增量 + CI |

## 7. 执行清单（从现在开始）

- [x] 规范成文 + ADR-0003
- [x] `packages/*/README.md` 五段元语料 + `pnpm modules` 门禁纳入 verify
- [x] 编辑走 diff 预览 + 备份 + 审计（human-only）
- [ ] git init 后：diff 增量索引 + CI
- [ ] 架构守卫 agent 常驻（只读审计报告）
- [ ] 每阶段评审：模块粒度与 README 模板（有变更即 ADR）
