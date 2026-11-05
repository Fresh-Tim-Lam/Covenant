---
adr: "0005"
title: AI 是架构作者，人是审阅者与小修者
status: accepted
date: 2026-11-05
deciders: [human:team]
supersedes: []
related: [ai-trust-boundary]
---
# ADR-0005：AI 是架构作者，人是审阅者与小修者

- 状态：accepted（2026-11-05）
- 决策人：用户（原话「本来就是 AI 写架构，人小修小改指引开发」）
- supersedes：D-006 中「AI 只能新增批注表达意见」的**架构作者身份**部分（批注保护部分继续有效）
- 关联：[ai-trust-boundary.md](../ai-trust-boundary.md) · [gate-spec-v0.md](gate-spec-v0.md) · D-006/D-055

## 背景

v0（D-006 时代）假设「人是架构作者，AI 只能提意见」，信任边界因此写成「AI 只能加批注」。0.4 引入图上编辑与补丁白名单后，门禁实际已放行 `ai:*` actor 的元素/关系增删（无 actor 检查），文档口径与实现出现漂移。用户裁决：**这不是漏洞，而是产品本意**——AI 写架构，人小修小改指引开发。

## 决策

1. **AI 是架构作者**：`ai:*` actor 允许对 elements/relations 执行 add/remove/replace（补丁通道放行，含关系与元素）；直接编辑 `.cvn.yaml` 同样是合法的 AI 工作方式。
2. **批注保护不变**：AI 可新增批注（`author: ai:*`）；**不得**删除/修改人工批注、流转批注状态、写 `ai_hint`（`gate/remove-actor` / `gate/edit-actor` / `gate/status-actor` / `gate/ai-hint` 保留）——人的批注是「人指引」的锚点，删除即篡改指引历史。
3. **签名与审计是问责机制**：补丁 author 必须与 `--actor` 一致；`.audit/*.jsonl` + git diff 承担「谁改了什么」的追溯。AI 落盘的结构变更**不需要二次人批**，人通过 review diff + `check` 事后把关。
4. **文档口径统一**：凡「AI 只能加批注/不能改元素」的过宽表述按本决策修订；批注保护类表述保留。

## 后果

- 正面：用户核心工作法（AI 写架构 → 人小修）获得工具级支持；文档-实现漂移消除。
- 风险与缓解：注入回路（恶意批注诱导 AI 改架构）——缓解 = 人 review diff + `check` 门禁 + git 历史可回滚；误改——缓解 = `.audit` + base_rev 乐观锁 + 语义 diff（`covenant diff`）。
- 对外 kit：`team-starter` 模板文档随下一个版本携带新口径；转发提示词即时更新。
