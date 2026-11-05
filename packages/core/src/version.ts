/**
 * 工具版本唯一事实源。
 *
 * 为什么单独成文件：版本号曾在三处硬编码（`cli/src/index.ts` 的 VERSION、
 * `mcp/src/index.ts` 的 SERVER_INFO、`render/src/html.ts` 内嵌数据），
 * 且长期停在 0.1.0 而 package.json 已 0.3.0 —— 任何打印版本的路径都在撒谎。
 *
 * 规则：
 *   1. 本常量必须等于根 `package.json` 的 `version`；
 *   2. 由 `pnpm agent:audit` 的 A9 检查强制，漂移即 FAIL；
 *   3. 其它包一律 `import { COVENANT_VERSION } from "@covenant/core"`，禁止再写版本字面量。
 */
export const COVENANT_VERSION = "0.4.0";
