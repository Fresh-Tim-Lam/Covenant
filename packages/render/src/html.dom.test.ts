import { describe, expect, it } from "vitest";
import { JSDOM, VirtualConsole } from "jsdom";
import type { CovenantDoc } from "@covenant/core";
import { layout } from "@covenant/layout";
import { renderSvg } from "./index";
import { renderHtml } from "./html";

function doc(): CovenantDoc {
  return {
    covenant: "0.1",
    id: "t/interact",
    profile: "c4-container@1",
    meta: { title: "交互测试", purpose: "p", non_goals: [], rev: 3 },
    elements: [
      { id: "e.a", kind: "container", name: "服务 A", summary: "做 A", tech: "TS" },
      { id: "e.b", kind: "datastore", name: "存储 B", summary: "存 B", tech: "PG", props: { storage_kind: "rdbms" } },
    ],
    relations: [{ id: "r.ab", kind: "writes", from: "e.a", to: "e.b", summary: "写" }],
    views: [{ id: "v.main", title: "主视图" }],
    annotations: [
      {
        id: "a.01JAXTEST0001AAAA0001",
        target: { kind: "element", id: "e.a" },
        type: "risk",
        severity: "high",
        title: "已有批注",
        status: "open",
        author: "human:lily",
        created: "2026-11-03T00:00:00+08:00",
      },
    ],
  };
}

function html(): string {
  const d = doc();
  const l = layout(d);
  return renderHtml([{ doc: d, svg: renderSvg(d, l, { showBadges: false }), layout: l }]);
}

describe("自包含 HTML 的交互（jsdom 无头）", () => {
  it("点节点 → 出现表单；提交 → 写入 localStorage 且出现角标", () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;

    const node = d.querySelector("svg .node");
    expect(node).not.toBeNull();
    node!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    expect(d.getElementById("f-title")).not.toBeNull();
    (d.getElementById("f-title") as HTMLInputElement).value = "测试批注";
    (d.getElementById("f-body") as HTMLTextAreaElement).value = "证据";
    (d.getElementById("f-hint") as HTMLTextAreaElement).value = "改为异步";
    d.getElementById("f-submit")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    const store = window.localStorage.getItem("covenant:viewer:v1") ?? "";
    expect(store).toContain("测试批注");
    expect(store).toContain("改为异步");
    expect(d.querySelector("#cvn-badges circle")).not.toBeNull();
    expect(d.getElementById("pending")?.textContent).toContain("1");
  });

  it("导出补丁：可解析、含 base_rev 与 ops，ai_hint 映射为 ai_hint", async () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;

    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    (d.getElementById("f-title") as HTMLInputElement).value = "导出测试";
    (d.getElementById("f-hint") as HTMLTextAreaElement).value = "保持幂等";
    d.getElementById("f-submit")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    let captured: { text: () => Promise<string> } | null = null;
    class CaptureBlob {
      private readonly parts: string[];
      constructor(parts: string[]) {
        this.parts = parts;
      }
      text(): Promise<string> {
        return Promise.resolve(this.parts.join(""));
      }
    }
    // @ts-expect-error 测试内替换浏览器 Blob
    window.Blob = CaptureBlob;
    window.URL.createObjectURL = ((b: unknown) => {
      captured = b as { text: () => Promise<string> };
      return "blob:mock";
    }) as typeof window.URL.createObjectURL;
    window.URL.revokeObjectURL = (() => undefined) as typeof window.URL.revokeObjectURL;
    window.HTMLAnchorElement.prototype.click = function () {
      /* 不真正下载 */
    };

    d.getElementById("btn-export")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(captured).not.toBeNull();
    const patch = JSON.parse(await captured!.text());
    expect(patch.doc).toBe("t/interact");
    expect(patch.base_rev).toBe(3);
    expect(patch.ops).toHaveLength(1);
    expect(patch.ops[0].op).toBe("add");
    expect(patch.ops[0].path).toBe("/annotations/-");
    expect(patch.ops[0].value.title).toBe("导出测试");
    expect(patch.ops[0].value.ai_hint).toBe("保持幂等");
  });

  it("状态按钮：resolve 后导出 replace 操作，localStorage 记录覆盖", async () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;

    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const btn = d.querySelector('.acts button[data-act="resolved"]');
    expect(btn).not.toBeNull();
    btn!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    const store = JSON.parse(window.localStorage.getItem("covenant:viewer:v1") ?? "{}");
    expect(store["t/interact"].status["a.01JAXTEST0001AAAA0001"]).toBe("resolved");
    expect(d.getElementById("pending")?.textContent).toContain("1");

    let captured: { text: () => Promise<string> } | null = null;
    class CaptureBlob {
      private readonly parts: string[];
      constructor(parts: string[]) {
        this.parts = parts;
      }
      text(): Promise<string> {
        return Promise.resolve(this.parts.join(""));
      }
    }
    // @ts-expect-error 测试内替换浏览器 Blob
    window.Blob = CaptureBlob;
    window.URL.createObjectURL = ((b: unknown) => {
      captured = b as { text: () => Promise<string> };
      return "blob:mock";
    }) as typeof window.URL.createObjectURL;
    window.URL.revokeObjectURL = (() => undefined) as typeof window.URL.revokeObjectURL;
    window.HTMLAnchorElement.prototype.click = function () {
      /* 不真正下载 */
    };

    d.getElementById("btn-export")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const patch = JSON.parse(await captured!.text());
    expect(patch.ops).toHaveLength(1);
    expect(patch.ops[0].op).toBe("replace");
    expect(patch.ops[0].path).toBe("/annotations/a.01JAXTEST0001AAAA0001/status");
    expect(patch.ops[0].value).toBe("resolved");
  });

  it("复制按钮：选中节点后存在，点击不抛错并给反馈", () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const btn = d.getElementById("insp-copy");
    expect(btn).not.toBeNull();
    btn!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const toast = d.getElementById("toast");
    expect(toast).not.toBeNull();
    expect(toast!.textContent ?? "").toContain("复制");
  });
});
describe("HTML 编辑态（jsdom）", () => {
  it("切编辑 → 改名称/坐标 → 暂存 → 导出 edits.json", async () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;

    d.getElementById("btn-edit")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    expect(d.getElementById("e-name")).not.toBeNull();
    (d.getElementById("e-name") as HTMLInputElement).value = "服务 A2";
    (d.getElementById("e-summary") as HTMLTextAreaElement).value = "改职责";
    (d.getElementById("e-pin-x") as HTMLInputElement).value = "42";
    (d.getElementById("e-pin-y") as HTMLInputElement).value = "24";
    d.getElementById("edit-apply")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    let captured: { text: () => Promise<string> } | null = null;
    class CaptureBlob {
      private readonly parts: string[];
      constructor(parts: string[]) {
        this.parts = parts;
      }
      text(): Promise<string> {
        return Promise.resolve(this.parts.join(""));
      }
    }
    // @ts-expect-error 测试内替换浏览器 Blob
    window.Blob = CaptureBlob;
    window.URL.createObjectURL = ((b: unknown) => {
      captured = b as { text: () => Promise<string> };
      return "blob:mock";
    }) as typeof window.URL.createObjectURL;
    window.URL.revokeObjectURL = (() => undefined) as typeof window.URL.revokeObjectURL;
    window.HTMLAnchorElement.prototype.click = function () {
      /* 不真正下载 */
    };

    d.getElementById("btn-edit-export")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(captured).not.toBeNull();
    const payload = JSON.parse(await captured!.text());
    expect(payload.doc).toBe("t/interact");
    expect(payload.base_rev).toBe(3);
    expect(payload.actor).toBe("human:you");
    const paths = payload.ops.map((o: { path: string }) => o.path);
    expect(paths).toContain("/elements/e.a/name");
    expect(paths).toContain("/elements/e.a/summary");
    expect(paths).toContain("/views/v.main/layout/pins/e.a");
    const pin = payload.ops.find((o: { path: string }) => o.path.endsWith("/pins/e.a"));
    expect(pin.value).toEqual([42, 24]);
  });
});
describe("点选回归（拖拽捕获不得吞掉 click）", () => {
  it("pointerdown→pointerup→click 后仍打开悬浮检查器", () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    const node = d.querySelector("svg .node")!;
    node.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    node.dispatchEvent(new window.MouseEvent("pointerup", { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const box = d.getElementById("inspector")!;
    expect(box.hidden).toBe(false);
    expect(d.getElementById("f-title")).not.toBeNull();
  });
});
describe("编辑态拖拽节点（位置编辑）", () => {
  it("拖拽后记录 pins，并出现在导出的 edits.json", async () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;

    d.getElementById("btn-edit")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const node = d.querySelector("svg .node")!;
    const down = new window.MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 10, clientY: 10 });
    const move = new window.MouseEvent("pointermove", { bubbles: true, clientX: 50, clientY: 30 });
    const up = new window.MouseEvent("pointerup", { bubbles: true, clientX: 50, clientY: 30 });
    node.dispatchEvent(down);
    node.dispatchEvent(move);
    node.dispatchEvent(up);

    let captured: { text: () => Promise<string> } | null = null;
    class CaptureBlob {
      private readonly parts: string[];
      constructor(parts: string[]) {
        this.parts = parts;
      }
      text(): Promise<string> {
        return Promise.resolve(this.parts.join(""));
      }
    }
    // @ts-expect-error 测试内替换浏览器 Blob
    window.Blob = CaptureBlob;
    window.URL.createObjectURL = ((b: unknown) => {
      captured = b as { text: () => Promise<string> };
      return "blob:mock";
    }) as typeof window.URL.createObjectURL;
    window.URL.revokeObjectURL = (() => undefined) as typeof window.URL.revokeObjectURL;
    window.HTMLAnchorElement.prototype.click = function () {
      /* 不真正下载 */
    };

    d.getElementById("btn-edit-export")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(captured).not.toBeNull();
    const payload = JSON.parse(await captured!.text());
    const pin = payload.ops.find((o: { path: string }) => o.path.includes("/layout/pins/"));
    expect(pin).toBeTruthy();
    expect(pin.value).toHaveLength(2);
    expect(typeof pin.value[0]).toBe("number");
    expect(typeof pin.value[1]).toBe("number");
  });
});
describe("悬浮窗：钉住与拖拽", () => {
  it("钉住后点击背景不关闭；× 关闭并复位", () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;

    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const pin = d.getElementById("insp-pin")!;
    expect(pin).not.toBeNull();
    pin.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(pin.className).toContain("on");

    // 点击背景：钉住时不应关闭
    const wrap = d.getElementById("stage-wrap")!;
    wrap.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(d.getElementById("inspector")!.hidden).toBe(false);

    // × 关闭
    d.getElementById("insp-close")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(d.getElementById("inspector")!.hidden).toBe(true);
  });

  it("拖拽窗头可移动窗口", () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const box = d.getElementById("inspector")!;
    const head = box.querySelector(".insp-head")!;
    const beforeLeft = parseFloat(box.style.left || "0");
    const beforeTop = parseFloat(box.style.top || "0");
    head.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    window.dispatchEvent(new window.MouseEvent("pointermove", { bubbles: true, clientX: 60, clientY: 50 }));
    window.dispatchEvent(new window.MouseEvent("pointerup", { bubbles: true, clientX: 60, clientY: 50 }));
    // 位移必须与起手位置连续：不能因坐标系混用而跳变
    expect(parseFloat(box.style.left)).toBeCloseTo(beforeLeft + 50, 0);
    expect(parseFloat(box.style.top)).toBeCloseTo(beforeTop + 40, 0);
  });
});
describe("侧栏切换（其他架构图可点）", () => {
  it("点击第二个视图按钮 → 对应 section 显示、旧 section 隐藏", () => {
    const a = doc();
    const b: CovenantDoc = { ...doc(), id: "t/other", meta: { ...doc().meta, title: "另一张图" } };
    const la = layout(a);
    const lb = layout(b);
    const dom = new JSDOM(
      renderHtml([
        { doc: a, svg: renderSvg(a, la), layout: la },
        { doc: b, svg: renderSvg(b, lb), layout: lb },
      ]),
      { runScripts: "dangerously", url: "https://example.test/" },
    );
    const { window } = dom;
    const d = window.document;
    const btn = d.querySelector('#views button[data-doc="t/other"]')!;
    expect(btn).not.toBeNull();
    btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const secA = d.querySelector('section.doc[data-doc="t/interact"]')!;
    const secB = d.querySelector('section.doc[data-doc="t/other"]')!;
    expect((secB as HTMLElement).hidden).toBe(false);
    expect((secA as HTMLElement).hidden).toBe(true);
    expect(btn.className).toContain("on");
  });
});
describe("批注删除 / 撤销 / 回收桶", () => {
  it("× 删除持久批注 → 隐藏并导出 remove；撤销后恢复", async () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    const inspector = d.getElementById("inspector")!;
    expect(inspector.innerHTML).toContain("已有批注");
    const del = d.querySelector(".del-ann");
    expect(del).not.toBeNull();
    del!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    expect(inspector.innerHTML).toContain("批注（0）");
    expect(d.querySelectorAll(".del-ann").length).toBe(0);
    expect(d.querySelector(".trash")).not.toBeNull();
    expect(d.getElementById("pending")!.textContent).toContain("1");

    let captured: { text: () => Promise<string> } | null = null;
    class CaptureBlob {
      private readonly parts: string[];
      constructor(parts: string[]) {
        this.parts = parts;
      }
      text(): Promise<string> {
        return Promise.resolve(this.parts.join(""));
      }
    }
    // @ts-expect-error 测试内替换浏览器 Blob
    window.Blob = CaptureBlob;
    window.URL.createObjectURL = ((b: unknown) => {
      captured = b as { text: () => Promise<string> };
      return "blob:mock";
    }) as typeof window.URL.createObjectURL;
    window.URL.revokeObjectURL = (() => undefined) as typeof window.URL.revokeObjectURL;
    window.HTMLAnchorElement.prototype.click = function () {
      /* 不真正下载 */
    };
    d.getElementById("btn-export")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const patch = JSON.parse(await captured!.text());
    const removes = patch.ops.filter((o: { op: string }) => o.op === "remove");
    expect(removes).toHaveLength(1);
    expect(removes[0].path).toBe("/annotations/a.01JAXTEST0001AAAA0001");

    d.getElementById("toast-undo")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(inspector.innerHTML).toContain("批注（1）");
    expect(d.querySelector(".trash")).toBeNull();
  });
});
describe("悬浮窗关闭与钉子状态样式", () => {
  it("未钉住：点画布空白正常关闭", () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(d.getElementById("inspector")!.hidden).toBe(false);
    const pin = d.getElementById("insp-pin") as HTMLElement;
    expect(pin.getAttribute("aria-pressed")).toBe("false");
    expect(pin.className).not.toContain("on");
    d.querySelector("svg")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(d.getElementById("inspector")!.hidden).toBe(true);
  });

  it("钉住：点空白不关闭；取消钉住后再点空白关闭", () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const pin = d.getElementById("insp-pin") as HTMLElement;
    pin.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(pin.getAttribute("aria-pressed")).toBe("true");
    expect(pin.className).toContain("on");

    d.querySelector("svg")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(d.getElementById("inspector")!.hidden).toBe(false);

    pin.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(pin.getAttribute("aria-pressed")).toBe("false");
    d.querySelector("svg")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(d.getElementById("inspector")!.hidden).toBe(true);
  });
});
describe("批注内联编辑", () => {
  it("编辑持久批注 → 保存后列表更新、导出整块 replace", async () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const editBtn = d.querySelector(".edit-ann");
    expect(editBtn).not.toBeNull();
    editBtn!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    expect(d.getElementById("ae-title")).not.toBeNull();
    const saveBtn = d.querySelector(".ann-save") as HTMLElement;
    expect(saveBtn).not.toBeNull();
    expect(saveBtn.textContent).toContain("保存");
    (d.getElementById("ae-title") as HTMLInputElement).value = "改后的标题";
    (d.getElementById("ae-body") as HTMLTextAreaElement).value = "改后的正文";
    (d.getElementById("ae-sev") as HTMLSelectElement).value = "low";
    d.querySelector(".ann-save")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    const inspector = d.getElementById("inspector")!;
    expect(inspector.innerHTML).toContain("改后的标题");
    expect(inspector.innerHTML).toContain("改后的正文");
    // 编辑复用底部表单区，保存后恢复"新增批注"现场
    expect(d.getElementById("ae-title")).toBeNull();
    expect(d.getElementById("f-title")).not.toBeNull();

    let captured: { text: () => Promise<string> } | null = null;
    class CaptureBlob {
      private readonly parts: string[];
      constructor(parts: string[]) {
        this.parts = parts;
      }
      text(): Promise<string> {
        return Promise.resolve(this.parts.join(""));
      }
    }
    // @ts-expect-error 测试内替换浏览器 Blob
    window.Blob = CaptureBlob;
    window.URL.createObjectURL = ((b: unknown) => {
      captured = b as { text: () => Promise<string> };
      return "blob:mock";
    }) as typeof window.URL.createObjectURL;
    window.URL.revokeObjectURL = (() => undefined) as typeof window.URL.revokeObjectURL;
    window.HTMLAnchorElement.prototype.click = function () {
      /* 不真正下载 */
    };
    d.getElementById("btn-export")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const patch = JSON.parse(await captured!.text());
    const op = patch.ops.find((o: { op: string }) => o.op === "replace");
    expect(op).toBeTruthy();
    expect(op.path).toBe("/annotations/a.01JAXTEST0001AAAA0001");
    expect(op.value.title).toBe("改后的标题");
    expect(op.value.body).toBe("改后的正文");
    expect(op.value.severity).toBe("low");
    expect(op.value.author).toBe("human:lily");
    expect(op.value.status).toBe("open");
  });

  it("取消编辑：不改数据并恢复新增表单", () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    d.querySelector(".edit-ann")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    (d.getElementById("ae-title") as HTMLInputElement).value = "不该保存的标题";
    const back = d.querySelector(".ann-cancel") as HTMLElement;
    expect(back).not.toBeNull();
    expect(back.textContent).toContain("返回");
    back.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const inspector = d.getElementById("inspector")!;
    expect(inspector.innerHTML).toContain("已有批注");
    expect(inspector.innerHTML).not.toContain("不该保存的标题");
    expect(d.getElementById("ae-title")).toBeNull();
    expect(d.getElementById("f-title")).not.toBeNull();
  });});

/* ------------------- 交互回归：异常/跨文档/可见性 ------------------- */

function multiHtml(): string {
  const a = doc();
  const b: CovenantDoc = {
    covenant: "0.1",
    id: "t/other",
    profile: "c4-container@1",
    meta: { title: "另一张图", purpose: "p", non_goals: [], rev: 1 },
    elements: [
      { id: "e.x", kind: "container", name: "服务 X", summary: "x", tech: "TS" },
      { id: "e.y", kind: "container", name: "存储 Y", summary: "y", tech: "PG" },
    ],
    relations: [{ id: "r.xy", kind: "writes", from: "e.x", to: "e.y", summary: "写" }],
    views: [{ id: "v.main", title: "主视图" }],
    annotations: [],
  };
  const la = layout(a);
  const lb = layout(b);
  return renderHtml([
    { doc: a, svg: renderSvg(a, la), layout: la },
    { doc: b, svg: renderSvg(b, lb), layout: lb },
  ]);
}

function stubDownload(window: JSDOM["window"]): { blob: { text: () => Promise<string> } | null; download: string } {
  const state: { blob: { text: () => Promise<string> } | null; download: string } = { blob: null, download: "" };
  class CaptureBlob {
    private readonly parts: string[];
    constructor(parts: string[]) {
      this.parts = parts;
    }
    text(): Promise<string> {
      return Promise.resolve(this.parts.join(""));
    }
  }
  // @ts-expect-error 测试内替换浏览器 Blob
  window.Blob = CaptureBlob;
  window.URL.createObjectURL = ((b: unknown) => {
    state.blob = b as { text: () => Promise<string> };
    return "blob:mock";
  }) as typeof window.URL.createObjectURL;
  window.URL.revokeObjectURL = (() => undefined) as typeof window.URL.revokeObjectURL;
  window.HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    state.download = this.download;
  };
  return state;
}

describe("导出补丁 JSON（回归 doc 未定义）", () => {
  it("点击「导出补丁 JSON」能设置下载文件名且不抛 ReferenceError", async () => {
    const errors: string[] = [];
    const vc = new VirtualConsole();
    vc.on("jsdomError", (e) => errors.push(String((e as Error).message)));
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/", virtualConsole: vc });
    const { window } = dom;
    const d = window.document;
    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    (d.getElementById("f-title") as HTMLInputElement).value = "导出补丁用例";
    d.getElementById("f-submit")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const state = stubDownload(window);
    d.getElementById("btn-export")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(errors).toEqual([]);
    expect(state.download).toContain(".patch.json");
    expect(state.blob).not.toBeNull();
    const patch = JSON.parse(await state.blob!.text());
    expect(patch.ops.length).toBeGreaterThan(0);
  });
});

describe("批注内联编辑不再打断事件绑定", () => {
  it("进入批注编辑态不抛异常，且同面板状态流转按钮仍可用", () => {
    const errors: string[] = [];
    const vc = new VirtualConsole();
    vc.on("jsdomError", (e) => errors.push(String((e as Error).message)));
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/", virtualConsole: vc });
    const { window } = dom;
    const d = window.document;
    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    d.querySelector(".edit-ann")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(d.getElementById("ae-title")).not.toBeNull();
    expect(errors).toEqual([]);
    // 编辑态下，下方批注列表的状态流转按钮应已绑定（旧实现被 f-submit 异常跳过）
    const act = d.querySelector(".acts button") as HTMLElement | null;
    expect(act).not.toBeNull();
    expect(act!.getAttribute("data-act")).toBeTruthy();
    act!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const store = window.localStorage.getItem("covenant:viewer:v1") ?? "";
    expect(store).toContain("a.01JAXTEST0001AAAA0001");
  });
});

describe("切图瞬态清理与跨文档编辑隔离", () => {
  it("切图往返不残留批注内联编辑表单", () => {
    const dom = new JSDOM(multiHtml(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    const btns = d.querySelectorAll("#views button");
    const firstKey = btns[0]!.getAttribute("data-doc")!;
    const secondKey = btns[1]!.getAttribute("data-doc")!;
    d.querySelector("section.doc:not([hidden]) svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    d.querySelector(".edit-ann")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(d.getElementById("ae-title")).not.toBeNull();
    btns[1]!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    d.querySelector(`#views button[data-doc="${firstKey}"]`)!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(secondKey).not.toBe(firstKey);
    d.querySelector("section.doc:not([hidden]) svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(d.getElementById("ae-title")).toBeNull();
    expect(d.getElementById("f-title")).not.toBeNull();
  });

  it("切图重置钉住状态（窗口不再被隐式钉死）", () => {
    const dom = new JSDOM(multiHtml(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    const btns = d.querySelectorAll("#views button");
    d.querySelector("section.doc:not([hidden]) svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    (d.getElementById("insp-pin") as HTMLElement).dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect((d.getElementById("insp-pin") as HTMLElement).getAttribute("aria-pressed")).toBe("true");
    btns[1]!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    btns[0]!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    d.querySelector("section.doc:not([hidden]) svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect((d.getElementById("insp-pin") as HTMLElement).getAttribute("aria-pressed")).toBe("false");
  });

  it("编辑暂存按文档隔离：切图后不把 A 图 ops 带进 B 图", async () => {
    const dom = new JSDOM(multiHtml(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    const btns = d.querySelectorAll("#views button");
    d.getElementById("btn-edit")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    d.querySelector("section.doc:not([hidden]) svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    (d.getElementById("e-name") as HTMLInputElement).value = "改名后的 A";
    d.getElementById("edit-apply")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(d.getElementById("edit-pending")!.hidden).toBe(false);
    const pendingText = (d.getElementById("edit-pending") as HTMLElement).textContent ?? "";
    expect(Number(pendingText.replace(/\D+/g, ""))).toBeGreaterThan(0);
    // 切到 B 图：B 图没有暂存修改 → 导出按钮隐藏
    btns[1]!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect((d.getElementById("btn-edit-export") as HTMLElement).hidden).toBe(true);
    // 切回 A 图：A 的暂存修改还在，可导出且 doc 正确
    btns[0]!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect((d.getElementById("btn-edit-export") as HTMLElement).hidden).toBe(false);
    const state = stubDownload(window);
    d.getElementById("btn-edit-export")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const payload = JSON.parse(await state.blob!.text());
    expect(payload.doc).toBe("t/interact");
    expect(payload.ops.map((o: { path: string }) => o.path)).toContain("/elements/e.a/name");
  });

  it("编辑已存批注后 pending 计数包含编辑（不再显示 0）", () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    d.querySelector(".edit-ann")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    (d.getElementById("ae-title") as HTMLInputElement).value = "改标题";
    d.querySelector(".ann-save")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const pending = d.getElementById("pending")!;
    expect(pending.textContent).toContain("1");
  });
});