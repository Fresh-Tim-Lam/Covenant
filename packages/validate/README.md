# @covenant/validate

## 职责
三层校验：L1 JSON Schema、L2 文档完整性（引用/重复/批注/链接）、L3 剖面规则。

## 依赖
- 内部：`@covenant/core`、`@covenant/profile`
- 被依赖：`@covenant/cli`、`@covenant/mcp`

## 公共接口
- `checkDocument(doc, file): Finding[]`

## 设计取舍
- 校验只读：不修改文档、不写盘。
- finding 统一排序（level → code → elementId → path），保证输出确定性。
- 存储/网络类规则按能力开关（`hasStoreIo`）启用，避免通用图种误报。

## 约束
- 不得依赖 layout/render（避免循环）。
- 新增规则必须有正例 + 反例测试。