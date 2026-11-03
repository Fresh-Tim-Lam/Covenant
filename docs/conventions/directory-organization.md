# 目录组织规范

> **用途**：定义仓库顶层目录职责与临时文件归置规则，使任何文件（含 AI 产物）**无需询问即可唯一落位**。
> **目标读者**：人 + AI Agent（创建/移动文件前必读）。
> **状态**：生效中（核验于 2026-11-03）。
> **关联**：[README.md](README.md)（规范索引）、[docs-management.md](docs-management.md)（docs 组织）、[../prompts/paradigm-spec-v2.md](../prompts/paradigm-spec-v2.md) §2（通用版）。

## 1. 顶层目录职责

| 路径 | 职责 | 可否放临时文件 |
|------|------|:---:|
| `packages/` | pnpm workspace 源码包（core/profile/validate/cli/…）——**本项目不用 `src/`** | ❌ |
| `arch/` | 自举契约（`system.cvn.yaml`）+ FRAS 索引（`index.yaml`） | ❌ |
| `.github/` | CI 流水线（`workflows/verify.yml`） | ❌ |
| `skills/` | 给 Agent 的 Skill 文档（`covenant/SKILL.md`） | ❌ |
| `tests/` | 正式测试（M1 创建） | ❌ |
| `docs/` | 文档中心（调研/设计/参考/规范/范式） | 仅 `docs/tmp/` |
| `schema/` | 机器可校验的 JSON Schema | ❌ |
| `examples/` | 示例 `.cvn` 与可点击原型 | ❌ |
| `scripts/` | **可复用**开发工具（M1 创建） | ❌ |
| `resources/` | 随应用分发的静态资源 | ❌ |
| `artifacts/` | **全仓唯一临时区**（gitignore） | ✅ |
| `logs/` | 调试日志（gitignore） | ✅ |
| `arch/` | Covenant 自己的契约图（M1 自举时创建） | ❌ |
| `packaging/` | 打包发布（M2+） | ❌ |
| 仓库根 | 仅 `AGENT.md` / `README.md` / `LICENSE` / 包清单 / `.gitignore` 等顶层配置 | ❌ |

## 2. 临时文件铁律

符合任一即视为临时文件，**必须**放 `artifacts/`：

- 名字含 `tmp` / `debug` / `diag` / `repro` / `test` / `_` 前缀且非正式产物；
- 一次性调试脚本、截图、诊断输出、实验代码；
- 还在探索期、可能丢弃的验证代码。

**禁止出现**：仓库根、`src/`、`scripts/`、`docs/` 正文、`arch/`、`examples/`。

## 3. 决策流程

```
新建文件？
├─ 临时/一次性/调试        → artifacts/
├─ 正式源码                → packages/<pkg>/src/
├─ 正式测试                → tests/
├─ 可复用工具              → scripts/
├─ JSON Schema             → schema/
├─ 示例图 / 原型           → examples/
├─ 契约图（自己的系统）    → arch/
├─ 规范/设计/参考/范式     → docs/（按子目录职责）
└─ 其他                   → 先问：这个文件属于哪个目录的职责？
```

## 4. 当前已知例外（有意为之，勿"顺手修正"）

| 例外 | 原因 |
|------|------|
| `examples/prototype/` 放 HTML 原型 | 它是"示例级产物"，服务评审；M3 后由真实编辑器取代 |
| `examples/*.cvn` 未改双后缀 | Q10 已定 `.cvn.yaml`，改名待 M1 `git mv` |
| 根目录 `AGENT.md` | 明文允许的顶层文件 |

## 5. 自检

- [ ] 根目录无白名单外文件
- [ ] `artifacts/`、`logs/` 已 gitignore
- [ ] 新增目录有 README，首行即职责
- [ ] 无 `tmp_`/`debug_` 前缀文件落在正式目录
