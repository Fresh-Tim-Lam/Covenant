# adr/ — 架构决策记录（decision@1）

> **用途**：记录不可逆或有代价的设计决策。不是图，但同属契约，受 `pnpm adr` 门禁保护。
> **目标读者**：实现者、评审者、AI Agent。
> **状态**：M4 起有效（2026-11-03）。
> **关联**：[profiles-catalog-v0.md §11.1](../../design/profiles-catalog-v0.md)、[paradigm-spec-v2.md 附录 E](../../prompts/paradigm-spec-v2.md)。

## 文件约定

- 命名：`NNNN-<slug>.md`（4 位编号，与 front-matter 的 `adr` 一致）。
- front-matter 字段：

| 字段 | 必填 | 说明 |
|------|:---:|------|
| `adr` | ✅ | 4 位编号（建议加引号，保留前导零） |
| `title` | ✅ | 一句话结论 |
| `status` | ✅ | `proposed` / `accepted` / `superseded` / `rejected` |
| `date` | ✅ | `YYYY-MM-DD` |
| `deciders` | — | 决策人（`human:<name>`） |
| `supersedes` | — | 被本决策取代的 ADR 编号；`status: superseded` 时必填 |
| `related` | — | 相关元素/批注 id |

## 校验

```bash
pnpm adr                 # 校验 docs/design/adr
pnpm adr --json
```

规则：编号 4 位、标题非空、状态枚举、日期格式、文件名编号一致、superseded 必须有 supersedes 链、supersedes 目标必须存在。

> **已知限制**：catalog 的"accepted ADR 必须被文档 `links.kind=adr` 引用"尚未实现——`.cvn` 格式还没有 `links` 字段。

## 列表

| 编号 | 标题 | 状态 |
|------|------|------|
| [0001](0001-single-file-self-contained-html.md) | 采用单文件自包含 HTML 作为渲染产物 | accepted |
| [0002](0002-typescript-workspace-packages.md) | 全栈 TypeScript，按 pnpm workspace 拆分能力包 | accepted |
| [0003](0003-index-first-agent-development.md) | 采用索引优先的模块化 Agent 协同开发范式（Index-First Agent Dev） | accepted |
| [0004](0004-edit-server-short-lived.md) | 编辑态改为方案 B：短时本地编辑服务（导出 JSON 保留为降级通道） | accepted |
