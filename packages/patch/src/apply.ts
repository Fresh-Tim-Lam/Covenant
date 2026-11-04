/**
 * 补丁应用：把 HTML 导出的 `.patch.json` 落盘到 `.cvn.yaml`（M4）。
 *
 * 安全网（四道门）：
 *   1. base_rev 必须匹配（乐观锁）
 *   2. 只放行 add /annotations/-、replace /annotations/<id>/status、remove /annotations/<id>
 *   3. 写入临时文件后重新解析+校验，失败则中止且原件不动
 *   4. write-ahead 审计：先写 intent，rename 后再写 commit（见 audit.ts）
 *
 * 文本编辑本身在 text.ts；本文件只做前置校验、编排与原子落盘。
 */
import { readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { parseDocument } from "@covenant/core";
import type { CovenantDoc, Finding } from "@covenant/core";
import { checkDocument } from "@covenant/validate";
import { audit, sha256 } from "./audit";
import { classifyOps, finding } from "./parse";
import { replaceAnnotationBlocks } from "./text";
import type { Patch } from "./parse";
import { appendAnnotations, appendElements, applyStatusChanges, bumpRev, removeAnnotationBlocks, removeNamedBlocks } from "./text";

export interface ApplyOptions {
  /** 操作者标识，写入审计 */
  by?: string;
  dryRun?: boolean;
}

export interface ApplyResult {
  ok: boolean;
  findings: Finding[];
  newRev?: number;
  applied?: number;
  rendered?: string;
}

export function applyPatch(
  docPath: string,
  patch: Patch,
  options: ApplyOptions = {},
): ApplyResult {
  const by = options.by ?? "human:you";
  const at = new Date().toISOString();

  let original: string;
  try {
    original = readFileSync(docPath, "utf8");
  } catch (e) {
    return { ok: false, findings: [finding("patch/io", `无法读取 ${docPath}: ${(e as Error).message}`)] };
  }

  const parsed = parseDocument(original, docPath);
  if (!parsed.doc) return { ok: false, findings: parsed.findings };
  const doc: CovenantDoc = parsed.doc;

  const current = checkDocument(doc, docPath);
  const currentErrors = current.filter((f) => f.severity === "error");
  if (currentErrors.length > 0) {
    return {
      ok: false,
      findings: [finding("patch/doc-invalid", "文档当前已不合法，先修正再应用补丁", "运行 covenant check")],
    };
  }

  if (patch.doc !== doc.id) {
    return {
      ok: false,
      findings: [finding("patch/target", `补丁目标 ${patch.doc} 与文档 id ${doc.id} 不一致`)],
    };
  }

  const rev = doc.meta?.rev ?? 0;
  if (patch.base_rev !== rev) {
    return {
      ok: false,
      findings: [
        finding(
          "patch/base-rev",
          `补丁基于 rev ${patch.base_rev}，文档已是 rev ${rev}`,
          "重新导出补丁（HTML 里再点一次导出）",
        ),
      ],
    };
  }

  if (!patch.intent || !patch.intent.trim()) {
    return { ok: false, findings: [finding("patch/intent", "补丁缺少 intent（无法审计）")] };
  }

  const classified = classifyOps(patch.ops ?? []);
  if (classified.unknown.length > 0) {
    const bad = classified.unknown[0]!;
    return {
      ok: false,
      findings: [
        finding(
          "patch/op",
          `不支持的补丁操作 ${bad.op} ${bad.path}`,
          "v0 支持 add /annotations/-、replace /annotations/<id>/status、remove /annotations/<id>",
        ),
      ],
    };
  }

  const totalOps =
    classified.adds.length +
    classified.statuses.length +
    classified.removes.length +
    classified.edits.length;
  let next = appendAnnotations(
    original,
    classified.adds.map((op) => (op.value ?? {}) as Record<string, unknown>),
  );
  next = applyStatusChanges(next, classified.statuses, by, at);

  // 元素/关系操作（v0.2 新增）
  // 先删旧（元素→级联删关系），再加新
  if (classified.elementRemoves.length > 0 || classified.relationRemoves.length > 0) {
    next = removeNamedBlocks(next, "relations", classified.relationRemoves);
    next = removeNamedBlocks(next, "elements", classified.elementRemoves);
  }
  if (classified.elementAdds.length > 0) {
    next = appendElements(next, classified.elementAdds.map((op) => (op.value ?? {}) as Record<string, unknown>));
  }
  if (classified.relationAdds.length > 0) {
    next = appendElements(next, classified.relationAdds.map((op) => (op.value ?? {}) as Record<string, unknown>));
  }
  next = replaceAnnotationBlocks(next, classified.edits);
  next = removeAnnotationBlocks(next, classified.removes);
  next = bumpRev(next);

  const opsHash = sha256(JSON.stringify(patch.ops));
  const record = {
    at,
    actor: by,
    doc: doc.id,
    base_rev: rev,
    intent: patch.intent,
    ops_sha256: opsHash,
    op_count: totalOps,
  };

  if (options.dryRun) {
    return { ok: true, findings: [], newRev: rev + 1, applied: totalOps, rendered: next };
  }

  // write-ahead：先记 intent
  audit(docPath, { ...record, phase: "intent" });

  const tmp = `${docPath}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(tmp, next, "utf8");
    const reparsed = parseDocument(readFileSync(tmp, "utf8"), tmp);
    if (!reparsed.doc) {
      unlinkSync(tmp);
      return { ok: false, findings: reparsed.findings };
    }
    const after = checkDocument(reparsed.doc, tmp);
    const afterErrors = after.filter((f) => f.severity === "error");
    if (afterErrors.length > 0) {
      unlinkSync(tmp);
      return {
        ok: false,
        findings: [
          finding("patch/would-invalidate", "应用后文档将不合法，已中止（原文件未改）"),
          ...afterErrors,
        ],
      };
    }
    renameSync(tmp, docPath);
    audit(docPath, { ...record, phase: "commit", new_rev: rev + 1 });
    return { ok: true, findings: after, newRev: rev + 1, applied: totalOps };
  } catch (e) {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    return { ok: false, findings: [finding("patch/io", `写入失败: ${(e as Error).message}`)] };
  }
}
