import { describe, expect, it } from "vitest";
import type { CovenantDoc } from "@covenant/core";
import { layout, layoutSequence, route, segmentMidpoint, selectView } from "./index";

function doc(): CovenantDoc {
  return {
    covenant: "0.1",
    id: "t/layout",
    profile: "c4-container@1",
    meta: { title: "t", purpose: "p", non_goals: [] },
    elements: [
      { id: "e.a", kind: "container", name: "A", summary: "a", tech: "ts" },
      { id: "e.b", kind: "container", name: "B", summary: "b", tech: "ts" },
      { id: "e.c", kind: "datastore", name: "C", summary: "c", tech: "pg", props: { storage_kind: "rdbms" } },
    ],
    relations: [
      { id: "r.ab", kind: "calls", from: "e.a", to: "e.b", summary: "ab" },
      { id: "r.bc", kind: "writes", from: "e.b", to: "e.c", summary: "bc" },
      // 回边：c -> a 不应让层号无限增长
      { id: "r.ca", kind: "reads", from: "e.c", to: "e.a", summary: "ca" },
    ],
  };
}

describe("layout", () => {
  it("输出确定（两次调用逐字节一致）", () => {
    const a = JSON.stringify(layout(doc()));
    const b = JSON.stringify(layout(doc()));
    expect(a).toBe(b);
  });

  it("按最长路径分层：a=0, b=1, c=2（回边被忽略）", () => {
    const { ranks } = layout(doc());
    expect(ranks["e.a"]).toBe(0);
    expect(ranks["e.b"]).toBe(1);
    expect(ranks["e.c"]).toBe(2);
  });

  it("节点不重叠", () => {
    const { nodes } = layout(doc());
    const list = Object.values(nodes);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]!;
        const b = list[j]!;
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
  });

  it("pins 覆盖坐标", () => {
    const { nodes } = layout(doc(), { pins: { "e.a": [400, 300] } });
    expect(nodes["e.a"]!.x).toBeGreaterThanOrEqual(400);
  });

  it("route 生成 4 点正交折线", () => {
    const pts = route({ x: 0, y: 0, w: 10, h: 10 }, { x: 100, y: 0, w: 10, h: 10 });
    expect(pts).toHaveLength(4);
    expect(pts[0]!.x).toBe(10);
    expect(pts[3]!.x).toBe(100);
  });
});

describe("selectView", () => {
  it("无视图时返回全部", () => {
    const s = selectView(doc());
    expect(s.elementIds.sort()).toEqual(["e.a", "e.b", "e.c"]);
    expect(s.relationIds.sort()).toEqual(["r.ab", "r.bc", "r.ca"]);
  });

  it("include.elements 只保留命中元素，关系随之裁剪", () => {
    const s = selectView(doc(), { id: "v", title: "v", include: { elements: ["e.a", "e.b"] } });
    expect(s.elementIds.sort()).toEqual(["e.a", "e.b"]);
    expect(s.relationIds).toEqual(["r.ab"]);
  });

  it("前缀通配 e.* 与精确 id 等价（本图全部是 e.*）", () => {
    const s = selectView(doc(), { id: "v", title: "v", include: { elements: ["e.*"] } });
    expect(s.elementIds).toHaveLength(3);
  });

  it("tag: 选择器命中标签", () => {
    const d = doc();
    d.elements![1]!.tags = ["critical"];
    const s = selectView(d, { id: "v", title: "v", include: { elements: ["tag:critical"] } });
    expect(s.elementIds).toEqual(["e.b"]);
  });

  it("exclude 过滤元素与关系", () => {
    const s = selectView(doc(), {
      id: "v",
      title: "v",
      exclude: { elements: ["e.c"], relations: ["r.bc"] },
    });
    expect(s.elementIds.sort()).toEqual(["e.a", "e.b"]);
    expect(s.relationIds).toEqual(["r.ab"]);
  });

  it("include.relations 显式限定关系", () => {
    const s = selectView(doc(), { id: "v", title: "v", include: { relations: ["r.ab"] } });
    expect(s.elementIds).toHaveLength(3);
    expect(s.relationIds).toEqual(["r.ab"]);
  });

  it("layout 按选择结果裁剪节点与边", () => {
    const d = doc();
    const sel = selectView(d, { id: "v", title: "v", include: { elements: ["e.a", "e.b"] } });
    const r = layout(d, { includeIds: sel.elementIds, includeRelationIds: sel.relationIds });
    expect(Object.keys(r.nodes).sort()).toEqual(["e.a", "e.b"]);
    expect(r.edges.map((e) => e.id)).toEqual(["r.ab"]);
  });
});

describe("渲染质量 v2", () => {
  it("跨层长边走顶部通道 + 侧边走廊（通道段在节点带之上，首末段垂直于框边）", () => {
    const d = doc(); // 含 r.ca：c(rank2) → a(rank0)，跨度 2
    const r = layout(d);
    const long = r.edges.find((e) => e.id === "r.ca")!;
    const minNodeY = Math.min(...Object.values(r.nodes).map((n) => n.y));
    // 新路由：start → 侧边 stub → lane 竖线 → 通道横线 → lane 竖线 → 目标侧 stub
    expect(long.labelSegment).toEqual([2, 3]);
    expect(long.points[2]!.y).toBeLessThan(minNodeY);
    expect(long.points[3]!.y).toBe(long.points[2]!.y);
    expect(long.points[2]!.x).not.toBe(long.points[3]!.x);
    // 首/末段水平（垂直于 left/right 框边）
    const first = long.points[1]!;
    const last = long.points[long.points.length - 2]!;
    expect(Math.abs(first.y - long.points[0]!.y)).toBeLessThan(0.01);
    expect(Math.abs(long.points[0]!.x - first.x)).toBeGreaterThanOrEqual(18);
    expect(Math.abs(last.y - long.points[long.points.length - 1]!.y)).toBeLessThan(0.01);
    expect(Math.abs(long.points[long.points.length - 1]!.x - last.x)).toBeGreaterThanOrEqual(18);
  });

  it("barycenter 降低交叉：a→d、b→c 时第二层顺序反转为 d、c", () => {
    const d: CovenantDoc = {
      covenant: "0.1",
      id: "t/cross",
      profile: "c4-container@1",
      meta: { title: "t", purpose: "p", non_goals: [] },
      elements: [
        { id: "e.a", kind: "container", name: "A", summary: "a", tech: "ts" },
        { id: "e.b", kind: "container", name: "B", summary: "b", tech: "ts" },
        { id: "e.c", kind: "container", name: "C", summary: "c", tech: "ts" },
        { id: "e.d", kind: "container", name: "D", summary: "d", tech: "ts" },
      ],
      relations: [
        { id: "r.ad", kind: "calls", from: "e.a", to: "e.d", summary: "ad" },
        { id: "r.bc", kind: "calls", from: "e.b", to: "e.c", summary: "bc" },
      ],
    };
    const r = layout(d);
    // 初始文档序为 c,d；barycenter 后 d 应在 c 之上（列内顺序即 y 顺序）
    expect(r.nodes["e.d"]!.y).toBeLessThan(r.nodes["e.c"]!.y);
  });

  it("长边通道不会让坐标变成 NaN（视图缺 layout 的回归用例）", () => {
    const d = doc();
    const r = layout(d, { rankGap: undefined, nodeGap: undefined, padding: undefined });
    expect(Number.isFinite(r.width)).toBe(true);
    expect(Number.isFinite(r.height)).toBe(true);
    for (const n of Object.values(r.nodes)) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
  });
});

describe("父子约束", () => {
  it("parent 约束：child 至少比 parent 深一层（DOWN 方向 y 更大）", () => {
    const d: CovenantDoc = {
      covenant: "0.1",
      id: "t/parent",
      profile: "deployment@1",
      meta: { title: "p", purpose: "p", non_goals: [] },
      elements: [
        { id: "e.node", kind: "node", name: "N", summary: "n", props: { env: "prod" } },
        { id: "e.art", kind: "artifact", name: "A", summary: "a", parent: "e.node", props: { tech: "x" } },
      ],
      relations: [],
      views: [{ id: "v.main", title: "m" }],
    };
    const r = layout(d, { direction: "DOWN" });
    expect(r.nodes["e.art"]!.y).toBeGreaterThan(r.nodes["e.node"]!.y);
  });
});

describe("layoutSequence", () => {
  function seqDoc(): CovenantDoc {
    return {
      covenant: "0.1",
      id: "t/seq",
      profile: "sequence@1",
      meta: { title: "S", purpose: "p", non_goals: [] },
      elements: [
        { id: "e.a", kind: "actor", name: "用户", summary: "s" },
        { id: "e.b", kind: "participant", name: "服务", summary: "s" },
      ],
      relations: [
        { id: "r.1", kind: "message", from: "e.a", to: "e.b", summary: "请求" },
        { id: "r.2", kind: "message", from: "e.b", to: "e.b", summary: "自调用" },
        { id: "r.3", kind: "return", from: "e.b", to: "e.a", summary: "响应", props: { reply_to: "r.1" } },
      ],
      views: [{ id: "v.main", title: "m" }],
    };
  }

  it("参与者按文档顺序排成列，x 递增", () => {
    const s = layoutSequence(seqDoc());
    expect(s.participants.map((p) => p.id)).toEqual(["e.a", "e.b"]);
    expect(s.participants[1]!.x).toBeGreaterThan(s.participants[0]!.x);
  });

  it("消息按数组顺序分配 y，且逐行递增", () => {
    const s = layoutSequence(seqDoc());
    expect(s.messages).toHaveLength(3);
    expect(s.messages[1]!.y).toBeGreaterThan(s.messages[0]!.y);
    expect(s.messages[2]!.y).toBeGreaterThan(s.messages[1]!.y);
  });

  it("自调用消息标记 self，且不越界", () => {
    const s = layoutSequence(seqDoc());
    const self = s.messages.find((m) => m.relId === "r.2")!;
    expect(self.self).toBe(true);
    expect(self.fromX).toBe(self.toX);
  });

  it("includeIds 裁剪参与者与消息", () => {
    const s = layoutSequence(seqDoc(), { includeIds: new Set(["e.a", "e.b"]) });
    expect(s.participants).toHaveLength(2);
    const only = layoutSequence(seqDoc(), {
      includeIds: new Set(["e.a"]),
      includeRelationIds: new Set(),
    });
    expect(only.participants).toHaveLength(1);
    expect(only.messages).toHaveLength(0);
  });
});
describe("接线点分配（每条边独立接入点 + 自适应扩框）", () => {
  function docWithFanout(count: number): CovenantDoc {
    const relations: NonNullable<CovenantDoc["relations"]> = [];
    for (let i = 0; i < count; i++) {
      relations.push({ id: `r.${i}`, kind: "calls", from: "e.hub", to: "e.n0", summary: "x" });
    }
    return {
      covenant: "0.1",
      id: "t/ports",
      profile: "c4-container@1",
      meta: { title: "P", purpose: "p", non_goals: [] },
      elements: [
        { id: "e.hub", kind: "container", name: "Hub", summary: "s", tech: "TS" },
        { id: "e.n0", kind: "container", name: "N0", summary: "s", tech: "TS" },
      ],
      relations,
      views: [{ id: "v.main", title: "m" }],
    };
  }

  it("同一侧的平行边使用不同端口，且保持最小间距", () => {
    const l = layout(docWithFanout(3));
    const starts = l.edges.map((e) => e.points[0]!);
    expect(new Set(starts.map((p) => `${p.x},${p.y}`)).size).toBe(3);
    const along = starts[0]!.x === starts[1]!.x ? starts.map((p) => p.y) : starts.map((p) => p.x);
    along.sort((a, b) => a - b);
    for (let i = 1; i < along.length; i++) {
      expect(along[i]! - along[i - 1]!).toBeGreaterThanOrEqual(16);
    }
  });

  it("端口数超过侧边长度时自动扩展该维度（保持最小间距）", () => {
    const count = 16;
    const d = docWithFanout(count);
    const l = layout(d);
    const hub = l.nodes["e.hub"]!;
    const need = (count - 1) * 16 + 2 * 12; // 264
    expect(hub.h).toBeGreaterThanOrEqual(need);
    const starts = l.edges.map((e) => e.points[0]!);
    const along = starts[0]!.x === starts[1]!.x ? starts.map((p) => p.y) : starts.map((p) => p.x);
    along.sort((a, b) => a - b);
    for (let i = 1; i < along.length; i++) {
      expect(along[i]! - along[i - 1]!).toBeGreaterThanOrEqual(16);
    }
  });
});
describe("接线出口垂直短引线 + 与框间距", () => {
  function docBetween(): CovenantDoc {
    return {
      covenant: "0.1",
      id: "t/stub",
      profile: "c4-container@1",
      meta: { title: "S", purpose: "p", non_goals: [] },
      elements: [
        { id: "e.a", kind: "container", name: "A", summary: "s", tech: "TS" },
        { id: "e.b", kind: "container", name: "B", summary: "s", tech: "TS" },
        { id: "e.c", kind: "container", name: "C", summary: "s", tech: "TS" },
      ],
      relations: [{ id: "r.ab", kind: "calls", from: "e.a", to: "e.b", summary: "x" }],
      views: [{ id: "v.main", title: "m" }],
    };
  }

  it("首尾段必须是垂直/平行于端口法线的短引线（≥18px）", () => {
    const pins: Record<string, [number, number]> = { "e.a": [40, 120], "e.b": [620, 120], "e.c": [330, 40] };
    const l = layout(docBetween(), { pins });
    for (const e of l.edges) {
      const from = l.nodes[e.from]!;
      const to = l.nodes[e.to]!;
      const pts = e.points;
      const first = { dx: pts[1]!.x - pts[0]!.x, dy: pts[1]!.y - pts[0]!.y };
      const last = { dx: pts[pts.length - 1]!.x - pts[pts.length - 2]!.x, dy: pts[pts.length - 1]!.y - pts[pts.length - 2]!.y };
      // 起点落在哪个边 → 首段应垂直于该边
      const onLeftRight = Math.abs(pts[0]!.x - from.x) < 0.5 || Math.abs(pts[0]!.x - (from.x + from.w)) < 0.5;
      if (onLeftRight) expect(Math.abs(first.dx)).toBeGreaterThanOrEqual(18);
      else expect(Math.abs(first.dy)).toBeGreaterThanOrEqual(18);
      const onLeftRightTo = Math.abs(pts[pts.length - 1]!.x - to.x) < 0.5 || Math.abs(pts[pts.length - 1]!.x - (to.x + to.w)) < 0.5;
      if (onLeftRightTo) expect(Math.abs(last.dx)).toBeGreaterThanOrEqual(18);
      else expect(Math.abs(last.dy)).toBeGreaterThanOrEqual(18);
    }
  });

  it("中间线段与无关框保持 ≥12px 间距（扩展矩形不穿透）", () => {
    const pins: Record<string, [number, number]> = { "e.a": [40, 120], "e.b": [620, 120], "e.c": [330, 40] };
    const l = layout(docBetween(), { pins });
    const c = l.nodes["e.c"]!;
    for (const e of l.edges) {
      for (let i = 1; i < e.points.length - 2; i++) {
        const a = e.points[i]!;
        const b = e.points[i + 1]!;
        const horizontal = Math.abs(a.y - b.y) < 0.01;
        const vertical = Math.abs(a.x - b.x) < 0.01;
        if (horizontal) {
          const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
          const overlapX = x1 > c.x - 12 && x0 < c.x + c.w + 12;
          if (overlapX) {
            const insideY = a.y > c.y - 12 && a.y < c.y + c.h + 12;
            expect(insideY).toBe(false);
          }
        } else if (vertical) {
          const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
          const overlapY = y1 > c.y - 12 && y0 < c.y + c.h + 12;
          if (overlapY) {
            const insideX = a.x > c.x - 12 && a.x < c.x + c.w + 12;
            expect(insideX).toBe(false);
          }
        }
      }
    }
  });
});

/* ------------------- 长边侧边走廊 / 胶囊感知车道间距 ------------------- */

function segmentIntersectsRect(
  a: { x: number; y: number },
  b: { x: number; y: number },
  r: { x: number; y: number; w: number; h: number },
): boolean {
  if (Math.abs(a.y - b.y) < 0.01) {
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    return x0 < r.x + r.w && x1 > r.x && a.y > r.y && a.y < r.y + r.h;
  }
  if (Math.abs(a.x - b.x) < 0.01) {
    const y0 = Math.min(a.y, b.y);
    const y1 = Math.max(a.y, b.y);
    return y0 < r.y + r.h && y1 > r.y && a.x > r.x && a.x < r.x + r.w;
  }
  return false;
}

function assertNoEdgeCrossesNodes(
  result: ReturnType<typeof layout>,
  edgeIds?: string[],
): void {
  const endpoint = (ref: string): string => ref.split(":")[0] ?? ref;
  for (const e of result.edges) {
    if (edgeIds && !edgeIds.includes(e.id)) continue;
    const ends = [endpoint(e.from), endpoint(e.to)];
    for (let i = 0; i + 1 < e.points.length; i++) {
      for (const [id, r] of Object.entries(result.nodes)) {
        if (ends.includes(id)) continue;
        expect(segmentIntersectsRect(e.points[i]!, e.points[i + 1]!, r)).toBe(false);
      }
    }
  }
}

/** a→b→c、b→d，a→d 跨两层：旧实现会竖向穿过同列的 C，新实现必须走列间隙。 */
function stackedDoc(): CovenantDoc {
  return {
    covenant: "0.1",
    id: "t/long-side",
    profile: "c4-container@1",
    meta: { title: "L", purpose: "p", non_goals: [] },
    elements: [
      { id: "e.a", kind: "container", name: "A", summary: "a", tech: "TS" },
      { id: "e.b", kind: "container", name: "B", summary: "b", tech: "TS" },
      { id: "e.c", kind: "container", name: "C", summary: "c", tech: "TS" },
      { id: "e.d", kind: "container", name: "D", summary: "d", tech: "TS" },
    ],
    relations: [
      { id: "r.ab", kind: "calls", from: "e.a", to: "e.b", summary: "ab" },
      { id: "r.bc", kind: "calls", from: "e.b", to: "e.c", summary: "bc" },
      { id: "r.bd", kind: "calls", from: "e.b", to: "e.d", summary: "bd" },
      { id: "r.ad", kind: "calls", from: "e.a", to: "e.d", summary: "跨层" },
    ],
  };
}

describe("长边侧边走廊（不穿任何中间层节点）", () => {
  it("水平布局：长边不穿过同列中间节点", () => {
    const r = layout(stackedDoc());
    expect(r.edges.find((e) => e.id === "r.ad")!.labelSegment).toEqual([2, 3]);
    assertNoEdgeCrossesNodes(r);
  });

  it("垂直布局（DOWN）：长边不穿过中间行节点", () => {
    const r = layout(stackedDoc(), { direction: "DOWN" });
    const long = r.edges.find((e) => e.id === "r.ad")!;
    expect(long.labelSegment).toEqual([1, 2]);
    assertNoEdgeCrossesNodes(r);
  });
});

describe("平行边紧凑间距（去胶囊后不再按标签宽推宽）", () => {
  function parallelDoc(label: string, count: number): CovenantDoc {
    const relations = Array.from({ length: count }, (_, i) => ({
      id: `r.${i}`,
      kind: "calls",
      from: "e.a",
      to: "e.b",
      summary: `s${i}`,
      props: { label },
    }));
    return {
      covenant: "0.1",
      id: "t/parallel",
      profile: "c4-container@1",
      meta: { title: "P", purpose: "p", non_goals: [] },
      elements: [
        { id: "e.a", kind: "container", name: "A", summary: "a", tech: "TS" },
        { id: "e.b", kind: "container", name: "B", summary: "b", tech: "TS" },
      ],
      relations,
    };
  }

  it("同间隙短边车道间距 = 10px（≥8 且远小于标签宽）", () => {
    const d = parallelDoc("授权成功 [金额一致]", 3);
    const r = layout(d);
    const offsets = r.edges.map((e) => e.lane * 14).sort((a, b) => a - b);
    for (let i = 1; i < offsets.length; i++) {
      const step = offsets[i]! - offsets[i - 1]!;
      expect(step).toBeGreaterThanOrEqual(8);
      expect(step).toBeLessThanOrEqual(10.01);
    }
    // 宽标签不再把间隙扩到"胶囊宽 + 10"；只按半宽留出刚好不压节点的边距
    const a = r.nodes["e.a"]!;
    const b = r.nodes["e.b"]!;
    const gap = b.x - (a.x + a.w);
    expect(gap).toBeLessThan(200);
  });

  it("长边通道间距 = 10px（紧凑，不再按胶囊高 25）", () => {
    const d: CovenantDoc = {
      covenant: "0.1",
      id: "t/channels",
      profile: "c4-container@1",
      meta: { title: "CH", purpose: "p", non_goals: [] },
      elements: [
        { id: "e.a", kind: "container", name: "A", summary: "a", tech: "TS" },
        { id: "e.b", kind: "container", name: "B", summary: "b", tech: "TS" },
        { id: "e.c", kind: "container", name: "C", summary: "c", tech: "TS" },
        { id: "e.d", kind: "container", name: "D", summary: "d", tech: "TS" },
      ],
      relations: [
        { id: "r.ab", kind: "calls", from: "e.a", to: "e.b", summary: "ab" },
        { id: "r.bc", kind: "calls", from: "e.b", to: "e.c", summary: "bc" },
        { id: "r.cd", kind: "calls", from: "e.c", to: "e.d", summary: "cd" },
        { id: "r.ac", kind: "calls", from: "e.a", to: "e.c", summary: "ac" },
        { id: "r.ad", kind: "calls", from: "e.a", to: "e.d", summary: "ad" },
      ],
    };
    const r = layout(d);
    const longs = r.edges.filter((e) => e.labelSegment);
    expect(longs.length).toBe(2);
    const ys = longs.map((e) => e.points![2]!.y).sort((a, b) => a - b);
    const step = Math.abs(ys[1]! - ys[0]!);
    expect(step).toBeGreaterThanOrEqual(8);
    expect(step).toBeLessThanOrEqual(10.01);
  });

  it("紧凑模式下仍无穿框（长边侧边走廊保持）", () => {
    const r = layout(parallelDoc("很长的中文标签文本用于测试", 3));
    assertNoEdgeCrossesNodes(r);
  });
});

describe("段级批注几何（EdgeGeom.segmentCount / segmentMidpoint）", () => {
  it("segmentCount === points.length - 1；正交图边至少 2 段", () => {
    const r = layout(doc());
    expect(r.edges.length).toBeGreaterThan(0);
    for (const e of r.edges) {
      expect(e.segmentCount).toBe(e.points.length - 1);
      expect(e.segmentCount).toBeGreaterThanOrEqual(1);
    }
    // 普通正交折线：stub + 中间段 + stub，至少 2 段（多段边因此可挂段级批注）
    expect(r.edges.some((e) => e.segmentCount >= 2)).toBe(true);
  });

  it("段级批注的合法下标范围是 [0, segmentCount)", () => {
    const r = layout(doc());
    for (const e of r.edges) {
      for (let k = 0; k < e.segmentCount; k++) {
        const mid = segmentMidpoint(e.points, k);
        const a = e.points[k]!;
        const b = e.points[k + 1]!;
        expect(mid.x).toBeCloseTo((a.x + b.x) / 2, 6);
        expect(mid.y).toBeCloseTo((a.y + b.y) / 2, 6);
      }
    }
  });

  it("segmentMidpoint：两点边第 0 段=中点；越界下标确定性夹取", () => {
    const two = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    expect(segmentMidpoint(two, 0)).toEqual({ x: 5, y: 0 }); // 2 点边 = 1 段
    const orth = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 20 }];
    expect(segmentMidpoint(orth, 1)).toEqual({ x: 10, y: 10 });
    expect(segmentMidpoint(orth, 99)).toEqual({ x: 10, y: 10 }); // 夹到末段
    expect(segmentMidpoint(orth, -3)).toEqual({ x: 5, y: 0 }); // 夹到首段
    expect(segmentMidpoint([], 0)).toEqual({ x: 0, y: 0 });
  });
});