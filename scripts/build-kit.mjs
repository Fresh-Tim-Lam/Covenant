/**
 * 构建可交付 Package（covenant-kit）：
 * - bin/covenant.mjs：esbuild 打包成单文件 CLI（只需 Node ≥20，无需 pnpm install）
 * - viewer/covenant.html：由 templates/team-starter 预构建的自包含查看器
 * - examples/、templates/、docs/、inbox-template/
 * 用法：node scripts/build-kit.mjs
 */
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const root = resolve(".");
const version = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const kitName = `covenant-kit-${version}`;
const kit = join(root, "dist", kitName);
rmSync(kit, { recursive: true, force: true });
mkdirSync(join(kit, "bin"), { recursive: true });
mkdirSync(join(kit, "viewer"), { recursive: true });
mkdirSync(join(kit, "examples"), { recursive: true });
mkdirSync(join(kit, "docs"), { recursive: true });
mkdirSync(join(kit, "inbox-template"), { recursive: true });

// 1) 打包 CLI（把 workspace 包与第三方依赖全部 bake 进单文件）
// 兼容 pnpm store 版本变化：在 .pnpm 下找任意 esbuild@* 的 lib/main.js
function resolveEsbuild() {
  const pnpmDir = join(root, "node_modules/.pnpm");
  if (existsSync(pnpmDir)) {
    for (const d of readdirSync(pnpmDir)) {
      if (!d.startsWith("esbuild@")) continue;
      const main = join(pnpmDir, d, "node_modules/esbuild/lib/main.js");
      if (existsSync(main)) return require(main);
    }
  }
  return require("esbuild");
}
const esbuild = resolveEsbuild();
await esbuild.build({
  entryPoints: [join(root, "packages/cli/src/index.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  tsconfig: join(root, "tsconfig.base.json"),
  outfile: join(kit, "bin", "covenant.mjs"),
  legalComments: "none",
  logLevel: "warning",
});
const cliPath = join(kit, "bin", "covenant.mjs");
const cliSrc = readFileSync(cliPath, "utf8");
writeFileSync(cliPath, "#!/usr/bin/env node\n" + cliSrc.replace(/^#!.*\n/, ""), "utf8");
writeFileSync(
  join(kit, "bin", "covenant.cmd"),
  '@echo off\r\nnode "%~dp0covenant.mjs" %*\r\n',
  "utf8",
);

// 2) 模板与示例
// schema 是 CLI 解析/校验的仓库根锚点，必须随包携带
cpSync(join(root, "schema"), join(kit, "schema"), { recursive: true });
cpSync(join(root, "templates/team-starter"), join(kit, "templates/team-starter"), { recursive: true });
cpSync(join(root, "examples/quickstart"), join(kit, "examples/quickstart"), { recursive: true });
cpSync(join(root, "examples/topology-junction.cvn.yaml"), join(kit, "examples/topology-junction.cvn.yaml"));
cpSync(join(root, "examples/payments-arch.cvn.yaml"), join(kit, "examples/payments-arch.cvn.yaml"));

// 3) 文档与收件箱模板
for (const [src, dst] of [
  ["docs/design/format-spec-v0.md", "docs/format-spec.md"],
  ["docs/guides/agent-team-edit-deployment.md", "docs/edit-and-deploy.md"],
  ["docs/conventions/module-ownership.md", "docs/module-ownership.md"],
  ["todo/inbox/README.md", "inbox-template/README.md"],
  ["todo/inbox/_TEMPLATE.md", "inbox-template/_TEMPLATE.md"],
]) {
  if (existsSync(join(root, src))) cpSync(join(root, src), join(kit, dst));
}

// 4) 用 kit 自带 CLI 校验模板 + 预构建查看器（验证可移植性）
const cli = join(kit, "bin", "covenant.mjs");
const run = (args) => {
  const out = execFileSync(process.execPath, [cli, ...args], { cwd: kit, encoding: "utf8" });
  console.log("  $ covenant " + args.join(" ") + "\n" + out.trim());
};
run(["check", "templates/team-starter"]);
run(["build", "templates/team-starter", "-o", "viewer/covenant.html"]);

// 5) README / VERSION
writeFileSync(join(kit, "VERSION"), version + "\n", "utf8");
writeFileSync(
  join(kit, "README.md"),
  `# Covenant Kit ${version}

> 面向人机协作的软件工程契约图示工具（可移植包，无需 pnpm install）。

## 环境

- Node.js **≥ 20**（不需要 pnpm / 不需要网络）
- Windows 用 \`bin\\covenant.cmd\`，macOS/Linux 用 \`node bin/covenant.mjs\`

## 5 分钟上手

\`\`\`bash
# 1. 校验模板契约
node bin/covenant.mjs check templates/team-starter

# 2. 直接打开预构建查看器（可点选/缩放/拖拽/批注）
#    viewer/covenant.html —— 双击即可

# 3. 构建你自己的图（把 .cvn.yaml 放在一个目录里）
node bin/covenant.mjs check <你的目录>
node bin/covenant.mjs build <你的目录> -o out/covenant.html

# 4. 本地编辑服务（图上改批注 → 一键写回 .cvn.yaml，带 .audit 备份）
node bin/covenant.mjs serve out --edit --open

# 5. 文件夹版（一整套图：index.html + manifest + views/*.svg）
node bin/covenant.mjs bundle <你的目录> -o out/site
\`\`\`

## 目录

| 路径 | 内容 |
|---|---|
| \`bin/covenant.mjs\` | 单文件 CLI（check / render / build:html / bundle / edit / serve / patch-check / index / adr / ai / doctor） |
| \`viewer/covenant.html\` | 由 team-starter 模板预构建的自包含查看器（双击可开） |
| \`templates/team-starter/\` | 复制这个目录开始：covenant.yaml + arch/system.cvn.yaml |
| \`examples/\` | quickstart / payments / topology-junction 示例 |
| \`docs/\` | 格式规范、编辑与部署、模块 owner 规范 |
| \`inbox-template/\` | 需求反馈模板（交给 Covenant 侧收件箱） |

## 反馈

按 \`inbox-template/_TEMPLATE.md\` 写需求文件，交给 Covenant 团队；或直接提到 Covenant 仓库 \`todo/inbox/ALLELab/\`。

## 已知边界

- 查看器为单文件离线 HTML；编辑写回需要本机 loopback 服务（\`serve --edit\`）；
- 批注删除/编辑走"导出补丁 / 写回"，不直接改文件；
- 仅支持 Node 20 的 ESM CLI；Windows/macOS/Linux 均可。
`,
  "utf8",
);

console.log(`\nkit built: dist/${kitName}`);
