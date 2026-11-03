import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "vitest";
import { parseDocument } from "@covenant/core";
import type { CovenantDoc, ViewDef } from "@covenant/core";
import { checkDocument } from "@covenant/validate";
import { layout, selectView } from "@covenant/layout";
import { renderSvg } from "./index";

/**
 * 黄金 SVG：防止布局/渲染在重构中悄悄退化。
 * 生成/更新：`pnpm golden`（内部置 GOLDEN_UPDATE=1 跑本文件）。
 * 迭代视觉时先看 diff 再更新，不要盲目覆盖。
 */
const GOLDEN_DIR = join(process.cwd(), "packages/render/src/__golden__");
const UPDATE = process.env.GOLDEN_UPDATE === "1";

interface GoldenCase {
  name: string;
  file: string;
  view?: string;
}

const CASES: GoldenCase[] = [
  { name: "payments", file: "examples/payments-arch.cvn.yaml" },
  { name: "covenant-self", file: "examples/covenant-self.cvn.yaml" },
  { name: "order-dfd", file: "examples/order-dfd.cvn.yaml" },
  { name: "order-er", file: "examples/order-er.cvn.yaml" },
  { name: "order-flow", file: "examples/order-flow.cvn.yaml" },
  { name: "context", file: "examples/payments-context.cvn.yaml" },
  { name: "deployment", file: "examples/payments-deployment.cvn.yaml" },
  { name: "components", file: "examples/payments-components.cvn.yaml" },
  { name: "deps", file: "examples/covenant-deps.cvn.yaml" },
  { name: "sequence", file: "examples/order-sequence.cvn.yaml" },
  { name: "state", file: "examples/order-state.cvn.yaml" },
  { name: "multi-core", file: "examples/multi-view.cvn.yaml", view: "v.core" },
  { name: "multi-public", file: "examples/multi-view.cvn.yaml", view: "v.public" },
  { name: "self-arch", file: "arch/system.cvn.yaml" },
  { name: "topology-junction", file: "examples/topology-junction.cvn.yaml" },
];

function renderCase(c: GoldenCase): string {
  const parsed = parseDocument(readFileSync(c.file, "utf8"), c.file);
  if (!parsed.doc) throw new Error(`${c.file} 解析失败`);
  const doc: CovenantDoc = parsed.doc;
  const errors = checkDocument(doc, c.file).filter((f) => f.severity === "error");
  if (errors.length > 0) {
    throw new Error(`${c.file} 校验失败：${errors[0]!.code} ${errors[0]!.message}`);
  }
  const view: ViewDef | undefined = c.view
    ? (doc.views ?? []).find((v) => v.id === c.view)
    : (doc.views ?? [])[0];
  if (c.view && !view) throw new Error(`${c.file} 找不到视图 ${c.view}`);
  const sel = selectView(doc, view);
  const result = layout(doc, {
    direction: view?.layout?.direction,
    rankGap: view?.layout?.spacing?.rank,
    nodeGap: view?.layout?.spacing?.node,
    pins: view?.layout?.pins,
    includeIds: sel.elementIds,
    includeRelationIds: sel.relationIds,
  });
  return renderSvg(doc, result, { title: view?.title ?? doc.meta?.title, view });
}

describe("黄金 SVG（防视觉回归）", () => {
  for (const c of CASES) {
    it(`golden: ${c.name}`, () => {
      const svg = renderCase(c);
      const path = join(GOLDEN_DIR, `${c.name}.svg`);
      if (UPDATE) {
        mkdirSync(GOLDEN_DIR, { recursive: true });
        writeFileSync(path, svg, "utf8");
        return;
      }
      if (!existsSync(path)) {
        throw new Error(`黄金文件缺失：${path}（运行 pnpm golden 生成）`);
      }
      const golden = readFileSync(path, "utf8");
      if (svg !== golden) {
        throw new Error(
          `黄金 SVG 不匹配：${c.name}（若是有意的视觉改动，先人工看 diff 再运行 pnpm golden）`,
        );
      }
    });
  }
});
