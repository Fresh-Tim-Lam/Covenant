# viewer/ — 看板运行时脚本分片

看板是「构建期生成的单文件 HTML」：`packages/render/src/html.ts` 拼出骨架，内联的 `<script>` 是一段浏览器端 IIFE。
本文件夹把那段 IIFE 拆成若干**纯字符串常量分片**，在 `html.ts` 的 SCRIPT 模板里按原位置插值（`${脚本块}`），
从而让 html.ts 只保留「编排与 HTML 骨架」，运行时逻辑按职责落文件。

## 成员（F/R/A/S）

| 文件 | 职责（F） | 关系（R） | 断言/契约（A） | 约束（S） |
|---|---|---|---|---|
| `script-state.ts` | 指针封印状态、localStorage 存取、批注/编辑暂存的纯工具函数（`byId`/`docByKey`/`visibleAnns`/`esc`/`newId`/`nowISO` 等） | 与 `html.ts` 的 SCRIPT 共用同一 IIFE 作用域；被后者以 `${SCRIPT_STATE}` 原位置拼接 | 拼接后渲染出的 HTML 与拆分前逐字节一致；`pnpm golden` 零 diff | 纯文本搬迁，不改任何标识符；分片内不得出现反引号或 `${` |
| `script-edit-elements.ts` | 图上增删元素的 UI 与暂存：双击空白开创建表单、Delete 暂存删除、`.pending-add`/`.pending-remove` 视觉、撤销、`/elements/-` add 与 `/elements/<id>` remove 补丁 op | 调用 `script-state.ts` 的工具函数；被 `buildPatchFor` 调用 `pendingElementOps` 接入写回链路 | 创建/删除只进暂存、不写 `DATA.docs`；被批注或 relation 引用的元素拒绝暂存删除 | ≤300 行；不改 `html.dom.test.ts` |
| `element-edit.test.ts` | jsdom 无头验收：开表单、创建出 add op、Delete 出 remove op、有批注拒删、撤销后 ops 消失 | 走 `renderHtml` 产出的真实页面脚本 | 每个用例都断言「导出的 patch ops」，不测内部函数返回值 | ≤400 行 |

## 为什么拆（历史教训）

`html.ts` 曾是 2100+ 行模板字符串，前 4 次「图上增删元素」都因脚本/正则批量改写而破坏语法，
导致 48/52 个 DOM 测试全挂（AGENTS.md E2）。拆分只做**精确文本范围移动**：读原文 → 原样写入分片 →
原位置替换为 `${常量}`，每步立刻跑 `vitest run packages/render` + `pnpm golden`。
