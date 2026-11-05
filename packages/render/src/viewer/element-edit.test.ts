import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import type { CovenantDoc } from "@covenant/core";
import { layout } from "@covenant/layout";
import { renderSvg } from "../index";
import { renderHtml } from "../html";

/**
 * 「图上增删元素」验收（jsdom 无头，走 renderHtml 产出的真实页面脚本）。
 *
 * 只断言**用户看到的结果 + 导出的 patch ops**，不测内部函数返回值：
 *   - 双击空白 → 创建表单；双击节点仍是缩放语义
 *   - 创建 → 图上虚线占位 + 计数 +1 + add op（且 DATA.docs 不被修改）
 *   - 选中 + Delete → `.pending-remove` + remove op；再次 Delete / 撤销可恢复
 *   - 被批注 / relation 引用的元素拒删，toast 说明原因
 *   - 撤销后对应 op 从导出 patch 消失；add 在 remove 之前
 */

function doc(): CovenantDoc {
  return {
    covenant: "0.1",
    id: "t/edit-elements",
    profile: "c4-container@1",
    meta: { title: "图上增删", purpose: "p", non_goals: [], rev: 2 },
    elements: [
      { id: "e.a", kind: "container", name: "服务 A", summary: "做 A", tech: "TS" },
      {
        id: "e.b",
        kind: "datastore",
        name: "存储 B",
        summary: "存 B",
        tech: "PG",
        props: { storage_kind: "rdbms" },
      },
      { id: "e.c", kind: "container", name: "自由元素 C", summary: "可删", tech: "TS" },
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

interface Booted {
  window: JSDOM["window"];
  document: Document;
  alerts: string[];
}

function boot(): Booted {
  const d = doc();
  const l = layout(d);
  const html = renderHtml([
    { doc: d, svg: renderSvg(d, l, { showBadges: false }), layout: l },
  ]);
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://example.test/" });
  const w = dom.window;
  const alerts: string[] = [];
  w.alert = ((msg?: unknown) => {
    alerts.push(String(msg ?? ""));
  }) as unknown as typeof w.alert;
  w.confirm = (() => true) as unknown as typeof w.confirm;
  w.document.getElementById("btn-edit")!.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
  return { window: w, document: w.document, alerts };
}

function click(w: JSDOM["window"], el: Element): void {
  el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
}

function node(d: Document, id: string): Element {
  const el = d.querySelector(`.doc:not([hidden]) svg .node[data-id="${id}"]`);
  expect(el, `节点 ${id} 应存在`).not.toBeNull();
  return el!;
}

/** 双击画布空白（事件目标是 #stage-wrap 本身） */
function dblclickBlank(w: JSDOM["window"], d: Document): void {
  d.getElementById("stage-wrap")!.dispatchEvent(
    new w.MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: 320, clientY: 240 }),
  );
}

function pressDelete(w: JSDOM["window"]): void {
  w.dispatchEvent(new w.KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
}

function dataDoc(d: Document): { elements: unknown[] } {
  const raw = d.getElementById("covenant-data")!.textContent ?? "{}";
  return JSON.parse(raw).docs[0] as { elements: unknown[] };
}

interface Capture {
  blob: { text: () => Promise<string> } | null;
  download: string;
}

/** 把浏览器下载通道换成可读取的内存 Blob（同 html.dom.test.ts 的既有做法） */
function stubDownload(w: JSDOM["window"]): Capture {
  const state: Capture = { blob: null, download: "" };
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
  w.Blob = CaptureBlob;
  w.URL.createObjectURL = ((b: unknown) => {
    state.blob = b as { text: () => Promise<string> };
    return "blob:mock";
  }) as typeof w.URL.createObjectURL;
  w.URL.revokeObjectURL = (() => undefined) as typeof w.URL.revokeObjectURL;
  w.HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    state.download = this.download;
  };
  return state;
}

async function exportPatch(w: JSDOM["window"], d: Document): Promise<any> {
  const cap = stubDownload(w);
  click(w, d.getElementById("btn-export")!);
  expect(cap.blob, "导出补丁应产生下载 Blob").not.toBeNull();
  return JSON.parse(await cap.blob!.text());
}

function createElementViaForm(w: JSDOM["window"], d: Document, name: string): void {
  dblclickBlank(w, d);
  (d.getElementById("ce-name") as HTMLInputElement).value = name;
  click(w, d.getElementById("ce-create")!);
}

describe("图上增删元素：创建表单", () => {
  it("双击空白打开表单，字段齐全；kind 选项来自当前 doc 已有元素（去重排序）", () => {
    const { window: w, document: d } = boot();

    dblclickBlank(w, d);
    expect(d.querySelector(".cvn-create-win")).not.toBeNull();
    for (const id of ["ce-name", "ce-kind", "ce-summary", "ce-tech", "ce-create", "ce-cancel"]) {
      expect(d.getElementById(id), `表单字段 ${id}`).not.toBeNull();
    }
    const opts = Array.from((d.getElementById("ce-kind") as HTMLSelectElement).options).map(
      (o) => o.value,
    );
    // 本 doc 出现过的 kind：container / datastore（去重 + 排序）
    expect(opts).toEqual(["container", "datastore"]);

    click(w, d.getElementById("ce-cancel")!);
    expect(d.querySelector(".cvn-create-win")).toBeNull();
  });

  it("双击节点不是空白：保持缩放语义，不打开创建表单", () => {
    const { window: w, document: d } = boot();
    node(d, "e.c").dispatchEvent(
      new w.MouseEvent("dblclick", { bubbles: true, cancelable: true, clientX: 100, clientY: 100 }),
    );
    expect(d.querySelector(".cvn-create-win")).toBeNull();
  });

  it("名称为必填、同名元素被拒：都不产生暂存", () => {
    const { window: w, document: d, alerts } = boot();
    dblclickBlank(w, d);

    click(w, d.getElementById("ce-create")!);
    expect(alerts.some((a) => a.includes("名称必填"))).toBe(true);
    expect(d.querySelectorAll(".pending-add").length).toBe(0);

    (d.getElementById("ce-name") as HTMLInputElement).value = "服务 A"; // 已存在同名
    click(w, d.getElementById("ce-create")!);
    expect(alerts.some((a) => a.includes("同名"))).toBe(true);
    expect(d.getElementById("elem-pending")!.hidden).toBe(true);
  });
});

describe("图上增删元素：创建后暂存与 patch", () => {
  it("创建只进暂存：虚线占位 + 计数 +1，导出 patch 含 add op，且不改 DATA.docs", async () => {
    const { window: w, document: d } = boot();
    dblclickBlank(w, d);
    (d.getElementById("ce-name") as HTMLInputElement).value = "订单服务";
    (d.getElementById("ce-kind") as HTMLSelectElement).value = "container";
    (d.getElementById("ce-summary") as HTMLTextAreaElement).value = "处理订单";
    (d.getElementById("ce-tech") as HTMLInputElement).value = "TS";
    click(w, d.getElementById("ce-create")!);

    expect(d.querySelector(".cvn-create-win")).toBeNull();
    expect(d.getElementById("elem-pending")!.hidden).toBe(false);
    expect(d.getElementById("elem-pending")!.textContent).toContain("1");
    const placeholder = d.querySelectorAll(".pending-add");
    expect(placeholder.length).toBe(1);
    expect(placeholder[0]!.textContent).toContain("订单服务");
    // 构建产物副本只读：DATA.docs 里不应多出元素
    expect(dataDoc(d).elements).toHaveLength(3);

    const patch = await exportPatch(w, d);
    const adds = patch.ops.filter(
      (o: { op: string; path: string }) => o.op === "add" && o.path === "/elements/-",
    );
    expect(adds).toHaveLength(1);
    expect(adds[0].value.id).toMatch(/^e\.[a-z][a-z0-9-]{0,62}$/);
    expect(adds[0].value).toMatchObject({
      kind: "container",
      name: "订单服务",
      summary: "处理订单",
      tech: "TS",
    });
    expect(patch.doc).toBe("t/edit-elements");
    expect(patch.base_rev).toBe(2);
  });

  it("撤销新增后，add op 从导出 patch 消失", async () => {
    const { window: w, document: d } = boot();
    createElementViaForm(w, d, "新服务 D");
    expect(d.querySelectorAll(".pending-add").length).toBe(1);

    click(w, d.getElementById("toast-undo")!);
    expect(d.querySelectorAll(".pending-add").length).toBe(0);

    createElementViaForm(w, d, "新服务 E");
    const patch = await exportPatch(w, d);
    const adds = patch.ops.filter(
      (o: { op: string; path: string }) => o.op === "add" && o.path === "/elements/-",
    );
    expect(adds).toHaveLength(1);
    expect(adds[0].value.name).toBe("新服务 E");
  });
});

describe("图上增删元素：Delete 暂存删除", () => {
  it("选中 + Delete：图上 .pending-remove，导出 patch 含 remove op", async () => {
    const { window: w, document: d } = boot();
    click(w, node(d, "e.c"));
    pressDelete(w);

    expect(node(d, "e.c").classList.contains("pending-remove")).toBe(true);
    expect(d.getElementById("elem-pending")!.textContent).toContain("1");

    const patch = await exportPatch(w, d);
    const removes = patch.ops.filter((o: { op: string }) => o.op === "remove");
    expect(removes).toHaveLength(1);
    expect(removes[0]).toMatchObject({ path: "/elements/e.c", value: null });
    // 待删除元素只发 remove，不并发 replace
    expect(patch.ops.some((o: { path: string }) => o.path.startsWith("/elements/e.c/"))).toBe(false);
  });

  it("再次 Delete 取消暂存删除（可恢复）", () => {
    const { window: w, document: d } = boot();
    click(w, node(d, "e.c"));
    pressDelete(w);
    expect(node(d, "e.c").classList.contains("pending-remove")).toBe(true);

    pressDelete(w);
    expect(node(d, "e.c").classList.contains("pending-remove")).toBe(false);
    expect(d.getElementById("elem-pending")!.hidden).toBe(true);
  });

  it("撤销删除：.pending-remove 还原且 remove op 消失", async () => {
    const { window: w, document: d, alerts } = boot();
    click(w, node(d, "e.c"));
    pressDelete(w);
    expect(node(d, "e.c").classList.contains("pending-remove")).toBe(true);

    click(w, d.getElementById("toast-undo")!);
    expect(node(d, "e.c").classList.contains("pending-remove")).toBe(false);

    const cap = stubDownload(w);
    click(w, d.getElementById("btn-export")!);
    expect(cap.blob).toBeNull();
    expect(alerts.some((a) => a.includes("没有改动"))).toBe(true);
  });

  it("被批注 / relation 引用的元素禁止暂存删除，toast 说明原因", () => {
    const { window: w, document: d } = boot();

    click(w, node(d, "e.a")); // e.a 有批注
    pressDelete(w);
    expect(node(d, "e.a").classList.contains("pending-remove")).toBe(false);
    expect(d.getElementById("toast")!.textContent).toContain("批注");

    click(w, node(d, "e.b")); // e.b 被 r.ab 引用
    pressDelete(w);
    expect(node(d, "e.b").classList.contains("pending-remove")).toBe(false);
    expect(d.getElementById("toast")!.textContent).toContain("关系");

    expect(d.getElementById("elem-pending")!.hidden).toBe(true);
  });
});

describe("图上增删元素：ops 顺序", () => {
  it("同时有新增与删除时，元素 ops 为先 add 后 remove", async () => {
    const { window: w, document: d } = boot();
    createElementViaForm(w, d, "新服务 D");
    click(w, node(d, "e.c"));
    pressDelete(w);

    const patch = await exportPatch(w, d);
    const elemOps = patch.ops.filter((o: { path: string }) =>
      o.path.startsWith("/elements/"),
    ) as { op: string; path: string }[];
    expect(elemOps.map((o) => o.op)).toEqual(["add", "remove"]);
    expect(elemOps[0]!.path).toBe("/elements/-");
    expect(elemOps[1]!.path).toBe("/elements/e.c");
  });
});
