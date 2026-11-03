# examples/ — 示例契约图

> **用途**：`.cvn` 格式的手写示例，用于评审格式设计；M1 后转为渲染黄金测试的候选基准。
> **注意**：这些文件**尚未被任何实现解析/校验过**（本会话无可用 shell），字段以 [format-spec-v0.md](../docs/design/format-spec-v0.md) 与 [profiles-catalog-v0.md](../docs/design/profiles-catalog-v0.md) 为准；实现落地时会修正不一致处。
> **关联文档**：[format-spec-v0.md](../docs/design/format-spec-v0.md)、[profiles-catalog-v0.md](../docs/design/profiles-catalog-v0.md)。

## 文件清单

| 文件 | 剖面 | 演示点 |
|------|------|--------|
| `payments-arch.cvn.yaml` | `c4-container@1` | 元素定义/视图分离、关系矩阵、元素级约束、**架构问题批注**、文档级 fitness 规则 |
| `order-dfd.cvn.yaml` | `dfd@1` | 记法变体消歧义（demarco）、信任边界 frame、数据存储可达性规则 |
| `covenant-self.cvn.yaml` | `c4-container@1` | **自举**：用 Covenant 描述 Covenant 自身；把自举发现的 6 个真实缺口记成批注 |
| `prototype/arch-prototype.html` | — | **可点击原型**：零依赖单文件，点框/线钉批注、看 AI digest、导出补丁 |
| `topology-junction.cvn.yaml` | `graph@1` | **接线点拓扑**：`present.node_style: junction`（节点=点，不是框）、点间直线、交叉处跳线弧、边标签胶囊 |
| `covenant.yaml` | — | 项目清单：多文档 + 共享定义 + ADR 目录 |

**约定**：`id` 带语义前缀（`e.` 元素 / `r.` 关系 / `a.` 批注 / `k.` 规则 / `v.` 视图 / `f.` frame）。工具不应假设前缀与类型强绑定，但推荐保持一致。

---

## 自举发现的缺口（`covenant-self.cvn.yaml` 的 6 条批注）

> 这是"用自己测自己"的产物：格式是否够用，不看文档写得多漂亮，看它能不能描述自己的架构并暴露问题。

| 批注 | 类型/严重度 | 缺口 | 处理时机 |
|------|-------------|------|----------|
| `a.01JAY0S3KV01` | risk / high | **ELK 打包体积可能 >500KB**，击穿"单文件 HTML"预算 | M1 实测，优先"构建期算好布局、HTML 只带坐标" |
| `a.01JAY0S3KV02` | smell / medium | **region 批注按坐标锚定，重布局后语义漂移** | M2 前决定是否改为"元素集合 + 矩形提示" |
| `a.01JAY0S3KV03` | question / medium | **YAML Norway 问题**（`no`→false） | M1 定：YAML 1.2 core + fmt 加引号 |
| `a.01JAY0S3KV04` | todo / high → **已关闭** | 规则必须带 `fix_hint` 模板，否则 AI 闭环退化 | 已补：[profiles-catalog §12.1](../docs/design/profiles-catalog-v0.md)（12 个类型） |
| `a.01JAY0S3KV05` | risk / blocker | **原子替换与审计非同一事务**，崩溃点可追溯性断裂 | M1 采用 write-ahead 审计 |
| `a.01JAY0S3KV06` | decision / low | 默认不联网是产品承诺 | 长期 |

**结论**：格式表达力足够（元素/关系/批注/约束/视图都能承载），但暴露了 **2 个必须在 M1 解决的技术风险**（01、05）和 **1 个 M2 前必须回改的语义设计**（02）。这正是自举的价值。
