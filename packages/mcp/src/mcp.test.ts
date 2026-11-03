import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { handleRequest, TOOLS } from "./index";

function call(name: string, args: Record<string, unknown>, id = 2) {
  const res = handleRequest({
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: { name, arguments: args },
  });
  const text = (res!.result as { content: { text: string }[] }).content[0]!.text;
  return { isError: Boolean((res!.result as { isError?: boolean }).isError), data: JSON.parse(text) };
}

describe("covenant MCP server", () => {
  it("initialize 返回协议版本与服务信息", () => {
    const res = handleRequest({ jsonrpc: "2.0", id: 1, method: "initialize" });
    const r = res!.result as { protocolVersion: string; serverInfo: { name: string } };
    expect(r.protocolVersion).toBeTruthy();
    expect(r.serverInfo.name).toBe("covenant");
  });

  it("tools/list 暴露全部工具且都有 inputSchema", () => {
    const res = handleRequest({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const tools = (res!.result as { tools: { name: string; inputSchema: unknown }[] }).tools;
    expect(tools).toHaveLength(TOOLS.length);
    expect(tools.map((t) => t.name)).toContain("covenant_check");
    for (const t of tools) expect(t.inputSchema).toBeTruthy();
  });

  it("covenant_brief 返回未决批注与问题", () => {
    const { data } = call("covenant_brief", { doc: "examples/payments-arch.cvn.yaml" });
    expect(data.ok).toBe(true);
    expect(data.openAnnotations.length).toBeGreaterThan(0);
    expect(data.questions.length).toBeGreaterThan(0);
  });

  it("covenant_check 校验示例目录", () => {
    const { isError, data } = call("covenant_check", { paths: ["examples"] });
    expect(isError).toBe(false);
    expect(data.scanned).toBeGreaterThanOrEqual(4);
    expect(data.errors).toBe(0);
  });

  it("covenant_read_doc 返回语义投影", () => {
    const { data } = call("covenant_read_doc", { doc: "examples/payments-arch.cvn.yaml" });
    expect(data.ok).toBe(true);
    expect(data.elements.length).toBeGreaterThan(0);
    expect(data.annotations.length).toBeGreaterThan(0);
  });

  it("covenant_diff 识别 material 变更", () => {
    const dir = mkdtempSync(join(tmpdir(), "covenant-mcp-diff-"));
    const a = readFileSync("examples/payments-arch.cvn.yaml", "utf8");
    const b = a.replace("tech: Nginx + Lua", "tech: Envoy");
    writeFileSync(join(dir, "a.cvn.yaml"), a);
    writeFileSync(join(dir, "b.cvn.yaml"), b);
    const { data } = call("covenant_diff", {
      left: join(dir, "a.cvn.yaml"),
      right: join(dir, "b.cvn.yaml"),
    });
    expect(data.needsApproval).toBe(false);
    expect(data.summary.material).toBeGreaterThan(0);
  });

  it("covenant_patch_check 拒绝 AI 冒充 human", () => {
    const dir = mkdtempSync(join(tmpdir(), "covenant-mcp-"));
    const patchPath = join(dir, "p.json");
    writeFileSync(
      patchPath,
      JSON.stringify({
        covenant: "0.1",
        doc: "payments/containers",
        base_rev: 3,
        intent: "AI 越权",
        ops: [
          {
            op: "add",
            path: "/annotations/-",
            value: {
              id: "a.01JAXTEST0009ZZZZ0009",
              target: { kind: "element", id: "e.gateway" },
              type: "risk",
              severity: "low",
              title: "越权",
              status: "open",
              author: "human:lily",
              created: "2026-11-03T00:00:00+08:00",
            },
          },
        ],
      }),
    );
    const { data } = call("covenant_patch_check", {
      doc: "examples/payments-arch.cvn.yaml",
      patch: patchPath,
      actor: "ai:claude",
    });
    expect(data.ok).toBe(false);
    expect(data.findings.map((f: { code: string }) => f.code)).toContain("gate/impersonation");
  });

  it("未知方法 / 未知工具返回 JSON-RPC 错误", () => {
    expect(handleRequest({ id: 3, method: "nope" })!.error!.code).toBe(-32601);
    expect(handleRequest({ id: 4, method: "tools/call", params: { name: "nope" } })!.error!.code).toBe(
      -32602,
    );
  });
});
