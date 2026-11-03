/**
 * 编辑落盘流程（CLI 与编辑态服务共用）：
 * 预览 = 写 `<doc>.edited.cvn.yaml` + diff；accept = 写回原文件 + 备份 + 审计。
 *
 * diff 口径（用户已定）：默认文本统一 diff；检测到 git 可用时优先输出真正的 `git diff`
 * （用 `git diff --no-index`，因此**不需要 git init**），失败则回退到内置 LCS diff。
 */
import { appendFileSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseDocument } from "@covenant/core";
import type { Finding } from "@covenant/core";
import { checkDocument } from "@covenant/validate";
import { applyEdits, parseEdits, serializeDoc, unifiedDiff } from "@covenant/editor";

export interface EditRequest {
  docPath: string;
  editsText: string;
  accept: boolean;
  actor?: string;
  outPath?: string;
}

export interface EditOutcome {
  ok: boolean;
  changed: number;
  diff: string;
  out?: string;
  backup?: string;
  rev?: number;
  findings: Finding[];
  message?: string;
  /** diff 来源：git | internal（便于 UI/日志标注） */
  diffKind?: "git" | "internal";
}

/** 用 git 生成 diff（--no-index：无需 git init）；不可用/无差异时返回 null */
function gitTextDiff(beforePath: string, afterPath: string): string | null {
  const rel = (p: string): string => {
    const r = relative(process.cwd(), p);
    return r === "" ? p : r;
  };
  const result = spawnSync(
    "git",
    [
      "diff",
      "--no-index",
      "--no-color",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      "--",
      rel(beforePath),
      rel(afterPath),
    ],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  if (result.error) return null;
  const out = (result.stdout ?? "").trim();
  if (!out) return null;
  return `${out}\n`;
}

export function performEdit(req: EditRequest): EditOutcome {
  const docPath = resolve(req.docPath);
  let originalText: string;
  try {
    originalText = readFileSync(docPath, "utf8");
  } catch (e) {
    return {
      ok: false,
      changed: 0,
      diff: "",
      findings: [],
      message: `无法读取文档: ${(e as Error).message}`,
    };
  }
  const parsedDoc = parseDocument(originalText, docPath);
  if (!parsedDoc.doc) {
    return { ok: false, changed: 0, diff: "", findings: parsedDoc.findings, message: "文档解析失败" };
  }
  const parsedEdits = parseEdits(req.editsText);
  if (!parsedEdits.edits) {
    return { ok: false, changed: 0, diff: "", findings: parsedEdits.findings, message: "编辑文件非法" };
  }

  const applied = applyEdits(parsedDoc.doc, parsedEdits.edits);
  if (!applied.doc) {
    return { ok: false, changed: 0, diff: "", findings: applied.findings, message: "编辑无法应用" };
  }
  const nextDoc = applied.doc;

  const after = checkDocument(nextDoc, docPath);
  const errors = after.filter((f) => f.severity === "error");
  if (errors.length > 0) {
    return { ok: false, changed: 0, diff: "", findings: errors, message: "编辑后校验失败，未写盘" };
  }

  const actor = req.actor ?? parsedEdits.edits.actor ?? "human:you";
  if (!actor.startsWith("human:")) {
    return {
      ok: false,
      changed: 0,
      diff: "",
      findings: [],
      message: `编辑语义只允许 human actor（当前 "${actor}"）`,
    };
  }
  if (req.accept) nextDoc.meta.rev = (parsedDoc.doc.meta?.rev ?? 0) + 1;

  const text = serializeDoc(nextDoc);
  const out = resolve(req.outPath ?? docPath.replace(/\.cvn(\.yaml)?$/, ".edited.cvn.yaml"));
  const from = relative(process.cwd(), docPath);
  const fallback = unifiedDiff(originalText, text, {
    fromLabel: from,
    toLabel: relative(process.cwd(), req.accept ? docPath : out),
  });

  if (req.accept) {
    const auditDir = join(dirname(docPath), ".audit");
    mkdirSync(auditDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backup = join(auditDir, `${basename(docPath)}.${stamp}.bak`);
    copyFileSync(docPath, backup);
    writeFileSync(docPath, text, "utf8");
    const auditFile = join(auditDir, `edit-${new Date().toISOString().slice(0, 10)}.jsonl`);
    appendFileSync(
      auditFile,
      `${JSON.stringify({
        at: new Date().toISOString(),
        actor,
        doc: nextDoc.id,
        rev: nextDoc.meta.rev,
        ops: parsedEdits.edits.ops,
        backup: relative(process.cwd(), backup),
      })}\n`,
      "utf8",
    );
    const git = gitTextDiff(backup, docPath);
    return {
      ok: true,
      changed: applied.changed,
      diff: git ?? fallback,
      diffKind: git ? "git" : "internal",
      out: docPath,
      backup,
      rev: nextDoc.meta.rev,
      findings: [],
    };
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text, "utf8");
  const git = gitTextDiff(docPath, out);
  return {
    ok: true,
    changed: applied.changed,
    diff: git ?? fallback,
    diffKind: git ? "git" : "internal",
    out,
    findings: [],
  };
}
