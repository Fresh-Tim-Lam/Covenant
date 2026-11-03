# 5 分钟 Quickstart

> 目标：从零跑通 **写契约 → 校验 → 出图 → 标注 → 导出补丁 → 落盘** 的完整闭环。
> 前置：Node 22+、pnpm 11+。本仓库根目录执行。

## 0. 环境自检（可选）

```bash
pnpm covenant doctor
```

11 项检查：Node/pnpm/锁文件/workspace/schema/BOM/索引/ADR/git/产物/平台。每项失败都带 `fix:`。

## 1. 写一份最小契约

新建 `mini.cvn.yaml`（或直接用 `examples/quickstart/mini.cvn.yaml`）：

```yaml
covenant: "0.1"
id: quickstart/mini
profile: c4-container@1
meta:
  title: 支付网关（最小示例）
  purpose: 演示 check → build → annotate → patch → apply
  non_goals: []
elements:
  - { id: e.user, kind: person, name: 商户, summary: 发起支付 }
  - { id: e.gateway, kind: container, name: 支付网关, summary: 鉴权限流, tech: Ktor }
  - { id: e.db, kind: datastore, name: 支付库, summary: 订单流水, tech: PostgreSQL, props: { storage_kind: rdbms } }
relations:
  - { id: r.user-gateway, kind: calls, from: e.user, to: e.gateway, summary: 提交支付 }
  - { id: r.gateway-db, kind: writes, from: e.gateway, to: e.db, summary: 落订单 }
views:
  - { id: v.main, title: 支付网关, include: { elements: [e.*], relations: [r.*] } }
```

## 2. 校验

```bash
pnpm check examples/quickstart/mini.cvn.yaml
# result: 0 errors, 0 warnings
```

错误码会带 `fix:` 提示；`covenant: "0.1"` 必须加引号（否则 YAML 会解析成数字）。

## 3. 出图（两种）

```bash
pnpm render examples/quickstart/mini.cvn.yaml -o dist/mini.svg   # 静态 SVG
pnpm build:html examples/quickstart -o dist/mini.html            # 可标注 HTML
```

`build:html` 产物是**单个自包含文件**：双击打开，零外部请求。

想用本地服务打开（便于分享链接）：

```bash
pnpm serve dist        # → http://127.0.0.1:4173/
```

## 4. 人在图上标注

在 `dist/mini.html` 里：

1. 点击一个节点/连线 → 右侧出现批注表单；
2. 填标题、严重度、正文；**`ai_hint` 只由人填写**（它是给 AI 的约束）；
3. 保存后点"导出补丁"→ 得到 `*.patch.json`。

## 5. 门禁与落盘

```bash
pnpm patch-check <doc> <patch.json> --actor human:you   # AI 用 ai:<name>
pnpm apply <doc> <patch.json> --by human:you           # rev+1，保留注释，写前审计
pnpm check <doc>                                       # 复验
```

`apply` 会拒绝：`base_rev` 不匹配、AI 冒充 human、AI 写 `ai_hint`、AI 改批注状态。

## 6. 让 AI 参与（可选）

```bash
pnpm ai brief examples/quickstart/mini.cvn.yaml   # 未决批注 + ai_hint + 待答问题
pnpm mcp                                          # 或直接给 Agent 接 MCP（9 个工具）
```

## 7. 接下来

- 图种：`docs/design/profiles-catalog-v0.md`（10 个剖面）
- 格式：`docs/design/format-spec-v0.md`
- 人机协作契约：`docs/design/interaction.md`、`docs/design/ai-trust-boundary.md`
- 仓库自举：`arch/`、`covenant.yaml`
- Agent 入口：`AGENT.md`、`skills/covenant/SKILL.md`
