/**
 * 补丁落盘的 write-ahead 审计：同目录 `.audit/apply-<day>.jsonl`，只追加。
 *
 * 审计失败绝不阻断主流程（调用方仍会得到结果），因此这里吞掉所有异常；
 * 语义只由 apply.ts 决定，本文件不判断补丁是否可应用。
 */
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

export function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** write-ahead 审计：同目录 .audit/apply.jsonl，只追加 */
export function audit(docPath: string, record: Record<string, unknown>): void {
  try {
    const dir = join(dirname(docPath), ".audit");
    mkdirSync(dir, { recursive: true });
    const day = String(record.at ?? "").slice(0, 10) || "unknown";
    appendFileSync(join(dir, `apply-${day}.jsonl`), `${JSON.stringify(record)}\n`, "utf8");
  } catch {
    /* 审计失败不阻断主流程；调用方仍会得到结果 */
  }
}
