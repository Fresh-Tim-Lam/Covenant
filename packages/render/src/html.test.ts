import { describe, expect, it } from "vitest";
import type { CovenantDoc } from "@covenant/core";
import { layout } from "@covenant/layout";
import { renderSvg } from "./index";
import { renderHtml } from "./html";
import type { DocView } from "./html";

function doc(id: string, title: string): CovenantDoc {
  return {
    covenant: "0.1",
    id,
    profile: "c4-container@1",
    meta: { title, purpose: "p", non_goals: [] },
    elements: [
      { id: "e.a", kind: "container", name: "服务 A", summary: "做 A", tech: "TS" },
      { id: "e.b", kind: "datastore", name: "存储 B", summary: "存 B", tech: "PG", props: { storage_kind: "rdbms" } },
    ],
    relations: [{ id: "r.ab", kind: "writes", from: "e.a", to: "e.b", summary: "写" }],
    annotations: [
      {
        id: "a.01JAX9K3Q7P2",
        target: { kind: "element", id: "e.a" },
        type: "risk",
        severity: "high",
        title: "风险",
        status: "open",
        author: "human:lily",
        created: "2026-11-03T00:00:00+08:00",
        ai_hint: "改为异步",
      },
    ],
  };
}

function views(): DocView[] {
  const d = doc("t/html", "站点标题");
  return [{ doc: d, svg: renderSvg(d, layout(d)), layout: layout(d) }];
}

describe("renderHtml", () => {
  it("生成完整 HTML 骨架，且无外部资源", () => {
    const html = renderHtml(views(), { title: "站点标题" });
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
    expect(html).toContain('id="covenant-data"');
    expect(html).toContain("t/html");
    expect(html).not.toContain("<script src");
    expect(html).not.toContain("<link ");
  });

  it("内嵌 JSON 可解析，且包含语义副本与 ai_hint", () => {
    const html = renderHtml(views());
    const m = html.match(
      /<script id="covenant-data" type="application\/json">([\s\S]*?)<\/script>/,
    );
    expect(m).not.toBeNull();
    const data = JSON.parse(m![1]!);
    expect(data.docs).toHaveLength(1);
    expect(data.docs[0].docId).toBe("t/html");
    expect(data.docs[0].elements).toHaveLength(2);
    expect(data.docs[0].annotations[0].aiHint).toBe("改为异步");
    // 角标锚点（浏览器端据此绘制）
    expect(data.docs[0].anchors.elements["e.a"]).toHaveLength(2);
    expect(data.docs[0].anchors.relations["r.ab"]).toHaveLength(2);
  });

  it("包含可标注 UI（表单与导出按钮）", () => {
    const html = renderHtml(views());
    expect(html).toContain('id="f-title"');
    expect(html).toContain('id="btn-export"');
    expect(html).toContain('id="btn-reset"');
    expect(html).toContain("localStorage");
    expect(html).toContain("/annotations/-");
  });

  it("确定性：两次生成一致", () => {
    expect(renderHtml(views())).toBe(renderHtml(views()));
  });

  it("文档标题里的脚本标签被转义，不会提前闭合", () => {
    const d = doc("t/x", "占位");
    d.meta = {
      title: "</script><script>alert(1)</script>",
      purpose: "p",
      non_goals: [],
    };
    const l = layout(d);
    const html = renderHtml([{ doc: d, svg: renderSvg(d, l), layout: l }]);
    const jsonBlocks = html.match(/<script id="covenant-data"/g) ?? [];
    expect(jsonBlocks).toHaveLength(1);
    expect(html).not.toContain("</script><script>alert(1)</script>");
  });

  it("多文档时生成切换按钮", () => {
    const a = doc("t/a", "A 图");
    const b = doc("t/b", "B 图");
    const html = renderHtml([
      { doc: a, svg: renderSvg(a, layout(a)), layout: layout(a) },
      { doc: b, svg: renderSvg(b, layout(b)), layout: layout(b) },
    ]);
    expect(html).toContain('data-doc="t/a"');
    expect(html).toContain('data-doc="t/b"');
  });

  it("同一文档多视图：key = docId#viewId，导航显示视图名", () => {
    const d = doc("t/multi", "多视图文档");
    const l = layout(d);
    const html = renderHtml([
      { doc: d, viewId: "v.a", viewTitle: "视图 A", svg: renderSvg(d, l), layout: l },
      { doc: d, viewId: "v.b", viewTitle: "视图 B", svg: renderSvg(d, l), layout: l },
    ]);
    expect(html).toContain('data-doc="t/multi#v.a"');
    expect(html).toContain('data-doc="t/multi#v.b"');
    expect(html).toContain("视图 A");
    const m = html.match(
      /<script id="covenant-data" type="application\/json">([\s\S]*?)<\/script>/,
    );
    const data = JSON.parse(m![1]!);
    expect(data.docs.map((x: { key: string }) => x.key)).toEqual(["t/multi#v.a", "t/multi#v.b"]);
    expect(data.docs[0].docId).toBe("t/multi");
  });
});

describe("查看器 UX（顶栏 + 全屏画布 + 缩放/拖拽 + 悬浮检查器）", () => {
  it("布局：视图在顶栏，画布全屏，检查器悬浮且默认隐藏", () => {
    const html = renderHtml(views());
    expect(html).toContain('id="views"');
    expect(html).toContain('id="stage-wrap"');
    expect(html).toContain('id="stage"');
    expect(html).toContain('id="inspector" hidden');
    expect(html).not.toContain("<nav");
    expect(html).not.toContain('id="viewer"');
  });

  it("缩放控件与交互挂载存在", () => {
    const html = renderHtml(views());
    expect(html).toContain('id="zoom-in"');
    expect(html).toContain('id="zoom-out"');
    expect(html).toContain('id="zoom-fit"');
    expect(html).toContain("滚轮缩放");
    expect(html).toContain("pointerdown");
    expect(html).toContain("dblclick");
    expect(html).toContain("wheel");
  });
});

describe("拖选禁用与复制", () => {
  it("画布/顶栏禁用文字拖选，表单保留选择", () => {
    const html = renderHtml(views());
    expect(html).toContain("user-select:none");
    expect(html).toContain("#inspector,#inspector input,#inspector textarea,#inspector select{user-select:text}");
  });

  it("检查器带独立复制按钮与 toast 提示", () => {
    const html = renderHtml(views());
    expect(html).toContain('id="insp-copy"');
    expect(html).toContain("copySelection");
    expect(html).toContain("showToast");
  });
});

describe("HTML 编辑态（导出 edits.json）", () => {
  it("顶栏有编辑/导出按钮，脚本含编辑逻辑", () => {
    const html = renderHtml(views());
    expect(html).toContain('id="btn-edit"');
    expect(html).toContain('id="btn-edit-export"');
    expect(html).toContain("applyEditUi");
    expect(html).toContain("exportEdits");
    expect(html).toContain('id="e-pin-x"');
  });
});

describe("左侧侧栏（可滚动、可折叠）", () => {
  it("views 在 shell 内、纵向滚动、有折叠按钮", () => {
    const html = renderHtml(views());
    expect(html).toContain('id="shell"');
    expect(html).toContain('id="views"');
    expect(html).toContain('id="btn-nav"');
    expect(html).toContain("overflow-y:auto");
    expect(html).toContain("nav-collapsed");
    expect(html).not.toContain("overflow-x:auto;flex:0 0 auto");
  });
});
describe("悬浮窗小窗顶栏", () => {
  it("有专用拖拽顶栏（固定高度 + grip + 动作区靠右）", () => {
    const h = renderHtml(views());
    expect(h).toContain('class="insp-head" id="insp-drag"');
    expect(h).toContain('class="grip"');
    expect(h).toContain("height:38px");
    expect(h).toContain("cursor:grab");
    expect(h).toContain(".insp-head .insp-actions{margin-left:auto}");
    expect(h).toContain('<div class="insp-body">');
    expect(h).toContain("#inspector{position:absolute");
    expect(h).toContain("flex-direction:column");
    expect(h).not.toContain(".insp-head{display:flex;align-items:center;gap:6px;position:sticky");
  });
});