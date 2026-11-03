---
id: IR-YYYYMMDD-NN
team: <team-name>
author: <role-or-person>
date: YYYY-MM-DD HH:mm+08:00
project: <subdir-under-team-workspace>
kind: requirement        # requirement | bug | question | idea
severity: medium         # blocker | high | medium | low
status: new              # 团队只写 new
title: 一句话标题
evidence:
  - path: path/to/file
    lines: "12-40"
---

## 原话（逐字）

> 把用户/架构师的原话粘在这里，保留标点与错别字，不要润色。

## 场景

哪个项目/哪张图/哪一步遇到；相关 `.cvn.yaml` 或页面路径。

## 期望

可验收的结果（例如"编辑批注后能一键写回 .cvn.yaml"）。

## 现状证据

- `path:line` 或截图路径；
- 复现命令与输出摘要（不要贴大段日志）。

## 影响面

不做会怎样；是否阻塞试点/交付。
