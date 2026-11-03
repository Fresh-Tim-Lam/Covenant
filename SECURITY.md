# 安全策略

## 支持版本

| 版本 | 支持 |
|------|------|
| 0.1.x | ✅ |

## 信任边界（本项目的核心安全模型）

Covenant 是**本地单机工具**：没有服务端、没有账号体系、默认不联网。安全边界围绕"AI 与人谁可以改什么"：

1. **`.cvn.yaml` 是唯一事实源**。HTML/SVG 是构建产物，AI 不得直接编辑产物。
2. **AI 只能新增批注**：
   - `author` 必须是 `ai:<name>`（`gate/impersonation`）；
   - 不得写 `ai_hint`（人类给 AI 的指令，`gate/ai-hint`）；
   - 不得改批注状态（`gate/status-actor`）；
   - `base_rev` 必须匹配（`gate/base-rev`）。
3. **门禁在代码里，不在提示词里**：`covenant patch-check` / `apply` 对这些规则做硬校验；门禁失败时 `apply` 不写任何字节。
4. **写前审计**：`apply` 生成 `.audit/*.jsonl`（intent → rename → commit），记录谁在何时批准了什么。
5. **渲染产物无脚本注入**：所有文本经 XML 转义；内联 JSON 转义 `<`，避免提前闭合 `</script>`；产物无外部请求（无 CDN/字体/图片）。

## 已知风险面

| 风险 | 说明 | 缓解 |
|------|------|------|
| YAML 解析 | 恶意 YAML 锚点/别名炸弹 | 禁用 anchors/aliases（`parse.ts` 拒绝） |
| 路径穿越 | `covenant serve` 读取目录外文件 | 解析后必须仍在根目录内，否则 403 |
| 端口暴露 | `serve` 无鉴权/无 TLS | 默认绑定 `127.0.0.1`；不要暴露公网 |
| 供应链 | 依赖被投毒 | 锁文件 + `pnpm install --frozen-lockfile`；`pnpm verify` 门禁 |
| 审计伪造 | 手改 `.audit/` | 审计是"留痕"不是"防篡改"；强对抗场景需外部日志 |

## 报告漏洞

仓库尚未发布（未 `git init`、无公开地址）。**当前请直接联系仓库所有者私下报告**，不要公开 issue。

发布后将启用：
- GitHub Security Advisories（私有漏洞报告）；
- 72 小时内确认收到，7 天内给出修复或缓解计划。

报告时请包含：受影响版本、复现步骤、PoC（如有）、影响评估。请不要在修复发布前公开细节。
