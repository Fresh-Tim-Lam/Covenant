# scripts/ — 可复用开发工具

> **用途**：存放**正式可复用**的开发者工具（启动、基准、生成、验证）。一次性调试脚本一律放 `artifacts/`，不进本目录。
> **目标读者**：维护者。
> **状态**：M1 起有效（2026-11-03）。
> **关联**：[../docs/conventions/directory-organization.md](../docs/conventions/directory-organization.md)（落位规则）。

## 脚本清单

| 脚本 | 作用 | 用法 |
|------|------|------|
| `svg-to-png.mjs` | 开发期视觉核对：把渲染出的 SVG 转成 PNG（依赖 `@resvg/resvg-js`，devDependency） | `node scripts/svg-to-png.mjs dist/payments.svg dist/payments.png 1400` |
| `e2e-html-patch.mjs` | 端到端演练：jsdom 打开构建好的 HTML → 点选批注 → 状态流转 → 导出补丁到 `dist/e2e/html.patch.json` | `node scripts/e2e-html-patch.mjs` |

## 约定

- 脚本只做**可复用**的事；一次性诊断放 `artifacts/`。
- 新增脚本必须登记到上表，并说明依赖与用法。
- 脚本产物（PNG 等）写 `dist/` 或 `artifacts/`，不得写仓库根。
