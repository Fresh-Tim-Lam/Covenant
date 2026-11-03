// 开发期验证工具：把生成的 SVG 转成 PNG，用于人工/视觉检查。
// 用法: node scripts/svg-to-png.mjs <in.svg> <out.png> [width]
import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const [, , input, output, widthArg] = process.argv;
if (!input || !output) {
  console.error("用法: node scripts/svg-to-png.mjs <in.svg> <out.png> [width]");
  process.exit(2);
}
const width = Number(widthArg ?? 1600);
const svg = readFileSync(input, "utf8");
const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: width },
  background: "#ffffff",
});
writeFileSync(output, resvg.render().asPng());
console.log(`png: ${output} (${width}px wide)`);
