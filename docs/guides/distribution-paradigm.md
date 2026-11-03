# 分发范式：本地可信交付 vs GitHub 公开分发

> 结论先说：**同一个产品，两套入口**。本地是"包 + 服务 + 直写收件箱"的**可信内网模式**；GitHub 是"不可变 Release 资产 + Issue/PR + CI 门禁"的**公开协作模式**。两者共享同一套 `.cvn.yaml` 格式与 CLI，但**信任模型、反馈通道、版本节奏不同**。

## 1. 两种模式对比

| 维度 | 本地模式（当前） | GitHub 公开模式（待发布） |
|---|---|---|
| 交付物 | `dist/covenant-kit-<ver>/` + `.zip` + `.sha256` | **GitHub Release** 附件：同一 zip + sha256 + CHANGELOG；未来可 `npm i -D @covenant/cli` |
| 使用方式 | 内网磁盘目录，`node bin/covenant.mjs` | 下载 release / `npx`（若发布 npm） |
| 服务 | `serve --edit` loopback 可运行，AI agent 可直接用 | 不假设有本地服务；查看器仍是**离线单文件**，编辑服务为可选本地功能 |
| 需求入口 | `todo/inbox/<team>/` 直接 append-only 写文件 | **GitHub Issues**（模板化）+ PR；不开放仓库文件直写 |
| 信任边界 | 团队/agent 可信；human-only 门禁靠工具校验 | 外部不可信：Issue 只收需求；代码改动走 PR + CI + 维护者评审 |
| 版本 | 目录名带版本即可，无冻结要求 | **语义化版本 + tag + 不可变资产**；`.cvn.yaml` schema 版本单独演进 |
| CI | 本地 `pnpm verify` | GitHub Actions：typecheck + `pnpm verify` + 黄金测试 + 构建 kit |
| 反馈节奏 | 每周/≥5 条归并进 `requests.md` | Issue 标签分诊（`needs-triage`/`accepted`/`wontfix`），不承诺私货 |
| 安全模型 | 契约/批注/AI 边界 | 同上 + **供应链**：release sha256、SBOM、无网络依赖、`SECURITY.md` 漏洞上报 |

## 2. 共享不变量（两套模式都必须成立）

1. `.cvn.yaml` 是唯一事实源；HTML/SVG/kit 都是派生产物；
2. 默认离线：查看器零外部请求；只有显式 `serve --ai` 才外发；
3. AI 只追加批注（`ai:*`），不得改人类字段/状态/`ai_hint`；
4. 落盘走 gate + `.audit`（write-ahead），失败不写字节；
5. 兼容性承诺：`.cvn.yaml` 的 `covenant: "0.1"` 与 `schema/` 版本独立于 kit 版本；破坏性变更必须走新 schema 版本 + 迁移说明。

## 3. 本地模式（已可用）

```
dist/covenant-kit-0.1.0/        # 可移植包（无需 pnpm install）
  bin/covenant.mjs              # 单文件 CLI
  bin/covenant.cmd              # Windows 包装
  viewer/covenant.html          # 预构建查看器（双击）
  templates/team-starter/       # 起始契约模板
  examples/、docs/、schema/     # 示例 / 规范 / 解析锚点
  inbox-template/               # 反馈模板
```

- 需求：团队直接写 `D:\AAA_Project\Covenant\todo\inbox\<team>\*.md`（append-only）；
- 服务：`node bin/covenant.mjs serve out --edit --open`，批注可一键写回；
- agent 团队可直接取包、起服务、投需求，无网络与发布流程负担。

## 4. GitHub 模式（待发布前完成）

发布前需要你拍板/准备：

1. **`git init` 批准**（当前未初始化；Q3 待批）；
2. **许可证**（仓库目前无 LICENSE，必须选定后才能公开）；
3. **包名/scope**（根 `package.json` 目前 `private: true`；要么只发 Release zip，要么发 `@scope/covenant-cli`）；
4. **发布工作流**：tag `vX.Y.Z` → CI 构建 kit → 生成 sha256 → 上传 Release；
5. **反馈迁移**：本地 `todo/inbox` 保留为内网通道；公开仓库改用 GitHub Issues（模板已加）；
6. **安全**：`SECURITY.md` 补充私密漏洞上报；依赖审计（当前依赖极少，yaml/tsx/vitest 等）。

## 5. 发布检查清单（v0.1.0 首发）

- [ ] `git init` + 首次提交（需用户批准）
- [ ] LICENSE 选定
- [ ] `pnpm verify` 全绿（268 tests）
- [ ] `node scripts/build-kit.mjs` 成功；zip + sha256 记录进 Release notes
- [ ] GitHub Actions `verify` 在 PR 上跑通
- [ ] README/QUICKSTART 指向 Release 下载与 `npx`（若发布）
- [ ] Issue 模板可用（requirement/bug）
- [ ] 首个 Release 附 `covenant-kit-0.1.0.zip`、`*.sha256`、CHANGELOG 摘要
