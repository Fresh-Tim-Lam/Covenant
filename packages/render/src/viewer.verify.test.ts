import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";
import type { CovenantDoc } from "@covenant/core";
import { layout } from "@covenant/layout";
import { renderSvg } from "./index";
import { renderHtml } from "./html";

/**
 * 看板「✓ 核验」与「拖拽抑制」回归。
 *
 * 这两个功能曾各修过一次仍不生效，根因都在"看不见的契约差一位"：
 *   1. ✓ 徽章：`.doc[data-doc]` 存的是 **key**（docId#viewId），代码却拿 docId 去查
 *      → 选择器永不命中 → 按钮有反应但图上永远没徽章。
 *   2. 拖拽：`draggingWin` 在 pointerup 就被置回 false，而 pointerenter/click
 *      往往在释放**之后**才派发到新元素上 → 拖完立刻弹出别人的悬浮窗。
 *
 * 因此这里不测"函数返回值"，而是测**用户看到的结果**：徽章节点是否出现、窗口数量是否变化。
 */

function doc(): CovenantDoc {
  return {
    covenant: "0.1",
    id: "t/verify",
    profile: "c4-container@1",
    meta: { title: "核验回归", purpose: "p", non_goals: [], rev: 2 },
    elements: [
      { id: "e.a", kind: "container", name: "服务 A", summary: "做 A", tech: "TS" },
      { id: "e.b", kind: "container", name: "服务 B", summary: "做 B", tech: "TS" },
    ],
    relations: [{ id: "r.ab", kind: "calls", from: "e.a", to: "e.b", summary: "调用" }],
    views: [{ id: "v.main", title: "主视图" }],
    annotations: [],
  };
}

function html(): string {
  const d = doc();
  const l = layout(d);
  return renderHtml([{ doc: d, svg: renderSvg(d, l, { showBadges: false }), layout: l }]);
}

function boot(): { window: JSDOM["window"]; document: Document } {
  const dom = new JSDOM(html(), { runScripts: "dangerously", url: "https://example.test/" });
  return { window: dom.window, document: dom.window.document };
}

function click(w: JSDOM["window"], el: Element): void {
  el.dispatchEvent(new w.MouseEvent("click", { bubbles: true, cancelable: true }));
}

function pointer(w: JSDOM["window"], el: Element | JSDOM["window"], type: string, x = 0, y = 0): void {
  el.dispatchEvent(
    new w.MouseEvent(type, { bubbles: type !== "pointerenter" && type !== "pointerleave", cancelable: true, clientX: x, clientY: y, button: 0 }),
  );
}

describe("✓ 核验按钮", () => {
  it("点击后按钮变 on，且激活文档的 SVG 里出现 .verified-badge", () => {
    const { window: w, document: d } = boot();

    // 1) 点节点打开元素窗口
    const nodeA = d.querySelector('svg .node[data-id="e.a"]');
    expect(nodeA).not.toBeNull();
    click(w, nodeA!);

    // 2) 窗口顶栏应出现 ✓ 按钮
    const btn = d.querySelector(".verify-top-btn") as HTMLElement | null;
    expect(btn, "顶栏应有 .verify-top-btn").not.toBeNull();
    expect(btn!.getAttribute("data-id")).toBe("e.a");
    expect(btn!.classList.contains("on")).toBe(false);

    // 3) 点击核验
    click(w, btn!);
    expect(btn!.classList.contains("on"), "点击后按钮应带 on 类（绿底）").toBe(true);

    // 4) 图上必须出现徽章，且落在 data-doc=key 的 section 内（不是 docId）
    const meta = JSON.parse(d.querySelector("#covenant-data")!.textContent!) as {
      docs: { docId: string; key: string }[];
    };
    expect(meta.docs.length).toBe(1);
    const key = meta.docs[0].key;
    const section = d.querySelector(`section.doc[data-doc="${key}"]`);
    expect(section, `section 的 data-doc 应为 key=${key}`).not.toBeNull();
    expect(section!.querySelectorAll(".verified-badge").length, "图上应有 1 个 ✓ 徽章").toBe(1);

    // 5) 再点一次应取消
    click(w, btn!);
    expect(btn!.classList.contains("on")).toBe(false);
    expect(section!.querySelectorAll(".verified-badge").length, "取消后徽章应移除").toBe(0);
  });

  it("徽章画在「激活」的那篇文档上，不会串到别的视图", () => {
    const base = doc();
    const twoViews: CovenantDoc = {
      ...base,
      views: [
        { id: "v.main", title: "主视图" },
        { id: "v.two", title: "视图二" },
      ],
    };
    const l = layout(twoViews);
    // 每个视图一个 DocView（.doc section 是 per-view 的）
    // 每个视图一个 DocView；必须传 viewId，key 才会是 docId#viewId（生产侧同此）
    const views = twoViews.views!.map((v) => {
      const dv: CovenantDoc = { ...twoViews, views: [v] } as CovenantDoc;
      const lv = layout(dv);
      return { doc: dv, svg: renderSvg(dv, lv, { showBadges: false }), layout: lv, viewId: v.id, viewTitle: v.title };
    });
    const dom = new JSDOM(renderHtml(views), { runScripts: "dangerously", url: "https://example.test/" });
    const w = dom.window;
    const d = w.document;

    // 第 1 篇（默认激活）里点核验
    const nodeA = d.querySelector('section.doc:not([hidden]) svg .node[data-id="e.a"]');
    click(w, nodeA!);
    const btn = d.querySelector(".verify-top-btn") as HTMLElement;
    click(w, btn);

    const sections = d.querySelectorAll("section.doc");
    expect(sections.length).toBe(2);
    // 多视图时 key 必须带 #viewId —— 这正是旧代码用 docId 查询必然失配的地方
    const keys = Array.from(sections).map((s) => s.getAttribute("data-doc") ?? "");
    expect(keys.every((k) => k.includes("#"))).toBe(true);
    expect(keys).toContain("t/verify#v.main");
    expect(sections[0].querySelectorAll(".verified-badge").length).toBe(1);
    expect(sections[1].querySelectorAll(".verified-badge").length, "未激活视图不应有徽章").toBe(0);
  });
});

describe("拖拽窗口期间抑制其它元素的悬停/点击", () => {
  it("pointerup 之后的一小段时间内，指针进入其它节点不弹悬浮窗", () => {
    const { window: w, document: d } = boot();

    // 打开 e.a 的窗口
    click(w, d.querySelector('svg .node[data-id="e.a"]')!);
    const head = d.querySelector(".insp-head") as HTMLElement | null;
    expect(head, "窗口应有可拖拽的 .insp-head").not.toBeNull();
    const winsBefore = d.querySelectorAll(".cvn-win").length;
    expect(winsBefore).toBeGreaterThan(0);

    // 模拟拖拽：按下 → 移动 → 释放
    pointer(w, head!, "pointerdown", 10, 10);
    pointer(w, w, "pointermove", 80, 90);
    pointer(w, w, "pointerup", 80, 90);

    // 释放瞬间/之后，指针落到另一个节点上
    const nodeB = d.querySelector('svg .node[data-id="e.b"]');
    pointer(w, nodeB!, "pointerenter", 80, 90);

    expect(d.querySelectorAll(".cvn-win").length, "拖拽刚结束后不应为其它节点新开悬浮窗").toBe(winsBefore);
  });

  it("拖拽期间的 click 也不应被当作选中（避免误关窗/误开窗）", () => {
    const { window: w, document: d } = boot();
    click(w, d.querySelector('svg .node[data-id="e.a"]')!);
    const head = d.querySelector(".insp-head") as HTMLElement;
    const before = d.querySelectorAll(".cvn-win").length;

    pointer(w, head, "pointerdown", 5, 5);
    pointer(w, w, "pointermove", 60, 60);
    pointer(w, w, "pointerup", 60, 60);

    // 拖拽结束后立刻点击另一个节点：应被封印拦截，不新增窗口
    const nodeB = d.querySelector('svg .node[data-id="e.b"]');
    click(w, nodeB!);
    expect(d.querySelectorAll(".cvn-win").length).toBe(before);
  });
});
