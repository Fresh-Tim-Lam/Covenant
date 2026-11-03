# @covenant/indexer

## 职责
FRAS 索引（`arch/index.yaml`）读写与 I1–I3 门禁：覆盖、新鲜度/孤儿、可读性。
边界：只做索引；不写源码、不改 `.cvn.yaml`、不生成 F/R/A/S 语义。

## 依赖
- 外部：`js-yaml`
- 内部：`@covenant/core`（Finding 类型）
- 被依赖：`@covenant/cli`、`@covenant/mcp`

## 公共接口
- `checkIndex(cwd, indexPath): Finding[]`、`writeIndex(cwd, indexPath): { updated, missing }`
- 辅助：`collectSources(cwd)`、`loadIndex(indexPath)`、`hashFile(cwd, rel)`、`sha256(text)`
- 类型：`FrasEntry`、`IndexFile`

## 设计取舍
- 机器只维护 `source_sha256`；F/R/A/S 语义由人确认，工具不生成语义。
- 覆盖以"受管源文件"为准：`packages/*/src/**/*.ts`（排除 `*.test.ts`）与 `scripts/*.mjs`；排除 `node_modules`/`dist`/`.audit` 等产物与依赖目录。
- 现状（2026-11-03）：单文件 157 行，刻意保持精简——索引器只是门禁与哈希工具，不承载语义、不做代码理解。
- FRAS 维护节奏：改源码 → 人/Agent 更新条目 F/R/A/S → `pnpm index --write` 刷新哈希 → `pnpm index`（只读）确认 I1–I3；拆分/新增文件后同一轮补齐条目，否则 I1 直接红。

## 约束
- `--write` 只更新哈希，不得改写语义字段。
- 不得删除条目；孤儿条目由人裁决。
- 新增/拆分源文件必须补条目：`f` 一句话 ≤60 字且独立可读（禁止"详见/参见/同上/TODO"），`r` 写必读依赖文件，`s` 写代码推不出的隐性约束。
- 不得手改 `source_sha256`（只能由 `--write` 生成）。
