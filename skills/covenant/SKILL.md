# SKILL: Covenant 契约式架构图

> 给陌生 Agent 的使用说明书。读完这一页就能操作，不需要先读 `docs/`。

## 什么时候用

- 仓库里有 `arch/*.cvn.yaml` / `examples/*.cvn.yaml`，或被要求"画架构图 / 更新架构图 / 标注架构问题"。
- 想知道"这次改动算不算破坏性变更"。
- 需要在用户审查后把批注落盘。

## 三条铁律（违反会破坏信任）

1. **`.cvn.yaml` 是唯一事实源**。永远不要编辑生成的 HTML/SVG；改图 = 改 YAML 再重建。
2. **批注保护与作者模式**（ADR-0005）：AI 可增删改元素/关系；批注上 `author` 必须是 `ai:<你的名字>`、可新增批注；**禁止**写 `ai_hint`（那是人给 AI 的指令）；**禁止**改批注状态（open/ack/resolved 是人的判断）。
3. **先门禁后落盘**：任何补丁先 `patch-check`，通过后 `apply`；不要手改 YAML 追加批注。

## 首选：走 MCP

仓库自带 stdio MCP server（`packages/mcp`）。配置示例：

```json
{
  "mcpServers": {
    "covenant": { "command": "pnpm", "args": ["mcp"], "cwd": "/path/to/Covenant" }
  }
}
```

工具（`tools/list` 可见）：

| 工具 | 用途 |
|---|---|
| `covenant_brief` | 评审简报：未决批注、人给的 `ai_hint`、待答问题——**推荐入口** |
| `covenant_read_doc` | 读语义投影（元素/关系/批注/ai_hint） |
| `covenant_check` | L1–L3 校验 |
| `covenant_render` | 出 SVG |
| `covenant_build` | 出可标注的自包含 HTML |
| `covenant_patch_check` | 补丁门禁（不写盘） |
| `covenant_apply` | 应用补丁（保留注释、rev+1、审计） |
| `covenant_diff` | cosmetic / material / breaking |
| `covenant_index` | FRAS 索引 I1–I3 |

## 没有 MCP：走 CLI

```bash
pnpm check arch examples                 # 0 error 才继续
pnpm render arch/system.cvn.yaml -o dist/self.svg
pnpm build:html arch -o dist/arch.html   # 人在这里看图标注
pnpm patch-check <doc> <patch> --actor ai:<name>
pnpm apply <doc> <patch> --by ai:<name>
pnpm diff <a> <b>                        # breaking → 必须人工批准
pnpm verify                              # check + index + test
pnpm ai brief <doc>                      # 评审简报（未决批注 + ai_hint + 问题）
pnpm ai annotate <doc> --target e.x --title "…" --actor ai:<name> -o p.json
```

## 典型任务

### 1) 回应人工批注

1. `covenant_read_doc` 或直接读 YAML，找到 `status: open` 的批注；
2. 看 `ai_hint`（若存在）作为约束；
3. 修改 `.cvn.yaml` 的元素/关系（这属于语义变更，**不是**补丁能做的）；
4. 跑 `check`；再跑 `diff` 对照旧版本，确认没有意外 breaking；
5. 若需要落盘批注回复，用补丁（只能 `add /annotations/-`）。

### 2) 提交一条 AI 批注

生成补丁 JSON：

```json
{
  "covenant": "0.1",
  "doc": "<文档 id>",
  "base_rev": <文档当前 meta.rev>,
  "intent": "AI 审阅：<一句话>",
  "ops": [{
    "op": "add",
    "path": "/annotations/-",
    "value": {
      "id": "a.<26 位 Crockford Base32>",
      "target": { "kind": "element", "id": "e.xxx" },
      "type": "risk", "severity": "medium",
      "title": "<一句话结论>",
      "body": "<证据>",
      "status": "open",
      "author": "ai:<你的名字>",
      "created": "<带时区的 date-time>"
    }
  }]
}
```

然后 `patch-check` → `apply`。

### 3) 改结构后同步文档

- 改了组件边界 → 改 `arch/system.cvn.yaml`，再 `check` + `diff`；
- 加了源文件 → 在 `arch/index.yaml` 补 FRAS 条目，`pnpm index`；
- 改完代码 → `pnpm index`：`stale` 说明条目没确认，确认后 `--write`。

## 常见错误

| 现象 | 原因 | 修法 |
|---|---|---|
| `schema/const` on `covenant` | YAML 把 `0.1` 解析成数字 | 写 `covenant: "0.1"` |
| `schema/format date-time` | 只写了日期 | 用 `2026-11-03T00:00:00+08:00` |
| `gate/ai-hint` | AI 写了 `ai_hint` | 删掉，把结论放 `body` |
| `gate/impersonation` | `author: human:*` | 改成 `ai:<你的名字>` |
| `index/stale` | 改了源码没确认条目 | 确认 F/R/A/S 后 `pnpm index --write` |
| `patch/base-rev` | 补丁基于旧版本 | 重新导出补丁 |

## 不要做

- 不要 `yaml.load` 后 dump 整份文件（会丢注释）——补丁通道已处理。
- 不要给 `arch/index.yaml` 编造 F/R/A/S；它必须描述真实行为。
- 不要绕过 `patch-check` 直接写 `.audit/`。
