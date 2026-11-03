---
adr: "0003"
title: 采用索引优先的模块化 Agent 协同开发范式（Index-First Agent Dev）
status: accepted
date: 2026-11-03
deciders: [human:team]
supersedes: []
related: [e.core, e.cli]
---

# 采用索引优先的模块化 Agent 协同开发范式

## 背景

用户提出"从 0 开发的纯 Agent 团队"基础设施设想：代码组织、目录元语料、FRAS 索引、角色分工、阶段化工作流必须是同一套契约；索引不是事后 RAG，而是设计第一约束。Covenant 已有 FRAS 索引、门禁、模块化包、todo-scribe 记录等局部要素，但缺少成文规范与强制执行。

## 决策

1. 将范式写成规范：`docs/conventions/agent-team-development.md`（R1–R5 硬约束、角色、工作流、调参项、反模式）。
2. 立即执行两条可自动化的约束：
   - **R2 目录元语料**：每个 `packages/*` 必须带五段 README（职责/依赖/公共接口/设计取舍/约束），由 `pnpm modules` 校验并纳入 `pnpm verify`；
   - **R3 FRAS 覆盖**：延续 `pnpm index` 的 I1–I3 门禁。
3. 角色与写域隔离写入规范：Lead / 需求解读 / 架构守卫（只读）/ 模块 owner / Indexer / todo-scribe；跨域写需 Lead 批准。
4. 编辑与索引写入均"先 diff 后合入"：`covenant edit --diff/--accept`（human-only、备份、审计）；`index --write` 只更新哈希。

## 后果

- 好：新 Agent 进仓库可先读索引与模块 README，减少盲扫与口头交接；模块边界、文档缺失、索引过期都会变成门禁失败。
- 代价：规范成本；拆分粒度需持续调参；索引成为关键依赖（需快照/回滚）。
- 约束：新增模块不写 README 不能合入；架构守卫 agent 只读、不改业务代码；索引语义由人确认，机器不改语义。

## 备选

- 仅写文档、不设门禁：成本低但会退化为"事后补文档"，否决。
- 直接引入向量检索后端（如 XERJ）：可后续增强，但非范式前提；Covenant 当前以 FRAS 满足高层检索需求。
