# @covenant/cli

## 职责
`covenant` 命令入口：check/render/build/apply/patch-check/diff/index/ai/adr/edit/serve/doctor。

## 依赖
- 内部：core/profile/validate/layout/render/patch/diff/indexer/ai/adr/editor
- 被依赖：无（进程入口）

## 公共接口
- `pnpm covenant <command>`；退出码约定见 `docs/design/gate-spec-v0.md`

## 设计取舍
- 命令薄、逻辑在包内；CLI 只做参数解析、I/O 与退出码。
- 语义编辑：AI 与人皆可经补丁增删改（ADR-0005）；人工批注受保护（AI 不得删改）。

## 约束
- 不得绕过门禁（check/patch-check/index/adr）。
- 新命令必须同时更新 `usage()`、AGENT.md 命令表、至少一条测试。