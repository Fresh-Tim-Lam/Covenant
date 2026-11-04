#!/usr/bin/env node
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { parseDocument } from "@covenant/core";
import type { CovenantDoc, Finding } from "@covenant/core";
import { checkDocument } from "@covenant/validate";
import { applyPatch, gatePatch, parseActor, parsePatch } from "@covenant/patch";
import { diffDocs, formatDiff } from "@covenant/diff";
import { checkIndex, writeIndex } from "@covenant/indexer";
import { buildAnnotationPatch, buildBrief, formatBrief } from "@covenant/ai";
import { checkAcceptedAdrReferenced, checkAdrDir, collectAdrRefs } from "@covenant/adr";
import { performEdit } from "./edit-flow";
import { layout, selectView } from "@covenant/layout";
import { renderHtml, renderSvg } from "@covenant/render";
import type { DocView } from "@covenant/render";
import { startServer } from "./serve";
import { runDoctor } from "./doctor";

const VERSION = "0.1.0";

/** 门禁退出码（见 docs/design/gate-spec-v0.md §2） */
const EXIT_SERVE = -1;

const EXIT = {
  OK: 0,
  ERROR: 1,
  WARNING_STRICT: 2,
  TOOL_FAILURE: 3,
  GATE_FAILURE: 4,
} as const;

function usage(): string {
  return [
    "covenant — 契约式架构图示语言 CLI",
    "",
    "用法:",
    "  covenant check <file-or-dir>... [--strict] [--json]",
    "  covenant render <file.cvn.yaml> [-o out.svg]",
    "  covenant build <file-or-dir>... [-o out.html]",
  "  covenant bundle <file-or-dir>... [-o outdir]   打成一整套图（index.html + manifest.json + views/*.svg）",
    "  covenant apply <doc.cvn.yaml> <patch.json> [--by actor] [--dry-run]",
    "  covenant patch-check <doc.cvn.yaml> <patch.json> [--actor human:|ai:] [--json]",
    "  covenant diff <a.cvn.yaml> <b.cvn.yaml> [--json]",
    "  covenant index [--write] [--json]",
    "  covenant ai brief <doc> [--json]",
    "  covenant ai annotate <doc> --target <id> --title <t> [--body ...] [--actor ai:name] [-o patch.json]",
    "  covenant adr [dir] [--json]",
    "  covenant serve [dir] [--port 4173] [--host 127.0.0.1]",
    "  covenant edit <doc> <edits.json> [--out <file>] [--diff] [--accept] [--actor human:you]",
    "  covenant doctor [--json]",
    "",
    "退出码: 0 通过 / 1 有 error / 2 仅 warning 且 --strict / 3 工具失败 / 4 门禁自身异常",
  ].join("\n");
}

function collectFiles(target: string): string[] {
  const abs = resolve(target);
  const st = statSync(abs);
  if (st.isFile()) return [abs];
  if (!st.isDirectory()) return [];
  const out: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const child = join(abs, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(child));
    else if (entry.name.endsWith(".cvn.yaml") || entry.name.endsWith(".cvn")) {
      out.push(child);
    }
  }
  return out;
}

function renderFinding(f: Finding): string {
  const where = f.elementId ? ` ${f.elementId}` : "";
  const lines = [`  ${f.severity.toUpperCase().padEnd(5)} ${f.level} ${f.code}${where}  ${f.message}`];
  if (f.fixHint) lines.push(`  ${" ".repeat(5)}fix: ${f.fixHint}`);
  return lines.join("\n");
}

function loadDoc(file: string): { doc?: CovenantDoc; findings: Finding[] } {
  const text = readFileSync(file, "utf8");
  const parsed = parseDocument(text, file);
  if (!parsed.doc) return { findings: parsed.findings };
  return { doc: parsed.doc, findings: [...parsed.findings, ...checkDocument(parsed.doc, file)] };
}

function cmdCheck(args: string[], flags: { strict: boolean; json: boolean }): number {
  let files: string[];
  try {
    files = [...new Set(args.flatMap(collectFiles))].sort();
  } catch (e) {
    console.error(`无法读取目标: ${(e as Error).message}`);
    return EXIT.TOOL_FAILURE;
  }

  // A1 防假通过：扫描 0 个文件视为门禁配置异常
  if (files.length === 0) {
    console.error("gate/config: 扫描到 0 个 .cvn.yaml 文件（路径错误或门禁配置异常）");
    return EXIT.GATE_FAILURE;
  }

  let errors = 0;
  let warnings = 0;
  const report: { file: string; findings: Finding[] }[] = [];
  // evidence 覆盖统计（impl_status/evidence 是可选字段，不校验路径存在性）
  const evidence = { elements: 0, elementTotal: 0, relations: 0, relationTotal: 0, docs: 0 };

  for (const file of files) {
    const display = relative(process.cwd(), file) || file;
    let loaded: { doc?: CovenantDoc; findings: Finding[] };
    try {
      loaded = loadDoc(file);
    } catch (e) {
      console.error(`读取失败 ${display}: ${(e as Error).message}`);
      return EXIT.TOOL_FAILURE;
    }
    const findings = loaded.findings;
    report.push({ file: display, findings });
    if (loaded.doc) {
      const els = loaded.doc.elements ?? [];
      const rels = loaded.doc.relations ?? [];
      const elWithEvidence = els.filter((el) => (el.evidence ?? []).length > 0).length;
      const relWithEvidence = rels.filter((rel) => (rel.evidence ?? []).length > 0).length;
      evidence.elements += elWithEvidence;
      evidence.elementTotal += els.length;
      evidence.relations += relWithEvidence;
      evidence.relationTotal += rels.length;
      if (elWithEvidence + relWithEvidence > 0) evidence.docs += 1;
    }
    for (const f of findings) {
      if (f.severity === "error") errors++;
      else if (f.severity === "warning") warnings++;
    }
  }

  if (flags.json) {
    console.log(
      JSON.stringify({ version: VERSION, scanned: files.length, errors, warnings, evidence, report }, null, 2),
    );
  } else {
    console.log(`covenant check v${VERSION}`);
    console.log(`scanned: ${files.length} file${files.length === 1 ? "" : "s"}`);
    for (const { file, findings } of report) {
      if (findings.length === 0) {
        console.log(`  OK    ${file}`);
        continue;
      }
      console.log(`  ${file}`);
      for (const f of findings) console.log(renderFinding(f));
    }
    console.log(`result: ${errors} error${errors === 1 ? "" : "s"}, ${warnings} warning${warnings === 1 ? "" : "s"}`);
    console.log(
      `evidence: ${evidence.elements}/${evidence.elementTotal} elements, ${evidence.relations}/${evidence.relationTotal} relations (docs: ${evidence.docs})`,
    );
  }

  if (errors > 0) return EXIT.ERROR;
  if (warnings > 0 && flags.strict) return EXIT.WARNING_STRICT;
  return EXIT.OK;
}

function cmdRender(args: string[], out?: string, viewId?: string): number {
  const input = args[0];
  if (!input) {
    console.error("render 需要输入文件\n");
    console.error(usage());
    return EXIT.TOOL_FAILURE;
  }
  const file = resolve(input);

  let doc: CovenantDoc;
  let findings: Finding[];
  try {
    const loaded = loadDoc(file);
    findings = loaded.findings;
    if (!loaded.doc) {
      for (const f of findings) console.error(renderFinding(f));
      return EXIT.ERROR;
    }
    doc = loaded.doc;
  } catch (e) {
    console.error(`读取失败 ${input}: ${(e as Error).message}`);
    return EXIT.TOOL_FAILURE;
  }

  const errors = findings.filter((f) => f.severity === "error");
  if (errors.length > 0) {
    console.error("拒绝渲染：先修正以下校验错误");
    for (const f of errors) console.error(renderFinding(f));
    return EXIT.ERROR;
  }

  const views = doc.views ?? [];
  const view = viewId ? views.find((v) => v.id === viewId) : views[0];
  if (viewId && !view) {
    console.error(`找不到视图 "${viewId}"（可用：${views.map((v) => v.id).join(", ") || "无"}）`);
    return EXIT.TOOL_FAILURE;
  }
  const selection = selectView(doc, view);
  const result = layout(doc, {
    direction: view?.layout?.direction,
    rankGap: view?.layout?.spacing?.rank,
    nodeGap: view?.layout?.spacing?.node,
    pins: view?.layout?.pins,
    includeIds: selection.elementIds,
    includeRelationIds: selection.relationIds,
  });
  const svg = renderSvg(doc, result, { title: view?.title ?? doc.meta?.title, view });

  const outPath = out ? resolve(out) : file.replace(/\.cvn(\.yaml)?$/, ".svg");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, svg, "utf8");
  console.log(
    `rendered ${relative(process.cwd(), outPath)}  (${svg.length} bytes, ${result.width}×${result.height}, ${Object.keys(result.nodes).length} nodes, ${result.edges.length} edges)`,
  );
  return EXIT.OK;
}

function cmdBuild(args: string[], out?: string): number {
  if (args.length === 0) {
    console.error("build 需要目标目录或文件\n");
    console.error(usage());
    return EXIT.TOOL_FAILURE;
  }
  let files: string[];
  try {
    files = [...new Set(args.flatMap(collectFiles))].sort();
  } catch (e) {
    console.error(`无法读取目标: ${(e as Error).message}`);
    return EXIT.TOOL_FAILURE;
  }
  if (files.length === 0) {
    console.error("build: 没有找到 .cvn.yaml 文件");
    return EXIT.GATE_FAILURE;
  }

  const views: DocView[] = [];
  for (const file of files) {
    const display = relative(process.cwd(), file) || file;
    let loaded: { doc?: CovenantDoc; findings: Finding[] };
    try {
      loaded = loadDoc(file);
    } catch (e) {
      console.error(`读取失败 ${display}: ${(e as Error).message}`);
      return EXIT.TOOL_FAILURE;
    }
    const errors = loaded.findings.filter((f) => f.severity === "error");
    if (!loaded.doc || errors.length > 0) {
      console.error(`拒绝构建 ${display}：先修正校验错误`);
      for (const f of errors) console.error(renderFinding(f));
      return EXIT.ERROR;
    }
    const docViews = loaded.doc.views ?? [];
    const effectiveViews = docViews.length > 0 ? docViews : [undefined];
    for (const v of effectiveViews) {
      const selection = selectView(loaded.doc, v);
      const result = layout(loaded.doc, {
        direction: v?.layout?.direction,
        rankGap: v?.layout?.spacing?.rank,
        nodeGap: v?.layout?.spacing?.node,
        pins: v?.layout?.pins,
        includeIds: selection.elementIds,
        includeRelationIds: selection.relationIds,
      });
      views.push({
        doc: loaded.doc,
        viewId: v?.id,
        viewTitle: v?.title,
        svg: renderSvg(loaded.doc, result, {
          title: v?.title ?? loaded.doc.meta?.title,
          view: v, // 与 cmdRender/cmdBundle 一致：preset（如 junction）必须随视图传入
          showBadges: false, // 角标由浏览器端统一绘制（含新加的批注）
        }),
        layout: result,
      });
    }
  }

  const html = renderHtml(views, { title: views[0]?.doc.meta?.title });
  const outPath = resolve(out ?? "dist/covenant.html");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html, "utf8");
  console.log(
    `built ${relative(process.cwd(), outPath)}  (${views.length} docs, ${(html.length / 1024).toFixed(1)} KB)`,
  );
  return EXIT.OK;
}

/** bundle：把一套契约图打成文件夹站点（index.html + manifest.json + views/*.svg + annotations.json） */
/** bundle：把一套契约图打成"文件夹站点"（交互版：缩放/拖拽/点选/批注面板） */
/** bundle：文件夹打包（index.html = 主查看器同款体验，另存 manifest/annotations/views） */
function cmdBundle(args: string[], out?: string): number {
  if (args.length === 0) {
    console.error("bundle 需要目标目录或文件\n");
    console.error(usage());
    return EXIT.TOOL_FAILURE;
  }
  let files: string[];
  try {
    files = [...new Set(args.flatMap(collectFiles))].sort();
  } catch (e) {
    console.error(`无法读取目标: ${(e as Error).message}`);
    return EXIT.TOOL_FAILURE;
  }
  if (files.length === 0) {
    console.error("bundle: 没有找到 .cvn.yaml 文件");
    return EXIT.GATE_FAILURE;
  }
  const outDir = resolve(out ?? "dist/site");
  mkdirSync(resolve(outDir, "views"), { recursive: true });

  interface BundleAnnotation {
    id: string;
    status: string;
    severity: string;
    type: string;
    title: string;
    body: string;
    author: string;
    target: unknown;
  }
  interface BundleDoc {
    id: string;
    viewId?: string;
    title: string;
    svg: string;
    annotations: BundleAnnotation[];
  }
  const docs: BundleDoc[] = [];
  const views: DocView[] = [];

  for (const file of files) {
    const display = relative(process.cwd(), file) || file;
    let loaded: { doc?: CovenantDoc; findings: Finding[] };
    try {
      loaded = loadDoc(file);
    } catch (e) {
      console.error(`读取失败 ${display}: ${(e as Error).message}`);
      return EXIT.TOOL_FAILURE;
    }
    const errors = loaded.findings.filter((f) => f.severity === "error");
    if (!loaded.doc || errors.length > 0) {
      console.error(`拒绝打包 ${display}：先修正校验错误`);
      for (const f of errors) console.error(renderFinding(f));
      return EXIT.ERROR;
    }
    const doc = loaded.doc;
    const docViews = doc.views ?? [];
    for (const v of docViews.length > 0 ? docViews : [undefined]) {
      const selection = selectView(doc, v);
      const result = layout(doc, {
        direction: v?.layout?.direction,
        rankGap: v?.layout?.spacing?.rank,
        nodeGap: v?.layout?.spacing?.node,
        pins: v?.layout?.pins,
        includeIds: selection.elementIds,
        includeRelationIds: selection.relationIds,
      });
      // 与主查看器一致：角标由浏览器端绘制
      const svg = renderSvg(doc, result, {
        title: v?.title ?? doc.meta?.title,
        view: v,
        showBadges: false,
      });
      views.push({ doc, viewId: v?.id, viewTitle: v?.title, svg, layout: result });
      const safe = `${doc.id}${v?.id ? "." + v.id : ""}`.replace(/[^a-zA-Z0-9._-]+/g, "-");
      writeFileSync(resolve(outDir, "views", `${safe}.svg`), svg, "utf8");
      docs.push({
        id: doc.id,
        viewId: v?.id,
        title: v?.title ?? doc.meta?.title ?? doc.id,
        svg: `views/${safe}.svg`,
        annotations: (doc.annotations ?? []).map((a) => ({
          id: a.id,
          status: a.status,
          severity: a.severity,
          type: a.type,
          title: a.title,
          body: a.body ?? "",
          author: a.author,
          target: a.target,
        })),
      });
    }
  }

  // index.html：直接复用主查看器（悬浮窗/钉住/批注编辑/删除撤销/缩放拖拽全部一致）
  const html = renderHtml(views, { title: views[0]?.doc.meta?.title });
  writeFileSync(resolve(outDir, "index.html"), html, "utf8");
  writeFileSync(
    resolve(outDir, "manifest.json"),
    JSON.stringify({ version: 3, generatedAt: new Date().toISOString(), entries: docs }, null, 2),
    "utf8",
  );
  writeFileSync(
    resolve(outDir, "annotations.json"),
    JSON.stringify(docs.map((d) => ({ doc: d.id, view: d.viewId, annotations: d.annotations })), null, 2),
    "utf8",
  );
  console.log(
    `bundled ${relative(process.cwd(), outDir)}  (${views.length} views; index.html=主查看器同款 + views/*.svg + manifest/annotations)`,
  );
  return EXIT.OK;
}
function cmdApply(args: string[], by?: string, dryRun?: boolean): number {
  const [docArg, patchArg] = args;
  if (!docArg || !patchArg) {
    console.error("apply 需要 <doc.cvn.yaml> <patch.json>\n");
    console.error(usage());
    return EXIT.TOOL_FAILURE;
  }
  const docPath = resolve(docArg);
  const patchPath = resolve(patchArg);

  let patchText: string;
  try {
    patchText = readFileSync(patchPath, "utf8");
  } catch (e) {
    console.error(`无法读取补丁: ${(e as Error).message}`);
    return EXIT.TOOL_FAILURE;
  }
  const parsed = parsePatch(patchText, patchPath);
  if (!parsed.patch) {
    for (const f of parsed.findings) console.error(renderFinding(f));
    return EXIT.ERROR;
  }

  // 写盘前强制过门禁（信任边界：AI 不得冒充人、不得写 ai_hint、目标必须存在）
  const actorRaw = by ?? "human:you";
  const actor = parseActor(actorRaw);
  if (!actor) {
    console.error(`--by 必须是 human:<id> 或 ai:<name>，实际 "${actorRaw}"`);
    return EXIT.TOOL_FAILURE;
  }
  let docForGate: CovenantDoc;
  try {
    const docParsed = parseDocument(readFileSync(docPath, "utf8"), docPath);
    if (!docParsed.doc) {
      for (const f of docParsed.findings) console.error(renderFinding(f));
      return EXIT.ERROR;
    }
    docForGate = docParsed.doc;
  } catch (e) {
    console.error(`无法读取文档: ${(e as Error).message}`);
    return EXIT.TOOL_FAILURE;
  }
  const gateFindings = gatePatch(docForGate, parsed.patch, { actor });
  if (gateFindings.length > 0) {
    console.error("补丁未通过门禁，拒绝应用（未写入任何文件）");
    for (const f of gateFindings) console.error(renderFinding(f));
    return EXIT.ERROR;
  }

  const result = applyPatch(docPath, parsed.patch, {
    by: actorRaw,
    dryRun: Boolean(dryRun),
  });
  if (!result.ok) {
    for (const f of result.findings) console.error(renderFinding(f));
    return EXIT.ERROR;
  }
  for (const f of result.findings) {
    if (f.severity !== "error") console.log(renderFinding(f));
  }
  console.log(
    `${dryRun ? "[dry-run] 将应用" : "applied"} ${result.applied} annotation(s) → ${relative(process.cwd(), docPath)}  (rev ${parsed.patch.base_rev} → ${result.newRev})`,
  );
  if (dryRun) console.log("dry-run：未写入磁盘");
  return EXIT.OK;
}

function cmdPatchCheck(args: string[], actorRaw?: string, jsonOut?: boolean): number {
  const [docArg, patchArg] = args;
  if (!docArg || !patchArg) {
    console.error("patch-check 需要 <doc.cvn.yaml> <patch.json>\n");
    console.error(usage());
    return EXIT.TOOL_FAILURE;
  }
  const docPath = resolve(docArg);
  const patchPath = resolve(patchArg);

  let docText: string;
  let patchText: string;
  try {
    docText = readFileSync(docPath, "utf8");
    patchText = readFileSync(patchPath, "utf8");
  } catch (e) {
    console.error(`无法读取输入: ${(e as Error).message}`);
    return EXIT.TOOL_FAILURE;
  }

  const parsedDoc = parseDocument(docText, docPath);
  if (!parsedDoc.doc) {
    for (const f of parsedDoc.findings) console.error(renderFinding(f));
    return EXIT.ERROR;
  }
  const parsedPatch = parsePatch(patchText, patchPath);
  if (!parsedPatch.patch) {
    for (const f of parsedPatch.findings) console.error(renderFinding(f));
    return EXIT.ERROR;
  }

  const raw = actorRaw ?? "human:you";
  const actor = parseActor(raw);
  if (!actor) {
    console.error(`--actor 必须是 human:<id> 或 ai:<name>，实际 "${raw}"`);
    return EXIT.TOOL_FAILURE;
  }

  const findings = gatePatch(parsedDoc.doc, parsedPatch.patch, { actor });

  if (jsonOut) {
    console.log(
      JSON.stringify(
        {
          ok: findings.length === 0,
          actor: raw,
          doc: parsedDoc.doc.id,
          base_rev: parsedPatch.patch.base_rev,
          findings,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(
      `covenant patch-check  actor=${raw}  doc=${parsedDoc.doc.id}  base_rev=${parsedPatch.patch.base_rev}`,
    );
    for (const f of findings) console.log(renderFinding(f));
    console.log(
      findings.length === 0
        ? "gate: PASS"
        : `gate: FAIL（${findings.length} 个问题，未写入任何文件）`,
    );
  }
  return findings.length === 0 ? EXIT.OK : EXIT.ERROR;
}

function cmdDiff(args: string[], jsonOut?: boolean): number {
  const [aArg, bArg] = args;
  if (!aArg || !bArg) {
    console.error("diff 需要 <a.cvn.yaml> <b.cvn.yaml>\n");
    console.error(usage());
    return EXIT.TOOL_FAILURE;
  }
  const load = (p: string): CovenantDoc => {
    const abs = resolve(p);
    const parsed = parseDocument(readFileSync(abs, "utf8"), abs);
    if (!parsed.doc) {
      throw new Error(parsed.findings.map((f) => f.message).join("; "));
    }
    return parsed.doc;
  };
  let left: CovenantDoc;
  let right: CovenantDoc;
  try {
    left = load(aArg);
    right = load(bArg);
  } catch (e) {
    console.error(`无法解析输入: ${(e as Error).message}`);
    return EXIT.TOOL_FAILURE;
  }

  const result = diffDocs(left, right);
  if (jsonOut) {
    console.log(
      JSON.stringify({ left: left.id, right: right.id, ...result }, null, 2),
    );
  } else {
    console.log(formatDiff(result, relative(process.cwd(), resolve(aArg)), relative(process.cwd(), resolve(bArg))));
  }
  return result.needsApproval ? EXIT.ERROR : EXIT.OK;
}

function cmdIndex(jsonOut?: boolean, write?: boolean): number {
  const root = process.cwd();
  const indexPath = join(root, "arch", "index.yaml");

  if (write) {
    const r = writeIndex(root, indexPath);
    console.log(`index: 更新 ${r.updated} 条 source_sha256`);
    if (r.missing.length > 0) {
      console.log(`仍缺 ${r.missing.length} 条条目（F/R/A/S 需人工/Agent 撰写）：`);
      for (const m of r.missing) console.log(`  missing: ${m}`);
      return EXIT.ERROR;
    }
    return EXIT.OK;
  }

  const findings = checkIndex(root, indexPath);
  if (jsonOut) {
    console.log(JSON.stringify({ ok: findings.length === 0, findings }, null, 2));
  } else if (findings.length === 0) {
    console.log("index: PASS（I1–I3 全部通过）");
  } else {
    for (const f of findings) console.log(renderFinding(f));
    console.log(`index: FAIL（${findings.length} 个问题）`);
  }
  return findings.length === 0 ? EXIT.OK : EXIT.ERROR;
}

interface AiFlags {
  target?: string;
  title?: string;
  body?: string;
  aiType?: string;
  aiSeverity?: string;
  intent?: string;
  actor?: string;
  out?: string;
  json?: boolean;
}

function cmdAi(args: string[], flags: AiFlags): number {
  const [sub, docArg] = args;
  if (!sub || !docArg) {
    console.error("ai 需要子命令与文档（brief | annotate）\n");
    console.error(usage());
    return EXIT.TOOL_FAILURE;
  }
  let doc: CovenantDoc;
  try {
    const parsed = parseDocument(readFileSync(resolve(docArg), "utf8"), docArg);
    if (!parsed.doc) {
      for (const f of parsed.findings) console.error(renderFinding(f));
      return EXIT.ERROR;
    }
    doc = parsed.doc;
  } catch (e) {
    console.error(`读取失败 ${docArg}: ${(e as Error).message}`);
    return EXIT.TOOL_FAILURE;
  }

  if (sub === "brief") {
    const brief = buildBrief(doc);
    console.log(flags.json ? JSON.stringify(brief, null, 2) : formatBrief(brief));
    return EXIT.OK;
  }

  if (sub === "annotate") {
    if (!flags.target || !flags.title) {
      console.error("annotate 需要 --target <id> 与 --title <文字>");
      return EXIT.TOOL_FAILURE;
    }
    const actor = flags.actor ?? "ai:claude";
    const r = buildAnnotationPatch({
      doc,
      actor,
      targetId: flags.target,
      title: flags.title,
      body: flags.body,
      type: flags.aiType,
      severity: flags.aiSeverity,
      intent: flags.intent,
    });
    if (!r.patch) {
      for (const f of r.findings) console.error(renderFinding(f));
      return EXIT.ERROR;
    }
    const out = resolve(flags.out ?? `dist/${doc.id.replace(/\//g, "-")}-ai.patch.json`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(r.patch, null, 2)}\n`, "utf8");
    console.log(
      `drafted patch → ${relative(process.cwd(), out)}  (target=${r.targetKind}/${flags.target}, base_rev=${r.patch.base_rev})`,
    );
    return EXIT.OK;
  }

  console.error(`未知 ai 子命令: ${sub}\n`);
  console.error(usage());
  return EXIT.TOOL_FAILURE;
}

function cmdAdr(args: string[], jsonOut?: boolean): number {
  const dir = args[0] ?? "docs/design/adr";
  const result = checkAdrDir(resolve(dir));

  // 跨仓库：accepted ADR 必须被文档 links.kind=adr 引用
  const docs: CovenantDoc[] = [];
  for (const target of ["arch", "examples"]) {
    try {
      for (const file of collectFiles(target)) {
        const loaded = loadDoc(file);
        if (loaded.doc) docs.push(loaded.doc);
      }
    } catch {
      // 目录不存在时忽略（例如被裁剪的检出）
    }
  }
  const refs = collectAdrRefs(docs);
  const unreferenced = checkAcceptedAdrReferenced(result.records, refs);
  const findings = [...result.findings, ...unreferenced];

  if (jsonOut) {
    console.log(
      JSON.stringify({ ok: findings.length === 0, count: result.records.length, findings }, null, 2),
    );
    return findings.length === 0 ? EXIT.OK : EXIT.ERROR;
  }
  for (const r of result.records) {
    const errs = r.findings.filter((f) => f.severity === "error");
    if (errs.length === 0) {
      console.log(`  OK    ${relative(process.cwd(), r.file)}`);
    } else {
      for (const f of errs) console.log(renderFinding(f));
    }
  }
  for (const f of unreferenced) console.log(renderFinding(f));
  console.log(
    findings.length === 0
      ? `adr: PASS（${result.records.length} 条）`
      : `adr: FAIL（${findings.length} 个问题）`,
  );
  return findings.length === 0 ? EXIT.OK : EXIT.ERROR;
}

async function cmdServe(
  args: string[],
  opts: { host?: string; port?: number; edit?: boolean; open?: boolean },
): Promise<number> {
  const target = resolve(args[0] ?? "dist");
  if (!existsSync(target)) {
    console.error(`路径不存在：${target}`);
    console.error("先构建产物：pnpm build:html examples -o dist/covenant.html");
    return EXIT.TOOL_FAILURE;
  }
  const isFile = statSync(target).isFile();
  const dir = isFile ? dirname(target) : target;
  let defaultFile: string | undefined;
  if (isFile) {
    defaultFile = relative(dir, target);
  } else if (!existsSync(join(dir, "index.html"))) {
    const htmls = readdirSync(dir).filter((f) => f.endsWith(".html")).sort();
    if (htmls.includes("covenant.html")) defaultFile = "covenant.html";
    else if (htmls.length === 1) defaultFile = htmls[0];
    else if (htmls.length > 1) {
      console.log(`提示: ${dir} 有多个 HTML，默认入口未确定；可用 "covenant serve <文件>" 指定。`);
    }
  }
  if (opts.port !== undefined && (!Number.isInteger(opts.port) || opts.port <= 0)) {
    console.error(`--port 必须是正整数（收到 ${String(opts.port)}）`);
    return EXIT.TOOL_FAILURE;
  }

  const token = opts.edit ? randomBytes(18).toString("hex") : undefined;
  try {
    const handle = await startServer({
      dir,
      defaultFile,
      host: opts.host,
      port: opts.port ?? 4173,
      edit: token ? { token, root: process.cwd() } : undefined,
    });
    console.log(`covenant serve → ${handle.url}`);
    console.log(`  root: ${dir}${defaultFile ? `  (entry: ${defaultFile})` : ""}`);
    if (token) {
      console.log("  编辑态已开启：页面可「预览并写回」（human-only，写回前先看 diff）");
      console.log("  安全：仅本机；token 已注入页面；写回自动备份到 .audit/；Ctrl+C 结束");
    } else {
      console.log("  只读托管；Ctrl+C 停止");
    }
    if (opts.open) openBrowser(handle.url);
    process.on("SIGINT", () => {
      void handle.close().then(() => process.exit(EXIT.OK));
    });
    return EXIT.OK;
  } catch (e) {
    console.error(`无法启动服务: ${(e as Error).message}`);
    return EXIT.TOOL_FAILURE;
  }
}

function openBrowser(url: string): void {
  const cmd = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(cmd, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    console.log(`（无法自动打开浏览器，请手动访问 ${url}）`);
  }
}
function cmdDoctor(jsonOut?: boolean): number {
  const report = runDoctor(process.cwd());
  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
    return report.ok ? EXIT.OK : EXIT.ERROR;
  }
  for (const r of report.results) {
    console.log(`  ${r.status.toUpperCase().padEnd(4)} ${r.id.padEnd(11)} ${r.message}`);
    if (r.fix) console.log(`         fix: ${r.fix}`);
  }
  const fails = report.results.filter((r) => r.status === "fail").length;
  const warns = report.results.filter((r) => r.status === "warn").length;
  console.log(
    `doctor: ${report.ok ? "PASS" : "FAIL"}（${report.results.length} 项，${fails} fail / ${warns} warn）`,
  );
  return report.ok ? EXIT.OK : EXIT.ERROR;
}

function cmdEdit(
  args: string[],
  flags: { actor?: string; out?: string; diff: boolean; accept: boolean },
): number {
  const [docArg, editsArg] = args;
  if (!docArg || !editsArg) {
    console.error("edit 需要 <doc.cvn.yaml> <edits.json>\n");
    console.error(usage());
    return EXIT.TOOL_FAILURE;
  }
  const editsPath = resolve(editsArg);
  let editsText: string;
  try {
    editsText = readFileSync(editsPath, "utf8");
  } catch (e) {
    console.error(`无法读取编辑文件: ${(e as Error).message}`);
    return EXIT.TOOL_FAILURE;
  }

  const result = performEdit({
    docPath: docArg,
    editsText,
    accept: flags.accept,
    actor: flags.actor,
    outPath: flags.out,
  });

  if (!result.ok) {
    for (const f of result.findings) console.error(renderFinding(f));
    console.error(result.message ?? "编辑失败");
    return EXIT.ERROR;
  }
  if (flags.diff) console.log(result.diff || "（无差异）");
  if (flags.accept) {
    console.log(`edited ${relative(process.cwd(), resolve(docArg))}  rev → ${result.rev}  backup: ${relative(process.cwd(), result.backup!)}`);
  } else {
    console.log(`wrote ${relative(process.cwd(), result.out!)}  changed=${result.changed}`);
    console.log("原文件未修改。审查 diff 后合入：");
    console.log(`  covenant edit ${docArg} ${editsArg} --accept`);
  }
  return EXIT.OK;
}
function main(): number {
  const command = process.argv[2] ?? "";
  const rest = process.argv.slice(3);

  if (!command || command === "--help" || command === "-h") {
    console.log(usage());
    return command ? EXIT.OK : EXIT.TOOL_FAILURE;
  }

  const positional: string[] = [];
  let strict = false;
  let json = false;
  let out: string | undefined;
  let by: string | undefined;
  let actor: string | undefined;
  let viewId: string | undefined;
  let writeIndexFlag = false;
  let dryRun = false;
  let editDiff = false;
  let editAccept = false;
  let serveEdit = false;
  let serveOpen = false;
  let servePort: number | undefined;
  let serveHost: string | undefined;
  let aiTarget: string | undefined;
  let aiTitle: string | undefined;
  let aiBody: string | undefined;
  let aiType: string | undefined;
  let aiSeverity: string | undefined;
  let aiIntent: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i]!;
    if (arg === "--strict") strict = true;
    else if (arg === "--json") json = true;
    else if (arg === "--dry-run") dryRun = true;
    else if (arg === "--write") writeIndexFlag = true;
    else if (arg === "-o" || arg === "--out") out = rest[++i];
    else if (arg === "--by") by = rest[++i];
    else if (arg === "--actor") actor = rest[++i];
    else if (arg === "--view") viewId = rest[++i];
    else if (arg === "--diff") editDiff = true;
    else if (arg === "--accept") editAccept = true;
    else if (arg === "--edit") serveEdit = true;
    else if (arg === "--open") serveOpen = true;
    else if (arg === "--port") servePort = Number(rest[++i]);
    else if (arg === "--host") serveHost = rest[++i];
    else if (arg === "--target") aiTarget = rest[++i];
    else if (arg === "--title") aiTitle = rest[++i];
    else if (arg === "--body") aiBody = rest[++i];
    else if (arg === "--type") aiType = rest[++i];
    else if (arg === "--severity") aiSeverity = rest[++i];
    else if (arg === "--intent") aiIntent = rest[++i];
    else if (arg.startsWith("-")) {
      console.error(`未知参数: ${arg}`);
      return EXIT.TOOL_FAILURE;
    } else positional.push(arg);
  }

  switch (command) {
    case "check":
      return cmdCheck(positional, { strict, json });
    case "render":
      return cmdRender(positional, out, viewId);
    case "build":
      return cmdBuild(positional, out);
    case "bundle":
      return cmdBundle(positional, out);
    case "apply":
      return cmdApply(positional, by, dryRun);
    case "patch-check":
      return cmdPatchCheck(positional, actor, json);
    case "diff":
      return cmdDiff(positional, json);
    case "index":
      return cmdIndex(json, writeIndexFlag);
    case "adr":
      return cmdAdr(positional, json);
    case "edit":
      return cmdEdit(positional, { actor, out, diff: editDiff, accept: editAccept });
    case "doctor":
      return cmdDoctor(json);
    case "serve":
      void cmdServe(positional, { host: serveHost, port: servePort, edit: serveEdit, open: serveOpen }).then((code) => {
        if (code !== EXIT.OK) process.exit(code);
      });
      return EXIT_SERVE;
    case "ai":
      return cmdAi(positional, {
        target: aiTarget,
        title: aiTitle,
        body: aiBody,
        aiType,
        aiSeverity,
        intent: aiIntent,
        actor,
        out,
        json,
      });
    default:
      console.error(`未知命令: ${command}\n`);
      console.error(usage());
      return EXIT.TOOL_FAILURE;
  }
}

const exitCode = main();
if (exitCode !== EXIT_SERVE) process.exit(exitCode);
