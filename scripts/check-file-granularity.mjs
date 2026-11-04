#!/usr/bin/env node
/**
 * 文件粒度棘轮（AGENTS.md L12 / docs/conventions/file-granularity.md）
 *
 * 规则：文件夹承载高一级语义，文件尽量小。
 *   1. 新文件：源码 ≤ 300 行，测试 ≤ 400 行
 *   2. 存量文件：冻结在当前行数（grandfathered），**只许减、不许增**
 *   3. 文件夹语义：packages/*\/src/*\/ 子目录必须有 README.md（说明该文件夹的语义契约）
 *
 * 为什么用棘轮而不是一刀切 300：当前 render/html.ts 已 2100+ 行，
 * 一刀切会让检查永久红（绿灯疲劳），反而没人看。棘轮把存量债务冻结，
 * 只保证「不再变坏」，并把下降作为唯一合法方向。
 *
 * 用法：
 *   node scripts/check-file-granularity.mjs           # 检查
 *   node scripts/check-file-granularity.mjs --json    # 机器可读
 *   node scripts/check-file-granularity.mjs --init    # 重建存量基线（仅在人工确认后）
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const CONFIG = join(ROOT, "team/file-granularity.json");
const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const init = argv.includes("--init");

const DEFAULT_CONFIG = {
  schema: "covenant-file-granularity/v1",
  max_new_file_lines: 300,
  max_new_test_lines: 400,
  folder_readme_required: true,
  grandfathered: {},
};

/** 收集 packages/* /src 下的 .ts（排除 __golden__ 快照目录） */
function collect(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "__golden__" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) collect(p, out);
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/** 直接数换行，避免整体 split 的内存开销；末尾无换行也算一行 */
function countLines(abs) {
  const buf = readFileSync(abs);
  let n = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] === 10) n++;
  if (buf.length > 0 && buf[buf.length - 1] !== 10) n++;
  return n;
}

const entries = [];
for (const pkg of readdirSync(join(ROOT, "packages"), { withFileTypes: true })) {
  if (!pkg.isDirectory()) continue;
  const srcDir = join(ROOT, "packages", pkg.name, "src");
  if (!existsSync(srcDir)) continue;
  for (const abs of collect(srcDir)) {
    const rel = relative(ROOT, abs).split("\\").join("/");
    entries.push({ rel, abs, lines: countLines(abs), isTest: /\.test\.ts$/.test(rel) });
  }
}

// folder README 检查：packages/*/src/*/ 子目录（排除 __golden__）
const folders = [];
for (const pkg of readdirSync(join(ROOT, "packages"), { withFileTypes: true })) {
  if (!pkg.isDirectory()) continue;
  const srcDir = join(ROOT, "packages", pkg.name, "src");
  if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) continue;
  for (const sub of readdirSync(srcDir, { withFileTypes: true })) {
    if (!sub.isDirectory() || sub.name === "__golden__" || sub.name.startsWith(".")) continue;
    const rel = relative(ROOT, join(srcDir, sub.name)).split("\\").join("/");
    folders.push({ rel, hasReadme: existsSync(join(srcDir, sub.name, "README.md")) });
  }
}

if (init) {
  const grandfathered = {};
  for (const e of entries) {
    const limit = e.isTest ? DEFAULT_CONFIG.max_new_test_lines : DEFAULT_CONFIG.max_new_file_lines;
    if (e.lines > limit) grandfathered[e.rel] = e.lines;
  }
  writeFileSync(CONFIG, JSON.stringify({ ...DEFAULT_CONFIG, grandfathered }, null, 2) + "\n", "utf8");
  console.log(`已重建基线 → ${relative(ROOT, CONFIG)}（冻结 ${Object.keys(grandfathered).length} 个超标文件）`);
  process.exit(0);
}

if (!existsSync(CONFIG)) {
  console.error(`缺少基线文件 ${relative(ROOT, CONFIG)}；先跑 --init 并人工确认`);
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(CONFIG, "utf8"));
const grand = cfg.grandfathered ?? {};

const findings = [];
for (const e of entries) {
  const limit = e.isTest ? cfg.max_new_test_lines : cfg.max_new_file_lines;
  const frozen = grand[e.rel];
  if (typeof frozen === "number") {
    if (e.lines > frozen) {
      findings.push({
        severity: "error",
        code: "granularity/grew",
        file: e.rel,
        message: `存量文件从 ${frozen} 行增长到 ${e.lines} 行（棘轮只许减不许增）：请拆到新文件或文件夹`,
      });
    }
  } else if (e.lines > limit) {
    findings.push({
      severity: "error",
      code: "granularity/too-large",
      file: e.rel,
      message: `新文件 ${e.lines} 行 > 上限 ${limit}（测试上限 ${cfg.max_new_test_lines}）：请按语义拆到文件夹`,
    });
  }
}
if (cfg.folder_readme_required) {
  for (const f of folders) {
    if (!f.hasReadme) {
      findings.push({
        severity: "error",
        code: "granularity/folder-readme",
        folder: f.rel,
        message: "文件夹承载高一级语义，必须有 README.md 说明其语义契约（F/R/A/S）",
      });
    }
  }
}

const errors = findings.filter((f) => f.severity === "error");
if (asJson) {
  console.log(JSON.stringify({ ok: errors.length === 0, files: entries.length, folders: folders.length, findings }, null, 2));
} else {
  console.log(`文件粒度棘轮 — ${relative(ROOT, CONFIG)}`);
  console.log(`扫描：${entries.length} 个 .ts 文件 / ${folders.length} 个子文件夹；冻结存量 ${Object.keys(grand).length} 个`);
  for (const f of findings) {
    console.log(`❌ ${f.code}  ${f.file ?? f.folder}`);
    console.log(`     ${f.message}`);
  }
  const grown = findings.filter((f) => f.code === "granularity/grew").length;
  const over = findings.filter((f) => f.code === "granularity/too-large").length;
  const noReadme = findings.filter((f) => f.code === "granularity/folder-readme").length;
  console.log(
    errors.length === 0
      ? `✅ PASS：无增长、无超大新文件、文件夹语义齐全`
      : `合计：FAIL ${errors.length}（增长 ${grown} / 超大 ${over} / 缺 README ${noReadme}）`,
  );
}

// 顺便给出"值得拆"的存量 Top5，作为下降方向提示（不影响退出码）
if (!asJson) {
  const top = entries.filter((e) => grand[e.rel]).sort((a, b) => b.lines - a.lines).slice(0, 5);
  if (top.length) {
    console.log(`\n下降方向（存量 Top${top.length}，拆一个就更新基线）：`);
    for (const t of top) console.log(`  ${String(t.lines).padStart(5)} 行  ${t.rel}`);
  }
}
process.exit(errors.length === 0 ? 0 : 1);
