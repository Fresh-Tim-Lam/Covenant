#!/usr/bin/env node
/**
 * 索引优先范式门禁（R2）：每个模块必须带五段元语料。
 * 规范：docs/conventions/agent-team-development.md
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REQUIRED = ["职责", "依赖", "公共接口", "设计取舍", "约束"];
const pkgsDir = join(process.cwd(), "packages");

if (!existsSync(pkgsDir)) {
  console.error("FAIL modules: 缺少 packages/ 目录");
  process.exit(1);
}

const problems = [];
let checked = 0;

for (const entry of readdirSync(pkgsDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const dir = join(pkgsDir, entry.name);
  if (!existsSync(join(dir, "package.json"))) continue;
  checked++;
  const readme = join(dir, "README.md");
  if (!existsSync(readme)) {
    problems.push(`${entry.name}: 缺少 README.md（五段元语料）`);
    continue;
  }
  const text = readFileSync(readme, "utf8");
  const missing = REQUIRED.filter((s) => !new RegExp(`^## ${s}`, "m").test(text));
  if (missing.length > 0) {
    problems.push(`${entry.name}: README 缺少段落 ${missing.join("、")}`);
  }
}

if (checked === 0) {
  console.error("FAIL modules: packages/ 下没有找到模块");
  process.exit(1);
}

for (const p of problems) console.error(`FAIL modules: ${p}`);
if (problems.length > 0) {
  console.error(`modules: FAIL（${checked} 个模块，${problems.length} 个问题）`);
  process.exit(1);
}
console.log(`modules: PASS（${checked} 个模块均有五段元语料）`);
