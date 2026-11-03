# @covenant/render

## 职责
SVG/HTML 渲染：形状语义、贴线标签（纯文字+halo，无胶囊）、交点圆点（空心=几何交叉 / 实心=T 型真实连接）、序列图渲染、自包含单文件 HTML 查看器（多小窗/悬停/钉住/彩色引导线/缩放/标注/编辑导出）。

## 依赖
- 内部：`@covenant/core`、`@covenant/layout`
- 被依赖：`@covenant/cli`、`@covenant/mcp`

## 公共接口
- `renderSvg(doc, layout, options?)`、`renderHtml(views, options?)`

## 设计取舍
- HTML 是构建产物，内联 CSS/JS/SVG，零外部请求（CSP `default-src 'none'`）。
- 文本一律 XML 转义；内嵌 JSON 转义 `<` 防提前闭合脚本。
- 标注/编辑导出走"补丁/edits JSON"，不在浏览器直写 YAML。
- 边标签不再用背景胶囊：纯文字 + 白色细描边（halo）压线可读；标签中心严格贴边路径，候选沿路径滑动避让节点/其它标签/边线。
- 交叉不再画跳线弧：路径保持直线/折线，交点用圆点表达（空心=仅几何穿越；实心=仅限"某边端点落在另一边上"的 T 型汇入，并道共享折点不算连接）。

## 约束
- 不得引入网络资源（CDN/字体/图片）。
- 视觉变化必须更新黄金 SVG 并人工看 diff。