import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export * from "./types";
export { COVENANT_VERSION } from "./version";
export { parseDocument } from "./parse";

/** 向上查找仓库根：以 schema/kernel.schema.json 为锚点 */
export function findRepoRoot(startDir: string = process.cwd()): string {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, "schema", "kernel.schema.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("未找到仓库根（缺少 schema/kernel.schema.json）");
    }
    dir = parent;
  }
}

export function readTextFile(file: string): string {
  return readFileSync(file, "utf8");
}

/** 按 (level, code, elementId, path) 稳定排序，保证输出可比对 */
export function sortFindings(findings: import("./types").Finding[]): import("./types").Finding[] {
  const levelRank: Record<string, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4, L5: 5, L6: 6 };
  return [...findings].sort((a, b) => {
    const la = levelRank[a.level] ?? 9;
    const lb = levelRank[b.level] ?? 9;
    if (la !== lb) return la - lb;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    const ea = a.elementId ?? "";
    const eb = b.elementId ?? "";
    if (ea !== eb) return ea < eb ? -1 : 1;
    const pa = a.path ?? "";
    const pb = b.path ?? "";
    return pa < pb ? -1 : pa > pb ? 1 : 0;
  });
}
