# @covenant/layout

## 职责
确定性布局：DFS 破环 → Kahn 分层 → barycenter 交叉最小化 → 长边"通道 + 侧边走廊"（竖/横段只走列/行间隙，不穿框）；序列图专用 sequencer。

## 依赖
- 内部：`@covenant/core`（仅类型；不依赖 `@covenant/profile`——剖面解析在 core/profile 侧完成，layout 只吃已解析的 `CovenantDoc`）
- 被依赖：`@covenant/render`、`@covenant/cli`、`@covenant/mcp`

## 公共接口
- `layout(doc, options?)`、`selectView(doc, viewId?)`、`layoutSequence(doc, options?)`
- 路由/几何：`routePorts`、`clearPath`、`routeAbove`、`route`（导出供测试与复用）
- 标签口径（render 共用，避免宽度估算漂移）：`relationLabelText(rel)`、`estimateTextWidth(text, fontPx?)`、`estimateLabelWidth(rel)`

## 设计取舍
- 纯函数、无 I/O；所有尺寸由常量控制，保证跨平台逐字节一致。
- pins（手工坐标）优先于自动布局；父节点层级做松弛约束。
- 紧凑间距（去胶囊后）：长边通道与列/行车道统一 10px，不再按标签宽度扩张；仅对承载宽标签的 lane 按半宽留出"刚好不压节点"的边距。间隙不足时只扩大该间隙，不压回小间距。

## 约束
- 不得读写文件、不得依赖 render（避免循环）。
- 输出必须确定性；随机化不可接受。