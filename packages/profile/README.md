# @covenant/profile

## 职责
10 个图种剖面（c4/dfd/er/flowchart/deployment/graph/sequence/state）的词表、关系矩阵与专有规则。

## 依赖
- 内部：`@covenant/core`
- 被依赖：`@covenant/validate`

## 公共接口
- `PROFILES` / 剖面注册表、`findCycle`、剖面规则类型 `ProfileRule`

## 设计取舍
- 一剖面一模块化定义，规则写成纯函数，便于单测与复用。
- 规则只返回 finding，不修改文档；严重度/修复建议由规则给出。

## 约束
- 新增剖面必须同时补：示例文档、黄金图（或渲染测试）、FRAS 条目。
- 不得在剖面里写文档级 I/O。