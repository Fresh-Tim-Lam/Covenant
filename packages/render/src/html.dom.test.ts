import { describe, expect, it } from "vitest";
import { JSDOM, VirtualConsole } from "jsdom";
import type { CovenantDoc } from "@covenant/core";
import { layout } from "@covenant/layout";
import { renderSvg } from "./index";
import { renderHtml } from "./html";
import type { DocView } from "./html";

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
  return htmlOf(doc());
}

function htmlOf(d: CovenantDoc): string {
  const l = layout(d);
  return renderHtml([{ doc: d, svg: renderSvg(d, l, { showBadges: false }), layout: l }]);
}

/** 三节点回调图：c→a 是跨两层的长边，紧凑布局下为 6 点路径（含通道段）。 */
function docLongEdge(): CovenantDoc {
  return {
    covenant: "0.1",
    id: "t/long-edge",
    profile: "c4-container@1",
    meta: { title: "长边", purpose: "p", non_goals: [] },
    elements: [
      { id: "e.a", kind: "container", name: "A", summary: "a", tech: "ts" },
      { id: "e.b", kind: "container", name: "B", summary: "b", tech: "ts" },
      { id: "e.c", kind: "datastore", name: "C", summary: "c", tech: "pg", props: { storage_kind: "rdbms" } },
    ],
    relations: [
      { id: "r.ab", kind: "calls", from: "e.a", to: "e.b", summary: "ab" },
      { id: "r.bc", kind: "writes", from: "e.b", to: "e.c", summary: "bc" },
      { id: "r.ca", kind: "reads", from: "e.c", to: "e.a", summary: "ca" },
    ],
  };
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

  it("窗口可拖出容器边界（不钳制）", () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const box = d.getElementById("inspector")!;
    const beforeLeft = parseFloat(box.style.left || "0");
    const beforeTop = parseFloat(box.style.top || "0");
    const head = box.querySelector(".insp-head") as HTMLElement;
    head.dispatchEvent(new window.PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 200, clientY: 200, pointerId: 1 }));
    window.dispatchEvent(new window.PointerEvent("pointermove", { bubbles: true, clientX: -500, clientY: -400, pointerId: 1 }));
    window.dispatchEvent(new window.PointerEvent("pointerup", { bubbles: true, clientX: -500, clientY: -400, pointerId: 1 }));
    const afterLeft = parseFloat(box.style.left);
    const afterTop = parseFloat(box.style.top);
    expect(afterLeft).toBe(beforeLeft + (-700));
    expect(afterTop).toBe(beforeTop + (-600));
    expect(afterLeft).toBeLessThan(0); // 负坐标 = 拖出左边界
    expect(afterTop).toBeLessThan(0); // 负坐标 = 拖出上边界
  });});
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

/* ------------------- 多小窗 / 悬停预览 / 同色引导线 / 折叠表单 ------------------- */

function visibleWins(d: Document): HTMLElement[] {
  return Array.from(d.querySelectorAll<HTMLElement>(".cvn-win")).filter((w) => !w.hidden);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pointer(window: JSDOM["window"], type: string, x = 40, y = 40): MouseEvent {
  return new window.MouseEvent(type, { bubbles: false, clientX: x, clientY: y });
}

function stageTransform(d: Document): { tx: number; ty: number; scale: number } {
  const t = d.getElementById("stage")?.style.transform ?? "";
  const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)\s*scale\((-?[\d.]+)\)/.exec(t);
  return m ? { tx: Number(m[1]), ty: Number(m[2]), scale: Number(m[3]) } : { tx: 0, ty: 0, scale: 1 };
}

function embeddedCenters(d: Document): {
  elements: Record<string, [number, number]>;
  relations: Record<string, [number, number]>;
} {
  const raw = d.getElementById("covenant-data")!.textContent!;
  return JSON.parse(raw).docs[0].centers;
}

function guideLines(d: Document): SVGLineElement[] {
  return Array.from(d.querySelectorAll<SVGLineElement>("#insp-guides line"));
}

/* ---- 折线弧长几何（独立实现，用来独立校验 viewer 的"边中点"锚点） ---- */

function polylineLength(points: { x: number; y: number }[]): number {
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    total += Math.hypot(points[i + 1]!.x - points[i]!.x, points[i + 1]!.y - points[i]!.y);
  }
  return total;
}

/** 沿折线弧长取 t=0.5 的点（与实现无关的期望值）。 */
function arcMidpoint(points: { x: number; y: number }[]): { x: number; y: number } {
  const total = polylineLength(points);
  if (!points.length) return { x: 0, y: 0 };
  let acc = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + len >= total / 2) {
      const t = len === 0 ? 0 : (total / 2 - acc) / len;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    acc += len;
  }
  return { ...points[points.length - 1]! };
}

/** 折线上离 p 最近的点对应的"自起点的弧长距离"（用于断言离两端端口的距离占比）。 */
function arcDistanceFromStart(points: { x: number; y: number }[], p: { x: number; y: number }): number {
  let acc = 0;
  let best = Number.POSITIVE_INFINITY;
  let bestArc = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
    const q = { x: a.x + dx * t, y: a.y + dy * t };
    const dist = Math.hypot(p.x - q.x, p.y - q.y);
    if (dist < best) {
      best = dist;
      bestArc = acc + Math.hypot(q.x - a.x, q.y - a.y);
    }
    acc += Math.hypot(dx, dy);
  }
  return bestArc;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** 把引导线锚点（屏幕坐标 x2/y2）换回 SVG 用户坐标。 */
function anchorInSvg(d: Document): { x: number; y: number } {
  const line = guideLines(d)[0]!;
  const t = stageTransform(d);
  return {
    x: (Number(line.getAttribute("x2")) - t.tx) / t.scale,
    y: (Number(line.getAttribute("y2")) - t.ty) / t.scale,
  };
}

describe("「新增批注」表单默认折叠", () => {
  it("默认收起；点击标题行展开；再点收起", () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;

    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const win = visibleWins(d)[0]!;
    const toggle = win.querySelector(".ann-form-toggle") as HTMLElement;
    const body = win.querySelector(".ann-form-body") as HTMLElement;

    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toContain("新增批注");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(body.hidden).toBe(true);
    // 收起时输入仍在 DOM 里（只是隐藏），展开后立即可用
    expect(win.querySelector("#f-title")).not.toBeNull();

    toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(body.hidden).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect((win.querySelector("#f-title") as HTMLInputElement).value).toBe("");

    toggle.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(body.hidden).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("切换到别的对象（边）后恢复默认收起", () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;

    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    (visibleWins(d)[0]!.querySelector(".ann-form-toggle") as HTMLElement).dispatchEvent(
      new window.MouseEvent("click", { bubbles: true }),
    );
    expect((visibleWins(d)[0]!.querySelector(".ann-form-body") as HTMLElement).hidden).toBe(false);

    // 点边 → 再开一个新窗（多窗并存），新窗表单必须是默认收起
    d.querySelector("svg .edge")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(visibleWins(d)).toHaveLength(2);
    const win = visibleWins(d).find((w) => w.getAttribute("data-target") === "r.ab")!;
    expect(win).toBeTruthy();
    expect((win.querySelector(".ann-form-body") as HTMLElement).hidden).toBe(true);
    expect((win.querySelector(".ann-form-toggle") as HTMLElement).getAttribute("aria-expanded")).toBe("false");
  });
});

describe("悬停预览小窗（hover 态）", () => {
  it("悬停元素 → 出现小窗 + 同色高亮；移开 → 小窗消失", async () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    const node = d.querySelector("svg .node") as SVGElement;

    node.dispatchEvent(pointer(window, "pointerenter"));
    expect(visibleWins(d)).toHaveLength(1);
    const win = visibleWins(d)[0]!;
    const color = win.getAttribute("data-color")!;
    expect(color).toBeTruthy();
    expect(win.getAttribute("data-target")).toBe("e.a");
    // 锚定元素用同色高亮
    expect(node.classList.contains("hl")).toBe(true);
    expect(node.style.getPropertyValue("--hl")).toBe(color);

    node.dispatchEvent(pointer(window, "pointerleave"));
    await sleep(220);
    expect(visibleWins(d)).toHaveLength(0);
    expect(node.classList.contains("hl")).toBe(false);
  });

  it("鼠标移入窗口本体不关闭（可操作）；离开窗口后才收", async () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    const node = d.querySelector("svg .node") as SVGElement;

    node.dispatchEvent(pointer(window, "pointerenter"));
    const win = visibleWins(d)[0]!;
    expect(win).toBeTruthy();

    node.dispatchEvent(pointer(window, "pointerleave"));
    win.dispatchEvent(pointer(window, "pointerenter"));
    await sleep(200);
    expect(visibleWins(d)).toHaveLength(1); // 计时被取消，预览保留

    win.dispatchEvent(pointer(window, "pointerleave"));
    await sleep(220);
    expect(visibleWins(d)).toHaveLength(0);
  });
});

describe("点击保留与关闭规则", () => {
  it("左键点击后移开不消失；点空白才关闭", async () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    const node = d.querySelector("svg .node") as SVGElement;

    node.dispatchEvent(pointer(window, "pointerenter"));
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    node.dispatchEvent(pointer(window, "pointerleave"));
    await sleep(220);
    expect(visibleWins(d)).toHaveLength(1); // 点击态：移开不消失
    // 引导线 overlay 在有小窗时可见（svg 靠 attribute 控制显示）
    expect(d.getElementById("insp-guides")!.hasAttribute("hidden")).toBe(false);

    d.querySelector("svg")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(visibleWins(d)).toHaveLength(0);
    expect(d.getElementById("insp-guides")!.hasAttribute("hidden")).toBe(true);
  });

  it("点 A 再点 B → 两窗并存（未钉住也保留）；点空白 → 两窗都关", () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;

    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(visibleWins(d)[0]!.getAttribute("data-target")).toBe("e.a");

    // 点击另一个对象不关闭已有点击窗，而是再开一个窗
    d.querySelector("svg .edge")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const wins = visibleWins(d);
    expect(wins).toHaveLength(2);
    expect(wins.map((w) => w.getAttribute("data-target")).sort()).toEqual(["e.a", "r.ab"]);
    expect(wins.map((w) => w.getAttribute("data-kind")).sort()).toEqual(["element", "relation"]);
    // 两个锚定对象都同色高亮
    expect(d.querySelector("svg .node")!.classList.contains("hl")).toBe(true);
    expect(d.querySelector("svg .edge")!.classList.contains("hl")).toBe(true);
    expect(guideLines(d)).toHaveLength(2);

    // 点空白画布 → 关闭所有未钉住的窗
    d.querySelector("svg")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(visibleWins(d)).toHaveLength(0);
    expect(d.querySelector("svg .node")!.classList.contains("hl")).toBe(false);
    expect(d.querySelector("svg .edge")!.classList.contains("hl")).toBe(false);
    expect(guideLines(d)).toHaveLength(0);
    expect(d.getElementById("insp-guides")!.hasAttribute("hidden")).toBe(true);
  });
});

describe("多小窗并存 / 颜色 / 层级", () => {
  it("📌 钉住后点击另一个对象：两窗并存、颜色不同、各有引导线、级联错开", () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;

    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const win1 = visibleWins(d)[0]!;
    (win1.querySelector(".pin-btn") as HTMLElement).dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect((win1.querySelector(".pin-btn") as HTMLElement).getAttribute("aria-pressed")).toBe("true");

    d.querySelector("svg .edge")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const wins = visibleWins(d);
    expect(wins).toHaveLength(2);
    const colors = new Set(wins.map((w) => w.getAttribute("data-color")));
    expect(colors.size).toBe(2);
    // 窗口边框/标题条用各自颜色
    expect(win1.style.borderColor).not.toBe("");
    // 级联偏移：两窗默认位置不完全重叠
    expect(`${wins[0]!.style.left},${wins[0]!.style.top}`).not.toBe(`${wins[1]!.style.left},${wins[1]!.style.top}`);
    // 每条引导线颜色 = 对应窗口颜色
    const lines = guideLines(d);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      const owner = wins.find((w) => w.getAttribute("data-win") === line.getAttribute("data-win"))!;
      expect(owner).toBeTruthy();
      expect(line.getAttribute("stroke")).toBe(owner.getAttribute("data-color"));
    }
  });

  it("点空白只关未钉住的窗，📌 钉住的保留", () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;

    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const win1 = visibleWins(d)[0]!;
    (win1.querySelector(".pin-btn") as HTMLElement).dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    d.querySelector("svg .edge")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(visibleWins(d)).toHaveLength(2);

    d.querySelector("svg")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const left = visibleWins(d);
    expect(left).toHaveLength(1);
    expect(left[0]!.getAttribute("data-target")).toBe("e.a");
    expect((left[0]!.querySelector(".pin-btn") as HTMLElement).getAttribute("aria-pressed")).toBe("true");
  });
});

describe("窗口拖拽与同色引导线", () => {
  it("拖拽窗头移动窗口：引导线窗口端实时更新、锚点端不动", () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;

    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const win = visibleWins(d)[0]!;
    const line = guideLines(d)[0]!;
    expect(line).toBeTruthy();
    const before = {
      left: parseFloat(win.style.left),
      top: parseFloat(win.style.top),
      x1: line.getAttribute("x1"),
      y1: line.getAttribute("y1"),
      x2: line.getAttribute("x2"),
      y2: line.getAttribute("y2"),
    };
    expect(Number.isFinite(before.left)).toBe(true);
    expect(Number.isFinite(before.top)).toBe(true);

    const head = win.querySelector(".insp-head") as Element;
    head.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    window.dispatchEvent(new window.MouseEvent("pointermove", { bubbles: true, clientX: 110, clientY: 90 }));
    window.dispatchEvent(new window.MouseEvent("pointerup", { bubbles: true, clientX: 110, clientY: 90 }));

    expect(parseFloat(win.style.left)).toBeCloseTo(before.left + 100, 0);
    expect(parseFloat(win.style.top)).toBeCloseTo(before.top + 80, 0);
    // 窗口端坐标变化
    const moved = line.getAttribute("x1") !== before.x1 || line.getAttribute("y1") !== before.y1;
    expect(moved).toBe(true);
    // 锚点端（元素中心）不随窗口拖拽改变
    expect(line.getAttribute("x2")).toBe(before.x2);
    expect(line.getAttribute("y2")).toBe(before.y2);
  });

  it("引导线连到元素中心 / 边的弧长中点，且颜色=窗口色", () => {
    // 元素锚点
    const domA = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const wa = domA.window;
    const da = wa.document;
    da.querySelector("svg .node")!.dispatchEvent(new wa.MouseEvent("click", { bubbles: true }));
    const lineA = guideLines(da)[0]!;
    const tA = stageTransform(da);
    const centerA = embeddedCenters(da).elements["e.a"]!;
    expect(Number(lineA.getAttribute("x2"))).toBeCloseTo(tA.tx + centerA[0] * tA.scale, 1);
    expect(Number(lineA.getAttribute("y2"))).toBeCloseTo(tA.ty + centerA[1] * tA.scale, 1);
    const winA = visibleWins(da)[0]!;
    expect(lineA.getAttribute("stroke")).toBe(winA.getAttribute("data-color"));

    // 边锚点：路径弧长 t=0.5 的中点（不是端点/箭头）
    const domB = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const wb = domB.window;
    const db = wb.document;
    db.querySelector("svg .edge")!.dispatchEvent(new wb.MouseEvent("click", { bubbles: true }));
    const lineB = guideLines(db)[0]!;
    const tB = stageTransform(db);
    const pts = layout(doc()).edges.find((e) => e.id === "r.ab")!.points;
    const mid = arcMidpoint(pts);
    expect(Number(lineB.getAttribute("x2"))).toBeCloseTo(round1(tB.tx + mid.x * tB.scale), 1);
    expect(Number(lineB.getAttribute("y2"))).toBeCloseTo(round1(tB.ty + mid.y * tB.scale), 1);
    const total = polylineLength(pts);
    const anchor = anchorInSvg(db);
    const fromStart = arcDistanceFromStart(pts, anchor);
    expect(fromStart).toBeGreaterThan(0.3 * total);
    expect(total - fromStart).toBeGreaterThan(0.3 * total);
    expect(visibleWins(db)[0]!.getAttribute("data-kind")).toBe("relation");
  });

  it("多段（6 点）边：锚点落在中段而非起点端口（旧实现回退 points[0] 的回归）", () => {
    const d3 = docLongEdge();
    const geom = layout(d3).edges.find((e) => e.id === "r.ca")!;
    const pts = geom.points;
    // 紧凑布局下跨层长边是 6 点路径；至少多于 4 点才会触发旧的"回退到端点"分支
    expect(pts.length).toBeGreaterThan(4);
    const total = polylineLength(pts);
    const mid = arcMidpoint(pts);

    const dom = new JSDOM(htmlOf(d3), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    d.querySelector('svg .edge[data-id="r.ca"]')!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const line = guideLines(d)[0]!;
    const t = stageTransform(d);

    // 锚点 == 路径弧长 t=0.5 坐标
    expect(Number(line.getAttribute("x2"))).toBeCloseTo(round1(t.tx + mid.x * t.scale), 1);
    expect(Number(line.getAttribute("y2"))).toBeCloseTo(round1(t.ty + mid.y * t.scale), 1);
    // 距两端端口（points[0] / points[last]）的弧长距离均 > 30% 总弧长
    const anchor = anchorInSvg(d);
    const fromStart = arcDistanceFromStart(pts, anchor);
    const fromEnd = total - fromStart;
    expect(fromStart).toBeGreaterThan(0.3 * total);
    expect(fromEnd).toBeGreaterThan(0.3 * total);
    // 明确不再连到起点端口（距离端点 > 30% 弧长 => 欧氏距离也显著大于 1px）
    const first = pts[0]!;
    expect(Math.hypot(anchor.x - first.x, anchor.y - first.y)).toBeGreaterThan(1);
  });
});

/* ------------------- 多段边（segment）viewer 能力 ------------------- */

/** 两节点 + 一条多段边：带整边旧批注 + 段 0/段 1 批注。 */
function docSeg(): CovenantDoc {
  return {
    covenant: "0.1",
    id: "t/seg",
    profile: "c4-container@1",
    meta: { title: "多段边", purpose: "p", non_goals: [], rev: 2 },
    elements: [
      { id: "e.a", kind: "container", name: "服务 A", summary: "做 A", tech: "TS" },
      { id: "e.b", kind: "datastore", name: "存储 B", summary: "存 B", tech: "PG", props: { storage_kind: "rdbms" } },
    ],
    relations: [{ id: "r.ab", kind: "writes", from: "e.a", to: "e.b", summary: "写" }],
    annotations: [
      {
        id: "a.WHOLEEDGE0000000000000",
        target: { kind: "relation", id: "r.ab" },
        type: "risk",
        severity: "medium",
        title: "整边旧批注",
        status: "open",
        author: "human:lily",
        created: "2026-11-03T00:00:00+08:00",
      },
      {
        id: "a.SEGMENT0000000000000",
        target: { kind: "relation", id: "r.ab", segment: 0 },
        type: "todo",
        severity: "high",
        title: "第0段批注",
        status: "open",
        author: "human:lily",
        created: "2026-11-03T00:00:00+08:00",
      },
      {
        id: "a.SEGMENT1111111111111",
        target: { kind: "relation", id: "r.ab", segment: 1 },
        type: "question",
        severity: "low",
        title: "第1段批注",
        status: "open",
        author: "human:lily",
        created: "2026-11-03T00:00:00+08:00",
      },
    ],
  };
}

interface DocSegments {
  points: [number, number][];
  segmentCount: number;
}

function embeddedDoc(d: Document): {
  segments: Record<string, DocSegments>;
  centers: { elements: Record<string, [number, number]>; relations: Record<string, [number, number]> };
} {
  const raw = d.getElementById("covenant-data")!.textContent!;
  return JSON.parse(raw).docs[0];
}

function segHits(d: Document, relationId: string): SVGElement[] {
  return Array.from(d.querySelectorAll<SVGElement>(`.edge[data-id="${relationId}"] .seg-hit`));
}

function guideLineFor(d: Document, win: HTMLElement): SVGLineElement | undefined {
  return guideLines(d).find((l) => l.getAttribute("data-win") === win.getAttribute("data-win"));
}

function segMidOf(points: [number, number][], k: number): [number, number] {
  const a = points[k]!;
  const b = points[k + 1]!;
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

describe("多段边：段热区 / 段窗 / 段批注 / badge / 导出", () => {
  it("点 segment0 与 segment1 → 两窗并存，引导线锚点各自段中点，段角标也在段中点", () => {
    const dom = new JSDOM(htmlOf(docSeg()), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    const hits = segHits(d, "r.ab");
    // 紧凑布局下 r.ab 是多段折线（>=2 段）
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0]!.getAttribute("data-seg")).toBe("0");

    hits[0]!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    hits[1]!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    const wins = visibleWins(d);
    expect(wins).toHaveLength(2);
    expect(wins.map((w) => w.getAttribute("data-segment")).sort()).toEqual(["0", "1"]);
    // 段窗标题显示 段 k/n
    const t = stageTransform(d);
    const data = embeddedDoc(d);
    for (const win of wins) {
      expect(win.querySelector(".hint")!.textContent).toContain("段 ");
      expect(win.querySelector(".hint")!.textContent).toMatch(/段 [12]\/\d+/);
      const k = Number(win.getAttribute("data-segment"));
      const mid = segMidOf(data.segments["r.ab"]!.points, k);
      const line = guideLineFor(d, win)!;
      expect(line).toBeTruthy();
      expect(Number(line.getAttribute("x2"))).toBeCloseTo(round1(t.tx + mid[0] * t.scale), 1);
      expect(Number(line.getAttribute("y2"))).toBeCloseTo(round1(t.ty + mid[1] * t.scale), 1);
    }
    // 段角标画在各自段中点（整边另有 1 个 badge）
    const segBadges = Array.from(d.querySelectorAll("#cvn-badges circle[data-seg]"));
    expect(segBadges).toHaveLength(2);
    for (const c of segBadges) {
      const k = Number(c.getAttribute("data-seg"));
      const mid = segMidOf(data.segments["r.ab"]!.points, k);
      expect(Number(c.getAttribute("cx"))).toBeCloseTo(mid[0], 1);
      expect(Number(c.getAttribute("cy"))).toBeCloseTo(mid[1], 1);
    }
  });

  it("段窗只列该段批注；「整条边批注」折叠但可见/可展开", () => {
    const dom = new JSDOM(htmlOf(docSeg()), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    segHits(d, "r.ab")[0]!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const win = visibleWins(d)[0]!;

    const mainList = win.querySelector("ul.anns")!;
    expect(mainList.textContent).toContain("第0段批注");
    expect(mainList.textContent).not.toContain("第1段批注");
    expect(win.textContent).toContain("整条边批注（1）");

    const body = win.querySelector(".whole-edge-body") as HTMLElement;
    expect(body.hidden).toBe(true); // 默认折叠
    expect(body.textContent).toContain("整边旧批注");
    (win.querySelector(".whole-edge-toggle") as HTMLElement).dispatchEvent(
      new window.MouseEvent("click", { bubbles: true }),
    );
    expect(body.hidden).toBe(false);
    expect((win.querySelector(".whole-edge-toggle") as HTMLElement).getAttribute("aria-expanded")).toBe("true");
  });

  it("导出 patch：段窗提交的 target 带 segment", async () => {
    const dom = new JSDOM(htmlOf(docSeg()), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    segHits(d, "r.ab")[1]!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const win = visibleWins(d)[0]!;

    (win.querySelector("#f-title") as HTMLInputElement).value = "段 1 新批注";
    (win.querySelector("#f-submit") as HTMLElement).dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    const state = stubDownload(window);
    d.getElementById("btn-export")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const patch = JSON.parse(await state.blob!.text());
    const add = patch.ops.find((o: { op: string }) => o.op === "add");
    expect(add.value.title).toBe("段 1 新批注");
    expect(add.value.target).toEqual({ kind: "relation", id: "r.ab", segment: 1 });
  });

  it("新建表单可切「整条边」：导出 target 不带 segment", async () => {
    const dom = new JSDOM(htmlOf(docSeg()), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    segHits(d, "r.ab")[0]!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const win = visibleWins(d)[0]!;

    const scope = win.querySelector('[data-field="f-scope"]') as HTMLSelectElement;
    expect(scope).not.toBeNull();
    scope.value = "edge";
    scope.dispatchEvent(new window.Event("change", { bubbles: true }));
    (win.querySelector("#f-title") as HTMLInputElement).value = "整条边新批注";
    (win.querySelector("#f-submit") as HTMLElement).dispatchEvent(new window.MouseEvent("click", { bubbles: true }));

    const state = stubDownload(window);
    d.getElementById("btn-export")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const patch = JSON.parse(await state.blob!.text());
    const add = patch.ops.find((o: { op: string }) => o.op === "add");
    expect(add.value.target).toEqual({ kind: "relation", id: "r.ab" });
    expect(add.value.target.segment).toBeUndefined();
  });

  it("整条边旧批注仍可打开/改状态；段窗可打开整条边窗口", () => {
    const dom = new JSDOM(htmlOf(docSeg()), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;

    // 从段窗点「打开整条边窗口」→ 第二个窗，segment 为空
    segHits(d, "r.ab")[0]!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const segWin = visibleWins(d)[0]!;
    (segWin.querySelector(".open-edge-win") as HTMLElement).dispatchEvent(
      new window.MouseEvent("click", { bubbles: true }),
    );
    const edgeWin = visibleWins(d).find((w) => w.getAttribute("data-segment") === null)!;
    expect(edgeWin).toBeTruthy();
    expect(visibleWins(d)).toHaveLength(2);
    expect(edgeWin.textContent).toContain("整边旧批注");

    // 整边旧批注的状态流转仍可用
    const act = edgeWin.querySelector('.acts button[data-act="resolved"]') as HTMLElement;
    expect(act).not.toBeNull();
    act.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const store = JSON.parse(window.localStorage.getItem("covenant:viewer:v1") ?? "{}");
    expect(store["t/seg"].status["a.WHOLEEDGE0000000000000"]).toBe("resolved");
  });
});

/* ------------------- P0 回归：悬停不离开时不闪不同颜色 ------------------- */

describe("悬停窗颜色稳定（不闪色）", () => {
  it("指针在元素/窗口边界振荡（relatedTarget=窗口）不关闭、颜色不变", async () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    const node = d.querySelector("svg .node") as SVGElement;

    node.dispatchEvent(pointer(window, "pointerenter"));
    const win = visibleWins(d)[0]!;
    const color = win.getAttribute("data-color")!;
    expect(color).toBeTruthy();

    // 模拟指针从元素移到窗口本体（边界振荡）：relatedTarget 是窗口
    node.dispatchEvent(
      new window.MouseEvent("pointerleave", { bubbles: false, relatedTarget: win }),
    );
    await sleep(200);
    expect(visibleWins(d)).toHaveLength(1); // 不关闭
    expect(visibleWins(d)[0]!.getAttribute("data-color")).toBe(color); // 颜色不变

    // 再进元素（窗口仍在）：仍同色、不重复开窗
    node.dispatchEvent(pointer(window, "pointerenter"));
    expect(visibleWins(d)).toHaveLength(1);
    expect(visibleWins(d)[0]!.getAttribute("data-color")).toBe(color);

    // 用户描述的振荡序列：leave + enter 反复（窗口未关闭前 enter 会清掉关闭计时）
    for (let i = 0; i < 3; i++) {
      node.dispatchEvent(pointer(window, "pointerleave"));
      node.dispatchEvent(pointer(window, "pointerenter"));
    }
    await sleep(200);
    expect(visibleWins(d)).toHaveLength(1);
    expect(visibleWins(d)[0]!.getAttribute("data-color")).toBe(color);
  });

  it("hover 窗关闭后 400ms 内同一目标重开：复用上次颜色（色忆兜底）", async () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    const node = d.querySelector("svg .node") as SVGElement;

    node.dispatchEvent(pointer(window, "pointerenter"));
    const color = visibleWins(d)[0]!.getAttribute("data-color")!;
    node.dispatchEvent(pointer(window, "pointerleave"));
    await sleep(220);
    expect(visibleWins(d)).toHaveLength(0);

    // 立刻重新悬停：应复用刚才的颜色，而不是分配下一个颜色
    node.dispatchEvent(pointer(window, "pointerenter"));
    const again = visibleWins(d)[0]!;
    expect(again).toBeTruthy();
    expect(again.getAttribute("data-color")).toBe(color);
  });
});

/* ------------------- 侧栏文档分组 ------------------- */

function miniDoc(id: string, title: string): CovenantDoc {
  return {
    covenant: "0.1",
    id,
    profile: "c4-container@1",
    meta: { title, purpose: "p", non_goals: [] },
    elements: [
      { id: "e.a", kind: "container", name: "A", summary: "a", tech: "ts" },
      { id: "e.b", kind: "container", name: "B", summary: "b", tech: "ts" },
    ],
    relations: [{ id: "r.ab", kind: "calls", from: "e.a", to: "e.b", summary: "ab" }],
  };
}

function viewOf(d: CovenantDoc): DocView {
  const l = layout(d);
  return { doc: d, svg: renderSvg(d, l, { showBadges: false }), layout: l };
}

function groupedHtml(): string {
  return renderHtml([
    viewOf(miniDoc("covenant/self-architecture", "自身架构图")),
    viewOf(miniDoc("covenant/self", "系统结构")),
    viewOf(miniDoc("payments/context", "支付上下文")),
    viewOf(miniDoc("payments/components", "支付组件")),
    viewOf(miniDoc("t/custom", "未知文档")),
  ]);
}

describe("侧栏文档分组", () => {
  it("按组渲染标题；组内按钮数正确；按钮归属正确；组标题不可点击", () => {
    const dom = new JSDOM(groupedHtml(), { runScripts: "dangerously", url: "https://example.test/" });
    const d = dom.window.document;
    const groups = Array.from(d.querySelectorAll<HTMLElement>(".views-group"));

    expect(groups.map((g) => g.getAttribute("data-group"))).toEqual([
      "自身架构",
      "系统契约",
      "示例演示",
      "其他",
    ]);
    expect(Array.from(d.querySelectorAll(".views-group-title")).map((e) => e.textContent)).toEqual([
      "自身架构",
      "系统契约",
      "示例演示",
      "其他",
    ]);
    // 每组文档按钮数：自身架构1 / 系统契约1 / 示例演示2 / 其他1
    expect(groups.map((g) => g.querySelectorAll("button[data-doc]").length)).toEqual([1, 1, 2, 1]);
    // 当前选中 doc 的按钮在正确组内
    expect(
      groups[0]!.querySelector('button[data-doc="covenant/self-architecture"]'),
    ).not.toBeNull();
    expect(groups[2]!.querySelector('button[data-doc="payments/components"]')).not.toBeNull();
    // 组标题是不可点击的标题（不是 button），默认全部展开（组内按钮都可见）
    expect(d.querySelectorAll("#views button.views-group-title").length).toBe(0);
    for (const g of groups) {
      for (const b of Array.from(g.querySelectorAll<HTMLElement>("button[data-doc]"))) {
        expect(b.hidden).toBe(false);
      }
    }
  });

  it("当前激活 view 所在组的标题高亮；切到示例文档后高亮跟随", () => {
    const dom = new JSDOM(groupedHtml(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    const groupOf = (name: string): HTMLElement =>
      d.querySelector(`.views-group[data-group="${name}"]`)!;

    expect(groupOf("自身架构").className).toContain("on");
    expect(groupOf("示例演示").className).not.toContain("on");

    d.querySelector('button[data-doc="payments/components"]')!.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true }),
    );
    expect(groupOf("示例演示").className).toContain("on");
    expect(groupOf("自身架构").className).not.toContain("on");
    // 按钮仍保留 views-doc 缩进类
    expect(
      d.querySelector('button[data-doc="payments/components"]')!.className,
    ).toContain("views-doc");
  });

  it("真实看板形状：自身架构 1 + 示例演示 15（含多视图），不渲染空组", () => {
    const self = viewOf(miniDoc("covenant/self-architecture", "Covenant 自身架构"));
    const examples: DocView[] = [
      viewOf(miniDoc("covenant/package-graph", "包依赖")),
      { ...viewOf(miniDoc("example/multi-view", "多视图")), viewId: "v.core", viewTitle: "核心" },
      { ...viewOf(miniDoc("example/multi-view", "多视图")), viewId: "v.public", viewTitle: "公开" },
      viewOf(miniDoc("orders/dfd", "数据流")),
      viewOf(miniDoc("order/er", "数据模型")),
      viewOf(miniDoc("order/flow", "主流程")),
      viewOf(miniDoc("order/sequence", "交互")),
      viewOf(miniDoc("order/state", "生命周期")),
      { ...viewOf(miniDoc("payments/containers", "容器")), viewId: "v.main", viewTitle: "主视图" },
      { ...viewOf(miniDoc("payments/containers", "容器")), viewId: "v.data", viewTitle: "数据视图" },
      viewOf(miniDoc("payments/components", "组件")),
      viewOf(miniDoc("payments/context", "上下文")),
      viewOf(miniDoc("payments/deployment", "部署")),
      viewOf(miniDoc("quickstart/mini", "快速开始")),
      viewOf(miniDoc("topology/junction", "接线点")),
    ];
    const dom = new JSDOM(renderHtml([self, ...examples]), {
      runScripts: "dangerously",
      url: "https://example.test/",
    });
    const d = dom.window.document;
    expect(Array.from(d.querySelectorAll(".views-group-title")).map((e) => e.textContent)).toEqual([
      "自身架构",
      "示例演示",
    ]);
    expect(d.querySelectorAll("#views button[data-doc]")).toHaveLength(16);
    expect(
      d.querySelectorAll('.views-group[data-group="示例演示"] button[data-doc]'),
    ).toHaveLength(15);
    expect(d.querySelector('.views-group[data-group="自身架构"]')!.className).toContain("on");
  });

  it("分组优先级：source 路径优先于 id 推断；meta.group 可覆盖", () => {
    const archView: DocView = { ...viewOf(miniDoc("custom/whatever", "X")), source: "arch/system.cvn.yaml" };
    const metaDoc = miniDoc("x/with-meta", "Z");
    (metaDoc.meta as unknown as Record<string, unknown>).group = "自定义";
    const dom = new JSDOM(renderHtml([archView, viewOf(metaDoc)]), {
      runScripts: "dangerously",
      url: "https://example.test/",
    });
    const d = dom.window.document;
    expect(Array.from(d.querySelectorAll(".views-group-title")).map((e) => e.textContent)).toEqual([
      "系统契约",
      "自定义",
    ]);
  });

  it("分组后点按钮仍能正常切图（回归）", () => {
    const dom = new JSDOM(groupedHtml(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    d.querySelector('button[data-doc="payments/components"]')!.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true }),
    );
    expect((d.querySelector('section.doc[data-doc="payments/components"]') as HTMLElement).hidden).toBe(false);
    expect((d.querySelector('section.doc[data-doc="covenant/self-architecture"]') as HTMLElement).hidden).toBe(true);
    expect(d.querySelector('button[data-doc="payments/components"]')!.className).toContain("on");
  });
});

/* ------------------- P0 回归：幽灵窗（已关闭窗口复活）导致高亮/引导线残留 ------------------- */

describe("窗口关闭后高亮与引导线必须彻底清理", () => {
  it("主窗复用时，新窗口上的 pointer 事件不会复活已关闭窗口的高亮/引导线", () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    const node = d.querySelector("svg .node") as SVGElement;
    const edge = d.querySelector("svg .edge") as SVGElement;

    // 先给元素开窗，再点空白关闭（主窗被隐藏、innerHTML 清空）
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    d.querySelector("svg")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(visibleWins(d)).toHaveLength(0);
    expect(d.querySelectorAll(".hl")).toHaveLength(0);

    // 再给边开窗：复用同一个主窗 DOM 元素 #inspector
    edge.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(visibleWins(d)).toHaveLength(1);
    expect(d.querySelectorAll(".hl")).toHaveLength(1);

    // 用户在新窗口上按下/移入移出：旧实现里主窗上残留的旧监听会把已关闭的
    // 元素窗对象重新塞回 wins，导致元素+边同时高亮、引导线变两条（幽灵窗）。
    const win = visibleWins(d)[0]!;
    win.dispatchEvent(new window.MouseEvent("pointerdown", { bubbles: true, button: 0 }));
    win.dispatchEvent(pointer(window, "pointerenter"));
    win.dispatchEvent(pointer(window, "pointerleave"));

    const hls = Array.from(d.querySelectorAll(".hl"));
    expect(hls).toHaveLength(1);
    expect(hls[0]!.getAttribute("data-id")).toBe("r.ab");
    expect(hls[0]!.getAttribute("class")).toContain("edge");
    expect(node.classList.contains("hl")).toBe(false);
    expect(guideLines(d)).toHaveLength(1);

    // 关掉后仍必须归零
    d.querySelector("svg")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(visibleWins(d)).toHaveLength(0);
    expect(d.querySelectorAll(".hl")).toHaveLength(0);
    expect(guideLines(d)).toHaveLength(0);
  });

  it("只高亮窗口直接锚定的对象：元素窗不牵连其关联边，边窗不牵连端点元素", () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;

    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(visibleWins(d)[0]!.getAttribute("data-kind")).toBe("element");
    expect(d.querySelector("svg .node")!.classList.contains("hl")).toBe(true);
    expect(d.querySelector("svg .edge")!.classList.contains("hl")).toBe(false);

    d.querySelector("svg")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    d.querySelector("svg .edge")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(visibleWins(d)[0]!.getAttribute("data-kind")).toBe("relation");
    expect(d.querySelector("svg .edge")!.classList.contains("hl")).toBe(true);
    expect(d.querySelector("svg .node")!.classList.contains("hl")).toBe(false);
  });
});

/* ------------------- impl_status / evidence 小窗展示（task-18 Step 2） ------------------- */

function docImpl(): CovenantDoc {
  return {
    covenant: "0.1",
    id: "t/impl",
    profile: "c4-container@1",
    meta: { title: "实现状态", purpose: "p", non_goals: [] },
    elements: [
      {
        id: "e.a",
        kind: "container",
        name: "部分实现 A",
        summary: "a",
        tech: "ts",
        impl_status: "partial",
        evidence: [
          { kind: "code", path: "packages/render/src/html.ts", lines: "1-10" },
          { kind: "doc", path: "docs/design/format-spec-v0.md" },
        ],
      },
      {
        id: "e.b",
        kind: "datastore",
        name: "计划中 B",
        summary: "b",
        tech: "pg",
        props: { storage_kind: "rdbms" },
        impl_status: "planned",
      },
    ],
    relations: [
      // 缺省 impl_status → 弱端继承：max(partial, planned) = planned
      { id: "r.ab", kind: "writes", from: "e.a", to: "e.b", summary: "写" },
      // 显式 not_connected
      { id: "r.ba", kind: "reads", from: "e.b", to: "e.a", summary: "读", impl_status: "not_connected" },
    ],
  };
}

describe("小窗实现状态 chip 与证据列表", () => {
  it("元素窗显示显式 impl_status chip（partial → 蓝色）", () => {
    const dom = new JSDOM(htmlOf(docImpl()), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    d.querySelector('svg .node[data-id="e.a"]')!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const win = visibleWins(d)[0]!;
    const chip = win.querySelector(".impl-chip")!;
    expect(chip).not.toBeNull();
    expect(chip.getAttribute("class")).toContain("impl-partial");
    expect(chip.textContent).toBe("partial");
    // 元素显式声明，不应有"继承"标注
    expect(win.querySelector(".impl-note")).toBeNull();
  });

  it("边窗显示继承状态 +（继承自端点）；显式声明的关系不标注", () => {
    const dom = new JSDOM(htmlOf(docImpl()), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;

    d.querySelector('svg .edge[data-id="r.ab"]')!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    let win = visibleWins(d)[0]!;
    let chip = win.querySelector(".impl-chip")!;
    expect(chip.getAttribute("class")).toContain("impl-planned");
    expect(win.querySelector(".impl-note")!.textContent).toContain("继承自端点");

    // 点空白关窗，再开显式关系窗
    d.querySelector("svg")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    d.querySelector('svg .edge[data-id="r.ba"]')!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    win = visibleWins(d)[0]!;
    chip = win.querySelector(".impl-chip")!;
    expect(chip.getAttribute("class")).toContain("impl-not_connected");
    expect(win.querySelector(".impl-note")).toBeNull();
  });

  it("证据列表渲染 [doc|code] path:lines + 复制按钮（不抛错、toast 已复制路径）", () => {
    const dom = new JSDOM(htmlOf(docImpl()), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    d.querySelector('svg .node[data-id="e.a"]')!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const win = visibleWins(d)[0]!;

    const items = Array.from(win.querySelectorAll(".evidence li"));
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain("code");
    expect(items[0]!.textContent).toContain("packages/render/src/html.ts:1-10");
    expect(items[1]!.textContent).toContain("doc");
    expect(items[1]!.textContent).toContain("docs/design/format-spec-v0.md");
    expect(win.textContent).toContain("证据（2）");

    const copyBtn = win.querySelector(".copy-evidence") as HTMLElement;
    expect(copyBtn).not.toBeNull();
    // jsdom 无剪贴板：先确认默认路径不抛错（失败 toast 也可接受）
    expect(() => copyBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))).not.toThrow();
    // 模拟浏览器 copy 成功路径 → 成功 toast
    (d as unknown as { execCommand: () => boolean }).execCommand = () => true;
    copyBtn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(d.getElementById("toast")?.textContent).toContain("已复制路径");
  });

  it("无 evidence 不渲染证据区；无 impl_status 时显示缺省 implemented 且无继承标注", () => {
    const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const { window } = dom;
    const d = window.document;
    d.querySelector("svg .node")!.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const win = visibleWins(d)[0]!;
    expect(win.querySelector(".evidence")).toBeNull();
    expect(win.querySelector(".impl-chip")!.textContent).toBe("implemented");
    expect(win.querySelector(".impl-note")).toBeNull();
  });

  it("投影：元素/关系带 implStatus/implStatusExplicit/evidence；无字段文档不输出新键", () => {
    // 有字段文档
    const domImpl = new JSDOM(htmlOf(docImpl()), { runScripts: "dangerously", url: "https://example.test/" });
    const rawImpl = domImpl.window.document
      .getElementById("covenant-data")!.textContent!;
    const dataImpl = JSON.parse(rawImpl).docs[0];
    expect(dataImpl.elements[0].implStatus).toBe("partial");
    expect(dataImpl.elements[0].implStatusExplicit).toBe(true);
    expect(dataImpl.elements[0].evidence).toHaveLength(2);
    expect(dataImpl.elements[0].evidence[0].lines).toBe("1-10");
    expect(dataImpl.elements[0].evidence[1].lines).toBeUndefined();
    // 关系缺省 → 弱端继承
    expect(dataImpl.relations[0].implStatus).toBe("planned");
    expect(dataImpl.relations[0].implStatusExplicit).toBe(false);
    expect(dataImpl.relations[1].implStatus).toBe("not_connected");
    expect(dataImpl.relations[1].implStatusExplicit).toBe(true);

    // 无字段文档：DATA 不出现任何新键（老文档 HTML 的 JSON 字节不变）
    const domBase = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
    const rawBase = domBase.window.document.getElementById("covenant-data")!.textContent!;
    expect(rawBase).not.toContain('"implStatus"');
    expect(rawBase).not.toContain('"implStatusExplicit"');
    expect(rawBase).not.toContain('"evidence"');
    const dataBase = JSON.parse(rawBase).docs[0];
    expect(Object.keys(dataBase.elements[0]).sort()).toEqual(["id", "kind", "name", "summary", "tech"]);
    expect(Object.keys(dataBase.relations[0]).sort()).toEqual(["from", "id", "kind", "summary", "to"]);
  });
});
