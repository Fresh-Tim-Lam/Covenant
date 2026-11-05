#!/usr/bin/env node
/**
 * team_audit — Covenant 派发不变量审计（AGENTS.md §6）
 *
 * 用法：node scripts/agent/team_audit.mjs [--json] [--since <N>]
 *   --json        机器可读输出
 *   --since <N>   只检查最近 N 个提交的 Decision: 行（默认 30）
 *
 * 退出码：0 = 无 FAIL（WARN 允许）；1 = 有 FAIL；2 = 审计自身异常
 *
 * 设计原则（AGENTS.md L6）：审计的意义不是绿灯，是让失败可见。
 * 存量债务如实报出，不回填、不豁免、不为绿灯伪造数据。
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");
const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const sinceIdx = argv.indexOf("--since");
const since = sinceIdx >= 0 ? Number(argv[sinceIdx + 1] ?? 30) : 30;
const logIdx = argv.indexOf("--log");
const LOG_PATH = logIdx >= 0 && argv[logIdx + 1] ? argv[logIdx + 1] : "team/dispatch-log.jsonl";

const results = [];
function record(id, name, invariant, status, detail) {
  results.push({ id, name, invariant, status, detail });
}

function readText(rel) {
  // 注意：绝对路径必须原样使用——join(ROOT, "C:\...") 会拼成损坏路径
  const p = isAbsolute(rel) ? rel : join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, "utf8") : null;
}

function readJsonl(rel) {
  const text = readText(rel);
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch {
        return { __parseError: `line ${i + 1}` };
      }
    });
}

function git(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

// ---------- 载入数据 ----------
const log = readJsonl(LOG_PATH);
const parseErrors = log.filter((e) => e.__parseError);
const spawns = log.filter((e) => e.phase === "spawn");
const dones = log.filter((e) => e.phase === "done");

// ---------- 基线：区分存量债务与新违规 ----------
// 设计（AGENTS.md §3.1）：字段契约自基线时间起生效；此前的记录是存量债务，
// 不追溯、不回填、不豁免——但也不应让新违规被历史噪音淹没。
const BASELINE_PATH = "team/audit-baseline.json";
let baseline = { cutoff_ts: null, legacy: {} };
{
  const bt = readText(BASELINE_PATH);
  if (bt) {
    try {
      baseline = JSON.parse(bt);
    } catch {
      /* 基线文件损坏按"无基线"处理，全部记录视为新违规（更严格） */
    }
  }
}
const cutoff = baseline.cutoff_ts ? new Date(baseline.cutoff_ts) : null;
const isLegacy = (e) => (cutoff ? new Date(e.ts) < cutoff : false);
const newSpawns = spawns.filter((e) => !isLegacy(e));
const legacySpawns = spawns.filter(isLegacy);
const newDones = dones.filter((e) => !isLegacy(e));
const legacyDones = dones.filter(isLegacy);

/** 统一判定：新违规 → FAIL；仅存量 → WARN；无 → PASS */
function judge(code, name, invariant, newItems, legacyItems, detailFn) {
  if (newItems.length > 0) {
    record(code, name, invariant, "FAIL", detailFn("fail", newItems, legacyItems));
  } else if (legacyItems.length > 0) {
    record(code, name, invariant, "WARN", detailFn("legacy", newItems, legacyItems));
  } else {
    record(code, name, invariant, "PASS", detailFn("pass", newItems, legacyItems));
  }
}

// ---------- §3.1 兜底合并：插件行没有字段时，用 Lead 自记行补 ----------
// dsh-agent-team 插件只写 ts/actor/phase/target/desc，不捕获 mode/task/evidence/verdict。
// 因此 AGENTS.md §3.1 要求 Lead 另写 phase=lead-spawn / lead-verdict 的行。
// 判定时必须把同一 target 的两行合并看，否则 A1/A2/A3 会永久 FAIL。
const leadSpawnRows = log.filter((e) => e.phase === "lead-spawn");
const leadVerdictRows = log.filter((e) => e.phase === "lead-verdict");
/** 找对应的 Lead 自记行：优先按 task 精确匹配，退化按 target + 24h 窗口 */
function findLeadRow(row, pool) {
  const taskId = row.task ?? row.task_id;
  if (taskId) {
    const exact = pool.filter((r) => r.task === taskId);
    if (exact.length) return exact[exact.length - 1];
  }
  const t0 = new Date(row.ts).getTime();
  let best = null;
  let bestDt = Infinity;
  for (const r of pool) {
    if (r.target !== row.target) continue;
    const dt = Math.abs(new Date(r.ts).getTime() - t0);
    if (dt < bestDt && dt <= 24 * 60 * 60 * 1000) {
      best = r;
      bestDt = dt;
    }
  }
  return best;
}
/** 兼容插件写法：outcome 视同 verdict；evidence 可能是字符串或数组 */
function normalizeEvidence(v) {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v];
  return [];
}
const mergedMode = (e) => e.mode ?? e.payload?.mode ?? findLeadRow(e, leadSpawnRows)?.mode;
const mergedTask = (e) => e.task ?? e.task_id ?? findLeadRow(e, leadSpawnRows)?.task;
const mergedVerdict = (e) => {
  const lead = findLeadRow(e, leadVerdictRows);
  const own = normalizeEvidence(e.evidence);
  return {
    verdict: e.verdict ?? e.outcome ?? lead?.verdict,
    evidence: own.length > 0 ? own : normalizeEvidence(lead?.evidence),
  };
};

// ---------- A1：spawn 是否带 mode（L9） ----------
{
  const bad = (arr) => arr.filter((e) => !mergedMode(e));
  judge("A1", "spawn 必须显式传 mode（基线后）", "L9", bad(newSpawns), bad(legacySpawns), (st, nv, lg) =>
    st === "fail"
      ? `基线后 ${nv.length}/${newSpawns.length} 个 spawn 缺 mode（插件行与 lead-spawn 行都没有）：${nv.map((e) => e.target).slice(0, 5).join(", ")}`
      : st === "legacy"
        ? `基线后 0 违规；存量 ${lg.length} 条（${cutoff?.toISOString()} 前，不追溯）`
        : `${newSpawns.length} 个 spawn 均带 mode`,
  );
}

// ---------- A2：spawn 是否带任务关联（L1） ----------
{
  const bad = (arr) => arr.filter((e) => !mergedTask(e));
  judge("A2", "spawn 前先建任务并关联（基线后）", "L1", bad(newSpawns), bad(legacySpawns), (st, nv, lg) =>
    st === "fail"
      ? `基线后 ${nv.length}/${newSpawns.length} 个 spawn 无 task 关联：${nv.map((e) => e.target).slice(0, 5).join(", ")}`
      : st === "legacy"
        ? `基线后 0 违规；存量 ${lg.length} 条（不追溯）`
        : "全部 spawn 有关联任务",
  );
}

// ---------- A3：done 是否带 evidence 与 verdict（L3） ----------
{
  const bad = (arr) =>
    arr.filter((e) => {
      const m = mergedVerdict(e);
      return !m.verdict || !Array.isArray(m.evidence) || m.evidence.length === 0;
    });
  judge("A3", "done 必须带 evidence + verdict（基线后）", "L3", bad(newDones), bad(legacyDones), (st, nv, lg) =>
    st === "fail"
      ? `基线后 ${nv.length}/${newDones.length} 个 done 缺 evidence/verdict（插件行与 lead-verdict 行都没有）：${nv.map((e) => e.target).slice(0, 5).join(", ")}`
      : st === "legacy"
        ? `基线后 0 违规；存量 ${lg.length} 条（幽灵验收，不追溯）`
        : `${newDones.length} 个 done 均带证据`,
  );
}

// ---------- A4：tag ↔ commit（L5） ----------
{
  const tags = git("git tag --list 'v*'").split(/\r?\n/).filter(Boolean);
  const bad = [];
  for (const t of tags) {
    const sha = git(`git rev-list -n 1 refs/tags/${t}`);
    if (!sha || sha.length < 7) bad.push(`${t}(无 commit)`);
  }
  record(
    "A4",
    "每个 v* tag 指向存在的 commit",
    "L5",
    bad.length > 0 ? "FAIL" : tags.length > 0 ? "PASS" : "WARN",
    tags.length === 0 ? "无 v* tag（尚未发版）" : bad.length > 0 ? `异常 tag：${bad.join(", ")}` : `${tags.length} 个 tag 均有效（远端一致性需人工核对）`,
  );
}

// ---------- A5：plan.md 是否落后于最后一次派发（L7） ----------
{
  const planPath = join(ROOT, "todo/plan.md");
  const lastSpawn = spawns[spawns.length - 1];
  if (!existsSync(planPath)) {
    record("A5", "todo/plan.md 新鲜度", "L7", "FAIL", "todo/plan.md 不存在");
  } else if (!lastSpawn?.ts) {
    record("A5", "todo/plan.md 新鲜度", "L7", "WARN", "无 spawn 记录，跳过比较");
  } else {
    const planMtime = statSync(planPath).mtime;
    const spawnTime = new Date(lastSpawn.ts);
    const stale = planMtime < spawnTime;
    record(
      "A5",
      "todo/plan.md 不落后于最后一次派发",
      "L7",
      stale ? "WARN" : "PASS",
      `plan.md ${planMtime.toISOString()} vs 最后 spawn ${spawnTime.toISOString()}`,
    );
  }
}

// ---------- A6：触及 packages/**|schema/** 的最近提交是否含 Decision:（L10） ----------
{
  const shas = git(`git log -n ${since} --format=%H`).split(/\r?\n/).filter(Boolean);
  const offenders = [];
  for (const sha of shas) {
    const files = git(`git show --name-only --format= ${sha}`);
    const touchesCore = /(^|\n)(packages\/|schema\/)/.test(files);
    if (!touchesCore) continue;
    const body = git(`git log -1 --format=%B ${sha}`);
    if (!/Decision:/i.test(body)) offenders.push(sha.slice(0, 7));
  }
  record(
    "A6",
    "触及 packages/ 或 schema/ 的提交含 Decision:/Why:",
    "L10",
    offenders.length > 0 ? "WARN" : "PASS",
    offenders.length > 0
      ? `最近 ${since} 个提交中 ${offenders.length} 个缺决策索引：${offenders.slice(0, 8).join(", ")}`
      : `最近 ${since} 个提交均有决策索引`,
  );
}

// ---------- A7：owns.yaml owner 是否出现在 dispatch-log（幽灵 owner，L3） ----------
{
  const owns = readText("team/owns.yaml");
  if (!owns) {
    record("A7", "无幽灵 owner", "L3", "FAIL", "team/owns.yaml 不存在");
  } else {
    const owners = [...owns.matchAll(/owner:\s*([\w-]+)/g)].map((m) => m[1]);
    const seen = new Set([...spawns, ...log.filter((e) => e.phase === "message")].map((e) => e.target).filter(Boolean));
    const ghosts = [...new Set(owners)].filter((o) => !seen.has(o));
    record(
      "A7",
      "owns.yaml 中 owner 均有派发记录",
      "L3",
      ghosts.length > 0 ? "WARN" : "PASS",
      ghosts.length > 0 ? `从未派发：${ghosts.join(", ")}` : `${new Set(owners).size} 个 owner 均有记录`,
    );
  }
}

// ---------- A8：版本一致性（L4） ----------
{
  const readVer = (rel) => {
    const t = readText(rel);
    if (!t) return null;
    const m = /"version"\s*:\s*"([^"]+)"/.exec(t);
    return m ? m[1] : null;
  };
  const rootVer = readVer("package.json");
  const pkgs = execSync("node -e \"const fs=require('fs');console.log(fs.readdirSync('packages').join(' '))\"", {
    cwd: ROOT,
  })
    .toString()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const mismatch = [];
  for (const p of pkgs) {
    const v = readVer(`packages/${p}/package.json`);
    if (v && v !== rootVer) mismatch.push(`@covenant/${p}=${v}`);
  }
  record(
    "A8",
    "根与各包版本一致",
    "L4",
    mismatch.length > 0 ? "FAIL" : "PASS",
    mismatch.length > 0 ? `根 ${rootVer} ≠ ${mismatch.join(", ")}` : `全部 = ${rootVer}`,
  );
}

// ---------- A9：版本单一事实源（L4） ----------
// 版本号曾在三处硬编码且全部停在 0.1.0（cli VERSION / mcp SERVER_INFO / render 内嵌数据），
// 而 package.json 已 0.3.0 —— 打印版本的路径全在撒谎。现在收敛到 core 的 COVENANT_VERSION，
// 本检查保证：① 该常量等于 package.json；② packages/*/src 下不再出现版本字面量。
{
  const rootVer = (() => {
    const t = readText("package.json");
    const m = t ? /"version"\s*:\s*"([^"]+)"/.exec(t) : null;
    return m ? m[1] : null;
  })();
  const verFile = readText("packages/core/src/version.ts");
  const constVer = verFile ? /COVENANT_VERSION\s*=\s*"([^"]+)"/.exec(verFile)?.[1] : null;
  const problems = [];
  if (!constVer) problems.push("packages/core/src/version.ts 缺少 COVENANT_VERSION 常量");
  else if (constVer !== rootVer) problems.push(`COVENANT_VERSION=${constVer} ≠ package.json=${rootVer}`);

  // 扫描源码里的版本字面量（排除 version.ts 自身与测试）
  const offenders = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === "__golden__" || e.name.startsWith(".")) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) {
        const t = readText(p);
        if (!t) continue;
        if (/(?:VERSION|version)\s*[:=]\s*"\d+\.\d+\.\d+"/.test(t) && !p.endsWith("version.ts")) {
          offenders.push(relative(ROOT, p).split("\\").join("/"));
        }
      }
    }
  };
  walk(join(ROOT, "packages"));
  if (offenders.length) problems.push(`源码内硬编码版本字面量：${offenders.join(", ")}`);

  record(
    "A9",
    "版本单一事实源（COVENANT_VERSION = package.json，且无硬编码）",
    "L4",
    problems.length > 0 ? "FAIL" : "PASS",
    problems.length > 0 ? problems.join("；") : `全部来自 packages/core/src/version.ts = ${constVer}`,
  );
}

// ---------- 附加：日志可解析 ----------
if (parseErrors.length > 0) {
  record("A0", "dispatch-log 每行可解析", "L3", "FAIL", `${parseErrors.length} 行 JSON 损坏：${parseErrors.map((e) => e.__parseError).join(", ")}`);
}

// ---------- 输出 ----------
const fails = results.filter((r) => r.status === "FAIL");
const warns = results.filter((r) => r.status === "WARN");

if (asJson) {
  console.log(JSON.stringify({ ok: fails.length === 0, results }, null, 2));
} else {
  const icon = { PASS: "✅", WARN: "⚠️ ", FAIL: "❌" };
  console.log("covenant agent audit — AGENTS.md §6");
  console.log(`log: ${log.length} 条（spawn ${spawns.length} / done ${dones.length}）\n`);
  for (const r of results) {
    console.log(`${icon[r.status] ?? "  "} ${r.id} ${r.name}  [${r.invariant}]`);
    if (r.detail) console.log(`     ${r.detail}`);
  }
  console.log(`\n合计：PASS ${results.length - fails.length - warns.length} / WARN ${warns.length} / FAIL ${fails.length}`);
  if (fails.length === 0) {
    console.log("结论：无 FAIL。WARN 属存量债务，按 L6 如实保留，不回填。");
  } else {
    console.log("结论：有 FAIL —— 新派发必须满足 AGENTS.md §3 必填字段。");
  }
}

process.exit(fails.length === 0 ? 0 : 1);
