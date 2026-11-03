/**
 * FRAS 索引（I1–I3 可判定）：
 *   I1  每个源文件有条目
 *   I2  无 stale（源码 hash 变了条目没更新）/ 无 orphan（文件已删条目还在）
 *   I3  条目 f 非空且独立可读（禁止"详见"）
 *
 * 分工：F/R/A/S 的语义由人或 Agent 写；机器只维护 `source_sha256`。
 * 因此 `--write` 只更新哈希，不会替你编造语义。
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import yaml from "js-yaml";
import type { Finding } from "@covenant/core";

export interface FrasEntry {
  file: string;
  /** File 职责，≤60 字，必须独立可读 */
  f: string;
  /** 必读依赖 */
  r?: string[];
  /** 上层调用者 */
  a?: string[];
  /** 代码推不出的隐性约束 */
  s?: string[];
  source_sha256?: string;
}

export interface IndexFile {
  entries: FrasEntry[];
}

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".audit", "coverage"]);

/** 收集需要索引的源文件：packages/<pkg>/src 下的 TS（排除测试） + scripts 下的 mjs */
export function collectSources(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        const rel = relative(root, p).split(sep).join("/");
        if (rel.startsWith("packages/") && rel.includes("/src/")) out.push(rel);
      }
    }
  };
  walk(join(root, "packages"));

  const scripts = join(root, "scripts");
  if (existsSync(scripts)) {
    for (const entry of readdirSync(scripts, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".mjs")) {
        out.push(`scripts/${entry.name}`);
      }
    }
  }
  return out.sort();
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function hashFile(root: string, rel: string): string {
  return sha256(readFileSync(join(root, rel), "utf8"));
}

export function loadIndex(indexPath: string): IndexFile {
  if (!existsSync(indexPath)) return { entries: [] };
  const data = yaml.load(readFileSync(indexPath, "utf8"), { schema: yaml.CORE_SCHEMA }) as
    | IndexFile
    | null;
  return { entries: data?.entries ?? [] };
}

const finding = (code: string, message: string, fixHint?: string): Finding => ({
  code,
  level: "L4",
  severity: "error",
  message,
  fixHint,
});

/** 校验索引；返回 findings（空数组 = 通过） */
export function checkIndex(root: string, indexPath: string): Finding[] {
  const sources = new Set(collectSources(root));
  const index = loadIndex(indexPath);
  const byFile = new Map<string, FrasEntry[]>();
  for (const e of index.entries) {
    if (!byFile.has(e.file)) byFile.set(e.file, []);
    byFile.get(e.file)!.push(e);
  }

  const out: Finding[] = [];

  // I1：覆盖
  for (const src of sources) {
    if (!byFile.has(src)) {
      out.push(finding("index/missing", `缺少 FRAS 条目: ${src}`, "在 arch/index.yaml 增加条目并填写 f/r/a/s"));
    }
  }

  // I2：orphan / stale / 重复
  for (const [file, list] of byFile) {
    if (!sources.has(file)) {
      out.push(finding("index/orphan", `孤儿条目（文件不存在）: ${file}`, "删除该条目"));
      continue;
    }
    if (list.length > 1) {
      out.push(finding("index/duplicate", `同一文件有 ${list.length} 条条目: ${file}`));
    }
    const actual = hashFile(root, file);
    for (const e of list) {
      if (!e.source_sha256) {
        out.push(finding("index/stale", `条目缺少 source_sha256: ${file}`, "运行 covenant index --write"));
      } else if (e.source_sha256 !== actual) {
        out.push(
          finding("index/stale", `源码已变更但条目未更新（stale）: ${file}`, "确认 F/R/A/S 仍准确后运行 covenant index --write"),
        );
      }
    }
  }

  // I3：f 必须独立可读
  for (const e of index.entries) {
    const f = (e.f ?? "").trim();
    if (!f) out.push(finding("index/empty-f", `FRAS 条目 f 为空: ${e.file}`, "写一句 60 字以内的职责"));
    else if (/详见|参见|同上|TODO/.test(f)) {
      out.push(finding("index/unreadable-f", `FRAS 条目 f 不可独立阅读: ${e.file}`, "禁止用'详见/参见/同上/TODO'代替职责"));
    } else if (f.length > 60) {
      out.push(finding("index/long-f", `FRAS 条目 f 超过 60 字: ${e.file}`, "压缩到一句话"));
    }
  }

  return out;
}

/** 只更新哈希（语义由人/Agent 维护） */
export function writeIndex(root: string, indexPath: string): { updated: number; missing: string[] } {
  const index = loadIndex(indexPath);
  const sources = new Set(collectSources(root));
  let updated = 0;
  for (const e of index.entries) {
    if (!sources.has(e.file)) continue;
    e.source_sha256 = hashFile(root, e.file);
    updated++;
  }
  const present = new Set(index.entries.map((e) => e.file));
  const missing = [...sources].filter((s) => !present.has(s));
  const header = "# FRAS 索引：机器只维护 source_sha256；F/R/A/S 由人或 Agent 撰写\n";
  writeFileSync(indexPath, header + yaml.dump(index, { lineWidth: 120, noRefs: true }), "utf8");
  return { updated, missing };
}
