import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer } from "./serve";
import type { ServeHandle } from "./serve";

/**
 * GET /api/rev —— 写回前 rebase 的支撑接口。
 *
 * 背景：页面里的 doc.rev 是构建时冻结的；服务端每次写回 rev+1。
 * 若客户端不先取真实 rev 再写，第二次写回必被 gate 以 patch/base-rev 拒绝。
 * 这些测试锁定该接口存在且 rev 随写回递增。
 */

const CVN = `covenant: "0.1"
id: t/rev
profile: c4-container@1
meta:
  title: Rev
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
let docPath: string;
const TOKEN = "rev-token-123";

beforeAll(async () => {
  const root = mkdtempSync(join(tmpdir(), "covenant-rev-serve-"));
  const docs = join(root, "docs");
  mkdirSync(docs, { recursive: true });
  docPath = join(docs, "rev.cvn.yaml");
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

function getRev(doc: string, token?: string): Promise<Response> {
  return fetch(`${handle.url}api/rev?doc=${encodeURIComponent(doc)}`, {
    headers: token ? { "x-covenant-token": token } : {},
  });
}

function postPatch(body: unknown, token?: string): Promise<Response> {
  return fetch(`${handle.url}api/patch`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { "x-covenant-token": token } : {}),
    },
    body: JSON.stringify(body),
  });
}

const annOp = (id: string) => ({
  op: "add",
  path: "/annotations/-",
  value: {
    id,
    target: { kind: "element", id: "e.a" },
    type: "risk",
    severity: "low",
    title: "rev test",
    status: "open",
    author: "human:you",
    created: "2026-11-04T00:00:00+08:00",
  },
});

describe("GET /api/rev", () => {
  it("带 token → 返回当前 rev", async () => {
    const res = await getRev("t/rev", TOKEN);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; doc: string; rev: number };
    expect(body.ok).toBe(true);
    expect(body.doc).toBe("t/rev");
    expect(body.rev).toBe(1);
  });

  it("无 token → 401", async () => {
    expect((await getRev("t/rev")).status).toBe(401);
  });

  it("错误 token → 401", async () => {
    expect((await getRev("t/rev", "wrong")).status).toBe(401);
  });

  it("未知文档 → 404", async () => {
    expect((await getRev("t/nope", TOKEN)).status).toBe(404);
  });

  it("写回后 rev 递增：页面可先取新 rev 再 rebase 重试", async () => {
    const before = (await (await getRev("t/rev", TOKEN)).json() as { rev: number }).rev;
    const res = await postPatch(
      {
        patch: { covenant: "0.1", doc: "t/rev", base_rev: before, intent: "rev test", ops: [annOp("a.01JAYREVTEST000000000001")] },
        actor: "human:you",
      },
      TOKEN,
    );
    expect(res.status).toBe(200);
    const after = (await (await getRev("t/rev", TOKEN)).json() as { rev: number }).rev;
    expect(after).toBe(before + 1);
    expect(readFileSync(docPath, "utf8")).toContain("a.01JAYREVTEST000000000001");
  });

  it("陈旧 base_rev 写回被拒（证明 rebase 是必要的）", async () => {
    const res = await postPatch(
      {
        patch: { covenant: "0.1", doc: "t/rev", base_rev: 1, intent: "stale", ops: [annOp("a.01JAYREVTEST000000000002")] },
        actor: "human:you",
      },
      TOKEN,
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { ok: boolean; findings?: { code: string }[] };
    expect(body.ok).toBe(false);
    expect((body.findings ?? []).map((f) => f.code)).toContain("gate/stale");
  });
});
