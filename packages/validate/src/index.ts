import { join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { findRepoRoot, readTextFile, sortFindings } from "@covenant/core";
import type {
  CovenantDoc,
  ElementDef,
  Finding,
  RelationDef,
} from "@covenant/core";
import { getProfile } from "@covenant/profile";
import type { ProfileDef } from "@covenant/profile";

export { getProfile, listProfiles } from "@covenant/profile";
export type { ProfileDef } from "@covenant/profile";

/* eslint-disable @typescript-eslint/no-explicit-any */
let cachedValidator: any = null;

function getValidator(): any {
  if (cachedValidator) return cachedValidator;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const schemaPath = join(findRepoRoot(), "schema", "kernel.schema.json");
  const schema = JSON.parse(readTextFile(schemaPath));
  cachedValidator = ajv.compile(schema);
  return cachedValidator;
}

/** 从 JSON Pointer 里尽量还原出元素 id，便于 finding 可定位 */
function idAtPath(doc: CovenantDoc, instancePath: string): string | undefined {
  const segs = instancePath.split("/").filter(Boolean);
  if (segs.length < 2) return undefined;
  const [coll, indexStr] = segs;
  const index = Number(indexStr);
  if (!Number.isInteger(index)) return undefined;
  const lists: Record<string, any[] | undefined> = {
    elements: doc.elements,
    relations: doc.relations,
    frames: doc.frames,
    views: doc.views,
    annotations: doc.annotations,
    constraints: doc.constraints,
  };
  const list = lists[coll ?? ""];
  const item = list?.[index];
  return typeof item?.id === "string" ? item.id : undefined;
}

function hintFor(err: { keyword?: string; params?: any; instancePath?: string }): string {
  switch (err.keyword) {
    case "required":
      return `补上必填字段 ${String(err.params?.missingProperty ?? "")}`;
    case "additionalProperties":
      return `删除未知字段 "${String(err.params?.additionalProperty ?? "")}"，自定义字段请用 x- 前缀`;
    case "enum":
      return `取值必须是：${String((err.params?.allowedValues ?? []).join(" | "))}`;
    case "pattern":
      return "检查 ID / 版本号格式（见 schema/README.md）";
    case "const":
      return `字段值必须为 ${String(err.params?.allowedValue ?? "")}`;
    case "type":
      return `类型应为 ${String(err.params?.type ?? "")}`;
    default:
      return "按 schema/kernel.schema.json 修正";
  }
}

/** L1：结构 schema */
export function validateL1(doc: CovenantDoc, file: string): Finding[] {
  const validate = getValidator();
  if (validate(doc)) return [];
  return (validate.errors ?? []).map((err: any) => ({
    code: `schema/${String(err.keyword)}`,
    level: "L1" as const,
    severity: "error" as const,
    message: `${err.instancePath || "/"} ${err.message ?? ""}`.trim(),
    elementId: idAtPath(doc, err.instancePath ?? ""),
    path: file,
    fixHint: hintFor(err),
  }));
}

const baseEndpoint = (ref: string): string => ref.split(":")[0] ?? ref;

/** L2：内核完整性（ID 唯一、引用不悬空、父子无环） */
export function validateL2(doc: CovenantDoc, file: string): Finding[] {
  const findings: Finding[] = [];
  const elements = doc.elements ?? [];
  const relations = doc.relations ?? [];
  const frames = doc.frames ?? [];
  const views = doc.views ?? [];
  const annotations = doc.annotations ?? [];
  const constraints = doc.constraints ?? [];

  // 2.1 ID 唯一（跨集合）
  const seen = new Map<string, string>();
  const collections: [string, { id?: string }[]][] = [
    ["elements", elements],
    ["relations", relations],
    ["frames", frames],
    ["views", views],
    ["annotations", annotations],
    ["constraints", constraints],
  ];
  for (const [name, list] of collections) {
    for (const item of list) {
      const id = item.id;
      if (!id) continue; // schema 已报
      const prev = seen.get(id);
      if (prev) {
        findings.push({
          code: "kernel/duplicate-id",
          level: "L2",
          severity: "error",
          message: `id "${id}" 重复（首次出现在 ${prev}）`,
          elementId: id,
          path: file,
          fixHint: "ID 全局唯一且永不复用",
        });
      } else {
        seen.set(id, name);
      }
    }
  }

  const elIds = new Set(elements.map((e) => e.id));
  const relIds = new Set(relations.map((r) => r.id));
  const frameIds = new Set(frames.map((f) => f.id));
  const viewIds = new Set(views.map((v) => v.id));

  // 2.2 关系端点
  for (const rel of relations) {
    for (const [side, ref] of [
      ["from", rel.from],
      ["to", rel.to],
    ] as const) {
      const id = baseEndpoint(String(ref ?? ""));
      if (!elIds.has(id)) {
        findings.push({
          code: "kernel/dangling-ref",
          level: "L2",
          severity: "error",
          message: `${rel.id}.${side} 指向不存在的元素 "${id}"`,
          elementId: rel.id,
          path: file,
          fixHint: "改为已存在的 e.* id，或补上该元素定义",
        });
      }
    }
  }

  // 2.3 frame 成员
  for (const frame of frames) {
    for (const m of frame.members ?? []) {
      if (!elIds.has(m)) {
        findings.push({
          code: "kernel/dangling-ref",
          level: "L2",
          severity: "error",
          message: `${frame.id}.members 含不存在的元素 "${m}"`,
          elementId: frame.id,
          path: file,
          fixHint: "删除该成员或补元素定义",
        });
      }
    }
  }

  // 2.4 批注目标
  const targetSets: Record<string, Set<string>> = {
    element: elIds,
    relation: relIds,
    frame: frameIds,
    view: viewIds,
  };
  for (const ann of annotations) {
    const target = ann.target;
    if (!target) continue;
    if (target.kind === "region") {
      if (!viewIds.has(target.view)) {
        findings.push({
          code: "kernel/dangling-ref",
          level: "L2",
          severity: "error",
          message: `${ann.id}.target.view 指向不存在的视图 "${target.view}"`,
          elementId: ann.id,
          path: file,
          fixHint: "改为已存在的 v.* 视图 id",
        });
      }
      continue;
    }
    if (target.kind === "document") continue;
    const set = targetSets[target.kind];
    if (set && !set.has((target as { id: string }).id)) {
      findings.push({
        code: "kernel/dangling-ref",
        level: "L2",
        severity: "error",
        message: `${ann.id}.target 指向不存在的 ${target.kind} "${(target as { id: string }).id}"`,
        elementId: ann.id,
        path: file,
        fixHint: "修正 target.id 或删除该批注",
      });
    }
  }

  // 2.5 parent 存在 + 无环
  const parentOf = new Map<string, string>();
  for (const el of elements) {
    if (!el.parent) continue;
    if (!elIds.has(el.parent)) {
      findings.push({
        code: "kernel/dangling-ref",
        level: "L2",
        severity: "error",
        message: `${el.id}.parent 指向不存在的元素 "${el.parent}"`,
        elementId: el.id,
        path: file,
        fixHint: "补上父元素，或删除 parent",
      });
    } else {
      parentOf.set(el.id, el.parent);
    }
  }
  for (const el of elements) {
    const chain = new Set<string>([el.id]);
    let cur = parentOf.get(el.id);
    while (cur) {
      if (chain.has(cur)) {
        findings.push({
          code: "kernel/parent-cycle",
          level: "L2",
          severity: "error",
          message: `${el.id} 的 parent 链存在环`,
          elementId: el.id,
          path: file,
          fixHint: "打断 parent 环",
        });
        break;
      }
      chain.add(cur);
      cur = parentOf.get(cur);
    }
  }

  // 2.6 视图选择器里的显式 id
  const selectorChecks: [string, Set<string>][] = [
    ["elements", elIds],
    ["relations", relIds],
    ["frames", frameIds],
  ];
  for (const view of views) {
    for (const block of ["include", "exclude"] as const) {
      const sel = view[block];
      if (!sel) continue;
      for (const [field, set] of selectorChecks) {
        for (const token of (sel as Record<string, string[]>)[field] ?? []) {
          // 通配与前缀选择器不按精确 id 校验
          if (token.includes("*") || token.startsWith("tag:")) continue;
          if (!set.has(token)) {
            findings.push({
              code: "kernel/dangling-ref",
              level: "L2",
              severity: "error",
              message: `${view.id}.${block}.${field} 含不存在的 id "${token}"`,
              elementId: view.id,
              path: file,
              fixHint: "修正选择器或使用通配（如 e.*）",
            });
          }
        }
      }
    }
  }

  // 3.6 links 格式（文档级与元素级）：adr 必须是 4 位编号，url 必须是 http(s)
  type LinkLike = { kind: string; ref: string };
  const linkGroups: { owner: string; links: LinkLike[] }[] = [];
  if (doc.links) linkGroups.push({ owner: "document", links: doc.links });
  for (const el of elements) {
    if (el.links) linkGroups.push({ owner: el.id, links: el.links });
  }
  for (const group of linkGroups) {
    for (const link of group.links) {
      const adrOk = /^\d{4}$/.test(link.ref) || /(^|\/)\d{4}-[^/]*\.md$/.test(link.ref);
      if (link.kind === "adr" && !adrOk) {
        findings.push({
          code: "link/adr-format",
          level: "L2",
          severity: "error",
          message: `${group.owner} 的 adr link "${link.ref}" 必须是 4 位编号`,
          elementId: group.owner === "document" ? undefined : group.owner,
          path: file,
          fixHint: "用 0001 这样的 4 位编号，或 adr/0001-xxx.md 路径引用 ADR",
        });
      }
      if (link.kind === "url" && !/^https?:\/\//.test(link.ref)) {
        findings.push({
          code: "link/url-format",
          level: "L2",
          severity: "error",
          message: `${group.owner} 的 url link "${link.ref}" 必须以 http(s):// 开头`,
          elementId: group.owner === "document" ? undefined : group.owner,
          path: file,
        });
      }
    }
  }

  return findings;
}

/** L3：剖面一致性（词表 / 关系矩阵 / 必填属性 / 枚举 / 内置规则） */
export function validateL3(doc: CovenantDoc, file: string): Finding[] {
  const profile: ProfileDef | undefined = getProfile(doc.profile);
  if (!profile) {
    return [
      {
        code: "profile/unknown",
        level: "L3",
        severity: "error",
        message: `未注册的剖面 "${doc.profile}"`,
        path: file,
        fixHint: "使用已注册剖面，或在 packages/profile 中登记新剖面",
      },
    ];
  }

  const findings: Finding[] = [];
  const elements = doc.elements ?? [];
  const relations = doc.relations ?? [];
  const byId = new Map<string, ElementDef>(elements.map((e) => [e.id, e]));

  // 3.1 元素词表 + 必填 + 枚举
  for (const el of elements) {
    if (!profile.elements.includes(el.kind)) {
      findings.push({
        code: "profile/vocabulary",
        level: "L3",
        severity: "error",
        message: `${el.id} 的 kind "${el.kind}" 不在 ${profile.ref} 词表中`,
        elementId: el.id,
        path: file,
        fixHint: `可用 kind：${profile.elements.join(" | ")}`,
      });
      continue;
    }
    for (const prop of profile.requiredProps[el.kind] ?? []) {
      const value =
        (el as unknown as Record<string, unknown>)[prop] ??
        (el.props ? el.props[prop] : undefined);
      if (value === undefined || value === null || value === "") {
        findings.push({
          code: "profile/required-prop",
          level: "L3",
          severity: "error",
          message: `${el.id}（${el.kind}）缺少必填属性 "${prop}"`,
          elementId: el.id,
          path: file,
          fixHint: `在元素上补 ${prop}: <值>`,
        });
      }
    }
    for (const [prop, allowed] of Object.entries(profile.propEnums[el.kind] ?? {})) {
      const value =
        (el as unknown as Record<string, unknown>)[prop] ?? el.props?.[prop];
      if (value !== undefined && !allowed.includes(String(value))) {
        findings.push({
          code: "profile/prop-enum",
          level: "L3",
          severity: "error",
          message: `${el.id}.${prop} = "${String(value)}" 不在允许值内`,
          elementId: el.id,
          path: file,
          fixHint: `允许值：${allowed.join(" | ")}`,
        });
      }
    }
  }

  // 3.2 关系词表 + 关系矩阵
  for (const rel of relations) {
    const rule = profile.relations[rel.kind];
    if (!rule) {
      findings.push({
        code: "profile/vocabulary",
        level: "L3",
        severity: "error",
        message: `${rel.id} 的关系类型 "${rel.kind}" 不在 ${profile.ref} 词表中`,
        elementId: rel.id,
        path: file,
        fixHint: `可用关系：${Object.keys(profile.relations).join(" | ")}`,
      });
      continue;
    }
    const fromEl = byId.get(baseEndpoint(rel.from));
    const toEl = byId.get(baseEndpoint(rel.to));
    if (fromEl && !rule.from.includes(fromEl.kind)) {
      findings.push({
        code: "profile/relation-matrix",
        level: "L3",
        severity: "error",
        message: `${rel.id}：${rel.kind} 的源不能是 ${fromEl.kind}`,
        elementId: rel.id,
        path: file,
        fixHint: `源允许：${rule.from.join(" | ")}`,
      });
    }
    if (toEl && !rule.to.includes(toEl.kind)) {
      findings.push({
        code: "profile/relation-matrix",
        level: "L3",
        severity: "error",
        message: `${rel.id}：${rel.kind} 的目标不能是 ${toEl.kind}（${toEl.id}）`,
        elementId: rel.id,
        path: file,
        fixHint: `目标允许：${rule.to.join(" | ")}`,
      });
    }
  }

  // 3.3/3.4 内置规则：datastore 的 I/O 语义。
  // 只在有 reads/writes 的剖面（c4-container）生效；deployment 等剖面的 datastore 是"落位"不是"读写"。
  const hasStoreIo = Boolean(profile.relations["reads"] || profile.relations["writes"]);
  if (hasStoreIo) {
    for (const rel of relations) {
      const fromEl = byId.get(baseEndpoint(rel.from));
      const toEl = byId.get(baseEndpoint(rel.to));
      if (fromEl && toEl && fromEl.kind === "datastore" && toEl.kind === "datastore") {
        findings.push({
          code: "rule/no-direct-relation",
          level: "L3",
          severity: "error",
          message: `${rel.id}：datastore 之间不得直连（${fromEl.id} → ${toEl.id}）`,
          elementId: rel.id,
          path: file,
          fixHint: "改为经由 container 中转",
        });
      }
    }

    for (const el of elements) {
      if (el.kind !== "datastore") continue;
      const hit = relations.some(
        (r) => baseEndpoint(r.from) === el.id || baseEndpoint(r.to) === el.id,
      );
      if (!hit) {
        findings.push({
          code: "rule/store-unreachable",
          level: "L3",
          severity: "warning",
          message: `${el.id} 是 datastore，但没有任何 reads/writes 命中`,
          elementId: el.id,
          path: file,
          fixHint: "补一条 reads/writes，或删除该存储",
        });
      }
    }
  }

  // 3.5 剖面专有规则（catalog 的"内置规则"）
  for (const rule of profile.rules ?? []) {
    for (const r of rule({ doc, elements, relations })) {
      findings.push({
        code: r.code,
        level: "L3",
        severity: r.severity,
        message: r.message,
        elementId: r.elementId,
        path: file,
        fixHint: r.fixHint,
      });
    }
  }

  return findings;
}

/** 全量校验 L1–L3（M1 范围），输出按 (level, code, elementId, path) 稳定排序 */
export function checkDocument(doc: CovenantDoc, file: string): Finding[] {
  const findings = [
    ...validateL1(doc, file),
    ...validateL2(doc, file),
    ...validateL3(doc, file),
  ];
  return sortFindings(findings);
}
