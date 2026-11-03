# 单文件 HTML vs 文件夹打包（设计提案 v0.1 · bundle 已实现 2026-11-03）

> 触发：用户批注 `a.BBXNVV8125C9B232TK8JRZY9FC`（e.builder）："架构图们不是用单个 html 文件全部装起来的，得用一个文件夹，把整一套打包好，请你完善设计"。
> 本文对应当前实装（`covenant bundle`，manifest v3）；行为以代码与 `arch/index.yaml` 为准。

## 1. 现状与约束

- 默认 `covenant build` 把**多份契约图**合并成一个自包含 HTML（内联 SVG + CSS + JS + JSON 数据），无外部请求（CSP `default-src 'none'`）；
- 优点：双击即开、可单文件分发、离线；
- 缺点：文档越多体积线性增长；单文件内所有视图一次性加载；不适合"一整套图 + 批注 + 资源"的组织。

## 2. 双输出模式（均已实现）

| 模式 | CLI 命令（npm script 别名） | 产物 | 用途 |
|---|---|---|---|
| `single`（默认，保留） | `covenant build <dir> -o covenant.html`（`pnpm build:html`） | 1 个自包含 HTML | 单文件分发/离线评审 |
| `bundle`（第二模式） | `covenant bundle <dir> -o dist/site`（`pnpm build:bundle`） | 文件夹 | 一整套图/站点/长期维护 |

`bundle` 实际目录结构（manifest v3）：

```
site/
  index.html            # 主查看器（与单文件模式同一套查看器，交互完全一致）
  manifest.json         # version 3：{ version, generatedAt, entries:[{id,viewId,title,svg,annotations}] }
  views/<doc-id>.<view-id>.svg
  annotations.json      # [{doc, view, annotations:[...]}] 只读汇总（派生，非事实源）
```

要求（均已满足）：

- 零外部请求不变（相对路径 + 本地资源，查看器与 SVG 均内联/本地）；
- 批注仍以 `.cvn.yaml` 为唯一源，`annotations.json` / `manifest.json` 仅派生；
- 浏览器直接双击 `site/index.html` 可看（index.html 内联 SVG 与数据，`views/*.svg` 为额外静态资产）。

## 3. 已实现（v0.1，2026-11-03）

- `covenant bundle <dir> -o dist/site`：`index.html` **直接复用主查看器**（缩放/平移/双击/点选详情/批注面板/悬浮窗/删除撤销，与 `dist/covenant.html` 完全一致）+ `manifest.json`（v3, `entries`）+ `views/*.svg` + `annotations.json`；零外部请求，`file://` 双击可看。
- 与 `build` 共用同一渲染管线（layout + renderSvg），行为一致；单文件模式行为不变。
- 回归：`packages/cli/src/bundle.test.ts` 断言 manifest v3、entries、主查看器标记；交互验收见 `docs/audits/interaction-review-2026-11-03.md`。

## 3.1 后续顺序（小步，非阻塞）

1. （可选重构）把查看器模板从 `packages/render/src/html.ts` 抽成 `packages/render/src/viewer/`（CSS/JS/markup 三块）；
2. `build` 复用模板生成单文件（现状行为不变）；
3. 壳页按 `manifest.json` 列出视图，点击后加载对应预渲染 SVG（减少首屏体积）；
4. 黄金测试与 `pnpm cleanroom` 覆盖两种产物；`dist/covenant.html` 继续作为单文件基线。

## 4. 取舍

- 单文件仍是默认（符合"双击本地 HTML"用户偏好）；bundle 用于多图/站点/长期协作；
- bundle 会引入目录组织与相对路径维护成本，但换来更好的加载与增量能力；
- 当前采用"复用主查看器"而不是另写简化壳（避免两套交互漂移）；若后续拆壳，须保持交互一致并补回归测试。
