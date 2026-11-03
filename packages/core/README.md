# @covenant/core

## 职责
契约模型与 YAML 解析：`.cvn.yaml` → `CovenantDoc`，并提供元素/关系/批注/链接等类型定义与基础 ID 校验。

## 依赖
- 外部：`js-yaml`
- 被依赖：本仓库几乎所有包（profile/validate/layout/render/patch/diff/indexer/ai/adr/editor/cli）

## 公共接口
- `parseDocument(text, file): { doc?, findings }`
- 类型：`CovenantDoc`、`ElementDef`、`RelationDef`、`AnnotationDef`、`Link`、`Finding`

## 设计取舍
- 使用 YAML 1.2 CORE_SCHEMA（避免 `0.1` 被解析为数字、时间戳被转 Date）。
- 禁用锚点/别名，降低解析歧义与"锚点炸弹"风险。
- 类型校验与语义校验分离：core 只管结构与基础格式，剖面规则放 profile/validate。

## 约束
- 不依赖其他 `@covenant/*` 包（依赖图叶子）。
- 解析必须确定性；同一输入产生同样结果与 finding 顺序。