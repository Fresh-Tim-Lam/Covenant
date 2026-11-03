# @covenant/layout

## 职责
确定性布局：DFS 破环 → Kahn 分层 → barycenter 交叉最小化 → 长边"通道 + 侧边走廊"（竖/横段只走列/行间隙，不穿框）；序列图专用 sequencer。

## 依赖
- 内部：`@covenant/core`、`@covenant/profile`
- 被依赖：`@covenant/render`、`@covenant/cli`、`@covenant/mcp`

## 公共接口
- `layout(doc, options?)`、`selectView(doc, viewId?)`、`layoutSequence(doc, options?)`
- 路由/几何：`routePorts`、`clearPath`、`routeAbove`、`route`（导出供测试与复用）
- 标签口径（render 共用，避免宽度估算漂移）：`relationLabelText(rel)`、`estimateTextWidth(text, fontPx?)`、`estimateLabelWidth(rel)`

## 设计取舍
- 纯函数、无 I/O；所有尺寸由常量控制，保证跨平台逐字节一致。
- pins（手工坐标）优先于自动布局；父节点层级做松弛约束。
- 车道间距按标签胶囊尺寸预留（水平布局按胶囊宽、垂直布局按胶囊高），间隙不足时扩大 rankGap/画布，不压回固定小间距。

## 约束
- 不得读写文件、不得依赖 render（避免循环）。
- 输出必须确定性；随机化不可接受。