/**
 * 本地静态托管 + 可选"短时编辑态服务"（方案 B）。
 *
 * 只读模式：与之前一致，只提供 dist/ 下的自包含 HTML。
 * 编辑模式（covenant serve --edit）：额外提供 POST /api/edit，页面据此"预览 diff → 确认写回"。
 *  - 仅绑定 loopback；请求必须带启动时生成的随机 token（注入页面）；
 *  - 写回走与 CLI 相同的 performEdit：human-only、checkDocument、备份、审计；
 *  - 默认不开启，编辑结束后 Ctrl+C 关闭（短时）。
 */
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { parseDocument } from "@covenant/core";
import { applyPatch, gatePatch, parseActor, parsePatch } from "@covenant/patch";
import { performEdit } from "./edit-flow";

export interface ServeOptions {
  dir: string;
  port?: number;
  host?: string;
  /** 目录下没有 index.html 时，用这个文件名响应 "/" */
  defaultFile?: string;
  /** 编辑态：token + 契约仓库根目录（用于把 doc.id 映射回 .cvn.yaml） */
  edit?: { token: string; root: string };
}

export interface ServeHandle {
  url: string;
  port: number;
  close: () => Promise<void>;
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const MAX_BODY = 4 * 1024 * 1024;

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("请求体过大"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(text);
}

/** 遍历仓库找 .cvn.yaml，按 doc.id 映射到文件（编辑态服务用；跳过产物/依赖） */
function makeDocFinder(root: string): (docId: string) => string | null {
  const cache = new Map<string, string>();
  let scanned = false;
  const skip = new Set(["node_modules", "dist", ".git", ".audit", ".pnpm-store"]);
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(p);
      } else if (entry.name.endsWith(".cvn.yaml")) {
        try {
          const parsed = parseDocument(readFileSync(p, "utf8"), p);
          if (parsed.doc?.id) cache.set(parsed.doc.id, p);
        } catch {
          /* 忽略无法解析的文件，find 时返回 null */
        }
      }
    }
  };
  return (docId: string) => {
    if (!scanned) {
      walk(root);
      scanned = true;
    }
    return cache.get(docId) ?? null;
  };
}

function injectEditScript(html: string, token: string): string {
  const cfg = JSON.stringify({ endpoint: "/api/edit", patchEndpoint: "/api/patch", token });
  const script = `<script>window.__CVN_EDIT__=${cfg};</script>`;
  const head = html.indexOf("<head>");
  if (head < 0) return script + html;
  return html.slice(0, head + 6) + script + html.slice(head + 6);
}

async function handleEditApi(
  req: IncomingMessage,
  res: ServerResponse,
  edit: NonNullable<ServeOptions["edit"]>,
  findDoc: (docId: string) => string | null,
  pathname: string,
): Promise<void> {
  // GET /api/rev?doc=<docId>：返回 .cvn.yaml 的当前 rev。
  // 目的：页面里的 doc.rev 是构建时冻结的；写回成功后服务端 rev+1，
  // 第二次写回必然 base_rev 不匹配。写入前先取真实 rev 并 rebase。
  if (pathname === "/api/rev") {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const token0 = req.headers["x-covenant-token"];
    if (typeof token0 !== "string" || token0 !== edit.token) {
      json(res, 401, { ok: false, message: "token 无效" });
      return;
    }
    const docId = url.searchParams.get("doc") ?? "";
    if (!docId) {
      json(res, 400, { ok: false, message: "缺少 doc 参数" });
      return;
    }
    const docPath = findDoc(docId);
    if (!docPath) {
      json(res, 404, { ok: false, message: `找不到文档 ${docId}` });
      return;
    }
    const parsed = parseDocument(readFileSync(docPath, "utf8"), docPath);
    if (!parsed.doc) {
      json(res, 422, { ok: false, message: "文档解析失败", findings: parsed.findings });
      return;
    }
    json(res, 200, { ok: true, doc: docId, rev: parsed.doc.meta?.rev ?? 1, path: docPath });
    return;
  }

  if (pathname !== "/api/edit" && pathname !== "/api/patch") {
    json(res, 404, { ok: false, message: "未知 API" });
    return;
  }
  const token = req.headers["x-covenant-token"];
  if (typeof token !== "string" || token !== edit.token) {
    json(res, 401, { ok: false, message: "token 无效：请从 covenant serve --edit 启动的页面操作" });
    return;
  }
  let body: {
    edits?: { doc?: string; actor?: string };
    accept?: boolean;
    patch?: Record<string, unknown>;
    actor?: string;
  };
  try {
    body = JSON.parse(await readBody(req));
  } catch (e) {
    json(res, 400, { ok: false, message: `请求体不是合法 JSON：${(e as Error).message}` });
    return;
  }
  // 批注 patch 写回：用与 CLI 相同的 gatePatch + applyPatch（human-only、审计、rev+1）
  if (pathname === "/api/patch") {
    if (!body.patch) {
      json(res, 400, { ok: false, message: "缺少 patch" });
      return;
    }
    const parsed = parsePatch(JSON.stringify(body.patch));
    if (!parsed.patch) {
      json(res, 422, { ok: false, message: "patch 非法", findings: parsed.findings });
      return;
    }
    const p = parsed.patch;
    const actor = parseActor(body.actor ?? "human:you");
    if (!actor) {
      json(res, 400, { ok: false, message: "actor 必须是 human:* 或 ai:*" });
      return;
    }
    const docPath = findDoc(p.doc);
    if (!docPath) {
      json(res, 404, { ok: false, message: `找不到文档 ${p.doc} 对应的 .cvn.yaml` });
      return;
    }
    const docParsed = parseDocument(readFileSync(docPath, "utf8"), docPath);
    if (!docParsed.doc) {
      json(res, 422, { ok: false, message: "文档解析失败", findings: docParsed.findings });
      return;
    }
    const findings = gatePatch(docParsed.doc, p, { actor });
    if (findings.some((f) => f.severity === "error")) {
      json(res, 422, { ok: false, message: "门禁拒绝", findings });
      return;
    }
    const applied = applyPatch(docPath, p, { by: actor.id });
    if (!applied.ok) {
      json(res, 422, { ok: false, message: "写回失败", findings: applied.findings });
      return;
    }
    json(res, 200, {
      ok: true,
      rev: applied.newRev,
      applied: applied.applied,
      doc: p.doc,
    });
    return;
  }

  const docId = body.edits?.doc;
  if (!docId) {
    json(res, 400, { ok: false, message: "缺少 edits.doc" });
    return;
  }
  const docPath = findDoc(docId);
  if (!docPath) {
    json(res, 404, { ok: false, message: `找不到文档 ${docId} 对应的 .cvn.yaml` });
    return;
  }
  const outcome = performEdit({
    docPath,
    editsText: JSON.stringify(body.edits),
    accept: body.accept === true,
    actor: body.edits?.actor ?? "human:you",
  });
  if (!outcome.ok) {
    json(res, 422, {
      ok: false,
      message: outcome.message ?? "编辑失败",
      findings: outcome.findings,
    });
    return;
  }
  json(res, 200, {
    ok: true,
    diff: outcome.diff,
    changed: outcome.changed,
    out: outcome.out,
    backup: outcome.backup,
    rev: outcome.rev,
  });
}

function handle(req: IncomingMessage, res: ServerResponse, options: ServeOptions, findDoc: (id: string) => string | null): void {
  const root = resolve(options.dir);
  const url = new URL(req.url ?? "/", "http://localhost");
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("bad request");
    return;
  }

  if (req.method === "POST") {
    if (options.edit && pathname.startsWith("/api/")) {
      void handleEditApi(req, res, options.edit, findDoc, pathname).catch((e: Error) => {
        if (!res.headersSent) json(res, 500, { ok: false, message: e.message });
      });
      return;
    }
    res.writeHead(405, { allow: "GET, HEAD" });
    res.end();
    return;
  }
  // GET /api/rev：读当前 rev（供页面写回前 rebase）
  if (req.method === "GET" && options.edit && pathname === "/api/rev") {
    void handleEditApi(req, res, options.edit, findDoc, pathname).catch((e: Error) => {
      if (!res.headersSent) json(res, 500, { ok: false, message: e.message });
    });
    return;
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD" });
    res.end();
    return;
  }

  const isRoot = pathname === "/";
  const rel = isRoot ? "index.html" : pathname.replace(/^\/+/, "");
  let target = resolve(root, rel);
  if (!(target === root || target.startsWith(root + sep))) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("forbidden");
    return;
  }
  if (isRoot && options.defaultFile && !existsSync(target)) target = resolve(root, options.defaultFile);
  let file = target;
  let stat;
  try {
    stat = statSync(file);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404 not found");
    return;
  }
  if (stat.isDirectory()) {
    file = join(target, "index.html");
    if (!existsSync(file)) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("404 not found");
      return;
    }
    stat = statSync(file);
  }

  const isHtml = extname(file).toLowerCase() === ".html";
  if (options.edit && isHtml) {
    const html = injectEditScript(readFileSync(file, "utf8"), options.edit.token);
    res.writeHead(200, {
      "content-type": MIME[".html"]!,
      "content-length": Buffer.byteLength(html),
      "cache-control": "no-store",
    });
    if (req.method === "HEAD") res.end();
    else res.end(html);
    return;
  }

  res.writeHead(200, {
    "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
    "content-length": stat.size,
    "cache-control": "no-store",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  createReadStream(file).pipe(res);
}

export function startServer(options: ServeOptions): Promise<ServeHandle> {
  const findDoc = options.edit ? makeDocFinder(resolve(options.edit.root)) : () => null;
  const host = options.host ?? "127.0.0.1";
  const server = createServer((req, res) => handle(req, res, options, findDoc));
  return new Promise<ServeHandle>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 4173, host, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : (options.port ?? 4173);
      resolvePromise({
        url: `http://${host}:${port}/`,
        port,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}
