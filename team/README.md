# team/ — Agent 团队编制与写域

> 与 `docs/conventions/module-ownership.md` 同步维护；机器可读版本见 `owns.yaml`。
> 共享文件（`arch/index.yaml`、根 `package.json`、全局 `docs/`、`covenant.yaml`）**只有 Lead 可写**。

## 成员

| 成员 | 组 | 域 | 包（写域） | 工作区 |
|---|---|---|---|---|
| lead | — | — | 共享文件、发布、验收 | 全仓 |
| core-owner | core-semantics | core | core, profile, validate | 上述 3 包 |
| viz-owner | visualization | viewer | layout, render | 上述 2 包 |
| tools-owner | authoring | authoring | patch, diff, indexer, ai, adr, editor | 上述 6 包 |
| iface-owner | interfaces | interface | cli, mcp | 上述 2 包 |
| arch-guard | governance | architecture | 无（只读） | `docs/audits/` |
| interaction-owner | interaction | interaction | 无（只读） | `docs/audits/` |
| todo-scribe | planning | planning | 无（只读代码） | `todo/` |

## 规则

1. 一个包同一时间只有一个 owner；跨域修改走 Lead 转派。
2. Owner 完成工作后回报：文件/行数、API 变化、测试结果、索引待更新清单。
3. 拆分只改组织、不改行为（黄金 SVG / HTML 输出不变）。
4. `arch/index.yaml` 由 Lead 在合并后统一 `pnpm index --write`。
