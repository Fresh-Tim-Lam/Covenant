# 渲染引擎架构 v0（提案）

> **用途**：定义从 `.cvn` 文本到屏幕/文件的完整管线、模块边界、技术选型与确定性保证。
> **目标读者**：实现者、评审者。
> **状态**：提案 v0；技术栈 **已定：TypeScript 全栈**（D1）；交付形态 **已定：自包含本地 HTML 优先**（D2），见 [open-questions.md](open-questions.md)。本文以 TS + SVG 为基线。
> **关联文档**：[format-spec-v0.md](format-spec-v0.md)（输入格式）；[diagram-taxonomy.md](diagram-taxonomy.md)（剖面）。

---

## 1. 目标与非目标

**目标**
1. **确定性**：同一输入（文档 + 布局引擎版本 + 字体度量版本）产出逐字节相同的 SVG。
2. **可编程**：渲染是纯函数，无 DOM 依赖，可在 Node/Bun/浏览器/Worker/CI 中运行。
3. **可交互**：同一份 Scene 既能出 SVG，也能挂 DOM 事件做编辑。
4. **可校验**：渲染前必须过校验（或显式 `--allow-invalid` 以草稿态渲染）。

**非目标（v0）**
- 高帧率手绘笔迹（交给可选画布层）。
- 3D / 动画 / 实时协同（架构上留位，不做）。
- 像素级复刻 Figma 的设计能力。

---

## 2. 分层

```
┌──────────────────────────────────────────────────────────┐
│ 接入层    CLI  ·  MCP Server  ·  Web Editor  ·  CI 插件   │
├──────────────────────────────────────────────────────────┤
│ 编排层    parse → validate → layout → scene → render/export│
├──────────────────────────────────────────────────────────┤
│ 领域层    Document Model · Profile Registry · Validators   │
│           Annotation Store · Semantic Diff · AI Projection │
├──────────────────────────────────────────────────────────┤
│ 布局层    elk | dagre | none   +  pin 覆盖 + 自定义(序列图) │
├──────────────────────────────────────────────────────────┤
│ 渲染层    Scene(显示列表) → SVG | DOM | PNG | PDF          │
├──────────────────────────────────────────────────────────┤
│ 基础层    文本度量 · 几何 · 主题令牌 · 一致性哈希           │
└──────────────────────────────────────────────────────────┘
```

**关键约束**：**领域层不依赖渲染层；渲染层不依赖 DOM。** 这条让 AI、CI、服务端都能复用同一套语义。

---

## 3. 管线

```
.cvn (YAML)
  │ parse            js-yaml + 严格规则（禁锚点/别名/自定义 tag）
  ▼
RawDoc
  │ schema (L0/L1)   JSON Schema (ajv) + 严格未知字段
  ▼
Doc ──validate──► Findings[]  (L2 kernel / L3 profile / L4 cross-doc / L5 code / L6 fitness)
  │                          └── error 且有 --strict → 中止
  ▼
View 投影 (include/exclude/filter)
  │ layout           engine(doc, view) -> Map<id, Rect>；pins 覆盖
  ▼
Scene  { width, height, background, primitives[], hitAreas[], a11y[] }
  ├─► svgRenderer    → string（确定性）
  ├─► domRenderer    → SVGElement + 事件绑定（编辑器）
  ├─► pngRenderer    → resvg/skia（服务端）或 canvas（浏览器）
  └─► aiProjection   → digest / spatial / context
```

---

## 4. 为什么要有 Scene 中间表示

Scene = **显示列表 + 命中区 + 无障碍树**，不是 DOM 也不是字符串。

好处：
1. **一次布局，多种输出**（SVG/PNG/PDF/DOM）。
2. **可测试**：Scene 是纯数据，断言简单（黄金文件）。
3. **可分析**：重叠检测、越界检测、可读性检查（与校验器同构）。
4. **可增量**：编辑器局部重绘只需 diff Scene。
5. **可被 AI 读**：`spatial` 投影直接来自 Scene，无需解析 SVG。

```ts
type Scene = {
  width: number; height: number; background: Tok;
  primitives: Primitive[];          // 有序绘制
  hitAreas: HitArea[];              // 每个语义元素 → 几何 + elementId
  a11y: A11yNode[];                 // role/name/description（来自 name/summary）
  meta: { docId, viewId, rev, layoutEngine, fontMetricsVersion };
}
type Primitive =
  | { t:'rect'; id; x;y;w;h; rx; fill; stroke; dash }
  | { t:'path'; id; d; stroke; fill; markerStart?; markerEnd? }
  | { t:'text'; id; x;y; text; font; size; anchor; maxWidth; lines }
  | { t:'group'; id; children: Primitive[] }
  | { t:'badge'; id; x;y; count; severity }   // 批注角标
  | { t:'image'; id; href; x;y;w;h }
  | { t:'frame'; id; label; ... }
```

---

## 5. 模块划分（推荐 monorepo 包结构；M1 定稿）

```
packages/
├─ core/        @covenant/core      类型、文档模型、JSON Schema、解析/序列化/格式化
├─ profile/     @covenant/profile   剖面注册表 + 内置剖面定义（c4/dfd/er/...）
├─ validate/    @covenant/validate  L0–L6 校验器 + 规则类型实现 + finding 格式化
├─ layout/      @covenant/layout    布局接口 + elk/dagre 适配 + 序列图专用布局
├─ render/      @covenant/render    scene 构造 + svg/dom/png/pdf 渲染器 + 主题
├─ ai/          @covenant/ai        digest/context/spatial 投影 + diff + 补丁应用
├─ cli/         covenant            命令行：check/fmt/render/digest/diff/new/export
├─ mcp/         @covenant/mcp       MCP server（工具：list/digest/query/validate/annotate/patch/render）
└─ editor/      @covenant/editor    Web Component 编辑器（选择/拖拽/连线/批注面板）
```

依赖方向必须单向：`core ← profile ← validate ← layout ← render ← editor`；`ai` 只依赖 `core/validate`；`cli/mcp` 依赖全部但无反向依赖。

---

## 6. 技术选型（推荐 + 被否方案）

| 关注点 | 推荐 | 理由 | 被否 |
|--------|------|------|------|
| 语言 | TypeScript（strict） | 浏览器 + Node 通吃；类型即 schema | Rust/WASM（首期过重）；Python（前端要重写） |
| 解析 | `js-yaml` + 严格后处理 | 成熟；需禁锚点/别名 | 自写解析器（不值） |
| Schema | JSON Schema + `ajv` | 生态完善，可生成类型 | Zod（更顺手但跨语言弱）；手写校验（重复） |
| 布局 | `elkjs`（分层/树/力导向） | 覆盖 DFD/流程/层级；成果最稳 | dagre（作 fallback）；自研（不做） |
| 图形 | **SVG + HTML 叠层** | 可检查、可 a11y、可黄金测试、文本清晰 | Canvas（不利于检查/测试）；WebGL（无必要） |
| 文本度量 | 内置度量表（字体子集 width map）+ 浏览器实测校准 | 保证 Node 与浏览器一致 | 纯浏览器 `measureText`（服务端不可用） |
| 导出 PNG | `@resvg/resvg-js`（服务端）/ Canvas（浏览器） | 与 SVG 同源，避免两套渲染 | 无头浏览器（重） |
| 状态管理 | 不可变 Doc + Command 模式 | 天然 undo/redo、易 diff、易协同 | 可变对象（难审计） |
| 协同（后期） | Yjs（挂在 AST 上，保存时序列化 YAML） | 与"文件即事实源"兼容 | 自研 OT（不值） |
| 测试 | Vitest + Playwright | 单测快、e2e 真 | Jest（慢） |
| 包管理 | pnpm workspace | monorepo 标准 | npm workspaces（够用但慢） |

> 若用户偏好 **Rust/WASM 内核 + TS 外壳**（性能/单二进制分发），`core/validate/layout` 可放 Rust，`render/editor` 留 TS。接口设计已隔离，可后换。这就是 Q1 的意义。

---

## 7. 确定性渲染

必须消除的不确定源：

| 风险 | 对策 |
|------|------|
| 随机 ID / 时间戳 | 渲染期禁止 `Math.random`/`Date`；meta 里的时间不参与几何 |
| 浮点误差 | 几何量统一 `round(x*100)/100`；布局输出先量化再进 Scene |
| 字体差异 | 版本化度量表（`fontMetricsVersion`）；`<text>` 附 `textLength` 可选 |
| 布局引擎版本漂移 | `meta.layoutEngine = elk@0.9.x`；升级即黄金文件批量更新（视为变更） |
| Map/Set 迭代顺序 | 所有遍历按显式排序键（id） |
| 异步渲染 | 管线全同步；并发由外部调度 |

**验收方式**：同输入渲染 100 次哈希一致；CI 中黄金 SVG 文件对比（diff 为空才算过）。

---

## 8. 四种运行形态

> **D2 决定**：用户主路径是"双击生成好的本地 `.html`"。因此**形态 ①（自包含 HTML）是一等公民**，不是附属产物。

| 形态 | 入口 | 特点 |
|------|------|------|
| **① 自包含 HTML**（主路径） | `covenant build arch/ -o dist/arch.html` | 单文件、离线、无 CDN；内联文档 JSON + 渲染器 bundle + 样式；支持标注、导出补丁 |
| ② 本地服务 / 编辑器 | `covenant serve arch/` | localhost；标注直写磁盘；AI/MCP 同进程；热更新 |
| ③ Headless 渲染 | `covenant render x.cvn -o x.svg` | CI/文档站/AI 预览；无 DOM |
| ④ 只读查看器 | 形态 ① 的 `readonly` 模式 | 评审场景：只批注、不过改语义 |

**形态 ① 的工程约束**（详见 [interaction-and-ai-loop.md](interaction-and-ai-loop.md) §3）：
- 渲染器需可 tree-shake 成浏览器 bundle，目标 < 500 KB。
- 字体走系统字体栈（或内嵌子集），保证离线布局稳定。
- 写回默认走"导出补丁"（`file://` 不可写盘），`serve` 下升级为直写。
- 所有标注文本渲染前转义 + CSP `default-src 'none'`。

**打包产物结构**：
```
dist/arch.html            # 单文件（含全部文档 + 视图切换）
dist/arch.svg             # 可选：静态图（给文档站/PR diff）
dist/arch.png             # 可选：栅格图
```

---

## 9. 交互层要点

- **命中测试**：`hitAreas` 由 Scene 提供，优先用 `elementId` 而非几何猜测。
- **拖拽**：只改 `view.layout.pins`（语义层唯一坐标入口）；松手触发一次 Command。
- **连线**：从端口拖出，实时按**剖面关系矩阵**过滤可选目标（非法目标灰显）——**在交互层就消歧义**，而不是等校验。
- **批注**：选中元素 → 侧栏新建；批注角标由 Scene 的 `badge` 图元渲染；状态变更写回文档。
- **草稿态**：校验有 error 时允许编辑（`--allow-invalid`），但**禁止发布/冻结**，并高亮违规元素。

---

## 10. 性能预算（v0 目标）

| 场景 | 预算 |
|------|------|
| 200 元素图：parse+validate | < 100 ms |
| 200 元素图：布局（ELK） | < 500 ms |
| 200 元素图：首屏渲染 | < 200 ms |
| 编辑单元素重绘 | < 16 ms（局部 Scene diff） |
| digest 生成（100 元素） | < 20 ms，输出 < 4 KB |

超过 1000 元素时引入视口裁剪与增量布局（v2）。

---

## 11. 测试策略

1. **Schema 测试**：正例 / 反例（未知字段、缺必填、错类型）。
2. **校验器测试**：每个规则类型至少 1 正 1 反；finding 顺序稳定。
3. **布局测试**：断言无重叠、无越界、方向正确（性质测试）。
4. **黄金 SVG**：每个内置剖面 1 个基准文档；任何像素级变化显式更新。
5. **AI 投影测试**：digest 行数/字段稳定；预算截断行为确定。
6. **E2E**：编辑器拖拽 → 保存 → 重新渲染一致（防坐标漂移）。

---

## 12. 可访问性与语义

- SVG 根节点带 `role="img"` + `aria-labelledby`；每个元素 `<g role="group" aria-label>`。
- `<title>`/`<desc>` 来自 `name`/`summary` —— **a11y 与 AI 可读共用同一份文本**。
- 键盘导航：Tab 遍历元素、Enter 打开批注。
- 配色满足 WCAG AA；主题令牌化，可换深色。

---

## 13. AI 接口（引擎侧）

| 工具 | 输入 | 输出 |
|------|------|------|
| `covenant_list` | 项目路径 | 文档列表 + 状态 + 未决批注数 |
| `covenant_digest` | doc, budget | 紧凑语义摘要（§10.1 格式） |
| `covenant_query` | selector | 元素/关系/批注子集 |
| `covenant_validate` | doc | findings[]（含 fix_hint） |
| `covenant_annotate` | target, type, body, ai_hint | 新批注 id |
| `covenant_patch` | base_rev, ops, intent | 新 rev / 冲突 / 校验失败 |
| `covenant_render` | doc, view, format | svg/png 路径 |
| `covenant_diff` | rev A, rev B | 语义 diff（cosmetic/material/breaking） |

**MCP 只是薄壳**：所有能力先做成库函数，再暴露；保证 CLI/MCP/编辑器行为一致。

---

## 14. 里程碑

| 阶段 | 交付 | 验收 |
|------|------|------|
| M0 | 本提案 + 格式草案 | 用户确认 Q1–Q7 |
| M1 | `core` + `profile(c4-container,dfd,er,flowchart)` + `validate L0–L3` + `cli check` | 正反例全过；finding 稳定 |
| M2 | `layout` + `render(svg)` + 黄金测试 | 4 个剖面各有基准图，渲染确定性通过 |
| M3 | `editor`（选择/拖拽/连线/批注）+ `digest` | 人能在图上钉批注并保存 |
| M4 | `diff` + `patch` + `mcp` | AI 提交补丁 → 校验 → 语义 diff → 批准 |
| M5 | 代码绑定（L5）+ fitness（L6）+ Structurizr/Mermaid 互操作 | 图与代码一致性可执行 |

---

## 15. 主要风险

1. **YAML 表达力与歧义**（`no` → false 等）→ 严格格式化器 + 引号策略 + 正反例测试。
2. **ELK 布局质量不满足架构图审美** → 允许 pins 覆盖；后续可接 TALA 类自研/服务。
3. **范围膨胀**（想覆盖 55 种图）→ 用 §5 的 12 件套锁 MVP，剖面增量交付。
4. **编辑体验做不过专业白板** → 定位是"契约层"，不追求手绘自由；手绘需求交给可选画布层。
