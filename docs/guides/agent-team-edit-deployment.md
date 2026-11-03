# 在其他 Agent 团队项目里部署编辑态（系统化指引）

> 适用：项目由别的 Agent 团队（Lead + 模块 owner）维护，人类需要**直接编辑架构图**并安全落盘。
> 前置规范：[agent-team-development.md](../conventions/agent-team-development.md)（Index-First Agent Dev）。
> 相关决策：ADR-0003（范式）、ADR-0004（编辑态方案 B）。

---

## 1. 部署前检查

```bash
pnpm covenant doctor        # Node/pnpm/锁文件/schema/BOM/索引/版本
pnpm verify                 # 契约 + FRAS + ADR + 模块元语料 + 测试
```

要求：
- 仓库里有 `.cvn.yaml` 与 `covenant.yaml`；
- `arch/index.yaml` 为通过状态（I1–I3）；
- 每个 `packages/*` 有 README 五段（`pnpm modules`）。

## 2. 一键启动编辑态

```bash
# 构建 + 启动（自动开浏览器）
pnpm build:html examples -o dist/covenant.html
pnpm edit:serve            # = covenant serve dist --edit --open
```

等价手动命令：

```bash
pnpm covenant serve dist --edit --open
pnpm covenant serve dist --edit --port 4180   # 换端口
```

启动后终端会打印 URL 与编辑态提示；浏览器打开后：

1. 点顶栏 **「编辑」**；
2. 选中节点/连线，改 **名称 / 职责 / 技术 / X、Y 坐标**（v0 边界：位置 + 标签/说明）；
3. 点 **「暂存修改」**；
4. 点 **「预览并写回」** → 页内显示 unified diff；
5. 检查后点 **「确认写回」** → 写回 `.cvn.yaml`（rev+1、备份、审计）。

## 3. 安全与写域（Agent 团队必读）

| 约束 | 说明 |
|---|---|
| 仅本机 | 服务绑定 `127.0.0.1`，不要改 `--host` 到公网；防火墙不应放行 |
| token | 启动时随机生成并注入页面；无 token 的 `POST /api/edit` 返回 401 |
| human-only | 页面 actor 固定 `human:you`；`ai:*` 请求返回 422。**Agent 不得启动编辑服务代写** |
| 短时 | 编辑会话结束 `Ctrl+C`；不要用 nohup/后台常驻 |
| 写前校验 | `checkDocument` 0 error 才写；422 表示编辑不合法 |
| 可回滚 | 每次写回在 `.audit/<doc>.<ts>.bak` 留有前一版；`edit-<date>.jsonl` 记录 ops 与 actor |

**写域规则**：编辑只改 `arch/`、`examples/` 下的 `.cvn.yaml`；不碰 `packages/` 源码。若同时有模块 owner 在改契约，先由 Lead 排期，避免写域重叠。

## 4. Agent 团队协作流程

1. **需求解读 agent** 把用户诉求写入 `todo/requests.md`（逐字）+ 验收标准；
2. **Lead** 判断本次是"人类直接编辑"还是"Agent 补丁"：
   - 人类编辑 → 启动 `pnpm edit:serve`，人类操作，AI 只读旁路；
   - Agent 编辑 → 只能走批注补丁通道（`patch-check`/`apply`），不得改语义；
3. 写回后 **Lead** 跑 `pnpm verify`（契约 + 索引 + ADR + modules + 测试）；
4. `git init` 的项目：`git diff` 复核 → 提交；无 git 的项目：用 `.audit/*.bak` 回滚；
5. 需要更新索引：`pnpm index --write`（只更新哈希，语义由人确认）。

## 5. diff 来源（无需 git init）

写回/预览的 diff 优先用 `git diff --no-index` 生成（真正的 git 文本 diff，但**不需要仓库已 init**）；本机没有 git 时自动回退到内置文本 diff。返回体里的 `diffKind` 标明来源（`git` / `internal`）。

## 5.1 无服务降级（离线 / 不允许端口）

双击 HTML → 顶栏「编辑」→ 暂存 → **「导出编辑 JSON」** → 拿到 `.edits.json`：

```bash
pnpm covenant edit <doc.cvn.yaml> <file>.edits.json --diff   # 预览，原文件不动
pnpm covenant edit <doc.cvn.yaml> <file>.edits.json --accept # 确认写回（备份+审计）
```

## 6. 常见问题

| 现象 | 原因 / 处理 |
|---|---|
| 页面没有「预览并写回」按钮 | 不是用 `--edit` 启动的（token 未注入）；用 `pnpm edit:serve` |
| 401 token 无效 | 页面来自旧标签/旧服务；重新打开启动时打印的 URL |
| 422 编辑失败 | 编辑值非法或文档校验失败；看返回的 `findings`，或改回后再试 |
| 端口被占用 | `--port 4180` 换端口 |
| 误写回 | 从 `.audit/<doc>.<ts>.bak` 恢复；`edit-<date>.jsonl` 有对应 ops |
| 想加 File System Access（方案 C） | 后续增强；当前不实现，避免浏览器兼容与权限复杂度 |

## 7. 后续

- 方案 C（File System Access API）作为无服务的可写降级；
- 编辑边界 v1：增删元素/关系（breaking，需 ADR 与批准）；
- `git init` 后：diff 增量索引 + CI（见 todo/Q9）。
