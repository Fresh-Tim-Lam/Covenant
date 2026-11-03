import { describe, expect, it } from "vitest";
import { parseDocument } from "./index";

const DOC = (name: string): string => `covenant: "0.1"
id: t/parse
profile: c4-container@1
meta:
  title: parse
  purpose: p
  non_goals: []
elements:
  - id: e.a
    kind: container
    name: ${name}
    summary: s
    tech: ts
views:
  - id: v.main
    title: m
`;

describe("parseDocument：YAML 1.2 CORE_SCHEMA", () => {
  it("Norway 问题：no/yes/on/off 作为元素名时保持字符串", () => {
    for (const name of ["no", "yes", "on", "off", "No", "YES"]) {
      const { doc } = parseDocument(DOC(name), "parse.cvn.yaml");
      expect(doc).not.toBeNull();
      expect(doc?.elements?.[0]?.name).toBe(name);
      expect(typeof doc?.elements?.[0]?.name).toBe("string");
    }
  });

  it("时间戳字段保持字符串，不被解析成 Date（CORE_SCHEMA 而非 DEFAULT_SCHEMA）", () => {
    const text = DOC("A").replace(
      "views:",
      "annotations:\n  - id: a.01JAY0000000000000000\n    target: {kind: element, id: e.a}\n    type: risk\n    severity: low\n    title: t\n    status: open\n    author: human:x\n    created: 2026-11-03T00:00:00+08:00\nviews:",
    );
    const { doc } = parseDocument(text, "parse.cvn.yaml");
    expect(doc).not.toBeNull();
    expect(typeof doc!.annotations![0]!.created).toBe("string");
  });
});
