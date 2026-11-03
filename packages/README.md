# packages/ — 源码包（pnpm workspace）

> **用途**：存放 Covenant 的 TypeScript 源码包，按依赖单向分层。任何人（含 AI）改代码前先看本文件的依赖约束。
> **目标读者**：实现者。
> **状态**：M1 进行中（2026-11-03）。`core` / `profile` / `validate` / `cli` 已实现并通过 typecheck 与单测。
> **关联**：[../docs/design/engine-architecture-v0.md](../docs/design/engine-architecture-v0.md)（模块划分）、[../AGENT.md](../AGENT.md)（接入指南）。

## 包清单

| 包 | 职责 | 状态 |
|----|------|:---:|
| `core/` | 类型、YAML 解析（CORE_SCHEMA）、finding 排序、仓库根定位 | ✅ |
| `profile/` | 剖面注册表（10 个：c4-container / c4-context / c4-component / dfd / er / flowchart / deployment / graph / sequence / state）与专有规则 | ✅ |
| `validate/` | L1 schema（ajv 2020-12）/ L2 完整性 / L3 剖面一致性 | ✅ |
| `cli/` | `covenant check`，含门禁退出码与 A1 防假通过 | ✅ |
| `layout/` | 确定性分层布局（DFS 破环 + Kahn 分层 + lane 通道）+ 视图选择器（include/exclude/tag） | ✅ |
| `render/` | SVG 渲染 + 可标注自包含 HTML（内联 SVG + 语义 JSON + 批注表单 + 状态流转按钮 + 导出补丁）、确定性输出 | ✅ |
| `patch/` | 补丁解析/门禁/应用：`base_rev` 乐观锁、信任边界门禁（AI 不得冒充人/写 ai_hint/改状态）、批注状态流转（含 resolution）、文本块插入（保留 YAML 注释）、复验后原子替换、write-ahead 审计 | ✅ |
| `diff/` | 语义 diff：cosmetic / material / breaking 分类（删元素/关系/改 kind/改端点 = breaking），确定性输出 | ✅ |
| `indexer/` | FRAS 索引：I1 覆盖 / I2 新鲜度与孤儿 / I3 可读性；`--write` 只更新哈希 | ✅ |
| `ai/` | 评审简报 + AI 批注补丁构造（author=ai:*、禁 ai_hint） | ✅ |
| `adr/` | ADR front-matter、编号一致、supersedes 链、accepted 跨文档引用 | ✅ |
| `editor/` | 受控语义编辑（文本属性/pins）+ YAML 序列化 + 统一 diff | ✅ |
| `editor/` | 浏览器标注器（M3） | ⏳ |
| `ai/` | digest / diff / patch（M4） | ⏳ |
| `mcp/` | MCP server（M4） | ⏳ |

## 已知限制（M1，诚实记录）

| 限制 | 影响 | 计划 |
|------|------|------|
| ~~层内未做交叉最小化~~ | 已实现 barycenter（6 轮上下扫描，保留交叉最少方案） | ✅ 已完成 |
| ~~长边穿过中间区域~~ | 跨层 > 1 的边改走顶部通道 | ✅ 已完成 |
| ~~标签相邻~~ | 已实现全局标签避让（节点障碍 + 互斥 + 候选位移） | ✅ 已完成 |
| ~~无黄金 SVG 测试~~ | 已加 7 个黄金断言（`pnpm golden` 更新，改视觉前先看 diff） | ✅ 已完成 |
| ER 样式较简 | attribute=胶囊、entity=近方形；尚无椭圆/弱实体/Chen 菱形 | M2：按 notation 分支渲染 |`n| `links` 的 code/issue 目标不校验存在性 | 只校验 adr/url 形式 | M3 代码绑定后接入 |

## 依赖方向（强制）

```
core  ←  profile  ←  validate  ←  layout  ←  render  ←  editor
                                    ↑
                              cli / ai / mcp（只依赖下层）
```

**禁止反向依赖**；`core` 不得 import 上层任何包。新增跨层依赖必须走 ADR。

## 常用命令（在仓库根执行）

| 命令 | 作用 |
|------|------|
| `pnpm install` | 安装依赖（esbuild 构建脚本已在 `pnpm-workspace.yaml` 白名单） |
| `pnpm typecheck` | 全仓 `tsc --noEmit` |
| `pnpm test` | vitest（`packages/**/*.test.ts`） |
| `pnpm check examples` | 校验示例文档（退出码 0/1/2/3/4） |
| `pnpm render <f> -o out.svg` | 布局 + 渲染 SVG（`--view v.id` 指定视图） |
| `pnpm build:html <dir> -o out.html` | 生成自包含单文件 HTML（只读查看器） |
| `pnpm apply <doc> <patch.json>` | 应用补丁（默认写盘；`--dry-run` 只预览；先过门禁） |
| `pnpm patch-check <doc> <patch.json> --actor …` | 只做门禁检查，不写盘 |
| `pnpm diff <a> <b>` | 语义 diff（cosmetic/material/breaking） |
