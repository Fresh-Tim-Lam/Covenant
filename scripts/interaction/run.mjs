/**
 * 交互剧本运行器（专门交互验证入口）。
 *
 * 用法：node scripts/interaction/run.mjs <scenario.json>
 * 剧本 = JSON 步骤数组，每步一个动作或断言；运行器驱动真实浏览器（本机 Edge，headless）
 * 逐步执行，每步截图留证，产出 docs/audits/interaction/<name>-report.json。
 *
 * 任何编辑功能必须先写剧本、跑绿本运行器，才允许交付（铁律 3：jsdom 不等价浏览器）。
 */
import { chromium } from "playwright-core";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scenarioPath = resolve(process.cwd(), process.argv[2] ?? "scripts/interaction/feature1.json");
const scenario = JSON.parse(readFileSync(scenarioPath, "utf8"));
const outDir = resolve(process.cwd(), "docs/audits/interaction", scenario.name ?? "scenario");
mkdirSync(outDir, { recursive: true });

const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
if (!existsSync(EDGE)) { console.error("未找到 Edge: " + EDGE); process.exit(2); }

const browser = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
page.on("pageerror", (err) => consoleErrors.push(String(err)));
page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });

const results = [];
let stepNo = 0;
async function shot(tag) {
  const file = join(outDir, `${String(++stepNo).padStart(2, "0")}-${tag}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function runStep(step) {
  const t0 = Date.now();
  try {
    switch (step.action) {
      case "goto":
        await page.goto(step.url, { waitUntil: "load", timeout: 20000 });
        break;
      case "click":
        await page.locator(step.selector).first().click({ timeout: 8000 });
        break;
      case "fill":
        await page.locator(step.selector).first().fill(step.value, { timeout: 8000 });
        break;
      case "press":
        await page.keyboard.press(step.key);
        break;
      case "waitFor": {
        await page.locator(step.selector).first().waitFor({ state: step.state ?? "visible", timeout: 8000 });
        break;
      }
      case "assertExists": {
        const n = await page.locator(step.selector).count();
        if (n === 0) throw new Error(`选择器无匹配: ${step.selector}`);
        break;
      }
      case "assertCount": {
        const n = await page.locator(step.selector).count();
        if (n !== step.count) throw new Error(`数量 ${n} ≠ ${step.count}: ${step.selector}`);
        break;
      }
      case "assertText": {
        const text = (await page.locator(step.selector).first().textContent({ timeout: 8000 })) ?? "";
        if (!text.includes(step.contains)) throw new Error(`文本不含「${step.contains}」，实际「${text.slice(0, 80)}」`);
        break;
      }
      case "assertClass": {
        const cls = (await page.locator(step.selector).first().getAttribute("class")) ?? "";
        if (step.expect ? !cls.split(/\s+/).includes(step.expect) : cls.split(/\s+/).includes(step.absent))
          throw new Error(`class 断言失败，实际「${cls}」`);
        break;
      }
      case "assertEval": {
        const v = await page.evaluate(step.fn);
        if (v !== step.expect) throw new Error(`eval ${JSON.stringify(v)} ≠ ${JSON.stringify(step.expect)}`);
        break;
      }
      case "download": {
        const [download] = await Promise.all([
          page.waitForEvent("download", { timeout: 8000 }),
          page.locator(step.selector).first().click(),
        ]);
        const file = join(outDir, step.saveAs ?? "download.json");
        await download.saveAs(file);
        if (step.parseJson) {
          const json = JSON.parse(readFileSync(file, "utf8"));
          const probe = JSON.stringify(json);
          for (const must of step.jsonContains ?? [])
            if (!probe.includes(must)) throw new Error(`下载 JSON 不含「${must}」`);
        }
        break;
      }
      case "screenshot":
        break;
      default:
        throw new Error("未知动作: " + step.action);
    }
    const shotFile = await shot(step.tag ?? step.action);
    results.push({ step: stepNo, action: step.action, desc: step.desc ?? "", pass: true, ms: Date.now() - t0, screenshot: shotFile });
    console.log(`  ✓ ${String(stepNo).padStart(2, "0")} ${step.desc ?? step.action}`);
  } catch (err) {
    const shotFile = await shot(`fail-${stepNo}`);
    results.push({ step: stepNo, action: step.action, desc: step.desc ?? "", pass: false, ms: Date.now() - t0, error: String(err), screenshot: shotFile });
    console.log(`  ✗ ${String(stepNo).padStart(2, "0")} ${step.desc ?? step.action} → ${err}`);
    throw err;
  }
}

let failed = false;
try {
  for (const step of scenario.steps) {
    await runStep(step);
  }
} catch {
  failed = true;
}
await browser.close();

const passed = results.filter((r) => r.pass).length;
const report = {
  scenario: scenario.name,
  date: new Date().toISOString(),
  url: scenario.steps[0]?.url ?? "",
  total: results.length,
  passed,
  failed: results.length - passed,
  consoleErrors,
  steps: results,
};
writeFileSync(join(outDir, "report.json"), JSON.stringify(report, null, 2), "utf8");
console.log(`\n剧本 ${scenario.name}: ${passed}/${results.length} 通过${consoleErrors.length ? `，页面错误 ${consoleErrors.length} 条` : ""}`);
console.log("报告: " + join(outDir, "report.json"));
process.exit(failed ? 1 : 0);
