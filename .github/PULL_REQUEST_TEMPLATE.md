## 变更说明

<!-- 一句话说明这个 PR 做了什么、为什么。关联 Issue：Fixes #... -->

## 检查清单

- [ ] `pnpm verify` 通过（契约校验 + FRAS 索引 + ADR + 全量测试）
- [ ] `pnpm typecheck` 0 error
- [ ] 若改动渲染：黄金 SVG 已人工比对，`pnpm golden` 基线已按预期更新
- [ ] 若新增/修改源文件：`arch/index.yaml` 已补条目并 `pnpm index --write`
- [ ] 若改动契约格式/schema：文档已同步（`docs/design/format-spec-v0.md` / `schema/`）
- [ ] 若涉及发布资产：`node scripts/build-kit.mjs` 成功（kit 版本/zip/sha256 变化已在 PR 说明）

## 证据

<!-- 命令输出摘要、截图路径、验证链接；不要只写"已测试" -->

## 风险与回滚

<!-- 影响面；是否需要新 schema 版本；回滚方式 -->
