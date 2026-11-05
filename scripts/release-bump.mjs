import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";

const V = "0.4.0";
const root = JSON.parse(readFileSync("package.json", "utf8"));
root.version = V;
writeFileSync("package.json", JSON.stringify(root, null, 2) + "\n", "utf8");
console.log("root ->", V);

for (const p of readdirSync("packages")) {
  const f = `packages/${p}/package.json`;
  if (!existsSync(f)) continue;
  const j = JSON.parse(readFileSync(f, "utf8"));
  j.version = V;
  writeFileSync(f, JSON.stringify(j, null, 2) + "\n", "utf8");
  console.log(`packages/${p} ->`, V);
}

const vf = "packages/core/src/version.ts";
const t = readFileSync(vf, "utf8").replace(/COVENANT_VERSION = "[^"]+"/, `COVENANT_VERSION = "${V}"`);
writeFileSync(vf, t, "utf8");
console.log("version.ts ->", V);
