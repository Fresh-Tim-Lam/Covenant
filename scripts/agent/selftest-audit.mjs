#!/usr/bin/env node
/**
 * 审计自测：基线后的新违规必须 FAIL。
 *
 * 目的（AGENTS.md L6「让失败可见」）：证明 `pnpm agent:audit` 不是永久绿灯。
 * team/audit-baseline.json 只把历史债务降级为 WARN；基线之后再出现缺
 * mode / 缺 task / 缺 evidence 的记录，仍必须 FAIL。
 *
 * 用法：node scripts/agent/selftest-audit.mjs
 * 退出码：0 = 自测通过；1 = 自测失败
 */
import { spawnSync } from "node:child_process";
import { appendFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "../..");
const AUDIT = join(ROOT, "scripts/agent/team_audit.mjs");

function runAudit(extraArgs = []) {
  const r = spawnSync(process.execPath, [AUDIT, ...extraArgs], { cwd: ROOT, encoding: "utf8" });
  return { code: r.status ?? -1, out: (r.stdout ?? "") + (r.stderr ?? "") };
}

const tmp = join(tmpdir(), `covenant-audit-selftest-${Date.now()}.jsonl`);
copyFileSync(join(ROOT, "team/dispatch-log.jsonl"), tmp);
// 基线之后（2026-11-05 > cutoff 2026-11-04T15:00Z）的坏记录：spawn 无 mode、无 task
appendFileSync(
  tmp,
  JSON.stringify({
    ts: "2026-11-05T00:00:00.000Z",
    actor: "lead",
    phase: "spawn",
    target: "selftest-bad",
    desc: "intentional violation for selftest",
    source: "dsh-agent-team",
  }) + "\n",
  "utf8",
);

const bad = runAudit(["--log", tmp]);
const real = runAudit();
rmSync(tmp, { force: true });

const pick = (out) => out.split(/\r?\n/).filter((l) => /A1|A2|合计|结论/.test(l)).join("\n");

console.log("== 1) 含 1 条基线后新违规（期望 FAIL / 退出码 1） ==");
console.log(pick(bad.out));
console.log(`   exit=${bad.code}\n`);
console.log("== 2) 真实日志（期望无 FAIL / 退出码 0） ==");
console.log(pick(real.out));
console.log(`   exit=${real.code}\n`);

const ok = bad.code === 1 && real.code === 0 && /A1 .*FAIL|FAIL [1-9]/.test(bad.out) && /FAIL 0/.test(real.out);
console.log(ok ? "SELFTEST PASS：基线后新违规被拦，真实日志无 FAIL" : `SELFTEST FAIL：期望 (1,0) 且 A1/A2 FAIL，实际 exit=(${bad.code},${real.code})`);
process.exit(ok ? 0 : 1);
