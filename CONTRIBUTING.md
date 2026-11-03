# 贡献指南

## 环境

- Node 22+，pnpm 11+。
- 先跑 `pnpm covenant doctor`，全绿（`git` 警告可忽略，直到仓库初始化）。

## 开发流程

```bash
pnpm install
pnpm verify          # 门禁：契约校验 + FRAS 索引 + ADR + 全量测试
pnpm typecheck       # 严格 TypeScript，0 error 才算完成
```

**提交前 `pnpm verify` 必须通过**。本地 CI 等价物，不要依赖"我机器上能跑"。

## 改代码的规矩

### 1. 改完源码必须同步 FRAS 索引

```bash
pnpm index            # 报 stale = 源码变了但条目没确认
# 确认 arch/index.yaml 里的 f/r/a/s 仍准确
pnpm index --write    # 只更新 source_sha256，不替你写语义
```

新增源文件会触发 I1 失败，必须先在 `arch/index.yaml` 补条目。

### 2. 改渲染必须走黄金测试

```bash
pnpm test                                  # 黄金 SVG 逐字节比对
pnpm golden                                # 确认视觉改动后更新基准
```

更新黄金前**先人工看 diff**（转 PNG 或对比 SVG），不要盲覆盖。

### 3. 改契约结构要同步自举文档

- 组件边界/依赖方向变化 → 改 `arch/system.cvn.yaml`；
- 决策变化 → 新增 ADR（`docs/design/adr/NNNN-*.md`）并更新其索引表；
- 新增能力包 → 补 `arch/index.yaml` 条目 + `packages/README.md` 表格。

### 4. 格式/规则变更必须带测试

- 新规则 → 至少一条正例 + 一条反例；
- 新剖面 → 词表/矩阵/规则 + 示例文档 + 黄金图；
- 改 schema → 同步 `docs/design/format-spec-v0.md`。

## 代码风格

- 中文文档、英文代码；注释解释"为什么"，不复述"做了什么"。
- TypeScript 严格模式；不引新依赖除非必要（当前运行时依赖只有 `js-yaml` + `ajv` + 标准库）。
- 确定性优先：同一输入必须产生逐字节一致的输出（布局/渲染/排序）。
- 错误信息必须带 `fix:` 提示（见 `Finding.fixHint`）。

## 契约与标注

- 人：在构建产物 HTML 里标注、写 `ai_hint`、改状态、导出补丁。
- AI：只能 `add /annotations/-`（`author: ai:*`），先过 `patch-check` 再 `apply`。
- 不要手改 `.cvn.yaml` 来"追加批注"——用补丁通道，否则丢失审计与身份校验。

## 提交流程（git 初始化后启用）

1. 从 `main` 切分支；一个 PR 只做一件事；
2. PR 描述写明：改了什么 / 为什么 / 证据（`pnpm verify` 输出、截图、diff）；
3. 破坏性变更（`covenant diff` 报 breaking）必须有 ADR 或维护者批准；
4. 合并前 CI 必须绿。

## 语言与文档

- 文档用中文，标识符/命令/代码用英文；
- 新增设计文档放 `docs/design/`，并在 `docs/README.md` 或相关 README 建索引；
- 不要在文档里写"待办清单"代替实现——待办放 `docs/to-dolist.md`。

## 分发与发布

- 可交付包：pnpm package:kit → dist/covenant-kit-<version>/（单文件 CLI + 查看器 + 模板 + 文档），Compress-Archive 打 zip 并记录 sha256。
- 本地内网 / GitHub 公开两套范式见 [docs/guides/distribution-paradigm.md](docs/guides/distribution-paradigm.md)：本地走 kit + 收件箱直写；公开仓库走 Release 资产 + Issue 模板 + CI。
- 公开前必须：git init（待批准）、选定 LICENSE、确认包名/发布渠道。
