# Covenant 使用指南（给外部团队的 Prompt）

> 复制下面整段发给目标团队的 Lead 或成员即可。不需要任何 Covenant 开发背景。

---

## 你收到了什么

一个可移植工具包 `covenant-kit-0.1.0.zip`，用来**把你的项目架构画成可交互的契约图**：

- `.cvn.yaml` = 架构的唯一事实源（声明元素、关系、视图、批注）
- 渲染出的 HTML = 离线可交互看板（缩放/拖拽/点选/悬浮窗/批注编辑/多窗/彩色引导线）
- 不需要 pnpm / 不需要网络 / 只需要 Node ≥ 20

## 5 分钟上手

```bash
# 1. 解压 covenant-kit-0.1.0.zip，进入目录
cd covenant-kit-0.1.0

# 2. 校验自带模板（确认工具能跑）
node bin/covenant.mjs check templates/team-starter

# 3. 复制模板到你的项目
cp -r templates/team-starter <你的架构目录>

# 4. 编辑 <你的架构目录>/arch/system.cvn.yaml：
#    - 改 id、title、purpose
#    - 把 elements/relations 换成你项目的真实架构
#    - 加 annotations 记录已知风险/问题

# 5. 校验 + 构建看板
node bin/covenant.mjs check <你的架构目录>
node bin/covenant.mjs build <你的架构目录> -o out/covenant.html

# 6. 打开 out/covenant.html（双击即可，离线可用）
#    - 点元素/边 → 悬浮窗（可拖/可钉/可多窗/彩色引导线）
#    - 编辑批注 → 保存/←返回/删除/撤销
#    - 左侧侧栏按分组切换图

# 7. 如果想在线编辑并写回 .cvn.yaml：
node bin/covenant.mjs serve out --edit --open
#    页面上点元素 → 批注 → 写回批注（自动备份 .audit/）

# 8. 如果想输出一整套文件夹站点（多图）：
node bin/covenant.mjs bundle <你的架构目录> -o out/site
```

## 写架构的核心概念

```yaml
# arch/system.cvn.yaml
covenant: "0.1"
id: <团队>/<项目名>
profile: c4-container@1     # 剖面（决定元素类型和校验规则）

meta:
  title: 你的架构图标题
  purpose: 为什么画这张图
  non_goals: [不画什么]
  owners: [human:你的名字]
  status: draft
  rev: 1

elements:                    # 框（人/系统/容器/存储/外部）
  - id: e.gateway
    kind: container          # person | container | datastore | external-system
    name: 支付网关
    summary: 鉴权、限流、路由
    tech: Ktor

relations:                   # 线（调用/读写/…）
  - id: r.user-gateway
    kind: calls
    from: e.user
    to: e.gateway
    summary: 发起支付

annotations:                 # 批注（问题/风险/决策）
  - id: a.01JAY000000000000000000000
    target: { kind: element, id: e.gateway }
    type: risk
    severity: high
    title: 限流用内存计数器，重启丢失
    body: 证据和影响面写这里
    status: open
    author: human:你的名字
    created: 2026-11-03T00:00:00+08:00

views:
  - id: v.main
    title: 系统总览
    layout: { direction: RIGHT }
```

## 规则

1. `.cvn.yaml` 是唯一事实源——HTML/SVG 都是构建产物，不要手改；
2. **AI 只能加批注**（`author: ai:xxx`），不能改元素/关系/状态——门禁会拒绝；
3. 改架构（增删元素/关系）直接编辑 `.cvn.yaml`，重新 `build`；
4. 改批注在页面上操作（写回或导出补丁），不要手改 YAML 里的批注；
5. 每次提交代码前跑 `node bin/covenant.mjs check <你的架构目录>` 确认 0 error。

## 反馈

遇到 bug / 缺功能 / 有建议：
1. 填写 `inbox-template/_TEMPLATE.md`（复制一份，按字段填）；
2. 交给 Covenant 团队（或发到 GitHub Issues）。

## 完整命令参考

| 命令 | 用途 |
|---|---|
| `check <dir>` | 校验契约（schema + 剖面 + 引用/ID） |
| `render <file> -o out.svg` | 渲染单张 SVG |
| `build <dir> -o out.html` | 构建自包含 HTML 看板 |
| `bundle <dir> -o outdir` | 构建文件夹站点（index.html + views/*.svg + manifest） |
| `serve out --edit --open` | 本地编辑服务（批注写回，loopback + token） |
| `diff a.cvn.yaml b.cvn.yaml` | 对比两版契约 |
| `doctor` | 诊断仓库整体健康 |
