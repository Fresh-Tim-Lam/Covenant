# ALLELab 试点项目候选

> 用途：确定本试点用哪个子目录的架构作为 Covenant 的输入。
> 维护：Lead（确认后把状态改为 ✅ 并补一行"范围/视图"）。

| 子目录 | 当前状态（2026-11-03 观察） | 适配度 | 备注 |
|---|---|---|---|
| `coursepack-omp-main` | 最近活跃（11-03），有 `docs/architecture/**` 与分区 owner、audits/context-packs 体系 | ★★★ **已确认（2026-11-03 16:47，用户）** | 架构质量组的主战场，天然有 arch-* owner 可写需求 |
| `wanwei-agents` | 10-28 活跃，有 docs/config/packages/research | ★★ | 适合作为第二个试点（跨项目对比） |
| `cua-project` | 有 packages/docs/scripts 与工程硬约束 | ★★ | 工程约束多，适合验证"契约+约束"表达 |
| `dashboard` | 看板/数据层，规模较小 | ★ | 可作为内部工具图样本 |
| `coursepack-omp`（旧） | 被 `-main` 取代的旧目录 | ✕ | 不建议 |

## 需要团队确认

1. 试点主项目 = ✅ `coursepack-omp-main`（用户 2026-11-03 确认）
2. 首批建模范围 = 待团队确认（建议：容器级总览 + 一条关键数据/生成流水线）
3. 是否包含 `docs/architecture/audits/**` 的现有问题作为首批批注？（这些正是 Covenant 批注的天然素材）

确认后在 `2026-11-03-pilot-kickoff.md` 顶部追加一行（append-only）：

```
> 确认：project=... ; scope=... ; date=...
```
