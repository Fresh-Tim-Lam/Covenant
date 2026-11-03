import { describe, expect, it } from "vitest";
import type { CovenantDoc } from "@covenant/core";
import { layout } from "@covenant/layout";
import { renderSvg } from "./index";

function doc(): CovenantDoc {
  return {
    covenant: "0.1",
    id: "t/label-online",
    profile: "c4-container@1",
    meta: { title: "标签贴线", purpose: "p", non_goals: [] },
    elements: [
      { id: "e.a", kind: "container", name: "A", summary: "a", tech: "TS" },
      { id: "e.b", kind: "container", name: "B", summary: "b", tech: "TS" },
    ],
    relations: [
      { id: "r.ab", kind: "calls", from: "e.a", to: "e.b", summary: "调用" },
      { id: "r.ba", kind: "calls", from: "e.b", to: "e.a", summary: "回包" },
    ],
    views: [{ id: "v.main", title: "主视图" }],
  };
}

function distToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

describe("边标签胶囊贴线", () => {
  it("每个 edge-label-bg 的中心都落在某条边路径上（≤2.5px），不悬浮", () => {
    const d = doc();
    const result = layout(d);
    const svg = renderSvg(d, result);
    const rects = [...svg.matchAll(/class="edge-label-bg"[^>]*x="([\d.]+)"[^>]*y="([\d.]+)"[^>]*width="([\d.]+)"/g)];
    expect(rects.length).toBeGreaterThan(0);
    const segs = result.edges.flatMap((e) => {
      const pts = e.points;
      const out: Array<[{ x: number; y: number }, { x: number; y: number }]> = [];
      for (let i = 0; i + 1 < pts.length; i++) out.push([pts[i]!, pts[i + 1]!]);
      return out;
    });
    for (const m of rects) {
      const cx = Number(m[1]) + Number(m[3]) / 2;
      const cy = Number(m[2]) + 17 / 2;
      const best = Math.min(...segs.map(([a, b]) => distToSegment({ x: cx, y: cy }, a, b)));
      expect(best).toBeLessThanOrEqual(2.5);
    }
  });

  it("平行双向边的两个标签沿路径错开（不叠在同一点）", () => {
    const d = doc();
    const svg = renderSvg(d, layout(d));
    const centers = [...svg.matchAll(/class="edge-label-bg"[^>]*x="([\d.]+)"[^>]*y="([\d.]+)"/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
    }));
    expect(centers.length).toBe(2);
    const dist = Math.hypot(centers[0]!.x - centers[1]!.x, centers[0]!.y - centers[1]!.y);
    expect(dist).toBeGreaterThan(20);
  });
});
