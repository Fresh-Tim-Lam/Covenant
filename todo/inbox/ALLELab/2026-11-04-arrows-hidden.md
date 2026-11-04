---
id: IR-20261104-01
team: ALLELab
author: coursepack-architect
date: 2026-11-04 14:10+08:00
project: coursepack-omp-main
kind: bug
severity: medium
status: new
title: DFD/flow 箭头 marker-end 被节点框覆盖，方向不可见
evidence:
  - path: .scratch/covenant-pilot/out/site/views/coursepack-dfd-l1-main.v.main.svg
    lines: "1-2"
  - path: .scratch/covenant-pilot/postprocess-arrows.py
    lines: "1-80"
---

## 原话

> 用户在看板上发现数据流没有箭头——DFD 方向语义不可见，必修。

## 场景

Covenant Kit 0.2.0 `build`/`bundle` 的 DFD 契约：`kind: flow` 关系已经输出 `marker-end="url(#cvn-arrow-*)"`，但 SVG 将 `<g class="edge">` 排在节点 `<g class="node">` 之前，且路径终点正好落在目标节点矩形边界；节点填充覆盖箭头三角形，视觉上看不到方向。

## 期望

DFD/flow 箭头必须渲染在节点上层（或路径终点向节点外收 6–10px），并按关系 `impl_status` 着色；目录/内容顺序链（specify→切分→目录→内容）方向一眼可见。

## 现状证据

- `grep marker-end out/site/views/*.svg`：每条 relation 有 marker-end；
- 视觉截图：箭头端点在目标框内层不可见；
- 临时修复：`.scratch/covenant-pilot/postprocess-arrows.py` 在 build 后为每条 edge 复制可见 `marker-end="none"` 三角，叠加到所有节点之后；L0/L1/L2 分别 10/31/11/17/12/18 条箭头。
- 建议 kit：渲染顺序 arrow overlay 置于 node 之后，或按 `markerUnits=userSpaceOnUse` + endpoint inset；同时保留 impl_status 颜色/虚线。
