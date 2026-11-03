# @covenant/adr

## 职责
ADR 解析与校验：front-matter、编号与文件名一致、supersedes 链、accepted 必须被文档引用。

## 依赖
- 外部：Node 标准库（fs/path）
- 被依赖：`@covenant/cli`

## 公共接口
- `parseAdr`、`checkAdr`、`checkAdrDir`、`collectAdrRefs`、`checkAcceptedAdrReferenced`

## 设计取舍
- ADR 是 Markdown（人写），工具只做结构校验，不强制模板。
- accepted 必须在 `.cvn.yaml` 的 `links.kind=adr` 中被引用，防止"写了没人看"。

## 约束
- 只读校验，不改文件。
- 编号提取允许 `0001` 或 `0001-slug.md` 两种引用形式。