# 门禁规格 v0（Gate Spec）

> **用途**：把 [paradigm-spec-v2 §9](../prompts/paradigm-spec-v2.md) 的自检清单落成**可执行门禁**：每条规则 → 检查实现 → 命令 → 期望退出码。M1 开工即可照此实现 CI。
> **目标读者**：实现者（CLI/CI）、评审者。
> **状态**：v0，核验于 2026-11-03；未实现、未验证。
> **关联**：[paradigm-spec-v2.md](../prompts/paradigm-spec-v2.md)（规则来源）、[format-spec-v0.md](format-spec-v0.md)（finding/退出码）、[hard-constraints.md](../reference/hard-constraints.md)。

---

## 1. 门禁的三个层次

| 层 | 时机 | 跑什么 | 预算 |
|----|------|--------|------|
| **L-PRE** | pre-commit | 只跑改动文件的快速检查（D5、I2 局部、G1） | < 2s |
| **L-CI** | PR / push | 全量 D/I/G/P | < 30s（≤500 文件） |
| **L-NIGHT** | 每日 | 全量 + 代码锚点解析（L5/L6）+ 索引全量重建校验 | 不限 |

---

## 2. 退出码约定（全局统一）

| 码 | 含义 | CI 行为 |
|:--:|------|---------|
| `0` | 无 error（可能有 warning） | 通过 |
| `1` | 存在 error | 失败 |
| `2` | 仅 warning 且 `--strict-warnings` | 失败（可配置） |
| `3` | 工具/IO 失败（文件不可读、schema 缺失） | **失败，且不得重试掩盖** |
| `4` | **门禁自身异常**：扫描 0 个文件、配置缺失、白名单为空 | 失败（防假通过，见 §6） |

> 关键：`3` 与 `4` 必须与"真的没问题"区分开。CI 只认 `0` 为通过。

---

## 3. 检查项总表

> `判定`：`CI` = 自动；`Review` = 人工；`Self` = 自查。只有 CI 项进门禁。

### 3.1 目录契约

| ID | 检查 | 实现 | 命令 | 期望 |
|:--:|------|------|------|------|
| D1 | 一级目录有 README 且前 5 行含"职责" | 目录遍历 + 正则 `职责` | `covenant gate dirs` | 0；缺失列出路径，1 |
| D2 | 根目录文件在白名单内 | 遍历根目录（非递归）比对白名单 | 同上 | 0；越权文件列出，1 |
| D3 | `artifacts/`、`logs/` 被忽略 | `git check-ignore -q artifacts/.keep logs/.keep` | `covenant gate ignore` | 0；否则 4（配置缺失） |
| D4 | `src/` 下模块目录 README 含职责/边界/依赖 | 正则三关键词同时命中 | `covenant gate modules` | 0；缺项列模块，1 |
| D5 | `src/` 无 `tmp_/debug_/repro_` 前缀文件 | 文件名前缀匹配 | `covenant gate dirs` | 0；列出文件，1 |
| D6 | 目录增删已同步父索引 | ❌ 不可靠自动判定 | — | **Review** |

### 3.2 索引契约

| ID | 检查 | 实现 | 命令 | 期望 |
|:--:|------|------|------|------|
| I1 | 每个 `src/` 文件有 FRAS 条目 | 集合差（walk `src/` − index keys） | `covenant index --check` | 0；缺条目列文件，1 |
| I2 | 无 stale / orphan | `source_sha256` 对比 + 条目 key 存在性 | 同上 | 0；列 stale/orphan，1 |
| I3 | `f` 非空、≥8 字符、不含"详见" | 正则 + 长度 | 同上 | 0；列条目，1 |
| I4 | 索引被非 Indexer 手改 | ❌ 无法可靠判定 | — | **Review**（或 git blame 提示，不作门禁） |

### 3.3 图示契约

| ID | 检查 | 实现 | 命令 | 期望 |
|:--:|------|------|------|------|
| G1 | L0–L4 全绿 | `covenant check`（解析+schema+完整性+剖面+跨文档） | `covenant check arch/` | 0；否则列 finding，1 |
| G2 | 元素有 `summary`；文档有 `purpose`/`non_goals` | 已在 schema 必填 → L1 覆盖 | `covenant check` | 0 |
| G3 | 关系符合剖面矩阵 | L3 | `covenant check` | 0 |
| G4 | `ai_hint` 句式合规 | 规则库：白名单词首 + 模糊词黑名单 + 长度 | `covenant gate hints` | 0；列批注，1 |
| G5 | `fix_hint` 含具体 id/路径 | 正则 `[erfvk]\.[a-z]` 或 `/` | `covenant validate --findings` | 0 |
| G6 | 人工批注未被 AI 修改 | 对比 rev 间 `author:human:*` 的字段 hash | `covenant gate annotations` | 0；否则 1（P0） |
| G7 | 元素至少一条 code/ADR 链接 | 遍历 elements | `covenant gate links` | 0；warning（`--strict` 时 2） |
| G8 | 单视图 ≤200 元素 | 计数 | `covenant check` | 0；warning |

**G4 的实现细节（最容易做假）**：

```
allowed_start = ^(优先|禁止|必须)?\s*(改|把|将|新增|删除|拆分|合并|保持|确保|避免|使用|引入|移除|补|加)
vague_words   = 尽量|考虑|适当|优化一下|看看|大概|可能|差不多
max_len       = 2048（工具）/ 建议 200（规范）
```
> `ai_hint` 缺失**不算违规**（不是所有批注都需要指令）；存在但不合规才报。

### 3.4 补丁契约

| ID | 检查 | 实现 | 命令 | 期望 |
|:--:|------|------|------|------|
| P1 | 补丁含 `base_rev` 与 `intent` | 补丁 schema 必填 | `covenant patch` | 缺则拒绝，1 |
| P2 | `breaking` 有 `approved_by` | diff 分类 + 审计字段 | 同上 | 缺则拒绝，1 |
| P3 | 未修改人工批注/owners | 补丁路径白名单 | 同上 | 命中则拒绝，1（P0） |
| P4 | 审计字段齐全 | 审计记录 schema | `covenant gate audit` | 0；缺字段 1 |

---

### 3.5 规则覆盖对账（28 条 → 门禁）

> 防止"规范写了 28 条、门禁只覆盖 20 条"的静默缺口。

| 规范规则 | 对应门禁 | 说明 |
|----------|----------|------|
| D1–D5 | §3.1 | D6 归 Review |
| I1–I3 | §3.2 | I4 归 Review |
| G1–G3、G5、G7–G8 | §3.3 | G2 由 schema 必填覆盖 |
| **H1–H4** | **G4** | 句首用词 / 长度 / 模糊词由 G4 规则库实现 |
| **H5** | P2 + Review | 只可判定"是否声明需批准"，实质风险归人 |
| **H6** | G6 + P3 | 人工批注不可改 |
| P1–P4 | §3.4 | — |

**合计**：**25 条自动可判定 + 3 条人工/部分**（D6、I4、H5）。

---

## 4. 不可自动判定项（明确归人，不假装能查）

| 项 | 为何不可靠 | 归口 |
|----|-----------|------|
| D6 索引同步 | 需理解"是否该同步" | PR Review |
| I4 手改索引 | git blame 有噪声 | Review |
| 图是否"表达清楚" | 语义质量 | 季度评审 |
| `ai_hint` 是否"真的可执行" | 句式合规 ≠ 语义可执行 | Review 抽查 |
| 架构是否合理 | fitness 只能查规则，查不了设计 | 架构评审 |

> 把这些放进自动门禁的后果：**假通过**（形式上过了，实质没检查）。这比不检查更危险。

---

## 5. 豁免机制（必须可审计）

不允许用行内注释静默关闭检查。唯一方式是 `arch/waivers.yaml`：

```yaml
waivers:
  - rule: I1
    path: src/legacy/**
    reason: 遗留模块，迁移中
    owner: human:lily
    expires: 2026-12-31      # 必填，过期即失效
```

门禁行为：
- 命中豁免的 finding 降级为 info，不阻断；
- 豁免过期 → 重新变为 error（**到期自动复活**，不靠人记得）；
- 无 owner 或无 expires → `exit 4`（配置错误）。

---

## 6. 防假通过（门禁自身的验证）——本节最重要

门禁最常见的失效不是"报错太多"，而是**静默地什么都没检查**。必须自带以下断言：

| # | 断言 | 检查方式 | 失败表现 |
|:-:|------|----------|----------|
| A1 | 扫描文件数 > 0 | 每次运行输出 `scanned: N`；N=0 → exit 4 | CI 路径配错时不会假绿 |
| A2 | 每个 gate 有**反例 fixture** | `tests/gates/<id>/bad/` 必须让该 gate 变红 | 门禁实现写错时测试先红 |
| A3 | 每个 gate 有**正例 fixture** | `tests/gates/<id>/good/` 必须绿 | 防止门禁永远报错 |
| A4 | **变异测试**：人为把某个合法文件改坏，确认 CI 必红 | 每周一次或 gate 变更时 | 门禁形同虚设 |
| A5 | 白名单/规则表非空 | 与 A1 同理 | 空配置不通过 |
| A6 | gate 输出版本号与规则表 hash | 输出头 `gate: v0 rules:sha256:...` | 规则悄悄变化可追溯 |

> **验收口径**：门禁上线前，A1–A3 必须全过；A4 每季度至少一次。

---

## 7. 输出格式（与 finding 统一）

```
$ covenant gate dirs
gate: dirs v0 rules:sha256:ab12…
scanned: 42 dirs, 18 root files
ERROR D1 src/unknown-dir/README.md — 前 5 行缺少"职责"
ERROR D2 ./scratch.ipynb — 根目录越权文件（应在 artifacts/）
warn  D5 src/tmp_probe.ts — 临时文件前缀
result: 2 errors, 1 warning
exit 1
```

规则：先 ERROR 后 warn；同组内按路径排序（**输出必须确定**，便于 diff 与缓存）。

---

## 8. 落地顺序（M1 内）

| 序 | 门禁 | 依赖 | 说明 |
|:--:|------|------|------|
| 1 | D1–D5 | 目录遍历 | 纯文件系统，最便宜 |
| 2 | G1（L0–L4） | `covenant check` | 核心价值 |
| 3 | I1–I3 | 索引生成器 | 需先有 FRAS 生成 |
| 4 | G4/G5/G6/G7/G8 | check 扩展 | 规则库 |
| 5 | P1–P4 | 补丁通道（M4） | 最后接 |

---

## 9. 待验证

- 全部命令名与参数是**设计值**，尚未由实现确认（本会话无 shell）。
- 性能预算（L-CI < 30s @500 文件）未实测。
- D1 的"前 5 行含职责"是启发式，误报率未知；M1 用真实仓库校准。
- A4 变异测试需要 CI 支持"故意失败再恢复"，实现复杂度待评估。
