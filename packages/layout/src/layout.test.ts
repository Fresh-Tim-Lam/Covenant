import { describe, expect, it } from "vitest";
import type { CovenantDoc } from "@covenant/core";
import { layout, layoutSequence, route, selectView } from "./index";

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
  it("跨层长边走顶部通道（通道 y 在节点带之上）", () => {
    const d = doc(); // 含 r.ca：c(rank2) → a(rank0)，跨度 2
    const r = layout(d);
    const long = r.edges.find((e) => e.id === "r.ca")!;
    const minNodeY = Math.min(...Object.values(r.nodes).map((n) => n.y));
    expect(long.points[1]!.y).toBeLessThan(minNodeY);
    expect(long.points[2]!.y).toBe(long.points[1]!.y);
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