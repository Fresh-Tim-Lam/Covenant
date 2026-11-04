import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseDocument } from "@covenant/core";
import type { CovenantDoc, ImplStatus } from "@covenant/core";
import { layout, segmentMidpoint, selectView } from "@covenant/layout";
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
  y: l.y - 5.5,
  w: l.width + 4,
  h: 11,
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
describe("边标签（去胶囊）与交点圆点", () => {
  it("边标签只有文字 + 白描边，不再画背景胶囊", () => {
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
    expect(svg).not.toContain("edge-label-bg"); // 不再有背景胶囊
    expect(svg).toContain('class="edge-label"');
    expect(svg).toContain('paint-order="stroke"'); // 白描边保证压线可读
    expect(svg).toContain('stroke="#ffffff"');
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
      id, from, to, points, segmentCount: points.length - 1, lane: 0,
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
    expect(svg).toContain("crossing-solid"); // T 型汇入
    expect(svg).toContain("crossing-hollow"); // 纯几何交叉
    // 纯几何交叉只应有一个空心点（T 型点不算空心）
    expect((svg.match(/crossing-hollow/g) ?? []).length).toBe(1);
    // 只有 T 型汇入算实心；共享内部折点（并道/走廊）不算连接、不再画实心
    expect((svg.match(/crossing-solid/g) ?? []).length).toBe(1);
    expect(svg.match(/ Q[-0-9]/g) ?? []).toHaveLength(0);
  });
});

describe("边标签不压别的边线", () => {
  it("标签沿路径滑动，避开穿过的另一条边", () => {
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
        { id: "r.h", kind: "calls", from: "e.a", to: "e.b", summary: "h", props: { label: "很长的中文边标签" } },
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
        { id: "r.h", from: "e.a", to: "e.b", points: [{ x: 100, y: 200 }, { x: 800, y: 200 }], segmentCount: 1, lane: 0 },
        { id: "r.v", from: "e.b", to: "e.a", points: [{ x: 450, y: 60 }, { x: 450, y: 340 }], segmentCount: 1, lane: 0 },
      ],
      width: 1000,
      height: 500,
      ranks: {},
    };
    const svg = renderSvg(d, fabricated);
    // 去胶囊后按文字锚点换算视觉包围盒：中心=(x, y-2.5)，宽≈文本宽+4，高 11
    const txt = /<text class="edge-label" x="([-\d.]+)" y="([-\d.]+)"[^>]*>([^<]*)<\/text>/.exec(svg);
    expect(txt).not.toBeNull();
    let units = 0;
    for (const ch of txt![3]!) units += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 1 : 0.55;
    const width = units * 10.5 + 4;
    const cx = Number(txt![1]);
    const cy = Number(txt![2]) - 2.5;
    const box = { x: cx - width / 2, y: cy - 5.5, w: width, h: 11 };
    // 垂直边线段 (450,60)-(450,340)：文字盒不得与它相交
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
      y: p.y - 5.5,
      w: p.width + 4,
      h: 11,
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

/* ------------------- 段级批注 badge（annotation.target.segment） ------------------- */

const BADGE_RE = /<g class="badge"><circle cx="([-\d.]+)" cy="([-\d.]+)" r="10"[^>]*\/><text[^>]*>(\d+)<\/text><\/g>/g;
function badges(svg: string): { x: number; y: number; n: number }[] {
  return [...svg.matchAll(BADGE_RE)].map((m) => ({ x: Number(m[1]), y: Number(m[2]), n: Number(m[3]) }));
}

function segDoc(): CovenantDoc {
  const d = doc();
  d.annotations = [];
  return d;
}

const ann = (segment?: number): NonNullable<CovenantDoc["annotations"]>[number] => ({
  id: segment === undefined ? "a.01JAXSEGWHOLE1" : "a.01JAXSEGSEG01",
  target:
    segment === undefined
      ? { kind: "relation", id: "r.ab" }
      : { kind: "relation", id: "r.ab", segment },
  type: "risk",
  severity: "low",
  title: "段级",
  status: "open",
  author: "human:lily",
  created: "2026-11-03T00:00:00+08:00",
});

describe("段级批注 badge", () => {
  it("段级 badge 落在对应段中点上方（mid.y - 10，±0.5）", () => {
    const d = segDoc();
    d.annotations = [ann(1)];
    const l = layout(d);
    const edge = l.edges.find((e) => e.id === "r.ab")!;
    const mid = segmentMidpoint(edge.points, 1);
    const svg = renderSvg(d, l);
    const b = badges(svg);
    expect(b).toHaveLength(1);
    expect(b[0]!.x).toBeCloseTo(mid.x, 1);
    expect(b[0]!.y).toBeCloseTo(mid.y - 10, 1);
    expect(b[0]!.n).toBe(1);
  });

  it("同段合并计数；整边 badge 只数无 segment 的批注", () => {
    const d = segDoc();
    d.annotations = [ann(), ann(1), { ...ann(1), id: "a.01JAXSEGSEG02" }];
    const l = layout(d);
    const edge = l.edges.find((e) => e.id === "r.ab")!;
    const mid = segmentMidpoint(edge.points, 1);
    const svg = renderSvg(d, l);
    const b = badges(svg);
    const segBadge = b.find((x) => Math.abs(x.x - mid.x) < 0.5 && Math.abs(x.y - (mid.y - 10)) < 0.5);
    expect(segBadge?.n).toBe(2);
    expect(b.some((x) => x.n === 1 && x !== segBadge)).toBe(true); // 整边 badge 仍在标签旁
    expect(b).toHaveLength(2);
  });

  it("无 segment 批注时输出与旧版逐字节一致（黄金示例零回归）", () => {
    const file = "examples/payments-arch.cvn.yaml";
    const parsed = parseDocument(readFileSync(file, "utf8"), file);
    const d = parsed.doc!;
    const view = (d.views ?? [])[0]!;
    const sel = selectView(d, view);
    const l = layout(d, {
      direction: view.layout?.direction,
      rankGap: view.layout?.spacing?.rank,
      nodeGap: view.layout?.spacing?.node,
      pins: view.layout?.pins,
      includeIds: sel.elementIds,
      includeRelationIds: sel.relationIds,
    });
    const svg = renderSvg(d, l, { title: view.title ?? d.meta?.title, view });
    expect(svg).toBe(readFileSync("packages/render/src/__golden__/payments.svg", "utf8"));
  });

  it("junction 模式（两点直线）段 0 的 badge 落在直线中点上方", () => {
    const d = segDoc();
    d.annotations = [ann(0)];
    const pins = { "e.a": [40, 40] as [number, number], "e.b": [320, 40] as [number, number] };
    const view = {
      id: "v.j",
      title: "j",
      present: { node_style: "junction" as const },
      layout: { pins },
    };
    d.views = [view];
    const l = layout(d, { pins, includeIds: ["e.a", "e.b"], includeRelationIds: ["r.ab"] });
    const svg = renderSvg(d, l, { view });
    // junction 渲染把边改写成两点直线：中点 = 两节点中心的中点
    const from = l.nodes["e.a"]!;
    const to = l.nodes["e.b"]!;
    const mid = { x: (from.x + from.w / 2 + to.x + to.w / 2) / 2, y: (from.y + from.h / 2 + to.y + to.h / 2) / 2 };
    const b = badges(svg);
    expect(b).toHaveLength(1);
    expect(b[0]!.x).toBeCloseTo(mid.x, 1);
    expect(b[0]!.y).toBeCloseTo(mid.y - 10, 1);
  });
});

/* ------------------- impl_status 线型映射（P0 格式扩展） ------------------- */

const IMPL_TEST_STATUSES: ImplStatus[] = [
  "implemented",
  "partial",
  "planned",
  "not_connected",
  "unknown",
];

interface PaintExpect {
  stroke?: string;
  dash?: string;
  opacity?: string;
  marker?: string;
}

const EDGE_EXPECT: Record<ImplStatus, PaintExpect> = {
  implemented: { marker: "cvn-arrow" },
  partial: { dash: "7 4", marker: "cvn-arrow" },
  planned: { dash: "2 3", opacity: ".72", marker: "cvn-arrow" },
  not_connected: { stroke: "#8b98a5", dash: "5 5", opacity: ".8", marker: "cvn-arrow-muted" },
  unknown: { stroke: "#9a6a00", dash: "2 3", marker: "cvn-arrow-unknown" },
};

function statusDoc(a: ImplStatus, b: ImplStatus, relStatus?: ImplStatus): CovenantDoc {
  return {
    covenant: "0.1",
    id: "t/impl",
    profile: "c4-container@1",
    meta: { title: "impl", purpose: "p", non_goals: [] },
    elements: [
      { id: "e.a", kind: "container", name: "A", summary: "a", tech: "TS", impl_status: a },
      { id: "e.b", kind: "container", name: "B", summary: "b", tech: "TS", impl_status: b },
    ],
    relations: [
      {
        id: "r.ab",
        kind: "calls",
        from: "e.a",
        to: "e.b",
        summary: "c",
        ...(relStatus ? { impl_status: relStatus } : {}),
      },
    ],
    views: [{ id: "v.main", title: "m" }],
  };
}

/** 取元素第一个几何图元的属性串 */
function nodeGeomAttrs(svg: string, id: string): string {
  return new RegExp(`<g class="node kind-container" data-id="${id}">\\s*<rect ([^>]*)/>`).exec(svg)?.[1] ?? "";
}

/** 取边可见 path（第二段 path）的属性串 */
function edgeVisibleAttrs(svg: string, id: string): string {
  const g = new RegExp(`<g class="edge" data-id="${id}">([\\s\\S]*?)</g>`).exec(svg)?.[1] ?? "";
  const paths = [...g.matchAll(/<path d="[^"]*"([^>]*)\/>/g)];
  return paths[paths.length - 1]?.[1] ?? "";
}

describe("impl_status 元素线型（5 状态）", () => {
  function fiveNodeDoc(): CovenantDoc {
    const elements = IMPL_TEST_STATUSES.map((s) => ({
      id: `e.${s}`,
      kind: "container",
      name: s,
      summary: s,
      tech: "TS",
      impl_status: s,
    }));
    const relations = IMPL_TEST_STATUSES.slice(1).map((s, i) => ({
      id: `r.${IMPL_TEST_STATUSES[i]}-${s}`,
      kind: "calls",
      from: `e.${IMPL_TEST_STATUSES[i]}`,
      to: `e.${s}`,
      summary: "c",
      impl_status: "implemented" as ImplStatus,
    }));
    return {
      covenant: "0.1",
      id: "t/impl5",
      profile: "c4-container@1",
      meta: { title: "impl5", purpose: "p", non_goals: [] },
      elements,
      relations,
      views: [{ id: "v.main", title: "m" }],
    };
  }

  it("implemented 不加任何新属性；其余按状态覆盖 dash/opacity/stroke", () => {
    const d = fiveNodeDoc();
    const svg = renderSvg(d, layout(d));
    const impl = nodeGeomAttrs(svg, "e.implemented");
    expect(impl).toContain('stroke="#94a3b8"');
    expect(impl).not.toContain("stroke-dasharray");

    const partial = nodeGeomAttrs(svg, "e.partial");
    expect(partial).toContain('stroke-dasharray="7 4"');
    expect(partial).not.toContain("opacity");

    const planned = nodeGeomAttrs(svg, "e.planned");
    expect(planned).toContain('stroke-dasharray="2 3"');
    expect(planned).toContain('opacity=".72"');

    const nc = nodeGeomAttrs(svg, "e.not_connected");
    expect(nc).toContain('stroke="#8b98a5"');
    expect(nc).toContain('stroke-dasharray="5 5"');
    expect(nc).toContain('opacity=".8"');

    const unk = nodeGeomAttrs(svg, "e.unknown");
    expect(unk).toContain('stroke="#9a6a00"');
    expect(unk).toContain('stroke-dasharray="2 3"');
  });

  it("非 implemented 覆盖 kind-dash（datastore 的 6 3 被替换）", () => {
    const d = fiveNodeDoc();
    d.elements![0] = {
      ...d.elements![0]!,
      kind: "datastore",
      props: { storage_kind: "rdbms" },
      impl_status: "partial",
    };
    const svg = renderSvg(d, layout(d));
    const attrs = new RegExp(`<g class="node kind-datastore" data-id="e.implemented">\\s*<rect ([^>]*)/>`).exec(svg)?.[1] ?? "";
    expect(attrs).toContain('stroke-dasharray="7 4"');
    expect(attrs).not.toContain("6 3");
  });

  it("junction 圆点：状态色作 stroke、fill 保持", () => {
    const d = statusDoc("implemented", "unknown");
    const pins = { "e.a": [40, 40] as [number, number], "e.b": [320, 40] as [number, number] };
    const view = { id: "v.j", title: "j", present: { node_style: "junction" as const }, layout: { pins } };
    d.views = [view];
    const l = layout(d, { pins, includeIds: ["e.a", "e.b"], includeRelationIds: ["r.ab"] });
    const svg = renderSvg(d, l, { view });
    // junction 圆点：fill 保持深色，unknown 端 stroke 用琥珀 + 状态虚线
    expect(svg).toContain('fill="#0f172a"');
    expect(svg).toContain('stroke="#9a6a00"');
    expect(svg).toContain('stroke-dasharray="2 3"');
  });
});

describe("impl_status 关系继承（弱端）与显式覆盖", () => {
  const TABLE: [ImplStatus, ImplStatus, ImplStatus][] = [
    ["implemented", "implemented", "implemented"],
    ["implemented", "planned", "planned"],
    ["partial", "not_connected", "not_connected"],
    ["planned", "unknown", "unknown"],
    ["partial", "planned", "planned"],
    ["not_connected", "not_connected", "not_connected"],
  ];

  for (const [a, b, expected] of TABLE) {
    it(`${a} + ${b} → ${expected}`, () => {
      const d = statusDoc(a, b);
      const l = layout(d);
      const attrs = edgeVisibleAttrs(renderSvg(d, l), "r.ab");
      const e = EDGE_EXPECT[expected];
      if (e.dash) expect(attrs).toContain(`stroke-dasharray="${e.dash}"`);
      else expect(attrs).not.toContain("stroke-dasharray");
      if (e.stroke) expect(attrs).toContain(`stroke="${e.stroke}"`);
      else expect(attrs).toContain('stroke="#94a3b8"');
      if (e.opacity) expect(attrs).toContain(`opacity="${e.opacity}"`);
      else expect(attrs).not.toContain("opacity=");
      expect(attrs).toContain(`marker-end="url(#${e.marker})"`);
    });
  }

  it("显式关系状态优先（覆盖弱端继承）", () => {
    const declared = statusDoc("implemented", "planned", "implemented");
    const attrs = edgeVisibleAttrs(renderSvg(declared, layout(declared)), "r.ab");
    expect(attrs).not.toContain("stroke-dasharray");
    expect(attrs).toContain('marker-end="url(#cvn-arrow)"');

    const forced = statusDoc("implemented", "implemented", "unknown");
    const attrs2 = edgeVisibleAttrs(renderSvg(forced, layout(forced)), "r.ab");
    expect(attrs2).toContain('stroke="#9a6a00"');
    expect(attrs2).toContain('stroke-dasharray="2 3"');
    expect(attrs2).toContain('marker-end="url(#cvn-arrow-unknown)"');
  });

  it("箭头 marker：not_connected/unknown 追加专用 marker，其余用默认", () => {
    const nc = statusDoc("implemented", "not_connected");
    const ncSvg = renderSvg(nc, layout(nc));
    expect(ncSvg).toContain('<marker id="cvn-arrow-muted"');
    expect(ncSvg).toContain('stroke="#8b98a5"');
    expect(ncSvg).not.toContain('<marker id="cvn-arrow-unknown"');

    const unk = statusDoc("implemented", "unknown");
    const unkSvg = renderSvg(unk, layout(unk));
    expect(unkSvg).toContain('<marker id="cvn-arrow-unknown"');
    expect(unkSvg).toContain('stroke="#9a6a00"');

    const plain = statusDoc("implemented", "implemented");
    const plainSvg = renderSvg(plain, layout(plain));
    expect(plainSvg).not.toContain("cvn-arrow-muted");
    expect(plainSvg).not.toContain("cvn-arrow-unknown");
  });

  it("无 impl_status 字段文档：输出与旧版逐字节一致（deps 黄金）", () => {
    const file = "examples/covenant-deps.cvn.yaml";
    const parsed = parseDocument(readFileSync(file, "utf8"), file);
    const d = parsed.doc!;
    const view = (d.views ?? [])[0]!;
    const sel = selectView(d, view);
    const l = layout(d, {
      direction: view.layout?.direction,
      rankGap: view.layout?.spacing?.rank,
      nodeGap: view.layout?.spacing?.node,
      pins: view.layout?.pins,
      includeIds: sel.elementIds,
      includeRelationIds: sel.relationIds,
    });
    const svg = renderSvg(d, l, { title: view.title ?? d.meta?.title, view });
    expect(svg).toBe(readFileSync("packages/render/src/__golden__/deps.svg", "utf8"));
    expect(svg).not.toContain("impl_status");
    expect(svg).not.toContain("cvn-arrow-muted");
    expect(svg).not.toContain("cvn-arrow-unknown");
  });
});

describe("impl_status 序列图（参与者方框 + reply 虚线覆盖）", () => {
  function seqDoc(): CovenantDoc {
    const file = "examples/order-sequence.cvn.yaml";
    const parsed = parseDocument(readFileSync(file, "utf8"), file);
    return parsed.doc!;
  }

  it("参与者非 implemented 有状态线型；reply 的 5 3 被状态 dash 覆盖", () => {
    const d = seqDoc();
    const participant = d.elements![0]!;
    participant.impl_status = "planned";
    const reply = (d.relations ?? []).find((r) => r.kind === "return");
    expect(reply).toBeTruthy();
    reply!.impl_status = "not_connected";
    const svg = renderSvg(d, layout(d));
    // 参与者方框：planned 线型
    expect(svg).toMatch(/<g class="participant" data-id="[^"]+">\s*<rect[^>]*stroke-dasharray="2 3"[^>]*opacity="\.72"/);
    // reply 消息：not_connected 覆盖 5 3
    const msg = new RegExp(`<g class="message kind-reply" data-id="${reply!.id}">([\\s\\S]*?)</g>`).exec(svg)?.[1] ?? "";
    expect(msg).toContain('stroke-dasharray="5 5"');
    expect(msg).not.toContain("5 3");
    expect(msg).toContain('stroke="#8b98a5"');
    expect(msg).toContain('marker-end="url(#cvn-arrow-muted)"');
    expect(svg).toContain('<marker id="cvn-arrow-muted"');
  });
});