# @covenant/editor

## 职责
受控语义编辑 v0：`set` 文本属性/pins → 生成待审查新文件 + 统一 diff（无 git 依赖）。

## 依赖
- 内部：`@covenant/core`、外部 `js-yaml`
- 被依赖：`@covenant/cli`

## 公共接口
- `parseEdits`、`applyEdits`、`serializeDoc`、`unifiedDiff`

## 设计取舍
- 不直接改原文件：先写 `<doc>.edited.cvn.yaml` + diff，人审查后 `--accept`（备份 + 审计）。
- 不保 YAML 注释（整文件序列化），因此必须保留 `.bak`；后续可改行级保注释编辑。

## 约束
- 只允许 human actor（CLI 强制），AI 不得改语义。
- 不支持增删元素/关系、改 kind；这些属 breaking，需 ADR/批准。