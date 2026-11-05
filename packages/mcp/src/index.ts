/**
 * Covenant MCP server（stdio，JSON-RPC 2.0）。
 *
 * 目标：陌生 Agent 无需读 11 篇文档，一次 `tools/list` 就知道怎么校验、出图、提补丁。
 * 不引第三方 MCP SDK：协议面很小（initialize / tools/list / tools/call），减少依赖与体积。
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { COVENANT_VERSION, parseDocument } from "@covenant/core";
import type { CovenantDoc, Finding } from "@covenant/core";
import { checkDocument } from "@covenant/validate";
import { layout, selectView } from "@covenant/layout";
import { renderSvg } from "@covenant/render";
import { renderHtml } from "@covenant/render";
import type { DocView } from "@covenant/render";
import { applyPatch, gatePatch, parseActor, parsePatch } from "@covenant/patch";
import { diffDocs } from "@covenant/diff";
import { checkIndex, writeIndex } from "@covenant/indexer";
import { buildBrief } from "@covenant/ai";

export const PROTOCOL_VERSION = "2024-11-05";
export const SERVER_INFO = { name: "covenant", version: COVENANT_VERSION };

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const ok = (id: JsonRpcRequest["id"], result: unknown): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id: id ?? null,
  result,
});
const fail = (
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  data?: unknown,
): JsonRpcResponse => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message, data } });

/* ------------------------------ 工具实现 ------------------------------ */

function loadDoc(file: string): { doc?: CovenantDoc; findings: Finding[] } {
  const abs = resolve(file);
  const parsed = parseDocument(readFileSync(abs, "utf8"), relative(process.cwd(), abs));
  if (!parsed.doc) return { findings: parsed.findings };
  return { doc: parsed.doc, findings: checkDocument(parsed.doc, relative(process.cwd(), abs)) };
}

function collectDocs(target: string): string[] {
  const abs = resolve(target);
  const st = statSync(abs);
  if (st.isFile()) return [abs];
  const out: string[] = [];
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const child = join(abs, entry.name);
    if (entry.isDirectory()) out.push(...collectDocs(child));
    else if (entry.name.endsWith(".cvn.yaml") || entry.name.endsWith(".cvn")) out.push(child);
  }
  return out;
}

function toolCheck(args: { paths?: string[] }): unknown {
  const targets = args.paths ?? ["arch", "examples"];
  const findings: Finding[] = [];
  let scanned = 0;
  for (const target of targets) {
    for (const file of collectDocs(target).sort()) {
      scanned++;
      try {
        const loaded = loadDoc(file);
        findings.push(...loaded.findings);
      } catch (e) {
        findings.push({
          code: "mcp/io",
          level: "L0",
          severity: "error",
          message: `${file}: ${(e as Error).message}`,
        });
      }
    }
  }
  const errors = findings.filter((f) => f.severity === "error").length;
  return { ok: errors === 0, scanned, errors, findings };
}

function toolReadDoc(args: { doc?: string }): unknown {
  const file = args.doc;
  if (!file) throw new Error("doc 必填");
  const loaded = loadDoc(file);
  if (!loaded.doc) return { ok: false, findings: loaded.findings };
  const d = loaded.doc;
  return {
    ok: true,
    doc: d.id,
    profile: d.profile,
    title: d.meta?.title,
    purpose: d.meta?.purpose,
    rev: d.meta?.rev ?? 0,
    elements: (d.elements ?? []).map((e) => ({
      id: e.id,
      kind: e.kind,
      name: e.name,
      tech: e.tech,
      summary: e.summary,
    })),
    relations: (d.relations ?? []).map((r) => ({
      id: r.id,
      kind: r.kind,
      from: r.from,
      to: r.to,
      summary: r.summary,
    })),
    annotations: (d.annotations ?? []).map((a) => ({
      id: a.id,
      target: a.target,
      status: a.status,
      severity: a.severity,
      title: a.title,
      ai_hint: a.ai_hint,
    })),
  };
}

function toolRender(args: { doc?: string; view?: string; out?: string }): unknown {
  if (!args.doc) throw new Error("doc 必填");
  const loaded = loadDoc(args.doc);
  if (!loaded.doc) return { ok: false, findings: loaded.findings };
  const doc = loaded.doc;
  const views = doc.views ?? [];
  const view = args.view ? views.find((v) => v.id === args.view) : views[0];
  if (args.view && !view) throw new Error(`找不到视图 ${args.view}`);
  const sel = selectView(doc, view);
  const result = layout(doc, {
    direction: view?.layout?.direction,
    rankGap: view?.layout?.spacing?.rank,
    nodeGap: view?.layout?.spacing?.node,
    pins: view?.layout?.pins,
    includeIds: sel.elementIds,
    includeRelationIds: sel.relationIds,
  });
  const svg = renderSvg(doc, result, { title: view?.title ?? doc.meta?.title });
  const out = resolve(args.out ?? args.doc.replace(/\.cvn(\.yaml)?$/, ".svg"));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, svg, "utf8");
  return {
    ok: true,
    out: relative(process.cwd(), out),
    bytes: svg.length,
    width: result.width,
    height: result.height,
    nodes: Object.keys(result.nodes).length,
    edges: result.edges.length,
  };
}

function toolBuild(args: { target?: string; out?: string }): unknown {
  const target = args.target ?? "arch";
  const views: DocView[] = [];
  for (const file of collectDocs(target).sort()) {
    const loaded = loadDoc(file);
    if (!loaded.doc) return { ok: false, findings: loaded.findings };
    const doc = loaded.doc;
    const docViews = doc.views ?? [];
    for (const v of docViews.length > 0 ? docViews : [undefined]) {
      const sel = selectView(doc, v);
      const result = layout(doc, {
        direction: v?.layout?.direction,
        rankGap: v?.layout?.spacing?.rank,
        nodeGap: v?.layout?.spacing?.node,
        pins: v?.layout?.pins,
        includeIds: sel.elementIds,
        includeRelationIds: sel.relationIds,
      });
      views.push({
        doc,
        viewId: v?.id,
        viewTitle: v?.title,
        svg: renderSvg(doc, result, { title: v?.title ?? doc.meta?.title, showBadges: false }),
        layout: result,
      });
    }
  }
  if (views.length === 0) return { ok: false, error: "没有找到契约文档" };
  const html = renderHtml(views, { title: views[0]?.doc.meta?.title });
  const out = resolve(args.out ?? "dist/covenant.html");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html, "utf8");
  return { ok: true, out: relative(process.cwd(), out), bytes: html.length, views: views.length };
}

function toolPatchCheck(args: { doc?: string; patch?: string; actor?: string }): unknown {
  if (!args.doc || !args.patch) throw new Error("doc 与 patch 必填");
  const loaded = loadDoc(args.doc);
  if (!loaded.doc) return { ok: false, findings: loaded.findings };
  const parsed = parsePatch(readFileSync(resolve(args.patch), "utf8"));
  if (!parsed.patch) return { ok: false, findings: parsed.findings };
  const actor = parseActor(args.actor ?? "human:you");
  if (!actor) throw new Error("actor 必须是 human:<id> 或 ai:<name>");
  const findings = gatePatch(loaded.doc, parsed.patch, { actor });
  return { ok: findings.length === 0, findings };
}

function toolApply(args: {
  doc?: string;
  patch?: string;
  by?: string;
  dryRun?: boolean;
}): unknown {
  if (!args.doc || !args.patch) throw new Error("doc 与 patch 必填");
  const loaded = loadDoc(args.doc);
  if (!loaded.doc) return { ok: false, findings: loaded.findings };
  const parsed = parsePatch(readFileSync(resolve(args.patch), "utf8"));
  if (!parsed.patch) return { ok: false, findings: parsed.findings };
  const actorRaw = args.by ?? "human:you";
  const actor = parseActor(actorRaw);
  if (!actor) throw new Error("by 必须是 human:<id> 或 ai:<name>");
  const gate = gatePatch(loaded.doc, parsed.patch, { actor });
  if (gate.length > 0) return { ok: false, findings: gate, refused: "gate" };
  const result = applyPatch(resolve(args.doc), parsed.patch, {
    by: actorRaw,
    dryRun: Boolean(args.dryRun),
  });
  return {
    ok: result.ok,
    applied: result.applied,
    newRev: result.newRev,
    dryRun: Boolean(args.dryRun),
    findings: result.findings,
  };
}

function toolDiff(args: { left?: string; right?: string }): unknown {
  if (!args.left || !args.right) throw new Error("left 与 right 必填");
  const a = loadDoc(args.left);
  const b = loadDoc(args.right);
  if (!a.doc || !b.doc) {
    return { ok: false, findings: [...a.findings, ...b.findings] };
  }
  return { ok: true, ...diffDocs(a.doc, b.doc) };
}

function toolIndex(args: { write?: boolean }): unknown {
  const root = process.cwd();
  const indexPath = join(root, "arch", "index.yaml");
  if (args.write) {
    const r = writeIndex(root, indexPath);
    return { ok: r.missing.length === 0, updated: r.updated, missing: r.missing };
  }
  const findings = checkIndex(root, indexPath);
  return { ok: findings.length === 0, findings };
}

function toolBrief(args: { doc?: string }): unknown {
  if (!args.doc) throw new Error("doc 必填");
  const loaded = loadDoc(args.doc);
  if (!loaded.doc) return { ok: false, findings: loaded.findings };
  return { ok: true, ...buildBrief(loaded.doc) };
}

/* ------------------------------ 工具清单 ------------------------------ */

export const TOOLS = [
  {
    name: "covenant_brief",
    description:
      "生成评审简报：未决批注、人给的 ai_hint、待回答的问题。AI 的推荐入口（先 brief 再决定改什么）。",
    inputSchema: {
      type: "object",
      properties: { doc: { type: "string" } },
      required: ["doc"],
    },
    handler: toolBrief,
  },
  {
    name: "covenant_check",
    description:
      "校验 .cvn.yaml 契约文档（L1 schema / L2 完整性 / L3 剖面一致性）。返回 findings 与 errors 计数。",
    inputSchema: {
      type: "object",
      properties: { paths: { type: "array", items: { type: "string" } } },
    },
    handler: toolCheck,
  },
  {
    name: "covenant_read_doc",
    description:
      "读取一份契约文档的语义投影（元素/关系/批注/ai_hint）。AI 应先读它再决定改什么。",
    inputSchema: {
      type: "object",
      properties: { doc: { type: "string" } },
      required: ["doc"],
    },
    handler: toolReadDoc,
  },
  {
    name: "covenant_render",
    description: "把文档渲染成 SVG（可指定视图），返回尺寸与节点/边数量。",
    inputSchema: {
      type: "object",
      properties: {
        doc: { type: "string" },
        view: { type: "string" },
        out: { type: "string" },
      },
      required: ["doc"],
    },
    handler: toolRender,
  },
  {
    name: "covenant_build",
    description: "生成可标注的自包含单文件 HTML（内联 SVG + 语义 JSON），双击可用。",
    inputSchema: {
      type: "object",
      properties: { target: { type: "string" }, out: { type: "string" } },
    },
    handler: toolBuild,
  },
  {
    name: "covenant_patch_check",
    description:
      "补丁门禁：AI 不得冒充 human、不得写 ai_hint、不得改状态；base_rev 必须匹配。不写盘。",
    inputSchema: {
      type: "object",
      properties: {
        doc: { type: "string" },
        patch: { type: "string" },
        actor: { type: "string" },
      },
      required: ["doc", "patch"],
    },
    handler: toolPatchCheck,
  },
  {
    name: "covenant_apply",
    description:
      "应用补丁到 .cvn.yaml（保留注释、rev+1、写前审计）。默认先过门禁，未通过则拒绝。",
    inputSchema: {
      type: "object",
      properties: {
        doc: { type: "string" },
        patch: { type: "string" },
        by: { type: "string" },
        dryRun: { type: "boolean" },
      },
      required: ["doc", "patch"],
    },
    handler: toolApply,
  },
  {
    name: "covenant_diff",
    description: "语义 diff：返回 cosmetic / material / breaking 变更；needsApproval 表示需人工批准。",
    inputSchema: {
      type: "object",
      properties: { left: { type: "string" }, right: { type: "string" } },
      required: ["left", "right"],
    },
    handler: toolDiff,
  },
  {
    name: "covenant_index",
    description: "FRAS 索引：I1–I3 校验；write=true 只更新 source_sha256（不写语义）。",
    inputSchema: {
      type: "object",
      properties: { write: { type: "boolean" } },
    },
    handler: toolIndex,
  },
] as const;

/* ------------------------------ 分发 ------------------------------ */

export function handleRequest(req: JsonRpcRequest): JsonRpcResponse | null {
  const { id, method } = req;

  if (method === "initialize") {
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
  }
  if (method === "notifications/initialized") return null;
  if (method === "ping") return ok(id, {});
  if (method === "tools/list") {
    return ok(id, {
      tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
  }
  if (method === "tools/call") {
    const params = (req.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
    const tool = TOOLS.find((t) => t.name === params.name);
    if (!tool) return fail(id, -32602, `Unknown tool: ${params.name ?? ""}`);
    try {
      const result = tool.handler((params.arguments ?? {}) as never);
      return ok(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      });
    } catch (e) {
      return ok(id, {
        content: [{ type: "text", text: `ERROR: ${(e as Error).message}` }],
        isError: true,
      });
    }
  }
  return fail(id, -32601, `Method not found: ${method ?? ""}`);
}
