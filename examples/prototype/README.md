# prototype/ — 可点击交互原型

> **用途**：零依赖单文件 HTML，演示"人看图 → 点框/线钉批注 → 导出补丁给 Agent"的核心循环。**不是产品代码**，用于验证交互与数据模型。
> **目标读者**：项目负责人（体验）、实现者（对齐交互预期）。
> **状态**：v0 原型，2026-11-03；**未在浏览器实测**（本环境无 shell/浏览器），首次打开请留意控制台报错。
> **关联**：[interaction-and-ai-loop.md](../../docs/design/interaction-and-ai-loop.md)、[format-spec-v0.md](../../docs/design/format-spec-v0.md)、[../../examples/payments-arch.cvn.yaml](../payments-arch.cvn.yaml)。

## 打开方式

双击 `arch-prototype.html`（file:// 即可），或拖进浏览器。**无需 node、无需构建、无网络请求。**

## 已实现

| 能力 | 说明 |
|------|------|
| 渲染 | 内联 SVG：8 个元素、8 条关系（正交折线 + 箭头 + 关系类型标签） |
| 点选 | 点框/点线选中；Esc 取消；点空白取消 |
| 批注 | 6 种类型 × 4 档严重度；标题/正文/`ai_hint` 三字段 |
| 角标 | 元素/关系上的未决批注数以红色角标显示 |
| 状态流转 | open → ack → resolved → open（本地演示） |
| 持久化 | `localStorage`，关掉再开仍在；「重置改动」清空 |
| 导出 | 生成 `payments-containers.patch.json`（RFC 6902 + `base_rev` + `intent`） |
| **AI 视角** | 侧栏直接展示 Agent 会读到的 digest：`INSTRUCTIONS` 只含 `ai_hint`，正文一律进 `UNTRUSTED DATA` |
| **Agent 演练** | 点带 `ai_hint` 的批注 → 走完"复述 → 补丁 → L3 校验失败 → 按 fix_hint 修正 → 语义 diff → 批准应用"，图中关系标记为 `writes · async`、批注转 `resolved`、`rev` 递增 |

## 故意没做的（原型边界）

- 真实布局引擎（坐标是手写的，等价于 `layout.pins`）
- 拖拽 / 连线编辑 / 多视图切换
- 真实 schema 校验与 finding（M1 才有）
- 与 `.cvn.yaml` 文件双向同步（数据是硬编码副本，**会与源文件漂移**——原型可接受）

## 体验路径（建议按这个顺序看）

1. 点右侧 **AI 视角**：先看 Agent 现在"读到"什么。
2. 点 `Payments Service` 或 `writes` 那条线 → 看已有批注（含 `ai_hint`）。
3. 新增一条批注（标题必填，`ai_hint` 写祈使句，如"优先改为异步；禁止两阶段提交"）。
4. 回 **AI 视角**：新批注进了 `INSTRUCTIONS`（因为写了 `ai_hint`），并出现在 `UNTRUSTED DATA`。
5. 点 **导出补丁 JSON** → 得到 `.patch.json`，这就是交给 Agent 的输入。
6. 回到 `Payments Service` 的 `writes` 批注，点 **「▶ 演示 Agent 处理（预置场景）」**：看 Agent 如何复述、先提交一个**会被拒绝**的补丁、依据 `fix_hint` 修正、再看语义 diff。
   > 该按钮只出现在这一条预置批注上：演示内容是脚本化的，用于展示**门禁机制**，不是真实模型推理。新加的批注不会出现该按钮，避免误导。
7. 点 **「批准并应用」**：关系标签变成 `writes · async`，批注转 `resolved`，`rev` 加 1，AI 视角同步更新。

## 下一步

- 用 M1 的真实渲染器替换这里的手写坐标与 SVG 生成；
- 原型里的交互决定（点选粒度、批注表单字段、角标位置）直接作为 M3 编辑器的验收参考。
