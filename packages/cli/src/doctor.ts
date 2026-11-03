/**
 * 环境自检：给陌生机器一个"第一屏诊断"。
 * 覆盖 cleanroom 覆盖不到的环境差异（Node/pnpm 版本、git、锁文件、BOM、索引、产物）。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { checkIndex as checkFrasIndex } from "@covenant/indexer";

export type CheckStatus = "ok" | "warn" | "fail" | "info";

export interface CheckResult {
  id: string;
  status: CheckStatus;
  message: string;
  fix?: string;
}

export interface DoctorReport {
  ok: boolean;
  results: CheckResult[];
}

const TEXT_EXT = new Set([
  ".ts",
  ".mjs",
  ".js",
  ".json",
  ".md",
  ".yaml",
  ".yml",
  ".cvn",
  ".txt",
  ".html",
  ".css",
]);

/** 比较 a/b 的数值版本（接受 v 前缀；返回 -1/0/1） */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, "").split(".").map((x) => Number.parseInt(x, 10) || 0);
  const pb = b.replace(/^v/, "").split(".").map((x) => Number.parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x !== y) return x < y ? -1 : 1;
  }
  return 0;
}

export function checkNode(version: string = process.version): CheckResult {
  const ok = compareVersions(version, "22.0.0") >= 0;
  return {
    id: "node",
    status: ok ? "ok" : "fail",
    message: `Node ${version}${ok ? "" : "（需要 >= 22）"}`,
    fix: ok ? undefined : "升级 Node 到 22 或更高",
  };
}

export function checkPnpm(cwd: string): CheckResult {
  const r = spawnSync("pnpm", ["--version"], {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (r.status !== 0 || !r.stdout.trim()) {
    return {
      id: "pnpm",
      status: "fail",
      message: "未找到 pnpm",
      fix: "corepack enable && corepack prepare pnpm@11 --activate",
    };
  }
  const version = r.stdout.trim().split(/\r?\n/)[0]!;
  const ok = compareVersions(version, "11.0.0") >= 0;
  return {
    id: "pnpm",
    status: ok ? "ok" : "warn",
    message: `pnpm ${version}${ok ? "" : "（仓库按 pnpm 11 验证）"}`,
    fix: ok ? undefined : "升级到 pnpm 11",
  };
}

export function checkLockfile(cwd: string): CheckResult {
  const ok = existsSync(join(cwd, "pnpm-lock.yaml"));
  return {
    id: "lockfile",
    status: ok ? "ok" : "fail",
    message: ok ? "pnpm-lock.yaml 存在" : "缺少 pnpm-lock.yaml",
    fix: ok ? undefined : "运行 pnpm install 生成锁文件并提交",
  };
}

export function checkWorkspaces(cwd: string): CheckResult {
  const dir = join(cwd, "packages");
  if (!existsSync(dir)) {
    return { id: "workspaces", status: "fail", message: "缺少 packages/ 目录" };
  }
  const pkgs = readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "package.json")))
    .map((e) => e.name);
  if (!existsSync(join(cwd, "node_modules", ".pnpm"))) {
    return {
      id: "workspaces",
      status: "warn",
      message: `${pkgs.length} 个包，但依赖未安装`,
      fix: "运行 pnpm install",
    };
  }
  return { id: "workspaces", status: "ok", message: `${pkgs.length} 个工作区包，依赖已安装` };
}

/** schema JSON 可解析且无 BOM */
export function checkSchemaJson(path: string): CheckResult {
  if (!existsSync(path)) {
    return { id: "schema", status: "fail", message: "缺少 schema/kernel.schema.json" };
  }
  const bytes = readFileSync(path);
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return {
      id: "schema",
      status: "fail",
      message: "kernel.schema.json 带 UTF-8 BOM（JSON.parse 会失败）",
      fix: "以 UTF-8 无 BOM 重写该文件",
    };
  }
  try {
    JSON.parse(bytes.toString("utf8"));
  } catch (e) {
    return {
      id: "schema",
      status: "fail",
      message: `kernel.schema.json 不是合法 JSON：${(e as Error).message}`,
    };
  }
  return { id: "schema", status: "ok", message: "kernel.schema.json 可解析（无 BOM）" };
}

/** 扫描仓库文本文件的 BOM（跳过 node_modules/dist） */
export function scanBom(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
        continue;
      }
      const ext = entry.name.slice(entry.name.lastIndexOf("."));
      if (!TEXT_EXT.has(ext)) continue;
      const b = readFileSync(p);
      if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) {
        const rel = p.startsWith(root + sep) ? p.slice(root.length + 1) : p;
        out.push(rel.split(sep).join("/"));
      }
    }
  };
  if (existsSync(root)) walk(root);
  return out.sort();
}

export function checkBom(cwd: string): CheckResult {
  const files = scanBom(cwd);
  return {
    id: "bom",
    status: files.length === 0 ? "ok" : "warn",
    message:
      files.length === 0 ? "文本文件无 BOM" : `${files.length} 个文本文件带 BOM`,
    fix: files.length === 0 ? undefined : `去 BOM：${files.slice(0, 5).join(", ")}${files.length > 5 ? " …" : ""}`,
  };
}

export function checkGit(cwd: string): CheckResult {
  const ok = existsSync(join(cwd, ".git"));
  return {
    id: "git",
    status: ok ? "ok" : "warn",
    message: ok ? "git 仓库已初始化" : "尚未 git init（版本历史与 CI 不可用）",
    fix: ok ? undefined : "git init && git add -A && git commit",
  };
}

export function checkAdrDir(cwd: string): CheckResult {
  const dir = join(cwd, "docs", "design", "adr");
  if (!existsSync(dir)) {
    return { id: "adr", status: "warn", message: "缺少 docs/design/adr/" };
  }
  const count = readdirSync(dir).filter((f) => f.endsWith(".md") && f !== "README.md").length;
  return { id: "adr", status: count > 0 ? "ok" : "warn", message: `${count} 条 ADR` };
}

export function checkIndex(cwd: string): CheckResult {
  const indexPath = join(cwd, "arch", "index.yaml");
  if (!existsSync(indexPath)) {
    return { id: "index", status: "warn", message: "缺少 arch/index.yaml（FRAS 索引）" };
  }
  const findings = checkFrasIndex(cwd, indexPath);
  return {
    id: "index",
    status: findings.length === 0 ? "ok" : "fail",
    message: findings.length === 0 ? "FRAS 索引通过（I1–I3）" : `FRAS 索引有 ${findings.length} 个问题`,
    fix: findings.length === 0 ? undefined : "运行 pnpm index 查看详情",
  };
}

export function checkDist(cwd: string): CheckResult {
  const html = join(cwd, "dist", "covenant.html");
  if (!existsSync(html)) {
    return {
      id: "dist",
      status: "info",
      message: "尚未构建 HTML（dist/covenant.html 不存在）",
      fix: "pnpm build:html examples -o dist/covenant.html",
    };
  }
  const size = statSync(html).size;
  return { id: "dist", status: "ok", message: `dist/covenant.html ${Math.round(size / 1024)}KB` };
}

/** 版本一致性：根 package.json 与所有工作区包 */
export function checkVersions(cwd: string): CheckResult {
  const rootPath = join(cwd, "package.json");
  if (!existsSync(rootPath)) {
    return { id: "version", status: "fail", message: "缺少 package.json" };
  }
  const rootVersion = (JSON.parse(readFileSync(rootPath, "utf8")) as { version?: string }).version;
  if (!rootVersion) {
    return { id: "version", status: "fail", message: "根 package.json 缺少 version" };
  }
  const pkgsDir = join(cwd, "packages");
  const bad: string[] = [];
  let count = 0;
  if (existsSync(pkgsDir)) {
    for (const entry of readdirSync(pkgsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const p = join(pkgsDir, entry.name, "package.json");
      if (!existsSync(p)) continue;
      count++;
      const v = (JSON.parse(readFileSync(p, "utf8")) as { version?: string }).version;
      if (v !== rootVersion) bad.push(`${entry.name}@${v ?? "?"}`);
    }
  }
  return bad.length === 0
    ? { id: "version", status: "ok", message: `${rootVersion}（root + ${count} 包一致）` }
    : { id: "version", status: "fail", message: `版本不一致：${bad.join(", ")}`, fix: "统一到根 package.json 的 version" };
}

export function runDoctor(cwd: string = process.cwd()): DoctorReport {
  const root = resolve(cwd);
  const results: CheckResult[] = [
    checkNode(),
    checkPnpm(root),
    checkLockfile(root),
    checkVersions(root),
    checkWorkspaces(root),
    checkSchemaJson(join(root, "schema", "kernel.schema.json")),
    checkIndex(root),
    checkAdrDir(root),
    checkBom(root),
    checkGit(root),
    checkDist(root),
    {
      id: "platform",
      status: "info",
      message: `${process.platform}/${process.arch}`,
    },
  ];
  return { ok: results.every((r) => r.status !== "fail"), results };
}
