/**
 * 语义 diff（M4）：比较两份契约文档，把变更分成 cosmetic / material / breaking。
 *
 * 分类原则（可判定，见 docs/design/format-spec-v0.md）：
 *   - breaking：语义契约被破坏或移除——删元素/删关系、改 kind、改关系端点、改剖面、
 *               删约束。这类变更**必须人工批准**。
 *   - material：新增能力或实现变化——加元素/加关系、改 tech、改 frame 成员、
 *               改视图选择器、加约束。需要评审但不阻塞。
 *   - cosmetic：不影响语义的表达层变化——名称、摘要、标签、props、视图布局、
 *               meta 文案、批注（含状态流转）。
 *
 * 纯函数、确定性：同输入逐字节一致；输出按 (class, kind, id) 稳定排序。
 */
import type {
  AnnotationDef,
  CovenantDoc,
  ElementDef,
  ElementConstraint,
  FrameDef,
  RelationDef,
  ViewDef,
} from "@covenant/core";

export type ChangeClass = "cosmetic" | "material" | "breaking";

export interface DiffChange {
  class: ChangeClass;
  kind: string;
  id: string;
  detail: string;
}

export interface DiffResult {
  changes: DiffChange[];
  summary: Record<ChangeClass, number>;
  /** 有 breaking 时需要人工批准 */
  needsApproval: boolean;
}

const json = (v: unknown): string => JSON.stringify(v ?? null);

function mapById<T extends { id: string }>(list: T[] | undefined): Map<string, T> {
  return new Map((list ?? []).map((x) => [x.id, x]));
}

function sameConstraints(a: ElementConstraint[] | undefined, b: ElementConstraint[] | undefined): boolean {
  return json(a ?? []) === json(b ?? []);
}

export function diffDocs(left: CovenantDoc, right: CovenantDoc): DiffResult {
  const changes: DiffChange[] = [];
  const add = (cls: ChangeClass, kind: string, id: string, detail = ""): void => {
    changes.push({ class: cls, kind, id, detail });
  };

  // 剖面
  if ((left.profile ?? "") !== (right.profile ?? "")) {
    add("breaking", "profile-changed", right.id, `${left.profile} → ${right.profile}`);
  }

  // 元素
  const elsA = mapById<ElementDef>(left.elements);
  const elsB = mapById<ElementDef>(right.elements);
  for (const [id, e] of elsB) {
    if (!elsA.has(id)) add("material", "element-added", id, `${e.kind} ${e.name}`);
  }
  for (const [id, e] of elsA) {
    if (!elsB.has(id)) {
      add("breaking", "element-removed", id, `${e.kind} ${e.name}`);
      continue;
    }
    const f = elsB.get(id)!;
    if (e.kind !== f.kind) add("breaking", "element-kind-changed", id, `${e.kind} → ${f.kind}`);
    if ((e.tech ?? "") !== (f.tech ?? "")) {
      add("material", "element-tech-changed", id, `${e.tech ?? "—"} → ${f.tech ?? "—"}`);
    }
    if (e.name !== f.name) add("cosmetic", "element-name-changed", id, `${e.name} → ${f.name}`);
    if ((e.summary ?? "") !== (f.summary ?? "")) add("cosmetic", "element-summary-changed", id);
    if (json(e.tags ?? []) !== json(f.tags ?? [])) add("cosmetic", "element-tags-changed", id);
    if (json(e.props ?? {}) !== json(f.props ?? {})) add("cosmetic", "element-props-changed", id);
    if ((e.parent ?? "") !== (f.parent ?? "")) add("breaking", "element-parent-changed", id, `${e.parent ?? "—"} → ${f.parent ?? "—"}`);
    if (!sameConstraints(e.constraints, f.constraints)) {
      const ca = mapById<ElementConstraint>(e.constraints);
      const cb = mapById<ElementConstraint>(f.constraints);
      for (const [cid] of cb) if (!ca.has(cid)) add("material", "constraint-added", `${id}.${cid}`);
      for (const [cid, c] of ca) {
        if (!cb.has(cid)) {
          add("breaking", "constraint-removed", `${id}.${cid}`, c.text);
          continue;
        }
        if (c.text !== cb.get(cid)!.text) add("material", "constraint-changed", `${id}.${cid}`);
      }
    }
  }

  // 关系
  const relA = mapById<RelationDef>(left.relations);
  const relB = mapById<RelationDef>(right.relations);
  for (const [id, r] of relB) {
    if (!relA.has(id)) add("material", "relation-added", id, `${r.from} -${r.kind}-> ${r.to}`);
  }
  for (const [id, r] of relA) {
    if (!relB.has(id)) {
      add("breaking", "relation-removed", id, `${r.from} -${r.kind}-> ${r.to}`);
      continue;
    }
    const s = relB.get(id)!;
    if (r.kind !== s.kind) add("breaking", "relation-kind-changed", id, `${r.kind} → ${s.kind}`);
    if (r.from !== s.from) add("breaking", "relation-from-changed", id, `${r.from} → ${s.from}`);
    if (r.to !== s.to) add("breaking", "relation-to-changed", id, `${r.to} → ${s.to}`);
    if ((r.summary ?? "") !== (s.summary ?? "")) add("cosmetic", "relation-summary-changed", id);
    if (json(r.props ?? {}) !== json(s.props ?? {})) add("cosmetic", "relation-props-changed", id);
    if ((r.routing ?? "") !== (s.routing ?? "")) add("cosmetic", "relation-routing-changed", id);
  }

  // frame
  const frA = mapById<FrameDef>(left.frames);
  const frB = mapById<FrameDef>(right.frames);
  for (const [id, f] of frB) {
    if (!frA.has(id)) add("material", "frame-added", id, f.name);
  }
  for (const [id, f] of frA) {
    if (!frB.has(id)) {
      add("material", "frame-removed", id, f.name);
      continue;
    }
    const g = frB.get(id)!;
    if (json([...f.members].sort()) !== json([...g.members].sort())) {
      add("material", "frame-members-changed", id, `${f.members.join(",")} → ${g.members.join(",")}`);
    }
    if (f.kind !== g.kind) add("breaking", "frame-kind-changed", id, `${f.kind} → ${g.kind}`);
    if (f.name !== g.name) add("cosmetic", "frame-name-changed", id);
  }

  // 视图
  const vA = mapById<ViewDef>(left.views);
  const vB = mapById<ViewDef>(right.views);
  for (const [id, v] of vB) if (!vA.has(id)) add("cosmetic", "view-added", id, v.title);
  for (const [id, v] of vA) {
    if (!vB.has(id)) {
      add("cosmetic", "view-removed", id, v.title);
      continue;
    }
    const w = vB.get(id)!;
    if (v.title !== w.title) add("cosmetic", "view-title-changed", id);
    if (json(v.layout ?? {}) !== json(w.layout ?? {})) add("cosmetic", "view-layout-changed", id);
    if (json(v.present ?? {}) !== json(w.present ?? {})) add("cosmetic", "view-present-changed", id);
    if (json(v.include ?? {}) !== json(w.include ?? {})) add("material", "view-include-changed", id);
    if (json(v.exclude ?? {}) !== json(w.exclude ?? {})) add("material", "view-exclude-changed", id);
  }

  // 批注（过程元数据 → cosmetic）
  const anA = mapById<AnnotationDef>(left.annotations);
  const anB = mapById<AnnotationDef>(right.annotations);
  for (const [id] of anB) if (!anA.has(id)) add("cosmetic", "annotation-added", id);
  for (const [id, a] of anA) {
    const b = anB.get(id);
    if (!b) {
      add("cosmetic", "annotation-removed", id);
      continue;
    }
    if (a.status !== b.status) add("cosmetic", "annotation-status-changed", id, `${a.status} → ${b.status}`);
    if (a.title !== b.title || (a.body ?? "") !== (b.body ?? "")) {
      add("cosmetic", "annotation-content-changed", id);
    }
  }

  // meta
  if ((left.meta?.title ?? "") !== (right.meta?.title ?? "")) add("cosmetic", "meta-title-changed", right.id);
  if ((left.meta?.purpose ?? "") !== (right.meta?.purpose ?? "")) add("cosmetic", "meta-purpose-changed", right.id);
  if (json(left.meta?.non_goals ?? []) !== json(right.meta?.non_goals ?? [])) {
    add("cosmetic", "meta-non-goals-changed", right.id);
  }

  const order: Record<ChangeClass, number> = { breaking: 0, material: 1, cosmetic: 2 };
  changes.sort((x, y) => {
    if (order[x.class] !== order[y.class]) return order[x.class] - order[y.class];
    if (x.kind !== y.kind) return x.kind < y.kind ? -1 : 1;
    if (x.id !== y.id) return x.id < y.id ? -1 : 1;
    return 0;
  });

  const summary: Record<ChangeClass, number> = { cosmetic: 0, material: 0, breaking: 0 };
  for (const c of changes) summary[c.class]++;
  return { changes, summary, needsApproval: summary.breaking > 0 };
}

export function formatDiff(result: DiffResult, leftLabel: string, rightLabel: string): string {
  const lines: string[] = [`covenant diff  ${leftLabel} → ${rightLabel}`];
  if (result.changes.length === 0) {
    lines.push("  （无语义变更）");
  }
  for (const c of result.changes) {
    lines.push(`  ${c.class.toUpperCase().padEnd(8)} ${c.kind.padEnd(24)} ${c.id}${c.detail ? `  ${c.detail}` : ""}`);
  }
  lines.push(
    `summary: ${result.summary.breaking} breaking, ${result.summary.material} material, ${result.summary.cosmetic} cosmetic`,
  );
  if (result.needsApproval) lines.push("需要人工批准：存在 breaking 变更");
  return lines.join("\n");
}
