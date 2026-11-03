import { describe, expect, it } from "vitest";
import type { CovenantDoc, Link } from "@covenant/core";
import { checkDocument } from "./index";

function doc(overrides: Partial<CovenantDoc> = {}): CovenantDoc {
  const base: CovenantDoc = {
    covenant: "0.1",
    id: "test/c4",
    profile: "c4-container@1",
    meta: { title: "测试图", purpose: "验证 L1–L3", non_goals: [] },
    elements: [
      { id: "e.a", kind: "container", name: "A", summary: "服务 A", tech: "TS" },
      {
        id: "e.b",
        kind: "datastore",
        name: "B",
        summary: "存储 B",
        tech: "PG",
        props: { storage_kind: "rdbms" },
      },
    ],
    relations: [{ id: "r.a-b", kind: "writes", from: "e.a", to: "e.b", summary: "写入" }],
    views: [{ id: "v.main", title: "主视图" }],
  };
  return { ...base, ...overrides };
}

const codes = (findings: { code: string }[]): string[] => findings.map((f) => f.code);

describe("checkDocument / L2–L3", () => {
  it("合法文档应无 error", () => {
    const findings = checkDocument(doc(), "test.cvn.yaml");
    expect(findings.filter((f) => f.severity === "error")).toEqual([]);
  });

  it("未知元素 kind 报 profile/vocabulary", () => {
    const d = doc();
    d.elements![0]!.kind = "microservice";
    expect(codes(checkDocument(d, "t"))).toContain("profile/vocabulary");
  });

  it("未知关系类型报 profile/vocabulary", () => {
    const d = doc();
    d.relations![0]!.kind = "writes-async";
    expect(codes(checkDocument(d, "t"))).toContain("profile/vocabulary");
  });

  it("违反关系矩阵报 profile/relation-matrix", () => {
    const d = doc();
    // datastore 不能作为 writes 的源
    d.relations![0]!.from = "e.b";
    expect(codes(checkDocument(d, "t"))).toContain("profile/relation-matrix");
  });

  it("悬空引用报 kernel/dangling-ref", () => {
    const d = doc();
    d.relations![0]!.to = "e.missing";
    expect(codes(checkDocument(d, "t"))).toContain("kernel/dangling-ref");
  });

  it("重复 id 报 kernel/duplicate-id", () => {
    const d = doc();
    d.elements!.push({ id: "e.a", kind: "container", name: "dup", summary: "重复", tech: "x" });
    expect(codes(checkDocument(d, "t"))).toContain("kernel/duplicate-id");
  });

  it("datastore 缺 storage_kind 报 profile/required-prop", () => {
    const d = doc();
    d.elements![1]!.props = {};
    expect(codes(checkDocument(d, "t"))).toContain("profile/required-prop");
  });

  it("finding 顺序稳定（同输入两次一致）", () => {
    const d = doc();
    d.relations![0]!.kind = "nope";
    d.elements![0]!.kind = "nope";
    const a = checkDocument(d, "t").map((f) => `${f.code}|${f.elementId ?? ""}`);
    const b = checkDocument(d, "t").map((f) => `${f.code}|${f.elementId ?? ""}`);
    expect(a).toEqual(b);
  });
});

function erDoc(): CovenantDoc {
  return {
    covenant: "0.1",
    id: "t/er",
    profile: "er@1",
    meta: { title: "ER", purpose: "p", non_goals: [] },
    elements: [
      { id: "e.order", kind: "entity", name: "Order", summary: "订单", props: { pk: ["id"] } },
      { id: "e.order-id", kind: "attribute", name: "id", summary: "主键", props: { parent: "e.order", type: "bigint" } },
      { id: "e.customer", kind: "entity", name: "Customer", summary: "客户", props: { pk: ["id"] } },
    ],
    relations: [{ id: "r.has", kind: "has-attr", from: "e.order", to: "e.order-id", summary: "主键" }],
    views: [{ id: "v.main", title: "m" }],
  };
}

describe("er@1 剖面规则", () => {
  it("合法 ER 文档无 error", () => {
    expect(checkDocument(erDoc(), "t").filter((f) => f.severity === "error")).toEqual([]);
  });

  it("attribute.parent 指向非 entity → er/attribute-parent", () => {
    const d = erDoc();
    d.elements!.push({
      id: "e.bad",
      kind: "attribute",
      name: "bad",
      summary: "錯",
      props: { parent: "e.order-id", type: "text" },
    });
    expect(codes(checkDocument(d, "t"))).toContain("er/attribute-parent");
  });

  it("同一 entity 下属性名重复 → er/duplicate-attribute", () => {
    const d = erDoc();
    d.elements!.push({
      id: "e.order-id2",
      kind: "attribute",
      name: "id",
      summary: "重复",
      props: { parent: "e.order", type: "bigint" },
    });
    expect(codes(checkDocument(d, "t"))).toContain("er/duplicate-attribute");
  });

  it("N:N 未标记 associative → warning er/cardinality-consistency", () => {
    const d = erDoc();
    d.relations!.push({
      id: "r.mn",
      kind: "relates",
      from: "e.order",
      to: "e.customer",
      summary: "多对多",
      props: { cardinality: { from: "N", to: "N" } },
    });
    const findings = checkDocument(d, "t");
    const f = findings.find((x) => x.code === "er/cardinality-consistency");
    expect(f?.severity).toBe("warning");
  });

  it("N:N 标记 associative 后不再告警", () => {
    const d = erDoc();
    d.relations!.push({
      id: "r.mn",
      kind: "relates",
      from: "e.order",
      to: "e.customer",
      summary: "多对多",
      props: { cardinality: { from: "N", to: "N" }, associative: true },
    });
    expect(codes(checkDocument(d, "t"))).not.toContain("er/cardinality-consistency");
  });

  it("has-attr 的源必须是 entity", () => {
    const d = erDoc();
    d.relations![0]!.from = "e.order-id";
    expect(codes(checkDocument(d, "t"))).toContain("profile/relation-matrix");
  });
});

function flowDoc(): CovenantDoc {
  return {
    covenant: "0.1",
    id: "t/flow",
    profile: "flowchart@1",
    meta: { title: "F", purpose: "p", non_goals: [] },
    elements: [
      { id: "e.s", kind: "start", name: "开始", summary: "s" },
      { id: "e.d", kind: "decision", name: "库存？", summary: "d", props: { question: "有货吗" } },
      { id: "e.p", kind: "process", name: "扣减", summary: "p" },
      { id: "e.end", kind: "end", name: "结束", summary: "e" },
    ],
    relations: [
      { id: "r.s-d", kind: "flow", from: "e.s", to: "e.d", summary: "x" },
      { id: "r.d-p", kind: "flow", from: "e.d", to: "e.p", summary: "有", props: { label: "是" } },
      { id: "r.d-end", kind: "flow", from: "e.d", to: "e.end", summary: "无", props: { label: "否" } },
      { id: "r.p-end", kind: "flow", from: "e.p", to: "e.end", summary: "x" },
    ],
    views: [{ id: "v.main", title: "m" }],
  };
}

describe("flowchart@1 剖面规则", () => {
  it("合法流程图无 error", () => {
    expect(checkDocument(flowDoc(), "t").filter((f) => f.severity === "error")).toEqual([]);
  });

  it("start 不唯一 → flow/start-count", () => {
    const d = flowDoc();
    d.elements!.push({ id: "e.s2", kind: "start", name: "另一个开始", summary: "s" });
    expect(codes(checkDocument(d, "t"))).toContain("flow/start-count");
  });

  it("不可达节点 → flow/unreachable", () => {
    const d = flowDoc();
    d.elements!.push({ id: "e.orphan", kind: "process", name: "孤立", summary: "x" });
    expect(codes(checkDocument(d, "t"))).toContain("flow/unreachable");
  });

  it("decision 出边不足 2 条 → flow/decision-branches", () => {
    const d = flowDoc();
    d.relations = d.relations!.filter((r) => r.id !== "r.d-end");
    expect(codes(checkDocument(d, "t"))).toContain("flow/decision-branches");
  });

  it("decision 出边缺 label → flow/decision-label", () => {
    const d = flowDoc();
    const rel = d.relations!.find((r) => r.id === "r.d-p")!;
    rel.props = {};
    expect(codes(checkDocument(d, "t"))).toContain("flow/decision-label");
  });

  it("end 之外禁止出边（矩阵 + 规则）", () => {
    const d = flowDoc();
    d.relations!.push({ id: "r.end-p", kind: "flow", from: "e.end", to: "e.p", summary: "非法" });
    const got = codes(checkDocument(d, "t"));
    expect(got).toContain("flow/end-outgoing");
    expect(got).toContain("profile/relation-matrix");
  });
});

function contextDoc(): CovenantDoc {
  return {
    covenant: "0.1",
    id: "t/context",
    profile: "c4-context@1",
    meta: { title: "C", purpose: "p", non_goals: [] },
    elements: [
      { id: "e.user", kind: "person", name: "用户", summary: "u" },
      { id: "e.sys", kind: "software-system", name: "本系统", summary: "s", props: { scope: "in" } },
      { id: "e.ext", kind: "external-system", name: "外部", summary: "e" },
    ],
    relations: [
      { id: "r.u-s", kind: "uses", from: "e.user", to: "e.sys", summary: "用" },
      { id: "r.s-e", kind: "uses", from: "e.sys", to: "e.ext", summary: "依赖" },
    ],
    views: [{ id: "v.main", title: "m" }],
  };
}

describe("c4-context@1 剖面规则", () => {
  it("合法上下文图无 error", () => {
    expect(checkDocument(contextDoc(), "t").filter((f) => f.severity === "error")).toEqual([]);
  });

  it("software-system 不唯一 → context/system-count", () => {
    const d = contextDoc();
    d.elements!.push({ id: "e.sys2", kind: "software-system", name: "另一个", summary: "x", props: { scope: "in" } });
    expect(codes(checkDocument(d, "t"))).toContain("context/system-count");
  });

  it("外部系统无关系 → warning", () => {
    const d = contextDoc();
    d.elements!.push({ id: "e.ext2", kind: "external-system", name: "孤立外部", summary: "x" });
    const f = checkDocument(d, "t").find((x) => x.code === "context/external-unreferenced");
    expect(f?.severity).toBe("warning");
  });

  it("software-system 带 tech → warning", () => {
    const d = contextDoc();
    d.elements!.find((e) => e.id === "e.sys")!.tech = "Kotlin";
    const f = checkDocument(d, "t").find((x) => x.code === "context/no-tech");
    expect(f?.severity).toBe("warning");
  });
});

function deployDoc(): CovenantDoc {
  return {
    covenant: "0.1",
    id: "t/deploy",
    profile: "deployment@1",
    meta: { title: "D", purpose: "p", non_goals: [] },
    elements: [
      { id: "e.n1", kind: "node", name: "prod", summary: "n", props: { env: "prod" } },
      { id: "e.n2", kind: "node", name: "stage", summary: "n", props: { env: "stage" } },
      { id: "e.a1", kind: "artifact", name: "api", summary: "a", parent: "e.n1", props: { tech: "Kotlin" } },
      { id: "e.a2", kind: "artifact", name: "web", summary: "a", parent: "e.n2", props: { tech: "Nginx" } },
      { id: "e.db", kind: "datastore", name: "pg", summary: "d", parent: "e.n1", props: { storage_kind: "rdbms" } },
    ],
    relations: [
      { id: "r.n", kind: "communicates", from: "e.n1", to: "e.n2", summary: "链路" },
      { id: "r.a", kind: "calls", from: "e.a1", to: "e.a1", summary: "自调用" },
    ],
    views: [{ id: "v.main", title: "m" }],
  };
}

describe("deployment@1 剖面规则", () => {
  it("合法部署图无 error，且不误报 c4 的 store-unreachable", () => {
    const findings = checkDocument(deployDoc(), "t");
    expect(findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(codes(findings)).not.toContain("rule/store-unreachable");
  });

  it("artifact parent 不是 node → deploy/parent", () => {
    const d = deployDoc();
    d.elements!.find((e) => e.id === "e.a1")!.parent = "e.a2";
    expect(codes(checkDocument(d, "t"))).toContain("deploy/parent");
  });

  it("跨环境 calls → warning deploy/cross-env", () => {
    const d = deployDoc();
    d.relations!.push({ id: "r.cross", kind: "calls", from: "e.a1", to: "e.a2", summary: "跨环境" });
    const f = checkDocument(d, "t").find((x) => x.code === "deploy/cross-env");
    expect(f?.severity).toBe("warning");
  });

  it("空节点 → warning deploy/empty-node", () => {
    const d = deployDoc();
    d.elements!.push({ id: "e.n3", kind: "node", name: "空节点", summary: "n", props: { env: "dev" } });
    const f = checkDocument(d, "t").find((x) => x.code === "deploy/empty-node");
    expect(f?.severity).toBe("warning");
  });
});

function componentDoc(): CovenantDoc {
  return {
    covenant: "0.1",
    id: "t/comp",
    profile: "c4-component@1",
    meta: { title: "C", purpose: "p", non_goals: [] },
    elements: [
      { id: "e.gw", kind: "component", name: "网关", summary: "s", props: { parent: "payments-api" } },
      { id: "e.svc", kind: "component", name: "编排", summary: "s", props: { parent: "payments-api" } },
      { id: "e.iface", kind: "interface", name: "Port", summary: "s" },
      { id: "e.ref", kind: "container-ref", name: "pg", summary: "s", props: { ref: "payments-pg" } },
    ],
    relations: [
      { id: "r.gw-svc", kind: "calls", from: "e.gw", to: "e.svc", summary: "x" },
      { id: "r.svc-iface", kind: "implements", from: "e.svc", to: "e.iface", summary: "x" },
      { id: "r.svc-ref", kind: "depends-on", from: "e.svc", to: "e.ref", summary: "x" },
    ],
    views: [{ id: "v.main", title: "m" }],
  };
}

describe("c4-component@1 剖面规则", () => {
  it("合法组件图无 error", () => {
    expect(checkDocument(componentDoc(), "t").filter((f) => f.severity === "error")).toEqual([]);
  });

  it("depends-on 成环 → component/cycle", () => {
    const d = componentDoc();
    d.relations!.push({ id: "r.ref-svc", kind: "depends-on", from: "e.ref", to: "e.svc", summary: "x" });
    expect(codes(checkDocument(d, "t"))).toContain("component/cycle");
  });

  it("组件没有任何关系 → warning", () => {
    const d = componentDoc();
    d.elements!.push({ id: "e.lonely", kind: "component", name: "孤立", summary: "s", props: { parent: "payments-api" } });
    const f = checkDocument(d, "t").find((x) => x.code === "component/orphan");
    expect(f?.severity).toBe("warning");
  });

  it("component 缺 parent → required-prop error", () => {
    const d = componentDoc();
    d.elements!.push({ id: "e.noparent", kind: "component", name: "无父", summary: "s" });
    expect(codes(checkDocument(d, "t"))).toContain("profile/required-prop");
  });
});

function graphDoc(): CovenantDoc {
  return {
    covenant: "0.1",
    id: "t/graph",
    profile: "graph@1",
    meta: { title: "G", purpose: "p", non_goals: [] },
    elements: [
      { id: "e.a", kind: "module", name: "a", summary: "s", props: { path: "src/a" } },
      { id: "e.b", kind: "module", name: "b", summary: "s", props: { path: "src/b" } },
      { id: "e.fs", kind: "external", name: "node:fs", summary: "s" },
    ],
    relations: [{ id: "r.a-b", kind: "imports", from: "e.a", to: "e.b", summary: "x" }],
    views: [{ id: "v.main", title: "m" }],
  };
}

describe("graph@1 剖面规则", () => {
  it("合法依赖图无 error", () => {
    expect(checkDocument(graphDoc(), "t").filter((f) => f.severity === "error")).toEqual([]);
  });

  it("module 缺 path → error", () => {
    const d = graphDoc();
    d.elements!.push({ id: "e.nopath", kind: "module", name: "无路径", summary: "s" });
    expect(codes(checkDocument(d, "t"))).toContain("profile/required-prop");
  });

  it("imports 成环 → warning graph/cycle", () => {
    const d = graphDoc();
    d.relations!.push({ id: "r.b-a", kind: "imports", from: "e.b", to: "e.a", summary: "x" });
    const f = checkDocument(d, "t").find((x) => x.code === "graph/cycle");
    expect(f?.severity).toBe("warning");
  });

  it("x-allow-cycles: true 时不再报告成环", () => {
    const d = graphDoc() as CovenantDoc & { "x-allow-cycles"?: boolean };
    d["x-allow-cycles"] = true;
    d.relations!.push({ id: "r.b-a", kind: "imports", from: "e.b", to: "e.a", summary: "x" });
    expect(codes(checkDocument(d, "t"))).not.toContain("graph/cycle");
  });

  it("external 可作为 imports 目标", () => {
    const d = graphDoc();
    d.relations!.push({ id: "r.a-fs", kind: "imports", from: "e.a", to: "e.fs", summary: "x" });
    expect(checkDocument(d, "t").filter((f) => f.severity === "error")).toEqual([]);
  });
});

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
      { id: "r.m", kind: "message", from: "e.a", to: "e.b", summary: "x", props: { label: "请求", kind: "sync" } },
      { id: "r.r", kind: "return", from: "e.b", to: "e.a", summary: "x", props: { label: "响应", reply_to: "r.m" } },
    ],
    views: [{ id: "v.main", title: "m" }],
  };
}

describe("sequence@1 剖面规则", () => {
  it("合法序列图无 error", () => {
    expect(checkDocument(seqDoc(), "t").filter((f) => f.severity === "error")).toEqual([]);
  });

  it("return 缺 reply_to → seq/order", () => {
    const d = seqDoc();
    d.relations![1]!.props = {};
    expect(codes(checkDocument(d, "t"))).toContain("seq/order");
  });

  it("return 出现在配对消息之前 → seq/order", () => {
    const d = seqDoc();
    d.relations = [d.relations![1]!, d.relations![0]!];
    expect(codes(checkDocument(d, "t"))).toContain("seq/order");
  });

  it("return 方向与 sync 相同 → seq/reverse-return", () => {
    const d = seqDoc();
    d.relations![1]!.from = "e.a";
    d.relations![1]!.to = "e.b";
    expect(codes(checkDocument(d, "t"))).toContain("seq/reverse-return");
  });

  it("sync 无 return → warning seq/reply-pairing", () => {
    const d = seqDoc();
    d.relations = [d.relations![0]!];
    const f = checkDocument(d, "t").find((x) => x.code === "seq/reply-pairing");
    expect(f?.severity).toBe("warning");
  });

  it("端点不是 actor/participant → seq/endpoint", () => {
    const d = seqDoc();
    d.elements!.push({ id: "e.p", kind: "process", name: "流程", summary: "s" });
    d.relations!.push({ id: "r.bad", kind: "message", from: "e.p", to: "e.b", summary: "x" });
    expect(codes(checkDocument(d, "t"))).toContain("seq/endpoint");
  });
});

function stateDoc(): CovenantDoc {
  return {
    covenant: "0.1",
    id: "t/state",
    profile: "state@1",
    meta: { title: "S", purpose: "p", non_goals: [] },
    elements: [
      { id: "e.init", kind: "initial", name: "入口", summary: "s" },
      { id: "e.a", kind: "state", name: "A", summary: "s" },
      { id: "e.f", kind: "final", name: "终态", summary: "s" },
    ],
    relations: [
      { id: "r.go", kind: "transition", from: "e.init", to: "e.a", summary: "x", props: { trigger: "go" } },
      { id: "r.done", kind: "transition", from: "e.a", to: "e.f", summary: "x", props: { trigger: "done" } },
    ],
    views: [{ id: "v.main", title: "m" }],
  };
}

describe("state@1 剖面规则", () => {
  it("合法状态机无 error", () => {
    expect(checkDocument(stateDoc(), "t").filter((f) => f.severity === "error")).toEqual([]);
  });

  it("initial 不唯一 → state/initial-count", () => {
    const d = stateDoc();
    d.elements!.push({ id: "e.init2", kind: "initial", name: "第二个入口", summary: "s" });
    expect(codes(checkDocument(d, "t"))).toContain("state/initial-count");
  });

  it("final 有出边 → state/final-outgoing + 矩阵错误", () => {
    const d = stateDoc();
    d.relations!.push({ id: "r.bad", kind: "transition", from: "e.f", to: "e.a", summary: "x" });
    const got = codes(checkDocument(d, "t"));
    expect(got).toContain("state/final-outgoing");
    expect(got).toContain("profile/relation-matrix");
  });

  it("不可达状态 → warning state/unreachable", () => {
    const d = stateDoc();
    d.elements!.push({ id: "e.orphan", kind: "state", name: "孤立", summary: "s" });
    const f = checkDocument(d, "t").find((x) => x.code === "state/unreachable");
    expect(f?.severity).toBe("warning");
  });

  it("无法到达 final → warning state/no-final-path", () => {
    const d = stateDoc();
    d.elements!.push({ id: "e.x", kind: "state", name: "X", summary: "s" });
    d.relations!.push({ id: "r.x", kind: "transition", from: "e.a", to: "e.x", summary: "x", props: { trigger: "side" } });
    const f = checkDocument(d, "t").find((x) => x.code === "state/no-final-path");
    expect(f?.severity).toBe("warning");
    expect(f?.elementId).toBe("e.x");
  });

  it("(from, trigger, guard) 冲突 → error", () => {
    const d = stateDoc();
    d.elements!.push({ id: "e.b", kind: "state", name: "B", summary: "s" });
    d.relations!.push(
      { id: "r.b1", kind: "transition", from: "e.a", to: "e.b", summary: "x", props: { trigger: "done" } },
      { id: "r.b2", kind: "transition", from: "e.b", to: "e.f", summary: "x", props: { trigger: "done" } },
    );
    expect(codes(checkDocument(d, "t"))).toContain("state/transition-conflict");
  });

  it("composite 有子状态但缺 initial → error", () => {
    const d = stateDoc();
    d.elements!.push(
      { id: "e.comp", kind: "composite", name: "组合状态", summary: "s" },
      { id: "e.c1", kind: "state", name: "子状态", summary: "s", parent: "e.comp" },
    );
    d.relations!.push(
      { id: "r.c1", kind: "transition", from: "e.a", to: "e.comp", summary: "x", props: { trigger: "enter" } },
      { id: "r.c2", kind: "transition", from: "e.comp", to: "e.f", summary: "x", props: { trigger: "exit" } },
    );
    expect(codes(checkDocument(d, "t"))).toContain("state/composite-initial");
  });

  it("composite 带 initial 子状态则通过", () => {
    const d = stateDoc();
    d.elements!.push(
      { id: "e.comp", kind: "composite", name: "组合状态", summary: "s" },
      { id: "e.c0", kind: "initial", name: "子入口", summary: "s", parent: "e.comp" },
      { id: "e.c1", kind: "state", name: "子状态", summary: "s", parent: "e.comp" },
    );
    d.relations!.push(
      { id: "r.c0", kind: "transition", from: "e.c0", to: "e.c1", summary: "x", props: { trigger: "enter" } },
      { id: "r.c1", kind: "transition", from: "e.a", to: "e.comp", summary: "x", props: { trigger: "enter" } },
      { id: "r.c2", kind: "transition", from: "e.comp", to: "e.f", summary: "x", props: { trigger: "exit" } },
    );
    const got = checkDocument(d, "t");
    expect(codes(got)).not.toContain("state/composite-initial");
    expect(codes(got)).not.toContain("state/initial-count");
  });
});

describe("links 字段（文档级/元素级）", () => {
  function withLinks(links: unknown, elementLinks?: unknown): CovenantDoc {
    const d = doc();
    d.links = links as Link[];
    if (elementLinks) d.elements![0]!.links = elementLinks as Link[];
    return d;
  }

  it("合法 adr/url link 不报错", () => {
    const d = withLinks([{ kind: "adr", ref: "0001" }, { kind: "url", ref: "https://example.com" }]);
    expect(codes(checkDocument(d, "t"))).not.toContain("link/adr-format");
    expect(codes(checkDocument(d, "t"))).not.toContain("link/url-format");
  });

  it("adr 编号不是 4 位 → link/adr-format", () => {
    const d = withLinks([{ kind: "adr", ref: "adr-1" }]);
    expect(codes(checkDocument(d, "t"))).toContain("link/adr-format");
  });

  it("url 缺协议 → link/url-format", () => {
    const d = withLinks([{ kind: "url", ref: "example.com" }]);
    expect(codes(checkDocument(d, "t"))).toContain("link/url-format");
  });

  it("元素级 link 同样校验", () => {
    const d = withLinks(undefined, [{ kind: "adr", ref: "1" }]);
    expect(codes(checkDocument(d, "t"))).toContain("link/adr-format");
  });
});
