import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import type { CovenantDoc } from "@covenant/core";
import { layout } from "@covenant/layout";
import { renderSvg } from "../index";
import { renderHtml } from "../html";

/**
 * 看板「图上增删关系」回归（task-22，姊妹篇见 element-edit.test.ts）。
 *
 * 只断言用户看到的结果 + 导出的 patch ops：
 *   - 连线模式（元素窗口 ⇒ 按钮 → 点目标 → 表单）→ add /relations/- 暂存 op；
 *   - 选中关系 + Delete → .pending-remove-rel + remove op；
 *   - 被批注引用的关系拒删（kernel/dangling-ref 防线）；暂存待删元素拒连；
 *   - 撤销后对应 op 消失；add 在 remove 之前。
 *
 * 窗口计数用可见窗口 `.cvn-win:not([hidden])`（模板常驻隐藏外壳，总数恒 ≥1）。
 */

function doc(withRelAnnotation = false): CovenantDoc {
  const d: CovenantDoc = {
    covenant: "0.1",
    id: "t/edit-relations",
    profile: "c4-container@1",
    meta: { title: "关系编辑回归", purpose: "p", non_goals: [], rev: 2 },
    elements: [
      { id: "e.a", kind: "container", name: "服务 A", summary: "做 A", tech: "TS" },
      { id: "e.b", kind: "container", name: "服务 B", summary: "做 B", tech: "TS" },
      { id: "e.c", kind: "container", name: "服务 C", summary: "做 C", tech: "TS" },
    ],
    relations: [{ id: "r.ab", kind: "calls", from: "e.a", to: "e.b", summary: "A 调用 B" }],
    views: [{ id: "v.main", title: "主视图" }],
    annotations: [],
  };
  if (withRelAnnotation) {
    d.annotations = [
      {
        id: "a.01JAYBNDTEST00000000000R",
        target: { kind: "relation", id: "r.ab" },
        type: "risk",
        severity: "major",
        title: "这条调用没有超时与重试",
        body: "补熔断后再删",
      } as CovenantDoc["annotations"] extends (infer T)[] ? T : never,
    ];
  }
  return d;
}

function boot(d: CovenantDoc): {
  window: JSDOM["window"];
  document: Document;
  alerts: string[];
} {
  const l = layout(d);
  const html = renderHtml([{ doc: d, svg: renderSvg(d, l, { showBadges: false }), layout: l }]);
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "https://example.test/" });
  const w = dom.window;
  const alerts: string[] = [];
  w.alert = ((msg?: unknown) => {
    alerts.push(String(msg ?? ""));
  }) as unknown as typeof w.alert;
  // 结构性编辑（Delete 暂存删等）仅在编辑模式生效（双模式切换，ADR/规范 UC-5）
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

function visibleWins(d: Document): number {
  return d.querySelectorAll(".cvn-win:not([hidden])").length;
}

function pressKey(w: JSDOM["window"], key: string): void {
  w.dispatchEvent(new w.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

interface Capture {
  blob: { text: () => Promise<string> } | null;
  download: string;
}

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

/** 从「点开 A 的窗口 → 点 ⇒ → 点目标 B」走完整条连线链路，停在表单 */
function startConnectToB(w: JSDOM["window"], d: Document, from = "e.a"): void {
  click(w, node(d, from));
  const btn = d.querySelector(".cvn-win:not([hidden]) .connect-top-btn") as HTMLElement | null;
  expect(btn, "元素窗口顶栏应有 ⇒ 连线按钮").not.toBeNull();
  click(w, btn!);
  expect(d.body.classList.contains("connecting"), "点击 ⇒ 后应进入连线模式").toBe(true);
  click(w, node(d, "e.b"));
}

describe("图上增删关系：连线模式创建", () => {
  it("⇒ 进入连线模式，点目标元素弹出关系表单（from/to 正确）", () => {
    const { window: w, document: d } = boot(doc());
    startConnectToB(w, d);
    const form = d.getElementById("relform-win");
    expect(form, "点目标元素后应弹出关系表单").not.toBeNull();
    expect(form!.textContent).toContain("e.a");
    expect(form!.textContent).toContain("e.b");
    expect(d.body.classList.contains("connecting"), "进入表单后连线模式应结束").toBe(false);
  });

  it("Esc 取消连线后，点目标元素只开普通窗口、不出关系表单", () => {
    const { window: w, document: d } = boot(doc());
    click(w, node(d, "e.a"));
    click(w, d.querySelector(".cvn-win:not([hidden]) .connect-top-btn") as HTMLElement);
    expect(d.body.classList.contains("connecting")).toBe(true);
    pressKey(w, "Escape");
    expect(d.body.classList.contains("connecting"), "Esc 应取消连线模式").toBe(false);
    click(w, node(d, "e.b"));
    expect(d.getElementById("relform-win")).toBeNull();
    expect(visibleWins(d), "Esc 后点目标应只开普通元素窗口").toBe(1);
  });

  it("summary 必填：空提交被拦（alert），不进暂存", () => {
    const { window: w, document: d, alerts } = boot(doc());
    startConnectToB(w, d);
    click(w, d.getElementById("rf-create")!);
    expect(alerts.join(" "), "空 summary 应 alert 拦截").toContain("必填");
    expect(d.getElementById("rel-pending")!.hidden, "未创建成功时计数应隐藏").toBe(true);
  });

  it("创建只进暂存：overlay + 计数 + add op；DATA.relations 不变", async () => {
    const { window: w, document: d } = boot(doc());
    startConnectToB(w, d);
    (d.getElementById("rf-summary") as HTMLTextAreaElement).value = "A 读取 B 的配置";
    click(w, d.getElementById("rf-create")!);

    const counter = d.getElementById("rel-pending") as HTMLElement;
    expect(counter.hidden).toBe(false);
    expect(counter.textContent).toContain("关系暂存 1");
    const overlay = d.querySelector('.pending-add-rel[data-id^="r."]');
    expect(overlay, "图上应出现虚线 overlay").not.toBeNull();
    // 正交路由：必须是 path 且折线段轴对齐（复用正式边视觉语言，非两点直连）
    expect(overlay!.tagName.toLowerCase()).toBe("path");
    const dAttr = overlay!.getAttribute("d") ?? "";
    expect(dAttr).toMatch(/^M[\d.\- ]+ L[\d.\- ]+ L[\d.\- ]+ L/);
    expect(overlay!.getAttribute("marker-end")).toContain("cvn-arrow");

    const raw = JSON.parse(d.getElementById("covenant-data")!.textContent ?? "{}").docs[0];
    expect(raw.relations.length, "DATA.docs 只读语义：relations 不得被改").toBe(1);

    const patch = await exportPatch(w, d);
    const adds = patch.ops.filter((o: any) => o.op === "add" && o.path === "/relations/-");
    expect(adds.length).toBe(1);
    expect(adds[0].value.from).toBe("e.a");
    expect(adds[0].value.to).toBe("e.b");
    expect(adds[0].value.summary).toBe("A 读取 B 的配置");
    expect(adds[0].value.id).toMatch(/^r\.[a-z][a-z0-9-]{0,62}$/);
  });

  it("暂存待删的元素拒绝连线（防悬空 from/to）", () => {
    const { window: w, document: d } = boot(doc());
    click(w, node(d, "e.c"));
    pressKey(w, "Delete"); // C 进暂存删除（e.c 无任何关系引用，删除应成功）
    click(w, node(d, "e.c")); // 再开窗
    click(w, d.querySelector(".cvn-win:not([hidden]) .connect-top-btn") as HTMLElement);
    const toast = d.getElementById("toast");
    expect(toast?.className).toContain("show");
    expect(toast?.textContent).toContain("已暂存删除");
    expect(d.body.classList.contains("connecting"), "被拒后不得进入连线模式").toBe(false);
  });
});

describe("图上增删关系：删除与撤销", () => {
  it("选中关系 + Delete → .pending-remove-rel + remove op；再按 Delete 恢复", async () => {
    const { window: w, document: d } = boot(doc());
    click(w, d.querySelector('.doc:not([hidden]) svg .edge[data-id="r.ab"]')!);
    expect(visibleWins(d), "点边应打开关系窗口").toBeGreaterThan(0);
    pressKey(w, "Delete");

    const edge = d.querySelector('.edge[data-id="r.ab"]');
    expect(edge!.classList.contains("pending-remove-rel"), "待删关系应有降饱和标记").toBe(true);
    expect((d.getElementById("rel-pending") as HTMLElement).textContent).toContain("关系暂存 1");
    let patch = await exportPatch(w, d);
    expect(patch.ops).toContainEqual({ op: "remove", path: "/relations/r.ab", value: null });

    pressKey(w, "Delete"); // 再按 = 恢复
    expect(edge!.classList.contains("pending-remove-rel")).toBe(false);
    // 恢复后无任何暂存 → buildPatchFor 返回 null → 页面走「没有改动可导出」，不产生下载
    const cap2 = stubDownload(w);
    click(w, d.getElementById("btn-export")!);
    expect(cap2.blob, "无任何暂存时不应产生下载").toBeNull();
  });

  it("被批注引用的关系拒删（toast 说明，不进暂存）", () => {
    const { window: w, document: d } = boot(doc(true));
    click(w, d.querySelector('.doc:not([hidden]) svg .edge[data-id="r.ab"]')!);
    pressKey(w, "Delete");
    const toast = d.getElementById("toast");
    expect(toast?.textContent).toContain("批注");
    expect(d.querySelector(".edge.pending-remove-rel")).toBeNull();
  });

  it("撤销暂存删除后 remove op 消失", async () => {
    const { window: w, document: d } = boot(doc());
    click(w, d.querySelector('.doc:not([hidden]) svg .edge[data-id="r.ab"]')!);
    pressKey(w, "Delete");
    expect(d.querySelector(".edge.pending-remove-rel")).not.toBeNull();
    click(w, d.getElementById("toast-undo")!);
    expect(d.querySelector(".edge.pending-remove-rel")).toBeNull();
    // 撤销后无任何暂存 → 无补丁下载
    const cap = stubDownload(w);
    click(w, d.getElementById("btn-export")!);
    expect(cap.blob, "撤销后无任何 op，不应产生下载").toBeNull();
  });

  it("新增与删除并存时，add op 在 remove op 之前", async () => {
    const { window: w, document: d } = boot(doc());
    // 1) 连线新建一条关系
    startConnectToB(w, d);
    (d.getElementById("rf-summary") as HTMLTextAreaElement).value = "B 回调 A";
    click(w, d.getElementById("rf-create")!);
    // 2) 暂存删除已有关系
    click(w, d.querySelector('.doc:not([hidden]) svg .edge[data-id="r.ab"]')!);
    pressKey(w, "Delete");

    const patch = await exportPatch(w, d);
    const ai = patch.ops.findIndex((o: any) => o.op === "add" && o.path === "/relations/-");
    const ri = patch.ops.findIndex((o: any) => o.op === "remove" && o.path === "/relations/r.ab");
    expect(ai).toBeGreaterThanOrEqual(0);
    expect(ri).toBeGreaterThan(ai);
  });
});
