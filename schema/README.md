# schema/ — 机器可校验的格式契约

> **用途**：把 prose 规范压缩成**可被程序（与 AI）直接消费**的 JSON Schema，作为 L1 校验的唯一事实源。
> **目标读者**：实现者（`@covenant/core` 直接引用）、AI Agent（读 schema 即可写出合法文档）。
> **状态**：v0 手写草案，**尚未用真实工具校验过**（本会话无可用 shell）。M1 首日必须用 ajv 跑通并修正。
> **关联文档**：[format-spec-v0.md](../docs/design/format-spec-v0.md)、[profiles-catalog-v0.md](../docs/design/profiles-catalog-v0.md)、[hard-constraints.md](../docs/reference/hard-constraints.md)。

## 文件

| 文件 | 覆盖 | 状态 |
|------|------|------|
| `kernel.schema.json` | Tier-2 文档的 **L1** 结构约束（字段/类型/必填/未知字段/ID 模式） | v0 草案 |
| `profile.schema.json` | Tier-1 剖面定义文件 | M1 生成 |
| `project.schema.json` | `covenant.yaml` 项目清单 | M1 生成 |

## 覆盖边界（重要，防止误用）

| 校验级 | 是否由本目录覆盖 | 说明 |
|--------|:---:|------|
| L0 parse | ❌ | YAML 语法、禁锚点/别名 —— 解析器负责 |
| **L1 schema** | ✅ | 本目录 |
| L2 kernel integrity | ❌ | ID 唯一、引用不悬空、父子无环 —— 需图算法 |
| L3 profile | ❌ | 词表/关系矩阵/必填 —— 由 `profiles-catalog` 数据驱动，代码执行 |
| L4 cross-doc | ❌ | imports 解析、跨文档冲突 |
| L5 code | ❌ | 代码锚点解析 |
| L6 fitness | ❌ | 架构规则 |

> **不要试图用 JSON Schema 表达剖面语义**。`kind` 在 schema 里是普通字符串，合法性由 L3 判定——这是刻意的：剖面可扩展，schema 不应随剖面改动。

## 使用方式（M1 参考）

```ts
import Ajv from 'ajv/dist/2020';
import kernel from '../schema/kernel.schema.json';

const validate = new Ajv({ allErrors: true, strict: false }).compile(kernel);
// YAML → JSON（YAML 1.2 core schema）→ validate
```

校验失败时输出与 L1 一致的 Finding 结构（`code: schema/<keyword>`），并按
`(level, code, element_id, path)` 排序，保持与 L2–L6 相同的稳定性约定。

## 刻意的宽松点（不是遗漏）

| 位置 | 宽松原因 |
|------|----------|
| `element.props` / `relation.props` | 剖面自定义属性，schema 不感知 |
| `constraint.if` / `constraint.then` | 规则参数形态随 type 变化；M5 引入 `expr` 后再收紧 |
| `x-*` 前缀（所有对象） | 扩展命名空间，必须放行 |
| 批注 id 长度 `{12,26}` | 新建须 26 位 ULID；读取兼容手写示例/历史 |

## 变更规则

1. 改 schema 必须同步改 `format-spec-v0.md` 与 `examples/`，三者同一次提交。
2. 破坏性变更 → 升 `covenant:` 小版本（`0.1` → `0.2`）并在 `docs/design/` 写迁移说明。
3. schema 是**契约**，不是实现细节：AI 会直接读它生成文档。
