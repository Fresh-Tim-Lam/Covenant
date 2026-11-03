import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer } from "./serve";
import type { ServeHandle } from "./serve";

const CVN = `covenant: "0.1"
id: t/live
profile: c4-container@1
meta:
  title: Live
  purpose: p
  non_goals: []
  rev: 1
elements:
  - id: e.a
    kind: container
    name: A
    summary: a
    tech: TS
views:
  - id: v.main
    title: 主视图
`;

let handle: ServeHandle;
let root: string;
let docPath: string;
const TOKEN = "test-token-123";

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), "covenant-edit-serve-"));
  const docs = join(root, "docs");
  mkdirSync(docs, { recursive: true });
  docPath = join(docs, "live.cvn.yaml");
  writeFileSync(docPath, CVN);
  const dist = join(root, "dist");
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, "covenant.html"), "<!DOCTYPE html><html><head></head><body>hi</body></html>");
  handle = await startServer({
    dir: dist,
    port: 0,
    defaultFile: "covenant.html",
    edit: { token: TOKEN, root },
  });
});

afterAll(async () => {
  await handle.close();
});

function post(body: unknown, token?: string, path = "api/edit"): Promise<Response> {
  return fetch(`${handle.url}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-covenant-token": token } : {}),
    },
    body: JSON.stringify(body),
  });
}

const edits = (accept: boolean) => ({
  accept,
  edits: {
    covenant: "0.1",
    doc: "t/live",
    base_rev: 1,
    actor: "human:you",
    ops: [{ op: "set", path: "/elements/e.a/name", value: "A2" }],
  },
});

describe("编辑态服务（covenant serve --edit）", () => {
  it("GET / 注入编辑配置（token + endpoint）", async () => {
    const html = await (await fetch(handle.url)).text();
    expect(html).toContain("__CVN_EDIT__");
    expect(html).toContain(TOKEN);
  });

  it("无 token / 错 token → 401", async () => {
    expect((await post(edits(false))).status).toBe(401);
    expect((await post(edits(false), "wrong")).status).toBe(401);
  });

  it("预览：返回 diff，原文件不变，生成 .edited 文件", async () => {
    const res = await post(edits(false), TOKEN);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; diff: string };
    expect(body.ok).toBe(true);
    expect(body.diff).toContain("-    name: A");
    expect(body.diff).toContain("+    name: A2");
    expect(readFileSync(docPath, "utf8")).toContain("name: A\n");
    expect(existsSync(join(root, "docs", "live.edited.cvn.yaml"))).toBe(true);
  });

  it("确认写回：rev+1、写原文件、生成备份", async () => {
    const res = await post(edits(true), TOKEN);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; rev: number; backup: string };
    expect(body.ok).toBe(true);
    expect(body.rev).toBe(2);
    const text = readFileSync(docPath, "utf8");
    expect(text).toContain("A2");
    expect(text).toContain("rev: 2");
    expect(existsSync(join(root, "docs", ".audit"))).toBe(true);
    expect(existsSync(join(root, "docs", ".audit", "live.cvn.yaml." + body.backup.split("live.cvn.yaml.")[1]!))).toBe(true);
  });

  it("未知文档 → 404", async () => {
    const res = await post({ accept: false, edits: { doc: "nope/none", ops: [] } }, TOKEN);
    expect(res.status).toBe(404);
  });

  it("AI actor 被拒（422）", async () => {
    const body = edits(false);
    (body.edits as { actor: string }).actor = "ai:bot";
    const res = await post(body, TOKEN);
    expect(res.status).toBe(422);
  });
});
describe("POST /api/patch：批注写回", () => {
  it("带 token 的 human patch 写回成功（rev+1，文件出现新批注）", async () => {
    const rev = Number(/rev:\s*(\d+)/.exec(readFileSync(docPath, "utf8"))![1]);
    const patch = {
      covenant: "0.1",
      doc: "t/live",
      base_rev: rev,
      intent: "viewer 写回批注",
      ops: [
        {
          op: "add",
          path: "/annotations/-",
          value: {
            id: "a.01JAYTEST00000000000001",
            target: { kind: "element", id: "e.a" },
            type: "risk",
            severity: "low",
            title: "服务写回的批注",
            status: "open",
            author: "human:you",
            created: "2026-11-03T00:00:00+08:00",
          },
        },
      ],
    };
    const res = await post({ patch, actor: "human:you" }, TOKEN, "api/patch");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.rev).toBe(rev + 1);
    expect(readFileSync(docPath, "utf8")).toContain("服务写回的批注");
  });

  it("无 token → 401", async () => {
    const res = await post({ patch: { covenant: "0.1", doc: "t/live", base_rev: 2, intent: "x", ops: [] } }, undefined, "api/patch");
    expect(res.status).toBe(401);
  });
});