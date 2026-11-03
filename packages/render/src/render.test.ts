import { describe, expect, it } from "vitest";
import type { CovenantDoc } from "@covenant/core";
import { layout, selectView } from "@covenant/layout";
import { labelCandidates, placeLabels, renderSvg } from "./index";

function doc(): CovenantDoc {
  return {
    covenant: "0.1",
    id: "t/render",
    profile: "c4-container@1",
    meta: { title: "测试标题", purpose: "渲染测试", non_goals: [] },
    elements: [
      { id: "e.a", kind: "container", name: "服务 A", summary: "做 A", tech: "TS" },
      { id: "e.b", kind: "datastore", name: "存储 B", summary: "存 B", tech: "PG", props: { storage_kind: "rdbms" } },
    ],
    relations: [{ id: "r.ab", kind: "writes", from: "e.a", to: "e.b", summary: "写" }],
    views: [{ id: "v.main", title: "主视图" }],
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
      },
    ],
  };
}

describe("renderSvg", () => {
  it("输出合法 SVG 骨架并包含语义文本", () => {
    const svg = renderSvg(doc(), layout(doc()));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('role="img"');
    expect(svg).toContain("测试标题");
    expect(svg).toContain("服务 A");
    expect(svg).toContain(">writes<");
    expect(svg.trimEnd().endsWith("</svg>")).toBe(true);
  });

  it("渲染确定性（两次一致）", () => {
    const d = doc();
    expect(renderSvg(d, layout(d))).toBe(renderSvg(d, layout(d)));
  });

  it("批注角标只统计未决批注", () => {
    const svg = renderSvg(doc(), layout(doc()));
    expect(svg).toContain('class="badge"');
  });

  it("文本被 XML 转义，不产生脚本注入", () => {
    const d = doc();
    d.elements![0]!.name = "<script>alert(1)</script>";
    const svg = renderSvg(d, layout(d));
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });
});

const labelBox = (l: { x: number; y: number; width: number }) => ({
  x: l.x - l.width / 2 - 2,
  y: l.y - 10,
  w: l.width + 4,
  h: 15,
});

describe("标签避让", () => {
  it("同一位置的多个标签会被错开（互不重叠）", () => {
    const primary = { x: 100, y: 100 };
    const req = {
      text: "calls",
      primary,
      candidates: labelCandidates(primary, false, true),
    };
    const placed = placeLabels([req, { ...req }], []);
    expect(placed).toHaveLength(2);
    const a = labelBox(placed[0]!);
    const b = labelBox(placed[1]!);
    const overlap =
      a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    expect(overlap).toBe(false);
  });

  it("主位置落在节点矩形上时会被移出", () => {
    const obstacle = { x: 0, y: 0, w: 100, h: 60 };
    const primary = { x: 50, y: 30 };
    const [p] = placeLabels(
      [{ text: "x", primary, candidates: labelCandidates(primary, false, true) }],
      [obstacle],
    );
    const box = labelBox(p!);
    const inside =
      box.x < 100 && box.x + box.w > 0 && box.y < 60 && box.y + box.h > 0;
    expect(inside).toBe(false);
  });

  it("SVG 中 edge-label 数量等于可见边数", () => {
    const d = doc();
    const l = layout(d);
    const svg = renderSvg(d, l);
    expect((svg.match(/class="edge-label"/g) ?? []).length).toBe(l.edges.length);
  });

  it("标签避让是确定性的（同输入两次一致）", () => {
    const d = doc();
    const l = layout(d);
    expect(renderSvg(d, l)).toBe(renderSvg(d, l));
  });
});

describe("flowchart 形状", () => {
  const flow: CovenantDoc = {
    covenant: "0.1",
    id: "t/flow-render",
    profile: "flowchart@1",
    meta: { title: "F", purpose: "p", non_goals: [] },
    elements: [
      { id: "e.s", kind: "start", name: "开始", summary: "s" },
      { id: "e.d", kind: "decision", name: "有货？", summary: "d", props: { question: "有货吗" } },
      { id: "e.end", kind: "end", name: "结束", summary: "e" },
    ],
    relations: [
      { id: "r.s-d", kind: "flow", from: "e.s", to: "e.d", summary: "x" },
      { id: "r.d-end", kind: "flow", from: "e.d", to: "e.end", summary: "y", props: { label: "否" } },
    ],
    views: [{ id: "v.main", title: "m" }],
  };

  it("decision 渲染为菱形、start/end 为胶囊、文字居中", () => {
    const svg = renderSvg(flow, layout(flow));
    expect(svg).toContain("<polygon");
    expect(svg).toContain("kind-decision");
    expect(svg).toContain("kind-start");
    expect(svg).toContain('text-anchor="middle"');
  });
});

describe("边标签语义", () => {
  it("state transition 显示 trigger [guard]，不再显示 kind", () => {
    const d: CovenantDoc = {
      covenant: "0.1",
      id: "t/state-label",
      profile: "state@1",
      meta: { title: "S", purpose: "p", non_goals: [] },
      elements: [
        { id: "e.init", kind: "initial", name: "入口", summary: "s" },
        { id: "e.paid", kind: "state", name: "已支付", summary: "s" },
        { id: "e.f", kind: "final", name: "完成", summary: "s" },
      ],
      relations: [
        { id: "r.a", kind: "transition", from: "e.init", to: "e.paid", summary: "x", props: { trigger: "授权成功", guard: "金额一致" } },
        { id: "r.b", kind: "transition", from: "e.paid", to: "e.f", summary: "x", props: { trigger: "履约完成" } },
      ],
      views: [{ id: "v.main", title: "m" }],
    };
    const svg = renderSvg(d, layout(d));
    expect(svg).toContain("授权成功 [金额一致]");
    expect(svg).toContain("履约完成");
    expect(svg).not.toContain(">transition<");
  });

  it("ER relates 显示基数 1:N", () => {
    const d: CovenantDoc = {
      covenant: "0.1",
      id: "t/er-label",
      profile: "er@1",
      meta: { title: "E", purpose: "p", non_goals: [] },
      elements: [
        { id: "e.order", kind: "entity", name: "Order", summary: "s", props: { pk: ["id"] } },
        { id: "e.pay", kind: "entity", name: "Payment", summary: "s", props: { pk: ["id"] } },
      ],
      relations: [
        { id: "r.rel", kind: "relates", from: "e.pay", to: "e.order", summary: "x", props: { cardinality: { from: "1", to: "N" } } },
      ],
      views: [{ id: "v.main", title: "m" }],
    };
    expect(renderSvg(d, layout(d))).toContain("1:N");
  });

  it("sequence 消息带序号", () => {
    const d: CovenantDoc = {
      covenant: "0.1",
      id: "t/seq-label",
      profile: "sequence@1",
      meta: { title: "Q", purpose: "p", non_goals: [] },
      elements: [
        { id: "e.a", kind: "actor", name: "用户", summary: "s" },
        { id: "e.b", kind: "participant", name: "服务", summary: "s" },
      ],
      relations: [
        { id: "r.1", kind: "message", from: "e.a", to: "e.b", summary: "提交订单", props: { kind: "sync" } },
      ],
      views: [{ id: "v.main", title: "m" }],
    };
    const svg = renderSvg(d, layout(d));
    expect(svg).toContain("1. 提交订单");
  });
});
describe("边标签胶囊与交叉跳线", () => {
  it("边标签带胶囊背景", () => {
    const d: CovenantDoc = {
      covenant: "0.1",
      id: "t/capsule",
      profile: "graph@1",
      meta: { title: "C", purpose: "p", non_goals: [] },
      elements: [
        { id: "e.a", kind: "module", name: "A", summary: "a", props: { path: "a" } },
        { id: "e.b", kind: "module", name: "B", summary: "b", props: { path: "b" } },
      ],
      relations: [{ id: "r.ab", kind: "imports", from: "e.a", to: "e.b", summary: "x" }],
      views: [{ id: "v.main", title: "m" }],
    };
    const svg = renderSvg(d, layout(d));
    expect(svg).toContain("edge-label-bg");
  });
});

describe("交点圆点（空心=几何交叉 / 实心=真实连接）", () => {
  it("junction 模式：边是点间直线，不再有跳线弧，交叉处是空心圆", () => {
    const d: CovenantDoc = {
      covenant: "0.1",
      id: "t/junction",
      profile: "graph@1",
      meta: { title: "J", purpose: "p", non_goals: [] },
      views: [
        {
          id: "v.main",
          title: "m",
          present: { node_style: "junction" },
          layout: { pins: { "e.a": [40, 40], "e.b": [320, 40], "e.c": [40, 260], "e.d": [320, 260] } },
        },
      ],
      elements: [
        { id: "e.a", kind: "module", name: "A", summary: "a", props: { path: "a" } },
        { id: "e.b", kind: "module", name: "B", summary: "b", props: { path: "b" } },
        { id: "e.c", kind: "module", name: "C", summary: "c", props: { path: "c" } },
        { id: "e.d", kind: "module", name: "D", summary: "d", props: { path: "d" } },
      ],
      relations: [
        { id: "r.ac", kind: "imports", from: "e.a", to: "e.d", summary: "交叉 1" },
        { id: "r.bd", kind: "imports", from: "e.b", to: "e.c", summary: "交叉 2" },
      ],
    };
    const view = d.views![0]!;
    const sel = selectView(d, view);
    const l = layout(d, { pins: view.layout?.pins, includeIds: sel.elementIds, includeRelationIds: sel.relationIds });
    const svg = renderSvg(d, l, { view });
    expect(svg).toContain('r="6"'); // 接线点
    expect(svg.match(/ Q[-0-9]/g) ?? []).toHaveLength(0); // 不再有跳线弧
    expect(svg).toContain("crossing-hollow"); // 两条对角线交叉 → 空心圆
    // 接线点模式不应画节点大框（module 的 rect 不出现）
    expect((svg.match(/<rect x="40" y="40"/g) ?? []).length).toBe(0);
  });

  it("T 型汇入/共享折点画实心圆，纯几何交叉画空心圆", () => {
    const d: CovenantDoc = {
      covenant: "0.1",
      id: "t/crossings",
      profile: "c4-container@1",
      meta: { title: "X", purpose: "p", non_goals: [] },
      elements: [
        { id: "e.a", kind: "container", name: "A", summary: "a", tech: "TS" },
        { id: "e.b", kind: "container", name: "B", summary: "b", tech: "TS" },
        { id: "e.c", kind: "container", name: "C", summary: "c", tech: "TS" },
        { id: "e.d", kind: "container", name: "D", summary: "d", tech: "TS" },
      ],
      relations: [
        { id: "r.1", kind: "calls", from: "e.a", to: "e.b", summary: "1" },
        { id: "r.2", kind: "calls", from: "e.b", to: "e.c", summary: "2" },
        { id: "r.3", kind: "calls", from: "e.c", to: "e.d", summary: "3" },
        { id: "r.4", kind: "calls", from: "e.d", to: "e.a", summary: "4" },
        { id: "r.5", kind: "calls", from: "e.a", to: "e.c", summary: "5" },
        { id: "r.6", kind: "calls", from: "e.b", to: "e.d", summary: "6" },
      ],
    };
    // 手工布局：节点放在四角（远离交点），边是我们精确控制的折线
    const nodes = {
      "e.a": { x: 10, y: 10, w: 20, h: 20 },
      "e.b": { x: 900, y: 10, w: 20, h: 20 },
      "e.c": { x: 10, y: 700, w: 20, h: 20 },
      "e.d": { x: 900, y: 700, w: 20, h: 20 },
    };
    const mk = (id: string, from: string, to: string, points: { x: number; y: number }[]) => ({
      id, from, to, points, lane: 0,
    });
    const fabricated = {
      nodes,
      edges: [
        mk("r.1", "e.a", "e.b", [{ x: 100, y: 100 }, { x: 100, y: 400 }]), // 竖线
        mk("r.2", "e.b", "e.c", [{ x: 300, y: 250 }, { x: 100, y: 250 }]), // T 型：终点落在 r.1 上
        mk("r.3", "e.c", "e.d", [{ x: 400, y: 100 }, { x: 400, y: 400 }]), // 竖线
        mk("r.4", "e.d", "e.a", [{ x: 350, y: 250 }, { x: 450, y: 250 }]), // 与 r.3 纯交叉
        mk("r.5", "e.a", "e.c", [{ x: 600, y: 100 }, { x: 700, y: 200 }, { x: 800, y: 100 }]), // 折点
        mk("r.6", "e.b", "e.d", [{ x: 600, y: 300 }, { x: 700, y: 200 }, { x: 800, y: 300 }]), // 共享折点
      ],
      width: 1200,
      height: 900,
      ranks: {},
    };
    const svg = renderSvg(d, fabricated);
    expect(svg).toContain("crossing-solid"); // T 型 + 共享折点
    expect(svg).toContain("crossing-hollow"); // 纯几何交叉
    // 纯几何交叉只应有一个空心点（T 型点不算空心）
    expect((svg.match(/crossing-hollow/g) ?? []).length).toBe(1);
    expect((svg.match(/crossing-solid/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(svg.match(/ Q[-0-9]/g) ?? []).toHaveLength(0);
  });
});

describe("边标签不压别的边线", () => {
  it("胶囊沿路径滑动，避开穿过的另一条边", () => {
    const d: CovenantDoc = {
      covenant: "0.1",
      id: "t/avoid",
      profile: "c4-container@1",
      meta: { title: "AV", purpose: "p", non_goals: [] },
      elements: [
        { id: "e.a", kind: "container", name: "A", summary: "a", tech: "TS" },
        { id: "e.b", kind: "container", name: "B", summary: "b", tech: "TS" },
      ],
      relations: [
        { id: "r.h", kind: "calls", from: "e.a", to: "e.b", summary: "h", props: { label: "很长的中文胶囊标签" } },
        { id: "r.v", kind: "calls", from: "e.b", to: "e.a", summary: "v" },
      ],
    };
    const nodes = {
      "e.a": { x: 10, y: 10, w: 20, h: 20 },
      "e.b": { x: 900, y: 10, w: 20, h: 20 },
    };
    const fabricated = {
      nodes,
      edges: [
        { id: "r.h", from: "e.a", to: "e.b", points: [{ x: 100, y: 200 }, { x: 800, y: 200 }], lane: 0 },
        { id: "r.v", from: "e.b", to: "e.a", points: [{ x: 450, y: 60 }, { x: 450, y: 340 }], lane: 0 },
      ],
      width: 1000,
      height: 500,
      ranks: {},
    };
    const svg = renderSvg(d, fabricated);
    const rect = /<rect class="edge-label-bg" x="([-\d.]+)" y="([-\d.]+)" width="([-\d.]+)" height="([-\d.]+)"/.exec(svg);
    expect(rect).not.toBeNull();
    const box = { x: Number(rect![1]), y: Number(rect![2]), w: Number(rect![3]), h: Number(rect![4]) };
    // 垂直边线段 (450,60)-(450,340)：胶囊不得与它相交
    const verticalAt450 = 450;
    const boxCovers450 = box.x < verticalAt450 && box.x + box.w > verticalAt450 && box.y < 340 && box.y + box.h > 60;
    expect(boxCovers450).toBe(false);
  });
});
describe("标签避让回退（候选耗尽也不重叠）", () => {
  it("重复主位置/候选相同时，标签按环扩张铺开且两两不重叠", () => {
    const primary = { x: 200, y: 200 };
    const req = { text: "同一位置的标签", primary, candidates: [primary] };
    const placed = placeLabels(Array.from({ length: 6 }, () => req), []);
    const boxes = placed.map((p) => ({
      x: p.x - p.width / 2 - 2,
      y: p.y - 10,
      w: p.width + 4,
      h: 15,
    }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
  });
});