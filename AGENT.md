# AGENT.md — Covenant 项目接入指南

> **本文件是 AI Agent 与新维护者进入本仓库的第一站。** 详细规则不在此重复，一律指向 `docs/` 单一事实源。
> **状态**：M0 末（2026-11-03）。**代码尚未开始**——本文件先于代码建立，用于约束后续所有 Agent 工作。
> **上新必读**：[docs/README.md](docs/README.md) → 本文件 §2 现状 → 再按任务读对应规范。

---



## 索引优先的 Agent 开发范式（Index-First Agent Dev）

规范全文：[docs/conventions/agent-team-development.md](docs/conventions/agent-team-development.md)（ADR-0003）。

- **目录元语料**：每个模块目录必须有 `README.md` 五段（职责/依赖/公共接口/设计取舍/约束），`pnpm modules` 门禁；
- **FRAS 索引**：新增/修改源文件后跑 `pnpm index`，`--write` 前人工确认语义；
- **读写隔离**：只有 `pnpm index --write` 写哈希；语义编辑走 `covenant edit --diff/--accept`（human-only、备份、审计）；
- **角色与写域**：Lead / 需求解读 / 架构守卫（只读）/ 模块 owner / Indexer / todo-scribe；跨目录修改需 Lead 批准；
- **先索引后搜索**：定位问题先读 `arch/index.yaml` 的 F/R/A/S，避免盲扫全仓；- **模块 owner 编制**：见 [docs/conventions/module-ownership.md](docs/conventions/module-ownership.md) 与 `team/owns.yaml`（写域互不重叠，共享文件仅 Lead 可写）。## 1. Role（角色）

**Covenant** 是一套**面向人机协作的软件工程图示语言**：

- **一个开放文本格式**（`.cvn.yaml`）：语义图 + 批注 + 约束，可校验、可 diff；
- **一个确定性渲染引擎**：同一输入必得同一输出，SVG 优先，可生成自包含 HTML；
- **一套协作契约**：人把架构问题钉在图上，AI 读 `ai_hint` 并提交可校验补丁，人批准后生效。

你的职责：按 `docs/` 的规范推进里程碑（当前 M1），**不得自行扩大范围**。范围与优先级见 [docs/to-dolist.md](docs/to-dolist.md)。

**当前阶段**：M0 已完成；**M1 进行中**——`core` / `profile` / `validate` / `cli` 已实现并通过 typecheck 与单测，3 个示例全部通过 L1–L3。渲染与编辑器尚未开始。

---


## 2. 现状（最重要：不要假设代码存在）

| 已存在且**有运行证据** | 已存在但**未验证** | 尚不存在 |
|---|---|---|
| `packages/`：core / profile / validate / layout / render / patch / diff / indexer / ai / mcp / cli（typecheck 0，191 单测通过） | `examples/prototype/arch-prototype.html`（未在浏览器实测） | `editor` 完整版 / `ai` 包 |
| `arch/`：自举契约 + FRAS 索引（`check arch` 与 `index` 全绿） | `.github/workflows/verify.yml`（未实际运行，仓库未 git init） | `er@1` 之外的剖面、CI 实际运行 |
| `skills/covenant/SKILL.md`：给陌生 Agent 的一页使用说明 + MCP 工具表 | — | — |
| `dist/covenant.html`：45.2 KB / 3 图 / 0 外部请求（**可标注**：点选→表单→localStorage→导出补丁；jsdom 测试覆盖） | 真实浏览器未实测（仅 jsdom）；`covenant apply` 未实现 | `editor` 完整版（M3 收尾）/ `ai` / `mcp` 包 |
| `covenant check`：L1–L3，3 个示例 **0 error** | `schema/kernel.schema.json` 的语义覆盖（手工核对，无独立测试） | CI / 门禁 D1–D5 |
| `examples/*.cvn.yaml`（已过校验） | — | `arch/`（Covenant 自己的契约图） |
| `docs/` 全套设计/规范/范式 | — | FRAS 索引、许可原文 |

**M1 的 core/validate/cli 有运行证据（见 §4 与 docs/to-dolist.md）；渲染、编辑器、MCP 仍为零。**

---


## 3. TechStack（已定，勿自行更改）

| 层 | 选型 | 决策来源 |
|----|------|----------|
| 语言 | TypeScript（strict）+ pnpm workspace | D1 |
| 渲染 | SVG + DOM 叠层；ELK 布局（构建期算好布局作为主方案） | D2 / GAP-01 |
| 解析 | `js-yaml`（YAML 1.2 core schema，禁锚点/别名） | 格式规范 |
| 契约 | JSON Schema 2020-12 + `ajv` | `schema/` |
| 测试 | `vitest` + 黄金 SVG | 引擎架构 v0 |
| 交付 | **自包含单文件 HTML 优先**（双击可开） | D2 |
| 许可 | **AGPL-3.0 + 商业双许可** | Q8 |

---


## 4. Commands（✅ 已可用 / ⏳ 未实现）

| 命令 | 用途 | 状态 |
|------|------|:---:|
| `pnpm install` | 安装依赖（esbuild 构建脚本已在 `pnpm-workspace.yaml` 白名单） | ✅ |
| `pnpm typecheck` | 全仓 `tsc --noEmit` | ✅ |
| `pnpm test` | vitest（8 条单测通过） | ✅ |
| `pnpm check examples` | 校验 L1–L3，退出码 0/1/2/3/4 | ✅ |
| `pnpm render <f.cvn.yaml> [-o out.svg] [--view v.id]` | 布局 + 渲染 SVG（按视图选择器裁剪；先校验，有 error 拒绝渲染） | ✅ |
| `pnpm build:html <dir> -o out.html` | 生成可标注的自包含 HTML（每视图一个入口 `doc#view`） | ✅ |
| `pnpm package:kit` | 生成可交付包 `dist/covenant-kit-<ver>/`（单文件 CLI + 查看器 + 模板 + 文档 + schema） | ✅ |
| `pnpm build:bundle` | 打成文件夹站点 `dist/site/`（index.html + manifest.json + views/*.svg + annotations.json） | ✅ |
| `pnpm apply <doc> <patch.json>` | 应用补丁：base_rev 校验 → 文本块插入（保留注释）→ 临时文件复验 → 原子替换 → 审计 | ✅ |
| `pnpm patch-check <doc> <patch.json> --actor human:\|ai:` | 补丁门禁：越权/ai_hint/过期/目标/ID/enum；`apply` 默认先过它 | ✅ |
| `pnpm diff <a> <b>` | 语义 diff：cosmetic/material/breaking；有 breaking 时 exit 1 | ✅ |
| `pnpm index` / `pnpm index --write` | FRAS I1–I3 校验 / 只更新 `source_sha256`（不写语义） | ✅ |
| `pnpm verify` | 本地 CI 等价物：`check arch examples` + `index` + `test` | ✅ |
| `pnpm mcp` | 启动 stdio MCP server（8 个工具，供外部 Agent 调用） | ✅ |
| `pnpm golden` | 生成/更新黄金 SVG（改视觉前先看 diff） | ✅ |
| `pnpm ai brief <doc>` | 生成评审简报（未决批注 / ai_hint / 待答问题） | ✅ |
| `pnpm ai annotate <doc> --target …` | 生成 gate 可接受的 AI 批注补丁 | ✅ |
| `pnpm adr` | 校验 ADR（front-matter / 编号 / supersedes 链 / accepted 引用） | ✅ |
| `pnpm cleanroom` | 干净环境复现：复制仓库 → 重装 → verify | ✅ |
| `pnpm serve [dir]` | 只读托管 dist/，真实浏览器验收标注交互 | ✅ |
| `pnpm modules` | 模块五段元语料门禁（Index-First 范式 R2） | ✅ |
| `pnpm covenant doctor` | 环境自检（Node/pnpm/锁文件/schema/BOM/索引/ADR/git/产物/版本） | ✅ |
| `pnpm edit:serve` | 一键启动短时编辑态（`serve dist --edit --open`） | ✅ |
| `pnpm covenant edit <doc> <edits.json>` | 受控语义编辑：`--diff` 预览（原文件不动）/ `--accept` 写回+rev+备份+审计 | ✅ |
| 发布文档 | [CHANGELOG.md](CHANGELOG.md)、[SECURITY.md](SECURITY.md)、[CONTRIBUTING.md](CONTRIBUTING.md) | ✅ |
| `node scripts/svg-to-png.mjs …` | SVG→PNG 视觉核对（devDependency resvg） | ✅ |
| `covenant digest …` | 生成 AI 摘要投影 | ⏳ |
| `covenant build …` | 生成自包含 HTML | ⏳ M2 |
| `covenant serve …` | 本地服务（直写 + MCP） | ⏳ M3 |
| `covenant patch …` | 应用补丁（base_rev + intent） | ⏳ M4 |

> 门禁退出码约定见 [docs/design/gate-spec-v0.md](docs/design/gate-spec-v0.md) §2；**扫描 0 个文件返回 4**（防 CI 假绿）已实现。

---


## 5. Architecture（架构）

```
.cvn.yaml ──parse──► Doc ──validate(L0-L6)──► Findings
                      │
                      ├─layout(ELK|pins)──► Scene ──render──► SVG / 自包含 HTML
                      ├─digest────────────► AI 投影（10 token/元素）
                      └─patch/diff────────► 语义变更 + 批准 + 审计
```

| 目录 | 职责 | README |
|------|------|--------|
| `docs/` | 文档中心（调研/设计/参考/规范/范式模板） | [docs/README.md](docs/README.md) |
| `schema/` | 机器可校验的 JSON Schema（L1 契约） | [schema/README.md](schema/README.md) |
| `examples/` | 示例 `.cvn` + 可点击原型 | [examples/README.md](examples/README.md) |
| `arch/` | 自举契约（`system.cvn.yaml`）+ FRAS 索引（`index.yaml`） | [arch/README.md](arch/README.md) |
| `packages/` | pnpm workspace 源码包（core / profile / validate / layout / render / patch / diff / indexer / cli） | [packages/README.md](packages/README.md) |

---


## 6. Conventions（何时必读哪份）

| 你要做的事 | 必读 |
|-----------|------|
| 创建/移动任何文件 | [docs/conventions/directory-organization.md](docs/conventions/directory-organization.md) |
| 新增/移动/删除文档 | [docs/conventions/docs-management.md](docs/conventions/docs-management.md) |
| 修改任何规范 | [docs/conventions/meta-rules.md](docs/conventions/meta-rules.md) |
| 改 `.cvn` 格式/字段 | [docs/design/format-spec-v0.md](docs/design/format-spec-v0.md) + [schema/](schema/README.md) + `examples/` 三者同改 |
| 加/改图类型（剖面） | [docs/design/profiles-catalog-v0.md](docs/design/profiles-catalog-v0.md) |
| 改交互/批注/写回 | [docs/design/interaction-and-ai-loop.md](docs/design/interaction-and-ai-loop.md) |
| 改 AI 输入/门禁 | [docs/design/ai-trust-boundary.md](docs/design/ai-trust-boundary.md) + [gate-spec-v0.md](docs/design/gate-spec-v0.md) |

---


## 7. Boundaries（边界）

#
## Always（必须做）

- 新增/移动/删除文件后，**同步索引**（父目录 README 或 `docs/README.md`）。
- 改格式时，**`format-spec` + `schema/` + `examples/` 三者同一次提交**。
- 每轮收尾做**自查**：文件是否落在正确目录、索引是否同步、**未验证项是否已标注**。
- 报告中区分「已运行验证」与「仅静态检查」——不得含糊。

#
## Ask First（先问用户）

- 更改已定决策（D1–D4、Q5–Q10、P1–P6，见 [docs/design/open-questions.md](docs/design/open-questions.md)、[docs/prompts/README.md](docs/prompts/README.md)）。
- 删除/重命名**正式文件**、改变目录组织。
- 新增第三方依赖、改构建/打包、改许可。
- 扩大 MVP 范围（12 件套之外）。

#
## Never（禁止）

- **不得编造运行结果**：没有 shell/执行环境时，不得声称"已测试/已通过"。
- 不得把 `dist/`、HTML 产物、`.cvn-cache/` 当作事实源。
- 不得手改生成物；不得提交 secrets。
- 不得绕过门禁（校验/补丁批准）或静默关闭检查。
- 不得假设 shell 可用（见 §8）。

---


## 8. Common Pitfalls（已知陷阱）

1. **shell 曾因沙箱策略不可用**：症状是 `pwsh` 返回 `exit code 3221225794`（`0xC0000142`）或挂起。**根因是沙箱/审批策略，不是 PowerShell 损坏**；用户开放完全权限后恢复。若再次出现，先查沙箱/审批配置，不要重装 PowerShell。
2. **仍有未验证产物**：`schema/kernel.schema.json` 的语义覆盖靠手工核对；`examples/prototype/arch-prototype.html` 未在浏览器实测；`layout/render` 尚不存在。报告时区分"已运行"与"仅静态"。
3. **`.cvn` 与 `.cvn.yaml`**：Q10 已执行——示例已改名，全仓引用已同步；文档中 `.cvn` 是简写。
4. **规则类型是 12 个**，不是 11（`no-outgoing` / `no-incoming` 分列）。
5. **HTML 是派生物**：任何"改 HTML"都必须回到 `.cvn.yaml` 再重建（见 interaction §6.1）。
6. **YAML 口径**：解析用 CORE_SCHEMA；版本号必须加引号（`covenant: "0.1"`）；时间必须带时区。写错会被 L0/L1 拦下。
7. **自举缺口未解**：GAP-01（ELK 体积）、GAP-05（审计事务）仍是待办。
8. **不要新增第 N 篇提案**：M0 已收敛；优先实现与验证。
9. **渲染质量**：v2 已做 barycenter 交叉最小化 + 跨层长边顶部通道；仍**未做标签避让**（密集短边标签可能相邻）。改布局前先看 `packages/README.md` 已知限制。
10. **`apply` 是文本块插入，不是 YAML 重排**：只追加 annotations 块 + 改 `rev` 行，其余字节不动（为了保留注释）。因此它假设 annotations 是块序列（`annotations: []` 会被展开）；改格式前先看 `packages/patch/src/index.ts`。
11. **状态流转是人类特权**：`replace /annotations/<id>/status` 只允许 human actor；流转表 `open→ack/resolved/wontfix`、`ack→resolved/wontfix/open`、`resolved|wontfix→open`、`superseded` 终态。AI 只能新增批注表达意见。

---


## 9. 下一次开工（M1 剩余）

1. `layout`(elk) + `render`(svg)：让 `covenant-self.cvn.yaml` 出图。
2. `er@1` 剖面注册（`c4-container@1` / `dfd@1` 已通过 check）。
3. 只读自包含 HTML（内联 doc + bundle，双击可开）。
4. 索引契约 I1–I3（FRAS 生成器）与门禁 D1–D5、fixture A2/A3。
5. 关闭 GAP-01（ELK 体积实测）与 GAP-05（write-ahead 审计）。
6. 许可原文（AGPL-3.0 + `COMMERCIAL.md`）与 `git init`。

详见 [docs/to-dolist.md](docs/to-dolist.md)。

---


## 10. References

- **[AGENTS.md](AGENTS.md)** — 多 Agent 派发契约（Lead 不变量 L1–L10、派发记录、验收阶梯、漂移审计）**← 团队协作必读**
- [README.md](README.md) — 项目总览与文档地图
- [docs/README.md](docs/README.md) — 文档总索引（必读）
- [docs/to-dolist.md](docs/to-dolist.md) — 活跃待办（唯一任务源）
- [docs/reference/hard-constraints.md](docs/reference/hard-constraints.md) — 12 条硬约束
- [docs/reference/glossary.md](docs/reference/glossary.md) — 术语表
- [docs/prompts/paradigm-spec-v2.md](docs/prompts/paradigm-spec-v2.md) — 范式规范（本仓库应遵守）
