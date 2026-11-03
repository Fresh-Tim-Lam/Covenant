/**
 * ADR（decision@1）：决策不是图，但同属契约。
 * 文件命名 NNNN-<slug>.md，front-matter 记录编号/状态/日期/决策人/supersedes 链。
 *
 * 已实现：front-matter 解析与字段校验、文件名编号一致、supersedes 目标存在。
 * 未实现（诚实记录）：catalog 的"accepted ADR 必须被文档 links.kind=adr 引用"——
 * 当前 .cvn 格式还没有 links 字段，等格式扩展后再接。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import yaml from "js-yaml";
import type { CovenantDoc, Finding } from "@covenant/core";

export const ADR_STATUSES = ["proposed", "accepted", "superseded", "rejected"] as const;
export type AdrStatus = (typeof ADR_STATUSES)[number];

export interface ParsedAdr {
  front?: Record<string, unknown>;
  body: string;
  findings: Finding[];
}

const finding = (code: string, message: string, fixHint?: string): Finding => ({
  code,
  level: "L4",
  severity: "error",
  message,
  fixHint,
});

export function parseAdr(text: string): ParsedAdr {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!m) {
    return { body: text, findings: [finding("adr/front-matter", "缺少 front-matter（--- 包裹的 YAML 头）")] };
  }
  let front: unknown;
  try {
    front = yaml.load(m[1]!, { schema: yaml.CORE_SCHEMA });
  } catch (e) {
    return {
      body: m[2] ?? "",
      findings: [finding("adr/front-matter", `front-matter 不是合法 YAML：${(e as Error).message}`)],
    };
  }
  if (!front || typeof front !== "object") {
    return {
      body: m[2] ?? "",
      findings: [finding("adr/front-matter", "front-matter 必须是映射（key: value）")],
    };
  }
  return { front: front as Record<string, unknown>, body: m[2] ?? "", findings: [] };
}

export function normalizeAdrNumber(value: string | number): string {
  const raw = String(value);
  const m = /(\d{4})/.exec(raw);
  if (m) return m[1]!;
  const digits = raw.replace(/^0+/, "") || "0";
  return digits.padStart(4, "0");
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

/** 校验一条 ADR 的 front-matter（不检查跨文件引用） */
export function checkAdr(front: Record<string, unknown>, file: string): Finding[] {
  const out: Finding[] = [];

  const rawNum = front.adr;
  if (rawNum === undefined) out.push(finding("adr/number", `${file}：缺少 adr 编号`));
  else if (typeof rawNum !== "number" && !/^\d{4}$/.test(String(rawNum))) {
    out.push(finding("adr/number", `${file}：adr 编号必须是 4 位数字（当前 ${String(rawNum)}）`));
  }

  const title = front.title;
  if (typeof title !== "string" || title.trim() === "") {
    out.push(finding("adr/title", `${file}：title 必填且非空`));
  }

  const status = front.status;
  if (typeof status !== "string" || !(ADR_STATUSES as readonly string[]).includes(status)) {
    out.push(
      finding(
        "adr/status",
        `${file}：status 必须是 ${ADR_STATUSES.join(" | ")}（当前 ${String(status)}）`,
      ),
    );
  }

  const date = front.date;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) {
    out.push(finding("adr/date", `${file}：date 必须是 YYYY-MM-DD（当前 ${String(date)}）`));
  }

  for (const key of ["deciders", "supersedes", "related"] as const) {
    const v = front[key];
    if (v !== undefined && !isStringArray(v)) {
      out.push(finding("adr/array", `${file}：${key} 必须是字符串数组`));
    }
  }

  // 文件名编号一致
  const base = basename(file);
  const m = /^(\d{4})-.+\.md$/.exec(base);
  if (m && rawNum !== undefined) {
    if (m[1] !== normalizeAdrNumber(rawNum as string | number)) {
      out.push(
        finding(
          "adr/filename",
          `${file}：文件名编号 ${m[1]} 与 front-matter 编号 ${normalizeAdrNumber(rawNum as string | number)} 不一致`,
        ),
      );
    }
  }

  // superseded 必须有 supersedes 链
  if (status === "superseded") {
    const chain = front.supersedes;
    if (!isStringArray(chain) || chain.length === 0) {
      out.push(finding("adr/supersedes-chain", `${file}：status=superseded 时必须写 supersedes 链`));
    }
  }

  return out;
}

export interface AdrRecord {
  file: string;
  front?: Record<string, unknown>;
  findings: Finding[];
}

/** 扫描并校验一个 ADR 目录；含 supersedes 目标存在性交叉检查 */
export function checkAdrDir(dir: string): { records: AdrRecord[]; findings: Finding[] } {
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".md") && f !== "README.md")
    .sort();
  const records: AdrRecord[] = files.map((f) => {
    const path = join(dir, f);
    if (!statSync(path).isFile()) return { file: path, findings: [] };
    const parsed = parseAdr(readFileSync(path, "utf8"));
    return {
      file: path,
      front: parsed.front,
      findings: [...parsed.findings, ...(parsed.front ? checkAdr(parsed.front, path) : [])],
    };
  });

  const findings = records.flatMap((r) => r.findings);
  const numbers = new Set(
    records
      .filter((r) => r.front && !r.findings.some((f) => f.code === "adr/number" || f.code === "adr/filename"))
      .map((r) => normalizeAdrNumber(r.front!.adr as string | number)),
  );
  for (const r of records) {
    if (!r.front) continue;
    const chain = r.front.supersedes;
    if (!isStringArray(chain)) continue;
    for (const target of chain) {
      if (!numbers.has(normalizeAdrNumber(target))) {
        findings.push(
          finding(
            "adr/supersedes-target",
            `${r.file}：supersedes 引用的 ${target} 在目录中不存在`,
          ),
        );
      }
    }
  }
  return { records, findings };
}

/** 收集文档（文档级 + 元素级）里 kind=adr 的引用编号（统一补零） */
export function collectAdrRefs(docs: CovenantDoc[]): Set<string> {
  const out = new Set<string>();
  for (const doc of docs) {
    for (const link of doc.links ?? []) {
      if (link.kind === "adr") out.add(normalizeAdrNumber(link.ref));
    }
    for (const el of doc.elements ?? []) {
      for (const link of el.links ?? []) {
        if (link.kind === "adr") out.add(normalizeAdrNumber(link.ref));
      }
    }
  }
  return out;
}

/** accepted 的 ADR 必须至少被一条文档 link 引用（catalog §11.1） */
export function checkAcceptedAdrReferenced(
  records: AdrRecord[],
  linkedNumbers: Set<string>,
): Finding[] {
  const out: Finding[] = [];
  for (const r of records) {
    const front = r.front;
    if (!front || front.status !== "accepted") continue;
    const num = normalizeAdrNumber(front.adr as string | number);
    if (!linkedNumbers.has(num)) {
      out.push({
        code: "adr/unreferenced",
        level: "L4",
        severity: "warning",
        message: `${r.file}：accepted 但没有文档 links.kind=adr 引用（${num}）`,
        fixHint: "在 arch/ 或示例文档根部加 links: [{ kind: adr, ref: \"0001\" }]",
      });
    }
  }
  return out;
}
