---
adr: "0004"
title: 编辑态改为方案 B：短时本地编辑服务（导出 JSON 继续保留为降级通道）
status: accepted
date: 2026-11-03
deciders: [human:team]
supersedes: []
related: [e.cli, e.render]
---

# 编辑态改为方案 B：短时本地编辑服务

## 背景

早期决策 Q9 是"浏览器不直写、只导出补丁"，因此编辑只能"导出 edits.json → CLI 应用"（方案 A）。用户实际使用后明确：需要**编辑态短时本地服务**（方案 B），并准备好一键启动脚本与"在其他 agent 团队把控的项目里部署"的系统化指引；File System Access API（方案 C）后续再加。

## 决策

1. `covenant serve <dir> --edit [--open]` 开启短时编辑态（默认只读，行为不变）。
2. 安全边界：
   - 仅绑定 `127.0.0.1`；启动时生成随机 token 注入页面，`POST /api/edit` 必须带 `x-covenant-token`；
   - 编辑语义 **human-only**（`ai:*` 请求返回 422）；
   - 写回前跑 `checkDocument`，0 error 才落盘；写回自动备份 `.audit/<doc>.<ts>.bak` + 审计 jsonl；
   - 短时：`Ctrl+C` 即关闭；不提供后台常驻。
3. 交互：页面「编辑」→ 改文本/坐标 →「暂存修改」→「预览并写回」→ 显示统一 diff →「确认写回」。
4. 降级：无服务（直接双击 HTML）时保留「导出编辑 JSON」+ `covenant edit`（方案 A），保证离线可用。
5. diff 口径：默认**文本统一 diff**（内置 LCS，无 git 也能用）；`git init` 后可直接叠加 `git diff`；回写目标是 `.cvn.yaml`（不是只出 `.patch.json`）。
6. 一键入口：`pnpm edit:serve`（= `serve dist --edit --open`）。

## 后果

- 好：人类可在真实浏览器里即时编辑并看到 diff；写回有备份与审计；AI 仍无法改语义。
- 代价：增加一个本地 HTTP 服务面（仅 loopback + token + 短时）；页面依赖服务时才出现"写回"按钮。
- 约束：编辑边界 v0 仍为"位置 + 标签/说明"；增删元素/关系后续再做；**方案 C（File System Access API）暂不实现**。
- 对 Q9 的修订：Q9 原意"不把浏览器直写当作唯一通道"仍成立——服务化写回走同一条 `performEdit` 门禁，不是绕过门禁的直写。
