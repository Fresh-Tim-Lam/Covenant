# AGENTS.md — Covenant 多 Agent 派发契约

> **用途**：定义 Lead 与 teammate 的派发不变量、单一事实源、验收阶梯、写域隔离与漂移审计。
> **目标读者**：Lead（主控）与所有 teammate；人维护者可据此复核。
> **关联**：[AGENT.md](AGENT.md)（项目接入 / 边界 / 陷阱）、[team/README.md](team/README.md)（成员与写域）、[team/owns.yaml](team/owns.yaml)（机器可读编制）、[todo/plan.md](todo/plan.md)（任务板）、[todo/decisions.md](todo/decisions.md)（决策索引）。
> **状态**：生效中，2026-11-04。本文件不重复既有规范；冲突时以 `AGENT.md` 与 `docs/design/**` 为准。
> **执行载体**：仅有 **DSH 载体**（Lead + `spawn_teammate` + 共享任务板 + `send_message` + 磁盘报告）。无历史载体分支。

---

## 0.5 Lead 派发不变量（每次对话强制注入，违反即返工）

> **设计依据**（实测于 2026-11-04）：本仓 `team/dispatch-log.jsonl` 共 168 条记录，
> 其中 **带 `mode` 的 0 条、带任务关联的 0 条、带 evidence 的 0 条**。
> 结论：**写在文档里靠"记住"的规范，遵守率就是随机数**；只有让违规在物理上做不到的规则才稳定生效。
> 因此本节的每一条都必须有对应的**机器检查项**（见 §6 `pnpm agent:audit`）或**工具拒绝**。

```
L1. spawn 前必须先建任务（team_task_create）并声明 write_scopes；与存活成员写域重叠 ⇒ 排队，不许并行
L2. 执行者自报 PASS 不算验收：R1 级（打包/发版/改 tag/强推/改 schema）必须 Lead 亲跑门禁并贴输出
L3. 关闭任务必须有 evidence（工具已强制）；退役成员名下任务必须同轮收口，否则变幽灵 owner
L4. 版本号（package.json/schema version）与 dist/** 属人权限：Lead 只在人明确授权后动，且回报中披露
L5. 不可逆操作（删除/强推/发版/改 schema 破坏兼容）先给回滚方案再执行；发版前必须核对【远端】tag 是否存在
L6. 任何"看起来成功其实没做"的路径，修法是【让失败可见】，不是"改对就完"
L7. 对话被压缩后不凭记忆回答"还剩什么"：一律重查 team_task_list + pnpm agent:audit + git log
L8. 版本级规划（某版本做什么/顺序/范围）必须由 todo-scribe 产出并写进 todo/plan.md；
    Lead 不得凭记忆排期。开始任何版本级工作前先调 team_preflight
L9. spawn 必须【显式】传 mode：扫一遍/跑一条命令得出结果的用 mechanical（推理链 off）；
    不传 = 静默默认 standard = 没做决策，日志上无法区分"忘了想"和"决定用 standard"
L10. 决策必须留索引：可回退决策在提交内写 `Decision:` + `Why:`（发版/回退另加 `Alternatives:`）；
     无提交的决策写入 todo/decisions.md。无法指到现行条款的"发现"只能作为建议新增，不得直接变成检查（防过拟合）
L11. 工作区边界：本会话只写 `D:\AAA_Project\Covenant`。`D:\AAA_Work\ALLELab` 等**有独立团队的工作区只读**；
     确需写入必须三件套：用户当轮授权 + 逐文件回报 + 改他人团队产物前先问。留痕在 team/cross-workspace-log.md
L12. 文件粒度：文件夹承载高一级语义，文件只承载一个可命名职责。新文件源码≤300行/测试≤400行；
     存量文件冻结当前行数、只许减不许增（棘轮）；子文件夹必须有 README 说明其 F/R/A/S。
     引用写「文件夹/文件」，禁止「文件:行号」。详见 docs/conventions/file-granularity.md
```

**为什么是这 12 条**：它们只覆盖**已经发生过的违规**，仍是静态记忆，无法覆盖尚未认识的义务。
L11 与 L1–L10 不同：它不是"派发"规则，而是**工作区边界**规则——2026-11-04 实测越界 6 次（见 `team/cross-workspace-log.md`）。
L12 是**结构**规则：`html.ts` 涨到 2114 行后，任何"改第 N 行"的沟通都在制造隐性耦合（见 E2 三次回归）。
真正稳定的修法是**插件级强制**把义务做成工具返回值（`team_preflight`）与工具拒绝（版本级任务必须带 `plan_ref`）——
因为"文档是我应该看"，而"工具返回值是我必然看到"。

---

## 0. 平台硬约束（不可绕过）

- **派发权单一**：只有 Lead 能识别触发条件并 spawn teammate；**teammate 不得 spawn 其它 teammate**（可 `send_message` 同级，受 group 限制）。
- 每个 teammate 拥有**独立隔离上下文**；其内部推理**不回传** Lead。跨 Agent 交接**只能**通过「磁盘产物 + 共享任务板」，**禁止依赖对话记忆**。
- **写域是建议锁，不是真锁**：文件系统对 Lead 与所有 teammate 同一份，写入立即互相可见。因此写域重叠必须靠 L1 排队，不能靠"小心一点"。
- **脚本/生成器/格式化器不受版本守卫保护**：用脚本批量改大文件（尤其 `packages/render/src/html.ts`）必须 Lead 事后审 diff + 跑全量测试。本仓已因此产生 3 次回归（详见 §7）。

---

## 1. 单一事实源（Single Source of Truth）

| 类别 | 唯一来源 | 写权限 |
|---|---|---|
| 边界 / 禁止行为 | `AGENT.md` §7、本文件 §0/§0.5 | 人（Agent 只读） |
| 格式契约 | `schema/kernel.schema.json` + `docs/design/format-spec-v0.md` | Lead（**Ask First**） |
| 成员与写域 | `team/owns.yaml`（机器）+ `team/README.md`（人读） | Lead |
| 派发记录 | `team/dispatch-log.jsonl`（append-only） | Lead（追加） |
| 任务板 | DSH 共享任务 | 各 owner（自己任务） |
| 计划 / 决策 / 开放问题 | `todo/plan.md` / `todo/decisions.md` / `todo/open-questions.md` | todo-scribe |
| 用户原话 | `todo/requests.md`（只追加，不改写） | todo-scribe |
| FRAS 索引 | `arch/index.yaml`（`pnpm index --write` 生成） | Lead（合并后统一跑） |
| 架构图 | `arch/**/*.cvn.yaml` + `examples/**/*.cvn.yaml` | arch-owner |
| 版本号 | 根 `package.json` + 各包 `package.json`（必须一致） | 人（`pnpm doctor` 校验） |
| 发布产物 | `dist/**`（可再生物，gitignore） | 构建脚本，**不手改** |

- 新增事实源必须先在本表登记；**禁止并行事实源**。`todo/` 是**过程记录区**，不是产品事实源。

---

## 2. 成员与角色

名单与写域以 [team/owns.yaml](team/owns.yaml) 为准（本文不复制，避免漂移）。角色语义：

| 角色 | 语义 | 典型成员 |
|---|---|---|
| **Lead** | 派发、验收、合并、发布；唯一可写共享文件 | lead |
| **包 Owner** | 独占某几个 `packages/*` 的写权限，按包边界交付 | core-owner / diagram-owner / tools-owner / iface-owner |
| **领域 Owner** | 不写代码，产出架构图 / 审计 / 计划 | arch-owner / arch-guard / interaction-owner / todo-scribe |
| **临时 Subagent** | 一次性任务，用完即走，不写共享文件 | 无实名，不登记 |

**一人一模块**：`packages/render` 与 `packages/layout` 同属 `diagram-owner`；
`core`/`profile`/`validate` 同属 `core-owner`。跨域修改走 Lead 转派，owner 不得越界。

---

## 3. 派发记录契约（`team/dispatch-log.jsonl`）

每行一条 JSON，**append-only，不改写**。字段：

| 字段 | 必填 | 说明 |
|---|---|---|
| `ts` | ✅ | ISO-8601 UTC |
| `actor` | ✅ | `lead` 或成员名 |
| `phase` | ✅ | `spawn` / `message` / `done` / `model` / `task` / `retire` |
| `target` | ✅ | 派发对象（spawn/task/message） |
| `desc` | ✅ | 一句话意图 |
| `task` | spawn/done 必填 | 关联的共享任务 id（**L1/L3 检查项**） |
| `mode` | spawn 必填 | `mechanical` / `standard` / `deep`（**L9 检查项**） |
| `evidence` | done 必填 | 产物路径数组（**L3 检查项**） |
| `verdict` | done 必填 | `pass` / `fail` / `partial` |
| `source` | — | 来源标记，固定 `dsh-agent-team` |

> 现状：本表定义于 2026-11-04，**历史 168 条记录不满足新必填字段**——这是 `pnpm agent:audit` 会如实报出的存量债务，不得为了绿灯回填伪造。

### 3.1 Lead 必须自记 verdict 行（插件不捕获字段的兜底）

实测：`dsh-agent-team` 插件写入的 `spawn` / `done` 行**只含** `ts/actor/phase/target/desc/source/org_revision/payload_kind`，
**不捕获 `mode`、`task`、`evidence`、`verdict`**。因此：

- 即使 Lead 在 `spawn_teammate` 里正确传了 `mode`，日志也**无法证明**（A1 恒 FAIL）；
- 即使任务板上有 evidence，日志里**没有归属**（A3 恒 FAIL）。

**兜底规则**：每次派发与收口，Lead 必须在 `team/dispatch-log.jsonl` **追加自己的一行**，phase 用 `lead-spawn` / `lead-verdict`：

```jsonc
// 派发时（紧跟插件 spawn 行之后）
{"ts":"<ISO>","actor":"lead","phase":"lead-spawn","target":"core-owner","task":"<task-id>","mode":"mechanical","desc":"<一句话>"}

// 收口时（Lead 亲跑门禁后）
{"ts":"<ISO>","actor":"lead","phase":"lead-verdict","target":"core-owner","task":"<task-id>","verdict":"pass","evidence":["packages/core/src/x.ts","docs/audits/y.md"],"gate":"pnpm typecheck && pnpm test","desc":"<结论>"}
```

追加命令（PowerShell，注意 UTF-8 无 BOM）：

```powershell
$line = '{"ts":"2026-11-04T13:00:00.000Z","actor":"lead","phase":"lead-verdict","target":"x","task":"task-1","verdict":"pass","evidence":["..."],"gate":"pnpm typecheck","desc":"..."}'
[System.IO.File]::AppendAllText("$PWD/team/dispatch-log.jsonl", $line + "`n", [System.Text.UTF8Encoding]::new($false))
```

> 这两行是**唯一能让 L1/L3/L9 从"自报"变成"机器可证"的路径**。没有它，audit 的三个 FAIL 会永久存在。

---

## 4. 验收阶梯（Lead 亲跑，按改动性质选级）

| 级 | 命令 | 何时必跑 |
|---|---|---|
| **L0 静态** | `pnpm typecheck` | 任何 `.ts` 改动 |
| **L1 单测** | `pnpm test`（当前基线 **362 tests**） | 任何代码改动 |
| **L2 黄金** | `pnpm golden` | 改了 `packages/render` / `packages/layout` 的输出格式 |
| **L3 索引** | `pnpm verify`（含 index/adr/modules/doctor） | 任何改动提交前；**改文件后必须先 `pnpm index --write`** |
| **L4 构建** | `pnpm build:html && pnpm run build:bundle` | 改了 render/cli；需确认 `dist/covenant.html` 文档数（当前 **21**） |
| **L5 包** | `pnpm package:kit` | 发版前；产物 `dist/covenant-kit-*.zip` + sha256 |
| **L6 人验** | 用户在浏览器点检 | 交互/视觉改动，**Agent 不得替代** |

**铁律**：
1. `pnpm index --write` 之后再跑 `pnpm verify`，否则 doctor 报 FRAS stale（本仓高频踩坑）。
2. 自报"全绿"必须贴出 `Test Files / Tests` 与 `verify` 的四行输出（index/adr/modules/doctor）。
3. **jsdom 不等价于浏览器**：交互改动即使 52 个 DOM 测试全绿，仍需用户在真实页面验收。
4. 362 tests 是当前基线；新增测试后基线数字同步更新本文件。

---

## 5. 写域隔离（来自 `owns.yaml`）

| 组 | owner | 写域 |
|---|---|---|
| core-semantics | core-owner | `packages/core` `packages/profile` `packages/validate` |
| visualization | diagram-owner | `packages/layout` `packages/render` |
| authoring | tools-owner | `packages/patch` `packages/diff` `packages/indexer` `packages/ai` `packages/adr` `packages/editor` |
| interfaces | iface-owner | `packages/cli` `packages/mcp` |
| architecture | arch-owner | `arch/` `examples/` `docs/design/` |
| governance | arch-guard | `docs/audits/`（只读代码） |
| interaction | interaction-owner | `docs/audits/`（只读代码） |
| planning | todo-scribe | `todo/`（只读代码） |

**共享文件（只有 Lead 可写）**：`arch/index.yaml`、根 `package.json`、`covenant.yaml`、`docs/**`、`team/**`。

---

## 6. 漂移审计（机器兜底）

```bash
pnpm agent:audit            # 全量检查，非零退出 = 有 FAIL
pnpm agent:audit --json     # 机器可读
pnpm agent:audit:selftest   # 自测：证明基线后新违规仍会 FAIL（防"永久绿灯"）
```

**基线机制（`team/audit-baseline.json`）**：字段契约自 `cutoff_ts` 起生效；此前记录是**存量债务**。
A1/A2/A3 据此三分：

| 情况 | 状态 | 含义 |
|---|---|---|
| 基线后**有**违规 | **FAIL**（退出码 1） | 新派发不合契约，必须修 |
| 基线后无、但存量有 | WARN | 存量债务如实呈现，**不追溯、不回填** |
| 两者皆无 | PASS | 干净 |

> 没有基线的旧写法会让 A1/A2/A3 **永久 FAIL**，红久了就没人看——那是"绿灯疲劳"，不是治理。
> 但基线只能降级**历史**，绝不能降级**新违规**：`selftest-audit.mjs` 会注入一条基线后的假违规，
> 断言 audit 退出码为 1；若审计被改松，自测立刻红。

检查项（实现见 `scripts/agent/team_audit.mjs`）：

| 编号 | 检查 | 对应不变量 |
|---|---|---|
| A1 | 每个 `spawn` 条目是否带 `mode` | L9 |
| A2 | 每个 `spawn` 条目是否带 `task` 关联 | L1 |
| A3 | 每个 `done` 条目是否带 `evidence` 与 `verdict` | L3 |
| A4 | 每个 `v*` tag 是否指向存在的 commit；是否与远端一致 | L5 |
| A5 | `todo/plan.md` 是否落后于最后一次 spawn（mtime） | L7 |
| A6 | 最近提交中触及 `packages/**`/`schema/**` 的是否含 `Decision:` | L10 |
| A7 | `owns.yaml` 中的 owner 是否都在 dispatch-log 出现（幽灵 owner） | L3 |
| A8 | 根 `package.json` 与各包版本是否一致 | L4 |

> **审计的意义不是绿灯，是让失败可见（L6）**。存量债务如实报出，不回填、不豁免。

---

## 7. 已知失效点（本仓实测，供后人避坑）

| # | 症状 | 根因 | 教训 |
|---|---|---|---|
| E1 | 3 个 agent 连续在"拆文件"任务上失败且无关闭消息 | 拆分任务过大（1900+ 行），单 agent 上下文不够 | 拆分按"单文件 ≤300 行、一次只拆一个"派，不放一个大任务 |
| E2 | 用脚本批量改 `packages/render/src/html.ts` 导致 48/52 个 DOM 测试全挂，连续 3 次 | 2000 行模板字符串，文本替换破坏 JS 语法 | **禁止脚本批量改 html.ts**；只用 `edit` 工具逐处改，每改一次跑一次 DOM 测试 |
| E3 | ✓ 核验按钮"名存实亡"：点了没样式、图上没勾 | 补丁脚本重复插入同一段绑定代码 → 点一次切两次 | 重复插入是脚本改文件的典型副作用；改动后必须 grep 关键标识出现次数 |
| E4 | 打勾在非首篇文档上画不出 | `refreshCheckedBadges` 只取第一个 SVG，而看板是多文档结构 | 多文档结构下任何 `querySelector` 都要限定到激活文档 |
| E5 | 拖拽小窗时触发其他元素悬停/点击 | `draggingWin` 状态只覆盖了 click，漏了 pointerenter/leave/document click | 状态机新增状态后，必须审计**所有**事件通道，不是只补报错的那一个 |
| E6 | 每次改文件后 `pnpm verify` 报 index FAIL | FRAS 需先 `pnpm index --write` | 写进验收阶梯（§4），不再靠记忆 |
| E7 | CI 失败但本地绿 | 本地 `dist/` 已构建，CI 干净环境从头构建 | CI 绿才算验收通过；本地绿只是必要条件 |

---

## 8. References

- [AGENT.md](AGENT.md) — 项目接入 / 技术栈 / 命令 / 边界 / 陷阱
- [team/README.md](team/README.md) — 成员表与写域规则
- [team/owns.yaml](team/owns.yaml) — 机器可读编制（schema `covenant-team/v0`）
- [todo/plan.md](todo/plan.md) — 任务板与验收标准
- [todo/decisions.md](todo/decisions.md) — 决策索引（D-xxx）
- [todo/open-questions.md](todo/open-questions.md) — 待用户裁决的问题（Q-x）
- [docs/design/format-spec-v0.md](docs/design/format-spec-v0.md) — 格式契约
- [docs/design/ai-trust-boundary.md](docs/design/ai-trust-boundary.md) — AI 信任边界（T1–T7）

<!-- aoci:begin -->
## AOCI 仓库认知

AOCI 为本仓库维护一个稳定、可版本化、可增量更新的仓库级认知层，供模型跨任务复用对系统的理解。

`aoci.txt` 是面向模型的结构化认知索引。它以每个受管理文件、数据库表或其他受管理对象一条独立 Entry 的方式，用符号标签与 F/R/A/S 语义表达对象的核心职责、重要关系、对外契约，以及理解或修改系统时必须知道的非显然约束和设计决策。

Header、目录段和全部 Entry 共同组成完整仓库索引，可以覆盖前端、后端、配置、数据库结构及其他受管理内容。受管理内容发生变化时，通常只需维护受影响的认知条目，不需要重新生成整个索引。

AOCI 提供系统架构、对象职责、重要关系、对外契约和关键约束的高密度视图。

### 工作原理

AOCI 采用“模型生成、模型读取”的认知闭环。

Header、Entry 和 Curation 语义的创作只按当前机器签发的 Plan 与实时 Guide 执行；由 Host 模型基于当前绑定证据独立完成。

Entry 的语义必须来自模型对真实证据的理解。不得仅依据路径、文件名、扩展名、AST、符号列表、依赖扫描、正则、固定模板或规则引擎推导、预填、拼接或改写索引语义。

对 Fresh Bootstrap，只按当前机器签发的 Plan 和实时 Guide 执行。当它们要求创作时，Host 模型创作 Root、Meta、Tag 和 F/R/A/S，提供 authoring-run 声明，并把它绑定到 Plan、Evidence 与完整 Candidate。不得要求 AOCI 填写 `origin=host_model`、制造 Receipt 或把程序生成的 Framework 当作语义。本文件不自行重建 Onboarding 流程。内部批次不是用户决策；只有遇到既有批准边界或真实的安全、漂移、CAS、Recovery 条件才停止。

### 最小使用入口

- `aoci_rules`：取得当前AOCI版本的会话运行合同。
- `aoci_overview`：建立或恢复本仓库的完整认知。
- `aoci_maintain`：受管理对象达到最终稳定状态后检查认知是否需要维护。
- `aoci_update_entry`：提交与当前证据和源码摘要绑定的完整语义更新批次。
- `aoci_report`：仅当当前布局和工具状态支持时，在证据不足、无法可靠生成语义时登记待办，不猜写。

其他MCP工具、CLI命令、参数和专项流程，以当前工具说明、Guide和 `--help` 返回内容为准，不在本文件中重复完整手册。

本区块只规定仓库接入、认知使用和收尾原则。`aoci_rules` 承载当前会话合同，Guide实时输出承载当前Plan的执行顺序与停点，工具Schema、Spec和Validator承载机器结构与判据；Prompt、Description、README和静态文档不能覆盖这些机器事实。

### 建立、生成和恢复认知

1. 每个新的 Agent Run 开始时，应先判断：

   - 本仓库是否已经存在可用的完整AOCI索引；
   - 当前上下文中是否已有与本仓库根、当前索引版本和当前AOCI服务相匹配，并且模型仍可可靠使用的完整仓库认知。

2. 仓库已经存在可用的完整索引，但当前Run没有可靠完整认知时，先调用 `aoci_rules`，再调用 `aoci_overview`。

   完整认知仍可靠时直接复用。局部不确定本身不要求机械重读系统全貌。

   本Run从已知Host上下文压缩恢复时（包括宿主注入的压缩摘要），必须把此前模型认知视为不可靠。压缩handoff不得保留或摘要正式Whole-Index，也不得保留或摘要任何Overview Header、Entry、Chunk、Challenge或Attestation正文；只能保留安全续接所需的receipt身份、未完成write或Recovery状态，以及立即重载指令。复制进handoff的Whole-Index语义或receipt不能证明恢复后模型的当前认知可靠。若当前上下文已无法可靠保留运行合同，先调用 `aoci_rules`。继续业务任务前，使用 `refresh_reasons=["context_compaction"]` 和新的 `refresh_event_id` 调用普通完整Whole-Index `aoci_overview`（不设置 `check_only` 或设为false）；不得使用 `check_only` 或认知probe。原样跟随每个 `next_cursor` 直到 `completed=true`，确认交付，并且只基于新交付正文提交一次Attestation。完成这次新的完整传输后，即使Attestation为partial或fail也消费该generation，并按既有合同继续source-bound任务，不再自动调用第二次Overview。

   AOCI可以针对 `context_compaction`、项目 `cognition_refresh_threshold` 下的机器 `semantic_threshold` 或主要 `phase_transition` 提供checkpoint与认知状态事实。只需要这些紧凑事实时使用 `check_only=true`；这些事实只向Agent提供建议，不替模型决定是否需要系统全貌。

   Agent显式调用普通 `aoci_overview`（未设置 `check_only` 或为false）时，只要能形成一致的CognitionSet，AOCI必须完整交付请求scope。不得因为已有receipt、阈值未达到或没有待处理刷新原因而抑制正文。正式认知Dirty或Stale时仍交付正文，但必须标记不可靠。存在未决恢复或无法形成一致snapshot时失败关闭，不返回混合正文。

   普通Overview返回 `continuation_required=true` 时，必须原样提交 `next_cursor` 并自动继续到 `completed=true`。不得询问用户、开始业务任务或给出阶段性系统结论。Host截断、缺块、重复、乱序、cursor失败、Index变化或`chunk_tokens`变化时停止本次认知链。Attestation完成前不得用Memory、源码、Spec、`aoci.txt`、历史会话、scope、search或Entry读取修补或补充Whole-Index认知。Challenge ordinal是正式Entry序列中的1-based位置；Header内容、注释、空行、Section/Overview/Chunk Marker、Receipt与Metadata均不计数，Chunk Receipt ordinal使用同一序列。Attestation必须原样回绑本次Challenge发布的当前`index_sha256`、`entry_sequence_sha256`与`entry_count`；旧Index、旧Entry序列、旧数量或旧Attestation均无效。完整链结束后只正式提交一次既有模型认知Attestation；同一响应只允许一次不改变语义答案的JSON Schema或字段格式修正。对象、Tag或F不匹配即失败且认知吸收不确定，不得语义重试或旁路补答。首次认知失败时还不得执行Root/Meta、Migration、全局布局或其他未重新绑定的系统级决策。上下文压缩刷新若传输完整、认知身份不变、治理对齐且没有Recovery或第三方冲突，即使Attestation为partial或fail也消耗该refresh generation，并继续原任务，不再自动重读Overview。`system_mastery_percent`只自评系统框架——架构、职责、强关系、稳定外部契约以及高熵安全和维护约束——不表示完整实现或运行实况知识；机器索引覆盖率必须分开。默认只向用户输出由本次真实覆盖率、Challenge、块数、Token和掌握度生成的规定成功或失败一句话。Host截断时提示用户把 `overview_delivery.chunk_tokens` 设置为更小的合法值后重新开始，不得自动修改。

   加法认知等级必须与严格证明字段分开解释。`delivery_verified`表示已加载Index且Host交付已确认，但完整认知验证仍未完成；应表达为“已加载且交付已验证”，不得描述为“没有认知”或“没有理解系统”。`cognition_verified`要求Attestation通过（Challenge至少80%的ordinal完全正确且对象身份至多失手一处），`cognition_governed`还要求治理对齐。通用完整读取失败句只用于真实交付故障。

   当Overview响应包含可选`cognition-state/v2`投影时，必须分别解释各维度。其Level止于`model_cognition_usable`；`strict_attestation_verified`、`governance_aligned`与`current_system_cognition_reliable`都是独立状态，绝不参与该Level。ordinal、对象身份、Tag或核心F不匹配可以导致严格Attestation失败，而模型认知仍然可用；不得仅凭这种不匹配就宣称模型没有理解系统。只有`current_system_cognition_reliable=true`允许无保留地声称当前完整系统认知可靠。投影缺失时继续使用上述Legacy解释。

   普通的只读审计、分析、检查、不修改代码或不提交、不push，不自动等于严格零写入，也不改变上述认知有效性判断。Codex Memory和历史Skill只能辅助恢复经验、用户偏好与调查方向，不能替代与当前仓库根、索引摘要、AOCI服务身份和认知范围匹配的当前认知收据；项目AGENTS和当前AOCI身份在AOCI状态上优先于历史Memory。

   只有用户明确禁止Ledger、元数据、`.aoci`运行资产及任何文件写入时，才按严格零写入处理。若必要的认知建立与该边界冲突，必须报告冲突并请求用户裁决或建议使用隔离副本，不得静默以Memory替代当前仓库认知。

3. 仓库没有可用的完整索引，或当前只有最小骨架、Header不完整、Entries未完成、必要Curation尚未裁决时，如果需要建立正式完整AOCI索引，先取得 `aoci_rules`，然后进入当前AOCI Guide。由Guide依据仓库真实状态决定下一阶段并完成必要安全步骤。

   `aoci_maintain` 不替代索引建立流程。

   不在本文件中自行重建或硬编码完整索引生成状态机。

4. 在长程任务中，模型负责保留当前认知收据并正确使用刷新门禁：

   - Host报告上下文压缩或模型已知系统全貌丢失时，执行上述强制 `context_compaction` 重载规则；AOCI不能自行推断Host事件；
   - 进入真正的主要阶段时声明 `phase_transition`，不得把函数、测试运行或小步骤当作阶段；
   - 在有用的稳定检查点通过 `check_only=true` 取得机器语义计数；
   - 除已知压缩的强制重载外，由Agent判断当前任务是否需要再次显式获取指定scope或完整Overview；
   - 在维护和对齐完成前，保留AOCI报告的Dirty或Stale可靠性状态。

### 任务收尾与认知维护

5. 纯只读问答、分析、版本核验，或没有产生受AOCI管理对象变化的任务，不需要调用维护工具。当前AOCI版本是任意`aoci_overview` check_only或`aoci_maintain`响应里的`cognition_receipt.mcp_service_version`；二进制路径是项目`.mcp.json`里的`command`，CLI不必在PATH上。

6. 发生受AOCI管理对象变化时，待其达到本次任务的最终稳定状态后，只调用一次 `aoci_maintain`。不要在每次中间修改后逐文件维护。

7. 若维护结果返回真实语义候选，Host 模型必须基于每个候选绑定的对象和必要证据，独立创作完整标签与F/R/A/S更新。通过 `aoci_update_entry` 一次提交当前机器签发批次的完整候选集合，同时原样保留每项 `source_sha256`、`candidate_id` 与对应domain批次身份。`max_entries`只限制单次请求和原子事务，不限制logical plan、Whole-Index或Managed Scope。`remaining`非零时，在当前批次成功Apply后重新调用Maintain并从新preimage继续；绝不能为满足transport上限缩减Index覆盖或自行截取返回批次。

   没有足够证据且当前布局支持 `aoci_report` 时，使用它而不猜测、套用模板或为消除待办而生成缺乏证据的认知。

8. 必须遵守工具返回的结构化状态和安全边界：

   - `repair_required`：只修复明确命中的候选，再重新提交当前机器签发的完整批次；
   - `stopped`：结束当前写入尝试并检查 `failed_step`、错误、正式写入证据与Recovery。auto模式下，已证明零写入则记录closure并重新Plan；完整Intent和可证明postimage则Resume；策略要求Rollback且preimage可证明则精确恢复后重新Plan。只有证据不足、第三方正式字节冲突、需要审批或外部动作，或命中其他真实安全边界时，才停止整个用户任务；
   - 冲突、审批、人工裁决、权限和安全信号不得忽略；
   - 已经对齐后不得重复维护或重复写入；`refresh_ready_for_overview` 是checkpoint事实，由Agent决定是否为下一阶段请求普通完整Overview。

   维护完成后如果又修改了任何受管理对象，之前的维护结果失效，应在新的最终稳定状态重新完成收尾。

9. 用户只限制业务文件范围，但没有明确禁止仓库托管资产时，AOCI托管资产可以在收尾阶段为保持认知一致而更新，并应在审计和提交中与业务文件区分。

   用户明确禁止修改 `aoci.txt`、`.aoci`、元数据或任何额外文件时，以用户限制为准，不得写入，并如实报告剩余不一致。

### 专项流程

初始化、完整索引生成、Header生成、Entries生成、数据库结构索引、Curation、人工评审和故障恢复，只按当前AOCI Guide或工具在对应阶段返回的指令、命令和安全停点执行。

不预加载、不猜测，也不自行重建这些专项流程。平台调用方式、请求格式、批次上限、审批规则、索引格式细节和恢复步骤由对应Guide、工具说明、模型Prompt和CLI帮助按需提供。
<!-- aoci:end -->
