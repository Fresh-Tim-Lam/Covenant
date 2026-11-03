#!/usr/bin/env node
import { createInterface } from "node:readline";
import { handleRequest } from "./index";

// stdio MCP server：stdout 只输出协议 JSON，日志一律走 stderr
process.stderr.write("covenant-mcp: ready (stdio)\n");

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  const text = line.trim();
  if (!text) return;
  let req: unknown;
  try {
    req = JSON.parse(text);
  } catch {
    process.stderr.write("covenant-mcp: invalid JSON line\n");
    return;
  }
  try {
    const res = handleRequest(req as Parameters<typeof handleRequest>[0]);
    if (res) process.stdout.write(`${JSON.stringify(res)}\n`);
  } catch (e) {
    process.stderr.write(`covenant-mcp: ${(e as Error).message}\n`);
  }
});
