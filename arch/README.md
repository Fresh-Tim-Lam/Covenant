# arch/ — 自举契约与 FRAS 索引

> **用途**：Covenant 用自己的格式描述自己。这里的文件受 `covenant check` 与索引门禁保护，**改代码结构就要同步改这里**。
> **目标读者**：实现者、评审者、AI Agent。
> **状态**：M4 起有效（2026-11-03；同日同步至 rev3：补齐 13 个包、交付/发布切片与 v.delivery 视图）。`system.cvn.yaml` 通过 L1–L3；`index.yaml` 通过 I1–I3。
> **关联**：[../docs/prompts/paradigm-spec-v2.md](../docs/prompts/paradigm-spec-v2.md)（三契约）、[../docs/design/gate-spec-v0.md](../docs/design/gate-spec-v0.md)（门禁）。

## 文件清单

| 文件 | 职责 |
|------|------|
| `system.cvn.yaml` | 仓库自身的容器视图：组件边界、依赖方向、已知缺口批注；`v.main` 系统结构 / `v.delivery` 交付与发布 |
| `index.yaml` | FRAS 索引：每个源文件的 File 职责 / 必读依赖 / 上层调用者 / 隐性约束 + `source_sha256` |

## 校验命令

| 命令 | 作用 |
|------|------|
| `pnpm check arch` | 契约文档 L1–L3 |
| `pnpm index` | FRAS I1–I3（覆盖 / 新鲜度 / 可读性） |
| `pnpm index --write` | 只更新 `source_sha256`（**不替你写语义**） |
| `pnpm verify` | 以上 + 示例校验 + 全量单测（本地 CI 等价物） |
| `pnpm render arch/system.cvn.yaml -o dist/self-arch.svg` | 出自举图 |
| `pnpm build:html arch -o dist/arch.html` | 出自举的可标注 HTML |

## FRAS 维护规则（重要）

1. **机器只维护 `source_sha256`**；`f/r/a/s` 是语义，由人或 Agent 写。
2. 改完代码先跑 `pnpm index`：报 `stale` 说明源码变了、条目没确认。
3. 确认 F/R/A/S 仍准确后再 `pnpm index --write` 更新哈希；**不要**用 `--write` 掩盖语义变化。
4. 新增源文件 → 必须先补条目，否则 I1 失败。
5. `f` 必须一句话独立可读（≤60 字，禁止"详见/参见"）。

## 变更流程

- **契约变更**（组件边界、依赖方向）：改 `system.cvn.yaml`，用 `covenant diff` 看是否 breaking。
- **批注**：在 `dist/arch.html` 里标注 → 导出补丁 → `covenant patch-check` → `covenant apply`。
- 不要手改 `dist/` 产物，它们由构建生成。
