import { describe, expect, it } from "vitest";
import { solidJoinPoints } from "./index";

const P = (x: number, y: number) => ({ x, y });

describe("实心交点（真实连接）判定", () => {
  it("两条边只共享内部折点（并道/走廊）→ 不算连接，无实心圆", () => {
    const e1 = [P(0, 0), P(10, 0), P(10, 10), P(30, 10)];
    const e2 = [P(0, 5), P(5, 5), P(5, 10), P(10, 10), P(10, 20)];
    expect(solidJoinPoints([e1, e2], [])).toHaveLength(0);
  });

  it("一条边的端点落在另一条边线段上（T 型汇入）→ 有实心圆", () => {
    const e1 = [P(0, 0), P(20, 0)];
    const e2 = [P(10, 0), P(10, 10)];
    const pts = solidJoinPoints([e1, e2], []);
    expect(pts).toHaveLength(1);
    expect(pts[0]!.x).toBe(10);
    expect(pts[0]!.y).toBe(0);
  });

  it("端点靠近节点（端口）时不算连接（由节点/箭头表达）", () => {
    const e1 = [P(0, 0), P(20, 0)];
    const e2 = [P(10, 0), P(10, 10)];
    const nodes = [{ x: 0, y: -10, w: 25, h: 20 }];
    expect(solidJoinPoints([e1, e2], nodes)).toHaveLength(0);
  });
});
