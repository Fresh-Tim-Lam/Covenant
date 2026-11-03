# 自身架构图批注处理记录（2026-11-03）

> 处理对象：`arch/system.cvn.yaml` 与 `examples/covenant-self.cvn.yaml` 中的 9 条批注。
> 原则：**能修代码就修 + 加回归测试；格式/产品决策写清楚；确实需要人验收的保持 open 并给出验收清单。**

## 一、已解决（修复或已具备证据）

| 批注 | 结论 | 证据 / 动作 |
|---|---|---|
| `a.01JAYS3KV0001` 短边标签密集相邻 | **已修**：候选位置耗尽后新增确定性环扩张回退，标签不再叠放 | `packages/render/src/index.ts` `fallbackLabelPoint`；`render.test.ts`「候选耗尽也不重叠」；黄金图 15 张不变（无冲突时行为不变） |
| `a.01JAYS3KV0002` 交叉最小化是否覆盖跨层边 | **已回答（v0 范围）**：只对相邻层边做 barycenter；跨层边走顶部通道绕行，不参与交叉计数。属已知取舍，不是 bug | `packages/layout/src/index.ts` 长边 channel 段注释；本记录 |
| `a.01JAY0S3KV01` 单文件 HTML 体积预算 | **已解除**：未引入 ELK（布局为自研确定性算法），当前产物 **179.8 KB < 500 KB** 预算；构建会打印体积 | `pnpm build:html` 输出；dist/covenant.html |
| `a.01JAY0S3KV03` YAML Norway 问题 | **已解决**：解析器显式使用 YAML 1.2 **CORE_SCHEMA**，`no/yes/on/off` 保持字符串 | `packages/core/src/parse.ts` 注释与实现；新增回归 `packages/core/src/parse.test.ts`（含时间戳不被转 Date） |
| `a.01JAY0S3KV04` 规则需要可修复建议 | **已具备**：validate 中 `fixHint` 共 20 处；golden path Step6 依赖的 fix_hint 已可用 | 该批注原状态已是 resolved；本次复核 |
| `a.01JAY0S3KV05` 原子替换 + 审计的崩溃窗口 | **已接受（write-ahead 可追溯）**：先写 `intent` → 临时文件 → 复验 → rename → `commit`；若在 rename 后、commit 前崩溃，`.audit` 里留有 intent-only 记录，可人工判定"可能已改" | `packages/patch/src/apply.ts` intent/commit 两阶段；`.audit/*.jsonl` |
| `a.01JAY0S3KV06` 默认不联网是产品承诺 | **已确认（决策）**：渲染/校验/digest 全本地；仅显式 `serve --ai` 才允许外发 | AGENT.md、设计文档；标记 resolved |

## 二、结案/保持 open

| 批注 | 原因 | 下一步 |
|---|---|---|
| `a.01JAYS3KV0003` 真实浏览器尚未验收 | 交互只在 jsdom 验证，CSS 手感必须人工确认 | 用最新 `dist/covenant.html` 做一次人工验收：点选/悬浮窗拖拽/钉住/编辑/删除撤销/缩放；有问题发回来 |
| ~~`a.01JAY0S3KV02` region 批注坐标漂移~~ | **用户确认已解决（2026-11-03）** | 按用户确认结案，不再作为格式缺口跟踪；若后续重新出现，再按 element/frame id 锚点方案处理 |

## 三、复核命令

```bash
pnpm test        # 264 tests
pnpm verify      # check / index / adr / modules / tests
pnpm build:html examples -o dist/covenant.html
```
