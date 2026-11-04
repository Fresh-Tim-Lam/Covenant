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
