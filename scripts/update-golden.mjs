// 生成/更新黄金 SVG：置 GOLDEN_UPDATE=1 跑 golden.test.ts。
// 用法: pnpm golden
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "pnpm",
  ["exec", "vitest", "run", "packages/render/src/golden.test.ts"],
  {
    stdio: "inherit",
    env: { ...process.env, GOLDEN_UPDATE: "1" },
    shell: true,
  },
);
process.exit(result.status ?? 1);
