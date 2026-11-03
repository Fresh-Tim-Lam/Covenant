# @covenant/patch

## 职责
补丁模型：解析、信任边界门禁、应用（保留注释的文本编辑、rev+1、write-ahead 审计）。
边界：只处理 annotations 的追加、状态流转与删除；不改元素/关系/视图语义。

## 依赖
- 内部：`@covenant/core`（解析/类型）、`@covenant/validate`（应用后复验）
- 被依赖：`@covenant/cli`、`@covenant/mcp`、`@covenant/ai`

## 公共接口
- `parsePatch`、`classifyOps`、`gatePatch`、`parseActor`、`applyPatch`
- 文本层辅助（barrel 也导出，测试直接覆盖）：`annotationYaml`、`appendAnnotations`、`applyStatusChanges`、`bumpRev`
- 模块内导出（未进 barrel）：`removeAnnotationBlocks`（只由 `applyPatch` 编排）
- 类型：`Patch`、`PatchOp`、`StatusOp`、`Actor`、`GateOptions`、`ApplyOptions`、`ApplyResult`

## 设计取舍
- 门禁在代码里而不是提示词里：AI 只能新增批注、不得写 `ai_hint`、不得改状态、不得删除批注、`base_rev` 必须匹配。
- 应用采用"注释保留的文本编辑"，避免整文件重写丢注释。
- 单文件拆分（≤300 行）：`parse.ts`（模型/解析/分类，最底层）→ `text.ts`（文本编辑，不读写文件）→ `audit.ts`（哈希与 write-ahead 审计）→ `gate.ts`（纯函数门禁）→ `apply.ts`（编排 + 复验 + 原子替换）；`index.ts` 只做 re-export。
- 依赖方向：`gate`/`apply` → `parse`，`apply` → `text`、`audit`；`gate`/`text` 不碰文件系统，无循环依赖。

## 约束
- 门禁失败时 `apply` 不得写入任何字节。
- 不得绕过审计（`.audit/` write-ahead）。
- 不得改变 gate 的拒绝条件与 finding code（含 `gate/remove-actor`）；`sha256`/`audit`/`finding` 保持内部实现，不从 barrel 导出。
