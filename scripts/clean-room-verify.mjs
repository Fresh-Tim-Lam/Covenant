// 干净环境复现：把仓库复制到临时目录（排除 node_modules/dist/.git/.audit），
// 重新 pnpm install --frozen-lockfile 并跑 pnpm verify。
// 用法: node scripts/clean-room-verify.mjs [--keep]
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const keep = process.argv.includes("--keep");
const dest = mkdtempSync(join(tmpdir(), "covenant-cleanroom-"));
const EXCLUDE = new Set(["node_modules", "dist", ".git", ".audit", ".pnpm-store"]);

cpSync(root, dest, {
  recursive: true,
  filter: (src) => {
    if (src === root) return true;
    const parts = src.slice(root.length + 1).split(/[\\/]/);
    return !parts.some((p) => EXCLUDE.has(p));
  },
});
console.log(`[cleanroom] copied → ${dest}`);

function run(cmd, args) {
  console.log(`[cleanroom] $ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, {
    cwd: dest,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return r.status ?? 1;
}

let status = 0;
const install = run("pnpm", ["install", "--frozen-lockfile"]);
if (install !== 0) {
  console.error("[cleanroom] install FAILED");
  status = install;
} else {
  status = run("pnpm", ["verify"]);
}

if (keep) console.log(`[cleanroom] kept → ${dest}`);
else rmSync(dest, { recursive: true, force: true });

process.exit(status);
