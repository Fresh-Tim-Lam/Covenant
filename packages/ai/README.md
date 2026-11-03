# @covenant/ai

## 职责
面向 Agent 的读取与生成：`brief`（未决批注/ai_hint/待答问题）与合法批注补丁生成。

## 依赖
- 内部：`@covenant/core`（可选 `@covenant/validate`）
- 被依赖：`@covenant/cli`、`@covenant/mcp`

## 公共接口
- `buildBrief(doc, options?)`、`formatBrief(brief)`、`buildAnnotationPatch(...)`、`newAnnotationId()`

## 设计取舍
- 简报优先"可执行信息"（未决项、人类指令），不是全文转述。
- 生成的补丁必须能直接过 `gatePatch`（作者 `ai:*`、不改状态）。

## 约束
- 不得生成修改结构/状态的补丁。
- 不得读取网络或任意路径。