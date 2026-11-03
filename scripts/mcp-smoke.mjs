// 冒烟测试：真实拉起 stdio MCP server，走 initialize → tools/list → tools/call。
// 用法: node scripts/mcp-smoke.mjs
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const EXPECTED_TOOLS = 9;

const server = spawn(
  process.execPath,
  ["--import", "tsx", "packages/mcp/src/server.ts"],
  { stdio: ["pipe", "pipe", "inherit"], cwd: process.cwd() },
);

const messages = [];
createInterface({ input: server.stdout }).on("line", (line) => {
  try {
    messages.push(JSON.parse(line));
  } catch {
    /* 非协议输出忽略 */
  }
});

function send(obj) {
  server.stdin.write(`${JSON.stringify(obj)}\n`);
}

function waitFor(predicate, label, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const hit = messages.find(predicate);
      if (hit) {
        clearInterval(timer);
        resolve(hit);
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`timeout waiting for ${label}`));
      }
    }, 20);
  });
}

try {
  send({ jsonrpc: "2.0", id: 1, method: "initialize" });
  const init = await waitFor((m) => m.id === 1, "initialize");
  if (!init.result?.serverInfo?.name) throw new Error("initialize 响应缺少 serverInfo");

  send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const list = await waitFor((m) => m.id === 2, "tools/list");
  const names = list.result.tools.map((t) => t.name);
  if (names.length !== EXPECTED_TOOLS) throw new Error(`工具数 ${names.length} != ${EXPECTED_TOOLS}`);

  send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "covenant_check", arguments: { paths: ["examples"] } },
  });
  const check = await waitFor((m) => m.id === 3, "covenant_check");
  const payload = JSON.parse(check.result.content[0].text);
  if (payload.errors !== 0) throw new Error(`check 发现 ${payload.errors} 个 error`);

  console.log(`PASS  tools=${names.length}  scanned=${payload.scanned}  errors=${payload.errors}`);
  console.log(`      tools: ${names.join(", ")}`);
} catch (e) {
  console.error(`FAIL  ${e.message}`);
  process.exitCode = 1;
} finally {
  server.kill();
}
