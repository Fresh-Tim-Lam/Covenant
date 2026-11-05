# 看板交互用例与规范 v0（interaction-usecases-v0）

> **状态**：v0 草案，待评审（2026-11-05，研讨产出）
> **触发**：用户反馈「编辑板块没有复用连线规划器，连出来的线不符合要求」「交互行为没有定义好，需要开研讨团队定用例图，比如应该怎么创建框，怎么选元素，怎么连线等」
> **目的**：把看板交互从 ad-hoc 实现升级为**可测的规范**；后续实现以本文为验收依据，规范变更走本文修订而非口头约定。
> **关联**：[interaction-and-ai-loop.md](interaction-and-ai-loop.md)（闭环）· [gate-spec-v0.md](gate-spec-v0.md)（写回门禁）· [../AGENTS.md](../../AGENTS.md) §7 E2/E5（教训）
> **现状证据**：`packages/render/src/html.ts`（SCRIPT 运行时）与 `packages/render/src/viewer/`（script-state / script-edit-elements / script-edit-relations），均为本研讨实际读取与实现过的代码。

---

## 0. 总原则（所有用例的公理）

| # | 原则 | 来源 |
|---|---|---|
| P1 | **只进暂存**：图上的一切编辑（建/删元素、建/删关系）先入暂存桶，绝不修改 `DATA.docs`（构建产物副本只读） | task-21/22 边界 |
| P2 | **单一出口**：暂存只能经「导出补丁 JSON」或「本地服务写回」生效，两者走同一条 `buildPatchFor` → gate → apply 链 | task-22 |
| P3 | **可见失败**：任何被拒操作必须有 toast 说明原因（引用哪条门禁/引用关系），禁止静默忽略 | AGENTS.md L6 |
| P4 | **指针封印**：`draggingWin`（小窗拖拽）、`panning`（画布平移）及释放后 260ms 冷却期内，抑制一切 hover/click 开窗 | 实测 bug E5/a84989b |

---

## 1. 用例总览

```mermaid
graph LR
  subgraph 浏览态
    H[悬停元素/边] --> HW[hover 预览窗]
    C1[点击元素/边] --> CW[clicked 窗（保留）]
    P1c[📌 钉住] --> PW[pinned 窗]
    B1[点空白] --> CLR[清除未钉住窗与选中]
  end
  subgraph 编辑态（#btn-edit 开启）
    D1[双击空白] --> EF[创建元素表单]
    S1[选中元素 + Delete] --> RD[暂存删除元素]
    L1[元素窗口 ⇒ 连线] --> CM[连线模式]
    CM -->|点目标元素| RF[关系表单]
    S2[选中关系 + Delete] --> RR[暂存删除关系]
  end
  EF --> ST[暂存桶 + 计数 + overlay]
  RD --> ST
  RF --> ST
  RR --> ST
  ST --> EX[导出补丁 JSON / 写回 .cvn.yaml]
```

---

## 2. UC-1 选择（select）

| 项 | 规范 |
|---|---|
| 参与者 | human |
| 触发 | 点击元素/边；点击空白；Esc |
| 主流程 | 点击对象 → 打开 clicked 窗口并置 `selected={kind,id,segment}`；点击另一对象 → 各自开窗（多窗并存）；点击空白 → 清除未钉住窗与选中 |
| 分支 | 点击段热区 → 段窗（`segment=k`）；拖拽/平移后的 click 被封印拦截 |
| 后置 | Delete 键作用于 `selected` 指向的对象 |
| 验收 | jsdom：点击边后 `selected` 语义可经「按 Delete 出现 `.pending-remove-rel`」观测；点空白后可见窗数回到钉住数 |

**现状**：单选已实现（selected 由 activateWin 维护）。
**GAP-1.1**：无多选/框选。**规范决定**：v0 不做（P2 backlog）——多选会连带暂存批处理、批量删除语义、框选与创建框的耦合，超出本轮；先让单选闭环被真实使用验证。
**GAP-1.2**：选中态与窗口耦合（关窗即失去 selected）——规范确认现状（窗口即选中载体），不引入独立选中高亮层。

## 3. UC-2 创建框 frame

**现状**：**无任何框创建 UI**（schema 支持 `frames[]`、render 会画框、自举图有 f.trusted）。这是最大缺口。

| 项 | 规范（推荐方案） |
|---|---|
| 触发 | 编辑模式下点击工具条「新建框」→ 进入画框模式（指针 crosshair）→ 在空白处**按下-拖拽-释放**画出矩形 → 弹表单（id 自动 `f.xxx`、title 必填）→ 创建 |
| 主流程 | 画矩形 → 暂存 `add /frames/-`（value: id/title/members）→ members = 释放时**几何包含**的已存在元素（以节点盒中心点是否落入矩形判定） |
| 分支 | 矩形面积 < 阈值（<16px²）→ 取消并 toast；未包含任何元素 → 允许创建空框但 toast 提醒；Esc → 取消 |
| 成员进出 | v0 不做拖入拖出（P2）；改成员直接编辑 `.cvn.yaml` |
| 与批注关系 | frame 可被批注 target 引用（已有能力），删除有批注引用的框同样被拦 |
| 验收 | jsdom：画框 → `.pending-add-frame` overlay 出现 + patch 含 `add /frames/-` 且 members 正确；含批注引用的框拒删 |
| 工作量 | **M**（复用连线模式的状态机骨架与暂存桶模式） |

**GAP-2.1**：无框创建/删除 UI——按上表实现（P1）。
**GAP-2.2**：无框删除——同 UC-4 语义（Delete 选中框 / 暂存），被成员或批注约束时拦（P1，随 2.1）。

## 4. UC-3 连线（创建关系）

| 项 | 规范 |
|---|---|
| 进入 | 元素窗口顶栏「⇒ 连线」→ `connectingFrom=源`（指针 crosshair + toast 提示） |
| 目标 | 点击**已存在且未暂存增删**的元素 → 关系表单；点空白/Esc → 取消连线模式 |
| 校验 | 自环拒绝；from/to 不得是暂存元素；summary 必填；kind 取当前文档已有 kinds |
| 重复边 | 同 from+to+kind 允许并存（架构语义上允许平行边），但 toast 提醒「已存在同向同类关系」 |
| 反向边 | 允许（from/to 互换是不同语义） |
| **pending 线路由** | **结论：查看器不做完整规划器复用，pending 线定位为「示意线」**。理由：layout 是构建期依赖（未打包进查看器），内嵌完整规划器 = 体积/复杂度大增且与 build 结果仍会有差。规范要求示意线：正交折线（≥3 段、轴对齐）+ 端口出线 + `cvn-arrow` 箭头 + 蓝色虚线（已实现于 `routeOrthogonal`）；写回并重新 build 后以规划器真实路由为准 |
| 验收 | jsdom：overlay 为 `<path>`、`d` 匹配正交折线、`marker-end` 含 `cvn-arrow`；Esc/空白取消；暂存元素连线被拒 toast |

**GAP-3.1**：重复边无提醒——toast 提醒（S）。
**GAP-3.2**：pending 线路由（已按本规范实现正交示意线）——完整规划器复用列为 non-goal（见 §10）。

## 5. UC-4 创建/删除元素与关系

| 项 | 规范 |
|---|---|
| 创建元素 | 双击空白 → 表单（name 必填唯一 / kind 来自当前文档已有 kinds / summary 默认= name / tech 可空） |
| 删除元素 | 选中 + Delete 暂存；被批注/relation/frame 引用时拒绝并列出数量 |
| 删除关系 | 选中关系 + Delete 暂存；被批注引用（含段级）时拒绝 |
| 暂存可见性 | 顶栏计数（元素/关系分列）+ 图上 overlay；再按 Delete 或点撤销 = 回退 |
| 撤销/重做 | v0：单撤销栈（深度 20），无重做。**规范决定**：重做（Ctrl+Y）列 P2——暂存操作天然低危（写回前可随时弃），重做收益有限 |
| 验收 | 沿用 `element-edit.test.ts` / `relation-edit.test.ts` 既有断言（ops 出现/消失、拒删 toast、顺序 add<remove） |

**GAP-4.1**：无暂存清单面板（只有计数，看不到具体条目）——见 UC-6 面板（P1）。
**GAP-4.2**：无重做——P2（理由如上）。

## 6. UC-5 悬停/点击/钉住 × 编辑模式

| 项 | 规范 |
|---|---|
| 浏览态 | hover 120ms 预览（移开即关）/ 点击保留 / 📌 钉住；三态并存多窗 |
| **编辑态** | **hover 预览禁用**（降噪：编辑时鼠标高频扫过元素，预览窗反成干扰）；点击/钉住/多窗保留 |
| 指针封印 | 拖窗/平移/260ms 冷却期内，一切 hover/click 抑制（现状已实现） |
| 验收 | jsdom：编辑开启时 pointerenter 不产生可见窗；封印期内 pointerenter 不产生可见窗（已有断言） |

**GAP-5.1**：编辑模式未抑制 hover 预览——`pointerSuppressed()` 增加 `editing` 分支（S）。

## 7. UC-6 暂存与写回

| 项 | 规范 |
|---|---|
| 双通道 | 「导出补丁 JSON」（单文档）/「导出全部补丁」（bundle）→ `covenant apply`；或编辑服务「写回」（先 `/api/rev` rebase 再 POST） |
| 门禁 | `gatePatch`（信任边界 T1–T7 + 端点/字段校验）→ 原子落盘 + rev+1 + `.audit/` |
| 失败 | 写回被 gate 拒 → toast 展示**前 3 条 findings**（现状只报成功/失败，不展示原因） |
| 暂存清单 | 编辑模式下点计数展开**暂存面板**：逐条列出 adds/removes（元素+关系），单条可移除 |
| 验收 | jsdom：mock 409 响应 → toast 含 `gate/` 错误码；面板列出与计数一致的条数 |

**GAP-6.1**：写回失败不展示 findings——toast 前 3 条（S）。
**GAP-6.2**：无暂存清单面板——面板（M，P1）。

## 8. UC-7 快捷键与边界

| 键 | 浏览态 | 编辑态 |
|---|---|---|
| Esc | 清除选中/关窗 | 取消连线模式/关表单/清选中 |
| Delete/Backspace | — | 暂存删除选中元素或关系 |
| 双击 | 缩放（命中对象）/建元素表单（空白） | 同左 |
| 拖空白 | 平移画布 | 平移画布 |

边界：空图（无双击建首个元素的引导 toast，P2）；单元素（连线按钮可用，目标校验拒绝自环 ✅）；密集图（pending 示意线不避障——已知限制，写回后以真实路由为准）。

**GAP-7.1**：快捷键表未入 kit 文档——补入 onboarding prompt（S）。
**GAP-7.2**：空图无引导——首次进入编辑模式时 toast「双击空白创建第一个元素」（S，P2）。

---

## 9. GAP 汇总（按优先级）

| ID | GAP | 规范行为 | 建议工作量 | 优先级 |
|---|---|---|---|---|
| 2.1/2.2 | 无框创建/删除 UI | 画框模式 + 暂存 + 拦截（UC-2 全表） | M | **P1** |
| 6.2 | 无暂存清单面板 | 计数点开面板，单条可移除 | M | **P1** |
| 5.1 | 编辑态未抑制 hover 预览 | `pointerSuppressed()` 加 `editing` | S | P1 |
| 6.1 | 写回失败不展示原因 | toast 前 3 条 findings | S | P2 |
| 3.1 | 重复边无提醒 | toast 提醒 | S | P2 |
| 7.1 | 快捷键表未文档化 | 入 onboarding prompt | S | P2 |
| 4.2 | 无重做 | Ctrl+Y | M | P2 |
| 7.2 | 空图无引导 | toast 引导 | S | P2 |
| 1.1 | 无多选/框选 | — | L | P2（先验证单选闭环） |

**已按本规范先行修复**（本次研讨前落地）：pending 关系线正交路由（GAP-3.2 的示意线要求，commit e942656）。

---

## 10. Non-goals（本轮明确不做）

- 查看器内嵌完整 layout 规划器（体积/复杂度；pending 线定位为示意线）
- 多选/框选批量操作（P2，待单选闭环验证）
- 实时协作/多人并发编辑（单机单文件前提）
- 元素拖拽改布局之外的画布重排（layout 仍是构建期权威）
- 移动端触控专门优化（Pointer 事件已兼容基础场景，不做专门打磨）

---

## 11. 验收标准索引（可测断言映射）

- UC-1 → `relation-edit.test.ts`（边选中 Delete 生效）+ `element-edit.test.ts`（空白清除）
- UC-2 → 待实现后新增：画框 overlay/patch/members 断言
- UC-3 → `relation-edit.test.ts`（正交 path + marker + Esc + 拒连）
- UC-4 → `element-edit.test.ts` 既有 10 用例
- UC-5 → 待实现后新增：编辑态 pointerenter 无可见窗
- UC-6 → 待实现后新增：mock 409 → toast 含错误码；面板条数断言
- 指针封印 → `viewer.verify.test.ts`（6 用例，含变异验证）
