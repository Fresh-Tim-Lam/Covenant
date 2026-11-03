# @covenant/diff

## 职责
语义 diff：把两次契约差异分类为 `cosmetic` / `material` / `breaking`，供审查与门禁使用。

## 依赖
- 内部：`@covenant/core`
- 被依赖：`@covenant/cli`

## 公共接口
- `diffDocs(before, after)`、`formatDiff(diff)`

## 设计取舍
- 只看语义变化而不是文本变化；重排/改序不算 breaking。
- 破坏性变更要求 ADR 或维护者批准（流程约束，工具只报告）。

## 约束
- 纯只读，不写盘、不改文档。