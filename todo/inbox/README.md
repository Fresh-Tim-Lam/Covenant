# todo/inbox/ — 外部团队需求收件箱（只追加）

> 用途：让**使用 Covenant 的项目团队**（首个试点：`D:\AAA_Work\ALLELab`）提交需求/问题/改进建议，而不直接改 `requests.md`。
> 维护者：**todo-scribe** 负责归并；**Lead** 负责分诊与排期；外部团队只写本目录下**自己的文件**。
> 原则：原话不加工、一团队一入口、append-only、证据带路径。

## 1. 目录约定

```
todo/inbox/
  README.md              # 本文件（规则）
  _TEMPLATE.md           # 复制到 <团队>/ 下使用
  <team>/                # 团队名（小写-连字符，如 ALLELab）
    README.md            # 该团队的试点说明（Lead 维护）
    PROJECTS.md          # 试点项目候选/确认（Lead 维护）
    YYYY-MM-DD-<role>-<slug>.md   # 需求文件（团队只追加新文件）
```

**不要**：
- 不要编辑别人的文件、不要改 `todo/requests.md`、`plan.md`、`decisions.md`；
- 不要在 inbox 里写“方案/设计文档”（设计由 Covenant 侧产出，inbox 只收需求与问题证据）；
- 不要复制整段代码/日志（用 `path:line` 引用）。

## 2. 需求文件模板（复制 `_TEMPLATE.md`）

每条需求必备字段：

```yaml
id: IR-20261103-01          # 团队内自增，Lead 归并后映射为 R-xxx
team: ALLELab
author: <角色名 / 人名>       # 建议用 ALLELab 的 role id
date: 2026-11-03 16:30+08:00
project: coursepack-omp-main # ALLELab 下的子目录名
kind: requirement            # requirement | bug | question | idea
severity: medium             # blocker | high | medium | low
status: new                  # new（团队只写 new，后续状态由 Lead/todo-scribe 改）
title: 一句话标题
evidence:
  - path: relative/or/absolute/path
    lines: "12-40"           # 可选
```

正文结构（必须）：

1. **原话**（逐字，不改标点）；
2. **场景**（哪个业务/哪张图/哪一步）；
3. **期望**（可验收的结果）；
4. **现状证据**（`path:line`、截图路径、命令输出摘要）；
5. **影响面**（若不做会怎样）。

## 3. 状态机（Lead/todo-scribe 维护）

`new → triaged（accepted / deferred / wontfix / duplicate）→ planned（T-xxx）→ done / rejected`

- 团队只写 `status: new`；后续由 todo-scribe 归并时更新并注明 R/T 编号；
- `duplicate` 必须指向已有 R-xxx；
- `wontfix` 必须写理由（避免"已读不回"）。

## 4. 归并节奏

- 每周一次（或累计 ≥5 条时）todo-scribe 把 inbox 新文件归并进 `requests.md`（保留原话、编号 R-xxx），并在 `plan.md` 建 T-xxx；
- Lead 分诊：优先级、依赖、是否进入当前里程碑；
- 归并后 inbox 文件**不删除**，在文件顶部加 `> 已归并：R-xxx / T-xxx（日期）`。

## 5. 与 ALLELab 现有流程的桥接

- ALLELab 的组织事实源是 `agents/org.json`、看板是 `dashboard/data/tasks.json`、交接在 `docs/team-handoff/`；
- 本 inbox **不替代**它们：需求在 Covenant 侧排期后，ALLELab 团队可继续用其 dashboard 跟踪自己的执行；
- 需要双向引用时：inbox 文件里写 `ALLELab-ref: <tasks.json id / org role>`。
