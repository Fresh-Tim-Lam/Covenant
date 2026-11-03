# 单文件 HTML vs 文件夹打包（设计提案 v0.1 · bundle 原型已实现 2026-11-03）

> 触发：用户批注 `a.BBXNVV8125C9B232TK8JRZY9FC`（e.builder）："架构图们不是用单个 html 文件全部装起来的，得用一个文件夹，把整一套打包好，请你完善设计"。

## 1. 现状与约束

- 当前 `covenant build:html` 把**多份契约图**合并成一个自包含 HTML（内联 SVG + CSS + JS + JSON 数据），无外部请求（CSP `default-src 'none'`）；
- 优点：双击即开、可单文件分发、离线；
- 缺点：文档越多体积线性增长；单文件内所有视图一次性加载；不适合"一整套图 + 批注 + 资源"的组织。

## 2. 提案：双输出模式

| 模式 | 命令 | 产物 | 用途 |
|---|---|---|---|
| `single`（默认，保留） | `covenant build:html <dir> -o covenant.html` | 1 个自包含 HTML | 单文件分发/离线评审 |
| `bundle`（新增） | `covenant build:bundle <dir> -o dist/site` | 文件夹 | 一整套图/站点/长期维护 |

`bundle` 目录结构：

```
site/
  index.html            # 壳：导航 + iframe/按需加载视图
  manifest.json         # { version, docs:[{id,title,file,sha256}], generatedAt }
  views/<doc-id>.json   # 每份契约的渲染数据（元素/关系/布局/批注摘要）
  views/<doc-id>.svg    # 可选：预渲染 SVG（无 JS 也能看）
  assets/app.css
  assets/app.js         # 与单文件模式共享的查看器逻辑（从同一模板抽取）
  annotations.json      # 可选：导出批注索引（只读汇总）
```

要求：
- 零外部请求不变（相对路径 + 本地资源）；
- `manifest.json` 带每份文档 `sha256`，与 FRAS 索引一致，便于增量重建；
- 批注仍以 `.cvn.yaml` 为唯一源，`annotations.json` 仅派生；
- 浏览器直接双击 `site/index.html` 可看（file:// 下按需 fetch 受限时退回内联数据模式）。

## 3. 已实现（v0.1 原型）
- `covenant bundle <dir> -o dist/site`：`index.html` **直接复用主查看器**（悬浮窗/钉住/批注编辑/删除撤销/缩放拖拽与 `dist/covenant.html` 完全一致）+ `manifest.json` + `views/<doc>.<view>.svg` + `annotations.json`；零外部请求，`file://` 双击可看。
- 与 `build:html` 共用同一渲染管线（layout + renderSvg），行为一致。

## 3.1 后续顺序（小步）

1. 抽出查看器模板为 `packages/render/src/viewer/`（含 CSS/JS/markup 三块）；
2. `build:html` 复用模板生成单文件（现状行为不变）；
3. 新增 `build:bundle`：写 `index.html` + `views/*.json` + `manifest.json`；
4. 壳页按 `manifest.json` 列出视图，点击后加载对应 JSON 渲染（或直接加载预渲染 SVG）；
5. 黄金测试与 `pnpm cleanroom` 覆盖两种产物；`dist/covenant.html` 继续作为单文件基线。

## 4. 取舍

- 单文件仍是默认（符合"双击本地 HTML"用户偏好）；bundle 用于多图/站点/长期协作；
- bundle 会引入目录组织与相对路径维护成本，但换来更好的加载与增量能力。