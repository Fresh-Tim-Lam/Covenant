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
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");
const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const sinceIdx = argv.indexOf("--since");
const since = sinceIdx >= 0 ? Number(argv[sinceIdx + 1] ?? 30) : 30;

const results = [];
function record(id, name, invariant, status, detail) {
  results.push({ id, name, invariant, status, detail });
}

function readText(rel) {
  const p = join(ROOT, rel);
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
const log = readJsonl("team/dispatch-log.jsonl");
const parseErrors = log.filter((e) => e.__parseError);
const spawns = log.filter((e) => e.phase === "spawn");
const dones = log.filter((e) => e.phase === "done");

// ---------- A1：spawn 是否带 mode（L9） ----------
{
  const missing = spawns.filter((e) => !e.mode && !e.payload?.mode);
  record(
    "A1",
    "spawn 必须显式传 mode",
    "L9",
    missing.length > 0 ? "FAIL" : "PASS",
    missing.length > 0
      ? `${missing.length}/${spawns.length} 个 spawn 缺 mode（应记 ${missing.map((e) => e.target).slice(0, 5).join(", ")}${missing.length > 5 ? " …" : ""}）`
      : `${spawns.length} 个 spawn 均带 mode`,
  );
}

// ---------- A2：spawn 是否带任务关联（L1） ----------
{
  const missing = spawns.filter((e) => !e.task && !e.task_id);
  record(
    "A2",
    "spawn 前先建任务并关联",
    "L1",
    missing.length > 0 ? "FAIL" : "PASS",
    missing.length > 0
      ? `${missing.length}/${spawns.length} 个 spawn 无 task 关联，无法验证「先建任务后派发」`
      : "全部 spawn 有关联任务",
  );
}

// ---------- A3：done 是否带 evidence 与 verdict（L3） ----------
{
  const missing = dones.filter((e) => !Array.isArray(e.evidence) || e.evidence.length === 0 || !e.verdict);
  record(
    "A3",
    "done 必须带 evidence + verdict",
    "L3",
    missing.length > 0 ? "FAIL" : "PASS",
    missing.length > 0
      ? `${missing.length}/${dones.length} 个 done 缺 evidence/verdict（幽灵验收）`
      : `${dones.length} 个 done 均带证据`,
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
