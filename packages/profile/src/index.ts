/**
 * 剖面注册表（Tier-1）。权威定义见 docs/design/profiles-catalog-v0.md。
 * 已实现：c4-container@1、dfd@1、er@1；其余剖面按 self-hosting-bootstrap 的顺序增量加入。
 */
import type { CovenantDoc, ElementDef, RelationDef } from "@covenant/core";

export interface RelationRule {
  from: string[];
  to: string[];
}

export interface ProfileRuleCtx {
  doc: CovenantDoc;
  elements: ElementDef[];
  relations: RelationDef[];
}

export interface ProfileRuleFinding {
  code: string;
  severity: "error" | "warning";
  message: string;
  elementId?: string;
  fixHint?: string;
}

export type ProfileRule = (ctx: ProfileRuleCtx) => ProfileRuleFinding[];

export interface ProfileDef {
  /** 剖面引用，形如 c4-container@1 */
  ref: string;
  /** 允许的元素 kind */
  elements: string[];
  /** 允许的关系 kind 及其关系矩阵 */
  relations: Record<string, RelationRule>;
  /** 各元素 kind 的必填属性（可位于顶层字段或 props 中） */
  requiredProps: Record<string, string[]>;
  /** 属性枚举约束：kind -> prop -> 允许值 */
  propEnums: Record<string, Record<string, string[]>>;
  /** 剖面专有的可判定规则（catalog 里的"内置规则"） */
  rules?: ProfileRule[];
}

export const C4_CONTAINER: ProfileDef = {
  ref: "c4-container@1",
  elements: ["person", "container", "datastore", "queue", "external-system"],
  relations: {
    calls: { from: ["person", "container"], to: ["container", "external-system"] },
    reads: { from: ["container"], to: ["datastore"] },
    writes: { from: ["container"], to: ["datastore", "queue"] },
    publishes: { from: ["container"], to: ["queue"] },
    subscribes: { from: ["container"], to: ["queue"] },
  },
  requiredProps: {
    container: ["tech"],
    datastore: ["tech", "storage_kind"],
    queue: ["tech"],
  },
  propEnums: {
    datastore: { storage_kind: ["rdbms", "kv", "object", "search", "file"] },
  },
};

/**
 * DFD（M1 只做 check，不渲染）。记法变体 demarco/gane-sarson 由文档 notation 字段标注。
 * 注意：process → process 直连按 profiles-catalog 属"警告规则"（需分层），
 * 本 M1 版本在矩阵中放行，警告规则留待 M2 实现（已在 catalog 标注）。
 */
export const DFD: ProfileDef = {
  ref: "dfd@1",
  elements: ["external-entity", "process", "data-store"],
  relations: {
    flow: {
      from: ["external-entity", "process", "data-store"],
      to: ["external-entity", "process", "data-store"],
    },
    "bidir-flow": { from: ["process"], to: ["external-entity"] },
  },
  requiredProps: {
    process: ["number"],
    "data-store": ["storage_kind"],
  },
  propEnums: {
    "data-store": { storage_kind: ["rdbms", "kv", "object", "search", "file"] },
  },
};

/**
 * ER（数据模型）。两种记法 chen / crowfoot 由文档 notation 标注；
 * v0 统一用"边 + cardinality"表达联系（Chen 的菱形在渲染层呈现，语义仍是边）。
 */
export const ER: ProfileDef = {
  ref: "er@1",
  elements: ["entity", "attribute"],
  relations: {
    "has-attr": { from: ["entity"], to: ["attribute"] },
    relates: { from: ["entity"], to: ["entity"] },
  },
  requiredProps: {
    entity: ["pk"],
    attribute: ["parent", "type"],
  },
  propEnums: {},
  rules: [
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      const byId = new Map(ctx.elements.map((e) => [e.id, e]));
      for (const el of ctx.elements) {
        if (el.kind !== "attribute") continue;
        const pid = typeof el.props?.parent === "string" ? el.props.parent : "";
        const owner = byId.get(pid);
        if (!owner) {
          out.push({
            code: "er/attribute-parent",
            severity: "error",
            message: `${el.id} 的 parent 未指向本图元素`,
            elementId: el.id,
            fixHint: "把 parent 设为 entity 的 id",
          });
        } else if (owner.kind !== "entity") {
          out.push({
            code: "er/attribute-parent",
            severity: "error",
            message: `${el.id} 的 parent 是 ${owner.kind}，必须是 entity`,
            elementId: el.id,
            fixHint: `把 ${el.id}.parent 指向 entity，而不是 ${owner.id}`,
          });
        }
      }
      return out;
    },
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      const seen = new Map<string, Set<string>>();
      for (const el of ctx.elements) {
        if (el.kind !== "attribute") continue;
        const pid = String(el.props?.parent ?? "");
        if (!seen.has(pid)) seen.set(pid, new Set());
        if (seen.get(pid)!.has(el.name)) {
          out.push({
            code: "er/duplicate-attribute",
            severity: "error",
            message: `实体 ${pid} 下属性名重复：${el.name}`,
            elementId: el.id,
            fixHint: "同一 entity 下属性名必须唯一",
          });
        }
        seen.get(pid)!.add(el.name);
      }
      return out;
    },
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      for (const r of ctx.relations) {
        if (r.kind !== "relates") continue;
        const card = r.props?.cardinality as { from?: string; to?: string } | undefined;
        if (card?.from === "N" && card?.to === "N" && r.props?.associative !== true) {
          out.push({
            code: "er/cardinality-consistency",
            severity: "warning",
            message: `${r.id} 是 N:N，建议标记 associative: true（关联实体）`,
            elementId: r.id,
            fixHint: "加 props.associative: true，或拆分为关联实体",
          });
        }
      }
      return out;
    },
  ],
};

/**
 * 流程图（ISO 5807）。direction 建议 DOWN；语义是"处理步骤 + 判断分支"。
 */
export const FLOWCHART: ProfileDef = {
  ref: "flowchart@1",
  elements: ["start", "end", "process", "decision", "io", "predefined", "subprocess"],
  relations: {
    flow: {
      from: ["start", "process", "decision", "io", "predefined", "subprocess"],
      to: ["end", "process", "decision", "io", "predefined", "subprocess"],
    },
  },
  requiredProps: {
    decision: ["question"],
    predefined: ["ref"],
    subprocess: ["ref"],
  },
  propEnums: {},
  rules: [
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      const starts = ctx.elements.filter((e) => e.kind === "start");
      if (starts.length !== 1) {
        out.push({
          code: "flow/start-count",
          severity: "error",
          message: `start 必须恰好 1 个（当前 ${starts.length}）`,
          fixHint: "保留唯一的入口节点",
        });
      }
      return out;
    },
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      const endIds = new Set(ctx.elements.filter((e) => e.kind === "end").map((e) => e.id));
      for (const r of ctx.relations) {
        if (r.kind !== "flow") continue;
        const from = r.from.split(":")[0] ?? r.from;
        if (endIds.has(from)) {
          out.push({
            code: "flow/end-outgoing",
            severity: "error",
            message: `${r.id}：end 节点不能有出边`,
            elementId: r.id,
            fixHint: "删除该出边，或把源节点改成 process",
          });
        }
      }
      return out;
    },
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      const start = ctx.elements.find((e) => e.kind === "start");
      if (!start) return out; // start 数量问题由 flow/start-count 报
      const adj = new Map<string, string[]>();
      for (const e of ctx.elements) adj.set(e.id, []);
      for (const r of ctx.relations) {
        if (r.kind !== "flow") continue;
        const u = r.from.split(":")[0] ?? r.from;
        const v = r.to.split(":")[0] ?? r.to;
        adj.get(u)?.push(v);
      }
      const seen = new Set<string>([start.id]);
      const queue = [start.id];
      while (queue.length > 0) {
        const u = queue.shift()!;
        for (const v of adj.get(u) ?? []) {
          if (!seen.has(v)) {
            seen.add(v);
            queue.push(v);
          }
        }
      }
      for (const e of ctx.elements) {
        if (!seen.has(e.id)) {
          out.push({
            code: "flow/unreachable",
            severity: "error",
            message: `${e.id} 从 start 不可达`,
            elementId: e.id,
            fixHint: "补一条从可达节点出发的 flow",
          });
        }
      }
      return out;
    },
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      const decisions = ctx.elements.filter((e) => e.kind === "decision");
      for (const d of decisions) {
        const outs = ctx.relations.filter(
          (r) => r.kind === "flow" && (r.from.split(":")[0] ?? r.from) === d.id,
        );
        if (outs.length < 2) {
          out.push({
            code: "flow/decision-branches",
            severity: "error",
            message: `${d.id}（decision）至少需要 2 条出边（当前 ${outs.length}）`,
            elementId: d.id,
            fixHint: "补上'是/否'两条分支",
          });
        }
        for (const r of outs) {
          const label = r.props?.label;
          if (typeof label !== "string" || label.trim() === "") {
            out.push({
              code: "flow/decision-label",
              severity: "error",
              message: `${r.id}：decision 的出边必须标注分支条件（props.label）`,
              elementId: r.id,
              fixHint: "加 props: { label: 是 } / { label: 否 }",
            });
          }
        }
      }
      return out;
    },
  ],
};

/** C4 上下文图：只表达"系统是什么、外部有谁、谁用它"，不表达技术栈。 */
export const C4_CONTEXT: ProfileDef = {
  ref: "c4-context@1",
  elements: ["person", "software-system", "external-system"],
  relations: {
    uses: {
      from: ["person", "software-system", "external-system"],
      to: ["software-system", "external-system"],
    },
  },
  requiredProps: { "software-system": ["scope"] },
  propEnums: { "software-system": { scope: ["in"] } },
  rules: [
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      const systems = ctx.elements.filter((e) => e.kind === "software-system");
      if (systems.length !== 1) {
        out.push({
          code: "context/system-count",
          severity: "error",
          message: `software-system 必须恰好 1 个（当前 ${systems.length}）`,
          fixHint: "上下文图只描述一个系统边界",
        });
      }
      return out;
    },
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      for (const el of ctx.elements) {
        if (el.kind !== "external-system") continue;
        const used = ctx.relations.some(
          (r) => (r.from.split(":")[0] ?? r.from) === el.id || (r.to.split(":")[0] ?? r.to) === el.id,
        );
        if (!used) {
          out.push({
            code: "context/external-unreferenced",
            severity: "warning",
            message: `${el.id} 是外部系统，但没有任何关系`,
            elementId: el.id,
            fixHint: "补一条 uses，或删除该外部系统",
          });
        }
      }
      return out;
    },
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      for (const el of ctx.elements) {
        if (el.kind === "software-system" && el.tech) {
          out.push({
            code: "context/no-tech",
            severity: "warning",
            message: `${el.id} 是上下文级系统，不应标注技术栈（tech）`,
            elementId: el.id,
            fixHint: "把技术细节移到 c4-container 图",
          });
        }
      }
      return out;
    },
  ],
};

/** 部署图：节点、制品落位、节点间链路。 */
export const DEPLOYMENT: ProfileDef = {
  ref: "deployment@1",
  elements: ["node", "artifact", "datastore", "external-system"],
  relations: {
    communicates: { from: ["node"], to: ["node"] },
    calls: { from: ["artifact"], to: ["artifact"] },
  },
  requiredProps: {
    node: ["env"],
    artifact: ["parent", "tech"],
    datastore: ["parent", "storage_kind"],
  },
  propEnums: { node: { env: ["dev", "stage", "prod"] } },
  rules: [
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      const nodes = new Map(
        ctx.elements.filter((e) => e.kind === "node").map((e) => [e.id, e]),
      );
      for (const el of ctx.elements) {
        if (el.kind !== "artifact" && el.kind !== "datastore") continue;
        const parent = (el.parent ?? el.props?.parent) as string | undefined;
        if (parent && !nodes.has(parent)) {
          out.push({
            code: "deploy/parent",
            severity: "error",
            message: `${el.id} 的 parent "${parent}" 不是本图的 node`,
            elementId: el.id,
            fixHint: "把 parent 指向 node 的 id",
          });
        }
      }
      return out;
    },
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      const envOf = new Map<string, string>();
      for (const el of ctx.elements) {
        if (el.kind !== "node") continue;
        envOf.set(el.id, String(el.props?.env ?? ""));
      }
      const parentOf = new Map<string, string>();
      for (const el of ctx.elements) {
        const p = (el.parent ?? el.props?.parent) as string | undefined;
        if (p) parentOf.set(el.id, p);
      }
      for (const r of ctx.relations) {
        if (r.kind !== "calls") continue;
        const from = parentOf.get(r.from.split(":")[0] ?? r.from);
        const to = parentOf.get(r.to.split(":")[0] ?? r.to);
        if (!from || !to) continue;
        const a = envOf.get(from);
        const b = envOf.get(to);
        if (a && b && a !== b) {
          out.push({
            code: "deploy/cross-env",
            severity: "warning",
            message: `${r.id} 跨环境直连（${a} → ${b}），通常应经过网关`,
            elementId: r.id,
            fixHint: "改为经网关/反向代理，或标注为受控链路",
          });
        }
      }
      return out;
    },
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      const hasChild = new Set<string>();
      for (const el of ctx.elements) {
        const p = (el.parent ?? el.props?.parent) as string | undefined;
        if (p) hasChild.add(p);
      }
      for (const el of ctx.elements) {
        if (el.kind === "node" && !hasChild.has(el.id)) {
          out.push({
            code: "deploy/empty-node",
            severity: "warning",
            message: `${el.id} 节点下没有 artifact/datastore`,
            elementId: el.id,
            fixHint: "补制品落位，或删除空节点",
          });
        }
      }
      return out;
    },
  ],
};

/** 找一条有向环（返回环上节点），无环返回 null */
function findCycle(edges: { from: string; to: string }[]): string[] | null {
  const adj = new Map<string, string[]>();
  const nodes = new Set<string>();
  for (const e of edges) {
    nodes.add(e.from);
    nodes.add(e.to);
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  const color = new Map<string, 0 | 1 | 2>();
  for (const n of nodes) color.set(n, 0);
  const stack: string[] = [];

  const dfs = (u: string): string[] | null => {
    color.set(u, 1);
    stack.push(u);
    for (const v of adj.get(u) ?? []) {
      if (color.get(v) === 1) {
        const i = stack.indexOf(v);
        return stack.slice(i).concat(v);
      }
      if (color.get(v) === 0) {
        const found = dfs(v);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(u, 2);
    return null;
  };
  for (const n of nodes) {
    if (color.get(n) === 0) {
      const found = dfs(n);
      if (found) return found;
    }
  }
  return null;
}

/** C4 组件图：单个容器内部的组件与接口。 */
export const C4_COMPONENT: ProfileDef = {
  ref: "c4-component@1",
  elements: ["component", "interface", "container-ref"],
  relations: {
    calls: { from: ["component"], to: ["component", "interface", "container-ref"] },
    implements: { from: ["component"], to: ["interface"] },
    "depends-on": {
      from: ["component", "interface", "container-ref"],
      to: ["component", "interface", "container-ref"],
    },
  },
  requiredProps: { component: ["parent"], "container-ref": ["ref"] },
  propEnums: {},
  rules: [
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      const cycle = findCycle(
        ctx.relations
          .filter((r) => r.kind === "depends-on")
          .map((r) => ({ from: r.from.split(":")[0] ?? r.from, to: r.to.split(":")[0] ?? r.to })),
      );
      if (cycle) {
        out.push({
          code: "component/cycle",
          severity: "error",
          message: `depends-on 存在环：${cycle.join(" → ")}`,
          fixHint: "拆掉环上的弱依赖，或改用接口倒置",
        });
      }
      return out;
    },
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      const hit = new Set<string>();
      for (const r of ctx.relations) {
        hit.add(r.from.split(":")[0] ?? r.from);
        hit.add(r.to.split(":")[0] ?? r.to);
      }
      for (const el of ctx.elements) {
        if (el.kind === "component" && !hit.has(el.id)) {
          out.push({
            code: "component/orphan",
            severity: "warning",
            message: `${el.id} 组件没有任何关系`,
            elementId: el.id,
            fixHint: "补上调用/实现关系，或删除该组件",
          });
        }
      }
      return out;
    },
  ],
};

/** 依赖/调用图：代码级影响面与分层违规。 */
export const GRAPH: ProfileDef = {
  ref: "graph@1",
  elements: ["module", "package", "file", "function", "external"],
  relations: {
    imports: {
      from: ["module", "package", "file", "function"],
      to: ["module", "package", "file", "function", "external"],
    },
    calls: {
      from: ["module", "package", "file", "function"],
      to: ["module", "package", "file", "function", "external"],
    },
    "depends-on": {
      from: ["module", "package", "file", "function"],
      to: ["module", "package", "file", "function", "external"],
    },
  },
  requiredProps: {
    module: ["path"],
    package: ["path"],
    file: ["path"],
    function: ["path"],
    external: ["name"],
  },
  propEnums: {},
  rules: [
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      if ((ctx.doc as unknown as Record<string, unknown>)["x-allow-cycles"] === true) return out;
      const cycle = findCycle(
        ctx.relations
          .filter((r) => r.kind === "imports")
          .map((r) => ({ from: r.from.split(":")[0] ?? r.from, to: r.to.split(":")[0] ?? r.to })),
      );
      if (cycle) {
        out.push({
          code: "graph/cycle",
          severity: "warning",
          message: `imports 存在环：${cycle.join(" → ")}`,
          fixHint: "拆环，或在文档根部声明 x-allow-cycles: true",
        });
      }
      return out;
    },
  ],
};

/** 序列图：一次交互中谁调谁、顺序、同步/异步。 */
export const SEQUENCE: ProfileDef = {
  ref: "sequence@1",
  elements: ["actor", "participant"],
  relations: {
    message: {
      from: ["actor", "participant"],
      to: ["actor", "participant"],
    },
    return: {
      from: ["actor", "participant"],
      to: ["actor", "participant"],
    },
  },
  requiredProps: {},
  propEnums: {},
  rules: [
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      const partIds = new Set(
        ctx.elements.filter((e) => e.kind === "actor" || e.kind === "participant").map((e) => e.id),
      );
      for (const r of ctx.relations) {
        const from = r.from.split(":")[0] ?? r.from;
        const to = r.to.split(":")[0] ?? r.to;
        if (!partIds.has(from) || !partIds.has(to)) {
          out.push({
            code: "seq/endpoint",
            severity: "error",
            message: `${r.id} 的端点必须是 actor/participant（${from} → ${to}）`,
            elementId: r.id,
            fixHint: "补上参与者元素，或修正端点 id",
          });
        }
      }
      return out;
    },
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      const msgIndex = new Map<string, number>();
      ctx.relations.forEach((r, i) => {
        if (r.kind === "message") msgIndex.set(r.id, i);
      });
      const paired = new Set<string>();
      ctx.relations.forEach((r, i) => {
        if (r.kind !== "return") return;
        const replyTo = typeof r.props?.reply_to === "string" ? r.props.reply_to : "";
        if (!replyTo) {
          out.push({
            code: "seq/order",
            severity: "error",
            message: `${r.id}：return 必须用 props.reply_to 指向配对的消息`,
            elementId: r.id,
            fixHint: "加 props: { reply_to: r.<sync 消息 id> }",
          });
          return;
        }
        const idx = msgIndex.get(replyTo);
        if (idx === undefined) {
          out.push({
            code: "seq/order",
            severity: "error",
            message: `${r.id}：reply_to "${replyTo}" 不是本图的 message`,
            elementId: r.id,
          });
          return;
        }
        if (idx > i) {
          out.push({
            code: "seq/order",
            severity: "error",
            message: `${r.id}：return 出现在配对消息之前（顺序不一致）`,
            elementId: r.id,
          });
        }
        const sync = ctx.relations.find((x) => x.id === replyTo);
        const syncKind = typeof sync?.props?.kind === "string" ? sync.props.kind : "sync";
        if (syncKind === "sync") paired.add(replyTo);
        // 反向校验：reply 方向应是 sync 的反向
        if (sync && syncKind === "sync") {
          const sFrom = sync.from.split(":")[0] ?? sync.from;
          const sTo = sync.to.split(":")[0] ?? sync.to;
          const rFrom = r.from.split(":")[0] ?? r.from;
          const rTo = r.to.split(":")[0] ?? r.to;
          if (rFrom !== sTo || rTo !== sFrom) {
            out.push({
              code: "seq/reverse-return",
              severity: "error",
              message: `${r.id}：return 方向应与 ${replyTo} 相反（${sTo} → ${sFrom}）`,
              elementId: r.id,
            });
          }
        }
      });
      for (const r of ctx.relations) {
        if (r.kind !== "message") continue;
        const k = typeof r.props?.kind === "string" ? r.props.kind : "sync";
        if (k === "sync" && !paired.has(r.id)) {
          out.push({
            code: "seq/reply-pairing",
            severity: "warning",
            message: `${r.id} 是同步消息，但没有配对的 return`,
            elementId: r.id,
            fixHint: "补一条 return，或把 props.kind 改成 async",
          });
        }
      }
      return out;
    },
  ],
};

/** 状态机：状态、事件、非法迁移。 */
export const STATE: ProfileDef = {
  ref: "state@1",
  elements: ["initial", "final", "state", "choice", "composite"],
  relations: {
    transition: {
      from: ["initial", "state", "choice", "composite"],
      to: ["state", "choice", "composite", "final"],
    },
  },
  requiredProps: {},
  propEnums: {},
  rules: [
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      const topInitials = ctx.elements.filter((e) => e.kind === "initial" && !e.parent);
      if (topInitials.length !== 1) {
        out.push({
          code: "state/initial-count",
          severity: "error",
          message: `顶层 initial 必须恰好 1 个（当前 ${topInitials.length}）`,
          fixHint: "保留唯一的入口状态",
        });
      }
      return out;
    },
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      const kindOf = new Map(ctx.elements.map((e) => [e.id, e.kind]));
      for (const r of ctx.relations) {
        if (r.kind !== "transition") continue;
        const from = r.from.split(":")[0] ?? r.from;
        if (kindOf.get(from) === "final") {
          out.push({
            code: "state/final-outgoing",
            severity: "error",
            message: `${r.id}：final 状态不能有出边`,
            elementId: r.id,
            fixHint: "删除该迁移，或把源状态改成 state",
          });
        }
      }
      return out;
    },
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      const initial = ctx.elements.find((e) => e.kind === "initial" && !e.parent);
      if (!initial) return out;
      const edges = ctx.relations
        .filter((r) => r.kind === "transition")
        .map((r) => ({
          from: r.from.split(":")[0] ?? r.from,
          to: r.to.split(":")[0] ?? r.to,
        }));
      const adj = new Map<string, string[]>();
      const rev = new Map<string, string[]>();
      for (const e of edges) {
        if (!adj.has(e.from)) adj.set(e.from, []);
        adj.get(e.from)!.push(e.to);
        if (!rev.has(e.to)) rev.set(e.to, []);
        rev.get(e.to)!.push(e.from);
      }
      const walk = (start: string, graph: Map<string, string[]>): Set<string> => {
        const seen = new Set([start]);
        const queue = [start];
        while (queue.length > 0) {
          const u = queue.shift()!;
          for (const v of graph.get(u) ?? []) {
            if (!seen.has(v)) {
              seen.add(v);
              queue.push(v);
            }
          }
        }
        return seen;
      };
      const forwards = walk(initial.id, adj);
      const finals = ctx.elements.filter((e) => e.kind === "final").map((e) => e.id);
      const backward = new Set<string>();
      for (const f of finals) {
        for (const id of walk(f, rev)) backward.add(id);
      }
      for (const el of ctx.elements) {
        if (el.kind !== "state" && el.kind !== "choice" && el.kind !== "composite") continue;
        if (!forwards.has(el.id)) {
          out.push({
            code: "state/unreachable",
            severity: "warning",
            message: `${el.id} 从 initial 不可达`,
            elementId: el.id,
          });
        }
        if (!backward.has(el.id)) {
          out.push({
            code: "state/no-final-path",
            severity: "warning",
            message: `${el.id} 无法到达任何 final`,
            elementId: el.id,
            fixHint: "补一条通往 final 的迁移",
          });
        }
      }
      return out;
    },
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      const groups = new Map<string, Set<string>>();
      for (const r of ctx.relations) {
        if (r.kind !== "transition") continue;
        const trigger = String(r.props?.trigger ?? "");
        const guard = String(r.props?.guard ?? "");
        const key = `${r.from.split(":")[0] ?? r.from}|${trigger}|${guard}`;
        if (!groups.has(key)) groups.set(key, new Set());
        groups.get(key)!.add(r.to.split(":")[0] ?? r.to);
      }
      for (const [key, targets] of groups) {
        if (targets.size > 1) {
          out.push({
            code: "state/transition-conflict",
            severity: "error",
            message: `同一 (from, trigger, guard) 有 ${targets.size} 个不同目标：${key}`,
            fixHint: "补 guard 区分，或合并为一条迁移",
          });
        }
      }
      return out;
    },
    (ctx) => {
      const out: ProfileRuleFinding[] = [];
      const children = new Map<string, string[]>();
      for (const el of ctx.elements) {
        if (!el.parent) continue;
        if (!children.has(el.parent)) children.set(el.parent, []);
        children.get(el.parent)!.push(el.id);
      }
      const kindOf = new Map(ctx.elements.map((e) => [e.id, e.kind]));
      for (const el of ctx.elements) {
        if (el.kind !== "composite") continue;
        const kids = children.get(el.id) ?? [];
        if (kids.length === 0) continue;
        const hasInitial = kids.some((id) => kindOf.get(id) === "initial");
        if (!hasInitial) {
          out.push({
            code: "state/composite-initial",
            severity: "error",
            message: `${el.id}（composite）缺少 initial 子状态`,
            elementId: el.id,
            fixHint: "为组合状态加一个 initial 子状态",
          });
        }
      }
      return out;
    },
  ],
};

/**
 * 混合剖面：允许所有已注册元素类型共存于同一文档。
 * 用于需要跨记法建图的项目（如 ALLELab：module + entity + process + data_store 混合）。
 * 关系矩阵全放行（from/to 不限），由业务不变量约束。
 */
const ALL_KINDS = [
  ...new Set([
    C4_CONTAINER.elements, DFD.elements, ER.elements,
    FLOWCHART.elements, C4_CONTEXT.elements, DEPLOYMENT.elements,
    C4_COMPONENT.elements, GRAPH.elements, SEQUENCE.elements, STATE.elements,
  ].flat()),
].sort();

const ALL_REL_KINDS = [
  ...new Set([
    ...Object.keys(C4_CONTAINER.relations), ...Object.keys(DFD.relations),
    ...Object.keys(ER.relations), ...Object.keys(FLOWCHART.relations),
    ...Object.keys(C4_CONTEXT.relations), ...Object.keys(DEPLOYMENT.relations),
    ...Object.keys(C4_COMPONENT.relations), ...Object.keys(GRAPH.relations),
    ...Object.keys(SEQUENCE.relations), ...Object.keys(STATE.relations),
  ]),
].sort();

export const MIXED: ProfileDef = {
  ref: "mixed@1",
  elements: ALL_KINDS,
  relations: Object.fromEntries(
    ALL_REL_KINDS.map((kind) => [kind, { from: ALL_KINDS, to: ALL_KINDS }]),
  ),
  requiredProps: {
    container: ["tech"],
    datastore: ["tech", "storage_kind"],
    "data-store": [],
    queue: ["tech"],
  },
  propEnums: {
    datastore: { storage_kind: ["rdbms", "kv", "object", "search", "file"] },
  },
};

const REGISTRY: Record<string, ProfileDef> = {
  [C4_CONTAINER.ref]: C4_CONTAINER,
  [DFD.ref]: DFD,
  [ER.ref]: ER,
  [FLOWCHART.ref]: FLOWCHART,
  [C4_CONTEXT.ref]: C4_CONTEXT,
  [DEPLOYMENT.ref]: DEPLOYMENT,
  [C4_COMPONENT.ref]: C4_COMPONENT,
  [GRAPH.ref]: GRAPH,
  [SEQUENCE.ref]: SEQUENCE,
  [STATE.ref]: STATE,
  [MIXED.ref]: MIXED,
};

/** 通过 "name@major" 取剖面；未知剖面返回 undefined 由调用方报错 */
export function getProfile(ref: string): ProfileDef | undefined {
  return REGISTRY[ref];
}

export function listProfiles(): string[] {
  return Object.keys(REGISTRY);
}

/** 取剖面的主版本（用于文档 profile 与 view profile 的兼容性提示） */
export function majorOf(ref: string): number {
  const at = ref.lastIndexOf("@");
  return at < 0 ? NaN : Number(ref.slice(at + 1));
}
