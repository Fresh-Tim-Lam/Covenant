# 试点启动：ALLELab × Covenant（2026-11-03）

> 这是 **Lead 发起的第一份收件文件**。团队直接在 `todo/inbox/ALLELab/` 下**新增**回答文件（不要改本文件），命名 `YYYY-MM-DD-<role>-<slug>.md`，从 `_TEMPLATE.md` 复制。
> 本文件顶部的确认行由 Lead 在团队回复后补写（append-only）。

> 确认：project=coursepack-omp-main（用户 2026-11-03 16:47 确认）; scope=待团队确认（建议：容器总览 + 生成流水线）; 作者/落盘方式=待团队回复

## 一、需要团队回答的问题（各写一个文件即可）

1. **试点项目**：确认 `coursepack-omp-main` 还是别的子目录？范围是哪 1–2 张图？
2. **需求作者**：哪 2–3 个角色（`coursepack-architect` / `arch-*-owner` / `arch-evidence-verifier`）负责往 inbox 写？
3. **首批原型输入**：能否把 `coursepack-omp-main/docs/architecture/**` 与 `audits/**` 里现成的架构事实，转成 1 份 `.cvn.yaml`（元素/关系/批注）作为试点种子？
4. **验收标准**：团队希望 Covenant 先满足哪 3 件事？（例如：图上批注能写回、导出可交付 HTML、CI 能校验架构契约不漂移）
5. **交付形态**：单文件 `covenant.html` 够用，还是需要 `dist/site/` 文件夹版（一整套图）？
6. **落盘权限**：团队能否直接写 `D:\AAA_Project\Covenant\todo\inbox\ALLELab\`？不行的话走 `docs/team-handoff/covenant-requirements/`。

## 二、Lead 侧已准备（供参考，不需要团队做）

- 查看器：`dist/covenant.html`（悬浮窗/批注编辑/删除撤销/缩放拖拽）、`dist/site/`（整套图文件夹版）；
- 编辑与写回：`pnpm edit:serve`（批注一键写回 `.cvn.yaml`，带 `.audit` 备份）；
- 契约格式：`.cvn.yaml`（schema 校验）、批注/patch 门禁、FRAS 索引、bundle；
- 需求收件箱：`todo/inbox/` 规范（见上级 README）。

## 三、团队提交后的流程

`inbox 新文件` → todo-scribe 每周归并 → Covenant `requests.md` R-xxx / `plan.md` T-xxx → Lead 分诊排期 → 完成后在 inbox 文件顶加 `> 已归并/已实现` 注释。

## 四、首个建议需求（团队可改写/否决）

> 把 `coursepack-omp-main` 的架构事实落成 `.cvn.yaml`（容器级 + 一条流水线），用 Covenant 批注记录 `audits/**` 里已知问题，并验证批注能经 `edit:serve` 一键写回、CI 可校验。
