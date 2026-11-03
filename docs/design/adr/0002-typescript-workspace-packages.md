---
adr: "0002"
title: 全栈 TypeScript，按 pnpm workspace 拆分能力包
status: accepted
date: 2026-11-03
deciders: [human:team]
supersedes: []
related: [e.cli, e.core]
---

# 全栈 TypeScript，按 workspace 拆包

## 背景

格式解析、校验、布局、渲染、补丁、索引、AI 与 MCP 能力需要被 CLI、测试与外部 Agent 同时复用；同时希望"单个能力可被替换或单独引用"。

## 决策

- 语言：全栈 TypeScript（Node 22+，严格模式）。
- 结构：pnpm workspace，一能力一包（core / profile / validate / layout / render / patch / diff / indexer / ai / adr / mcp / cli）。
- 包之间只通过公开导出与类型依赖，禁止跨包读内部文件。
- 门禁：`pnpm verify` = 契约校验 + FRAS 索引 + ADR + 全量测试。

## 后果

- 好：能力边界清晰；测试可按包组织；MCP/未来 `ai` 服务可直接复用包。
- 坏：包数量多，依赖图需要维护（由 `graph@1` 示例与 FRAS 索引共同约束）。
- 约束：新增包必须同时补 `arch/index.yaml` 条目，否则索引门禁失败。

## 备选

- 单包多目录：早期更快，但边界容易腐化，且不利于外部按需引用。
