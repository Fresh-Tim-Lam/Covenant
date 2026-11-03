# 验收报告（Acceptance）

> **对象**：目标「面向人机协作的软件工程图示语言」v0.1.0
> **日期**：2026-11-03
> **结论**：核心交付全部达成；4 项遗留属于发布/人工验收，已显式列出（见 §4）。

本文件把目标逐条映射到**可复现的命令与实测结果**。任何人都可按 §5 复跑。

---

## 1. 目标 → 证据

| # | 目标要求 | 交付物 | 可复现证据 | 实测结果 |
|---|---------|--------|-----------|:---:|
| 1 | 类飞书画板的文件格式 | `.cvn.yaml` + `schema/kernel.schema.json` + `docs/design/format-spec-v0.md` | `pnpm check examples` | **0 errors** |
| 2 | 程序化网页渲染引擎 | 布局（barycenter/长边通道）+ SVG + 自包含 HTML | `pnpm build:html examples -o dist/covenant.html` | **15 docs / 115.8 KB** |
| 3 | AI 可读 | `covenant ai brief`（未决批注/`ai_hint`/待答问题）；MCP `covenant_read_doc` | `pnpm ai brief examples/payments-arch.cvn.yaml` | **输出完整简报** |
| 4 | AI 可写 | `covenant ai annotate` 生成 gate 合法补丁；`patch-check` 强制 `author: ai:*`、禁 `ai_hint`、禁改状态 | `pnpm test`（`gate/impersonation` 等用例） | **209 tests 全绿** |
| 5 | 人可直接标注架构问题 | 自包含 HTML：点选元素/连线 → 批注表单 → 状态流转 → 导出补丁 | jsdom e2e + `dist/covenant.html` | **补丁导出通过** |
| 6 | 标注反馈进入开发 | `patch-check` → `apply`（保留注释、rev+1、write-ahead 审计）→ `check` | `pnpm test`（patch 32 条） | **rev 3→4 实测** |
| 7 | 市面调研 | `docs/research/landscape-2026-11.md` | 文档存在 | ✅ |
| 8 | 格式/架构提案 | `docs/design/*`（格式、剖面目录、引擎架构、交互、信任边界、门禁、可发现性、图种 taxonomy） | 文档存在 | ✅ |
| 9 | Memoria 范式仓库骨架 | `arch/` 自举契约 + `arch/index.yaml` FRAS + `covenant.yaml` + ADR + `AGENT.md` | `pnpm check arch` / `pnpm index` / `pnpm adr` | **全部 PASS** |
| 10 | 迭代开发 | 39 轮迭代、能力清单见 `CHANGELOG.md` | `git log`（待 git init） | 版本 **0.1.0** |

---

## 2. 当前实测汇总（2026-11-03 本轮）

```
pnpm verify            → result: 0 errors, 0 warnings
                         index: PASS（I1–I3，24 条）
                         adr:   PASS（2 条）
                         Tests: 209 passed（14 个测试文件）
pnpm covenant doctor   → PASS（12 项，0 fail / 1 warn：仅 git 未初始化）
pnpm golden            → 14 张黄金 SVG 全部匹配
pnpm build:html        → 15 docs / 115.8 KB（单文件、零外部请求）
node scripts/mcp-smoke → PASS  tools=9  scanned=13  errors=0
pnpm serve dist        → GET /           200 text/html 128871B（含 covenant-data）
                         GET /nope.html  404
                         GET /self-arch.svg 200 image/svg+xml
pnpm cleanroom         → PASS（干净目录 + 重装 + verify，209 tests）
```

## 3. 图种覆盖（10 个剖面）

`c4-container` / `c4-context` / `c4-component` / `dfd` / `er` / `flowchart` / `deployment` / `graph` / `sequence` / `state`

每个剖面都有：词表 + 关系矩阵 + 专有规则 + 示例文档 + 黄金图（或渲染测试）。

## 4. 未完成项（诚实清单）

| 项 | 状态 | 为什么没做 | 需要谁 |
|---|---|---|---|
| `git init` + 版本历史/tag | ❌ | 需要用户确认（不可逆的仓库初始化与发布动作） | 你 |
| AGPL-3.0 原文 + `COMMERCIAL.md` | ❌ | 许可证文本与商业条款需要用户决策 | 你 |
| 真实浏览器人工验收 | ⚠️ | 已提供 `pnpm serve` 与 HTTP 冒烟；视觉/手感需人看 | 你 |
| CI 实际运行 | ⚠️ | `.github/workflows/verify.yml` 已就绪，但无 remote | 你（git+remote） |

以上均不影响本地功能完整性。

## 5. 复跑方式（5 分钟）

```bash
pnpm install
pnpm covenant doctor          # 环境自检（12 项）
pnpm verify                   # 门禁：契约 + 索引 + ADR + 209 测试
pnpm build:html examples -o dist/covenant.html
pnpm serve dist               # 打开 http://127.0.0.1:4173/ 人工验收
pnpm cleanroom                # 干净环境复现（可选，~2 分钟）
```

## 6. 关键信任不变量（已被测试锁定）

1. `.cvn.yaml` 是唯一事实源；HTML/SVG 是产物。
2. AI 只能新增批注：`author` 必须 `ai:*`；不得写 `ai_hint`；不得改状态。
3. 补丁 `base_rev` 不匹配 → 拒绝；门禁失败 `apply` 不写任何字节。
4. 渲染确定性：同输入逐字节一致（黄金测试）。
5. 自包含 HTML 无外部请求、无脚本注入（XML 转义 + `</script>` 转义测试）。
