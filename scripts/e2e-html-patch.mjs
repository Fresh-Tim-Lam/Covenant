// 开发期端到端演练：用 jsdom 打开构建好的 HTML，点选标注 → 状态流转 → 导出补丁。
// 产物: dist/e2e/html.patch.json（交给 covenant patch-check / apply 使用）
import { readFileSync, writeFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const html = readFileSync("dist/covenant.html", "utf8");
const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://example.test/" });
const { window } = dom;
const d = window.document;

const DOC_ID = "payments/containers";
const nav = [...d.querySelectorAll("nav button")].find(
  (b) => b.getAttribute("data-doc") === DOC_ID,
);
if (!nav) {
  console.error(`找不到文档 ${DOC_ID}`);
  process.exit(1);
}
nav.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

const nodes = [...d.querySelectorAll(`.doc[data-doc="${DOC_ID}"] .node`)];
let targetNode = null;
let actBtn = null;
for (const n of nodes) {
  n.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  const btn =
    d.querySelector('.acts button[data-act="ack"]') ??
    d.querySelector('.acts button[data-act="resolved"]');
  if (btn) {
    targetNode = n.getAttribute("data-id");
    actBtn = btn;
    break;
  }
}
if (!actBtn) {
  console.error("没有找到可流转的批注（检查示例批注目标）");
  process.exit(1);
}
actBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

let captured = null;
class CaptureBlob {
  constructor(parts) {
    this.parts = parts;
  }
  text() {
    return Promise.resolve(this.parts.join(""));
  }
}
window.Blob = CaptureBlob;
window.URL.createObjectURL = (b) => {
  captured = b;
  return "blob:mock";
};
window.URL.revokeObjectURL = () => {};
window.HTMLAnchorElement.prototype.click = function () {
  /* 不真正下载 */
};

d.getElementById("btn-export").dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
if (!captured) {
  console.error("导出失败：没有捕获到 Blob");
  process.exit(1);
}
const text = await captured.text();
writeFileSync("dist/e2e/html.patch.json", text, "utf8");
const patch = JSON.parse(text);
console.log(
  `导出补丁: doc=${patch.doc} base_rev=${patch.base_rev} ops=${patch.ops.length} (node=${targetNode})`,
);
for (const op of patch.ops) console.log(`  ${op.op} ${op.path} = ${JSON.stringify(op.value)}`);
