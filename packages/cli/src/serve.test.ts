import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startServer } from "./serve";
import type { ServeHandle } from "./serve";

let handle: ServeHandle;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), "covenant-serve-"));
  writeFileSync(join(dir, "index.html"), "<h1>covenant</h1>");
  writeFileSync(join(dir, "a.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  handle = await startServer({ dir, port: 0 });
});

afterAll(async () => {
  await handle.close();
});

describe("covenant serve（只读静态托管）", () => {
  it("根路径返回 index.html 且类型正确", async () => {
    const res = await fetch(handle.url);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("covenant");
  });

  it("子路径按扩展名返回 MIME", async () => {
    const res = await fetch(`${handle.url}a.svg`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
  });

  it("未知文件返回 404", async () => {
    const res = await fetch(`${handle.url}nope.html`);
    expect(res.status).toBe(404);
  });

  it("目录穿越被拒绝", async () => {
    const res = await fetch(`${handle.url}%2e%2e/%2e%2e/package.json`);
    expect([403, 404]).toContain(res.status);
  });

  it("HEAD 返回头且无 body", async () => {
    const res = await fetch(handle.url, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");
  });

  it("非 GET/HEAD 返回 405", async () => {
    const res = await fetch(handle.url, { method: "POST" });
    expect(res.status).toBe(405);
  });

  it("目录无 index.html 时用 defaultFile 响应 /", async () => {
    const dir = mkdtempSync(join(tmpdir(), "covenant-serve-entry-"));
    writeFileSync(join(dir, "covenant.html"), "<h1>entry</h1>");
    const h = await startServer({ dir, port: 0, defaultFile: "covenant.html" });
    try {
      const res = await fetch(h.url);
      expect(res.status).toBe(200);
      expect(await res.text()).toContain("entry");
    } finally {
      await h.close();
    }
  });
});
