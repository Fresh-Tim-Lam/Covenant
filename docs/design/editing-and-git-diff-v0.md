# 编辑能力与 git diff 后端（v0 设计）

> **状态**：提案（2026-11-03）→ **方案 B 已实现**：短时本地编辑服务（`pnpm edit:serve`）+ 页内 diff 预览/确认写回；导出 edits.json 保留为降级通道（ADR-0004）。未接 patch-check、未做增删。
> **触发**：用户要求"架构图还得能够用户自己编辑，后端处理好 git diff"。
> **关联**：[interaction-and-ai-loop.md](interaction-and-ai-loop.md)、[gate-spec-v0.md](gate-spec-v0.md)、[../quickstart.md](../quickstart.md)。

---

## 1. 约束（不能破的既有不变量）

1. `.cvn.yaml` 是唯一事实源；HTML 是产物。
2. 任何写回都走**补丁通道**（门禁 + 身份 + `base_rev` + 审计），不允许"网页直接改 YAML"。
3. AI 与人的权限不同：AI 只能加批注；人可编辑语义。
4. 渲染确定性：同一 YAML 必须产出同一 HTML/SVG。

## 2. 两种编辑落盘策略

| 方案 | 做法 | 优点 | 问题 |
|---|---|---|---|
| A. 原地改 YAML | 后端解析 YAML 节点位置，做"保留注释的行级替换" | 无额外文件 | 需要自研 YAML 保注释编辑器，复杂且易错；一旦重排就丢注释 |
| **B. 生成新文件 + diff 审查**（推荐 v0） | 原文件不动；编辑结果写 `*.edited.cvn.yaml`，后端输出统一 diff；人确认后替换/提交 | 复用现有 `parseDocument`/`render`；diff 天然可审查；失败可丢弃 | 多一个文件与"确认"步骤 |

**推荐 B**：用户要的正是"后端处理好 git diff"——先给 diff 再合入，比"偷偷改原文件"更符合协作安全。

## 3. 后端接口（`covenant serve --edit`）

显式开启（默认只读）。本地 `127.0.0.1` + 启动时随机 `edit_token`（注入页面，请求头校验）。

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/` | 现有自包含 HTML |
| POST | `/api/patch` | body `{doc, patch}`：门禁 → 应用到内存/临时基线 → 返回 `{ok, diff, newRev, preview}` |
| POST | `/api/commit` | body `{doc}`：把 `*.edited.cvn.yaml` 提升为正式文件（写前备份 + 审计） |
| GET | `/api/diff?doc=` | 返回 unified diff（当前工作树 vs 磁盘） |
| GET | `/api/state` | 编辑会话状态（哪些 doc 有未提交编辑） |

**diff 生成**：
- 有 git：`git diff --no-index -- <base> <edited>`（无需仓库已 init）。
- 无 git：内置 LCS 行 diff（约 60 行，纯函数、可测试）。
- 输出统一为 `--- a/… +++ b/… @@ …`，前端用 `<pre>` 展示并高亮 +/-。

## 4. 编辑能力分级

| 级别 | 能编辑什么 | 补丁 ops | 风险 |
|---|---|---|---|
| v0 | 已有批注（现状）；**节点位置**（写回 `view.layout.pins`）；**元素/关系文本属性**（name/summary/tech/props 的 replace） | `replace /elements/<id>/name` 等 | 低 |
| v1 | 增删关系、改关系端点 | `add /relations/-`、`remove /relations/<i>` | 中（breaking，需批准） |
| v2 | 增删元素、改 kind | 结构性变更 | 高（必须 diff + 人工批准） |

v0 的"位置编辑"只写 `layout.pins`（格式里已有），不影响语义；这是最安全的第一块可见编辑。

## 5. 前端交互（v0）

1. 顶栏加「编辑」开关（只读 → 编辑态）；编辑态下显示 `保存预览 / 取消 / 提交`。
2. 拖动节点 → 记录 `pins`（不立即写盘）。
3. 悬浮窗里文本字段变为可编辑（name/summary/tech）；批注表单不变。
4. 点「预览 diff」→ POST `/api/patch` → 展示 unified diff；「提交」→ `/api/commit`；失败保留编辑态。
5. 所有编辑操作仍带 `actor`（`human:you`），AI 入口不提供编辑能力。

## 6. 测试与验收

- 单元：路径 diff（新增/删除/修改）、patch 应用到 pins、门禁拒绝 AI 编辑语义。
- 集成：起 `serve --edit` → POST patch → 断言返回 diff 且原文件未变 → commit 后备份存在、rev+1。
- e2e：jsdom 切编辑态、拖节点、预览、提交。
- 验收：`pnpm verify` 全绿 + 新增 `pnpm test:edit`。

## 7. 已拍板（2026-11-03）

- **编辑边界**：先只做「位置 + 标签/说明」；**增删元素/关系以后做**。
- **落盘通道**：选 **B**——短时本地编辑服务（一键 `pnpm edit:serve`），并配套系统化部署指引 `docs/guides/agent-team-edit-deployment.md`；**C（File System Access API）后续再加**。
- **diff 口径**：**优先 git diff**（`git diff --no-index`，因此**不需要 git init**）；git 不可用时回退内置 LCS 文本 diff；回写目标是 `.cvn.yaml`（不是只出 `.patch.json`）；是否 `git init` 仍待用户批准。

## 7.1 开放问题（保留）

1. 编辑产物是"新文件 + diff 审查"（推荐 B）还是"直接改原文件 + git diff 事后看"（A）？
2. 是否必须先 `git init`？无 git 时用内置 diff 是否可接受？
3. v0 先做"位置 + 文本属性"，还是直接要求"增删元素/关系"？
4. 编辑是否需要登录/口令（本机单用户是否够）？

## 7.5 已实现（v0 后端，2026-11-03 实测）

```bash
# 预览：生成待审查新文件 + 统一 diff，原文件不变
pnpm covenant edit examples/quickstart/mini.cvn.yaml my.edits.json --diff

# 确认后写回：rev+1、备份到 .audit/、写审计 jsonl
pnpm covenant edit examples/quickstart/mini.cvn.yaml my.edits.json --accept
```

- `edits.json` 形如 `{covenant:"0.1", doc, base_rev, actor, ops:[{op:"set", path:"/elements/e.x/name", value:"…"}]}`；
- 已支持：元素 `name/summary/tech`、关系 `summary`、视图 `layout.pins/<elementId>`（v0 分级里的"位置 + 文本属性"）；
- 写盘前用 `checkDocument` 校验，0 error 才落盘；`base_rev` 不匹配拒绝；
- 统一 diff 为内置行级 LCS（无 git 依赖），有 git 时可直接 `git diff` 对照；
- **注意**：命令是 `pnpm covenant edit`（`pnpm edit` 被 pnpm 内置命令抢占）。

**HTML 前端编辑态（已实现）**：顶栏「编辑」→ 选中节点/连线 → 改名称、职责、技术、X/Y 坐标 → 「暂存修改」→「导出编辑 JSON」→ `covenant edit <doc> <edits.json> --diff` 预览 → `--accept` 写回。全程无需本地服务。

**已实现**：拖拽节点写 pins（编辑态）；git diff（--no-index）/内置 diff 双通道。**未实现**：增删元素/关系、语义 diff 与 patch-check 门禁的整合。

## 8. 下一步（实现顺序）

1. S1：抽 `textDiff(base, next)` 纯函数 + 测试（无 git 降级的基础）。
2. S2：`serve --edit` + `/api/patch`，复用 `gatePatch`/`applyPatch`（先只支持 annotations + pins）。
3. S3：前端编辑态（位置拖动 + 文本属性）。
4. S4：`/api/commit` + 备份 + 审计 + 文档。
