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
      case "mouseClickAtSelector": {
        // 真实鼠标输入：按元素中心坐标点击（区别于 el.click() 合成事件，可暴露遮挡/命中问题）
        const box = await page.locator(step.selector).first().boundingBox({ timeout: 8000 });
        if (!box) throw new Error("无法取得元素位置: " + step.selector);
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        break;
      }
      case "dblclickAtSelector": {
        const box = await page.locator(step.selector).first().boundingBox({ timeout: 8000 });
        if (!box) throw new Error("无法取得元素位置: " + step.selector);
        await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
        break;
      }
      case "mouseMoveToSelector": {
        const box = await page.locator(step.selector).first().boundingBox({ timeout: 8000 });
        if (!box) throw new Error("无法取得元素位置: " + step.selector);
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
        break;
      }
      case "inspectPointAtSelectorCenter": {
        const b2 = await page.locator(step.selector).first().boundingBox({ timeout: 8000 });
        if (!b2) throw new Error("无法取得元素位置: " + step.selector);
        const cx = Math.round(b2.x + b2.width / 2), cy = Math.round(b2.y + b2.height / 2);
        const diag = await page.evaluate(([x, y]) => {
          const el = document.elementFromPoint(x, y);
          if (!el) return { point: [x, y], found: null };
          const chain = [];
          let cur = el;
          for (let i = 0; cur && i < 8; i++) {
            const cs = getComputedStyle(cur);
            const r = cur.getBoundingClientRect();
            chain.push({ tag: cur.tagName, cls: String(cur.getAttribute("class") ?? ""), id: cur.id ?? "", pointerEvents: cs.pointerEvents, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)] });
            cur = cur.parentElement;
          }
          return { point: [x, y], found: { tag: el.tagName, cls: String(el.getAttribute("class") ?? ""), id: el.id }, chain };
        }, [cx, cy]);
        results.push({ step: stepNo, action: "inspect", desc: step.desc ?? "", diag });
        console.log(`  ⓘ ${String(stepNo).padStart(2, "0")} inspectCenter(${cx},${cy}) → ${diag.found ? diag.found.tag + "." + diag.found.cls : "null"}`);
        const shotFile = await shot(step.tag ?? "inspect");
        const last = results[results.length - 1];
        last.screenshot = shotFile; last.pass = true;
        return;
      }
      case "clickAt": {
        await page.mouse.click(step.x, step.y);
        break;
      }
      case "inspectPoint": {
        // CDP 诊断：该视口坐标上实际命中的元素 + 祖先链（tag/class/pointer-events/矩形）
        const diag = await page.evaluate(([x, y]) => {
          const el = document.elementFromPoint(x, y);
          if (!el) return { point: [x, y], found: null };
          const chain = [];
          let cur = el;
          for (let i = 0; cur && i < 8; i++) {
            const cs = getComputedStyle(cur);
            const r = cur.getBoundingClientRect();
            chain.push({
              tag: cur.tagName,
              cls: String(cur.getAttribute("class") ?? ""),
              id: cur.id ?? "",
              pointerEvents: cs.pointerEvents,
              rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
            });
            cur = cur.parentElement;
          }
          return { point: [x, y], found: { tag: el.tagName, cls: String(el.getAttribute("class") ?? ""), id: el.id }, chain };
        }, [step.x, step.y]);
        results.push({ step: stepNo, action: "inspect", desc: step.desc ?? "", diag });
        console.log(`  ⓘ ${String(stepNo).padStart(2, "0")} inspect(${step.x},${step.y}) → ${diag.found ? diag.found.tag + "." + diag.found.cls : "null"}`);
        const shotFile = await shot(step.tag ?? "inspect");
        const last = results[results.length - 1];
        last.screenshot = shotFile;
        last.pass = true;
        return;
      }
      case "evalStore": {
        const value = await page.evaluate(step.fn);
        results.push({ step: stepNo, action: "evalStore", desc: step.desc ?? "", value });
        console.log(`  ⓘ ${String(stepNo).padStart(2, "0")} evalStore ${step.desc ?? ""} → ${JSON.stringify(value).slice(0, 120)}`);
        const shotFile = await shot(step.tag ?? "eval");
        results[results.length - 1].screenshot = shotFile;
        results[results.length - 1].pass = true;
        return;
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
