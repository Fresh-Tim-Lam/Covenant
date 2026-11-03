import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CovenantDoc } from "@covenant/core";
import {
  checkAcceptedAdrReferenced,
  checkAdr,
  checkAdrDir,
  collectAdrRefs,
  normalizeAdrNumber,
  parseAdr,
} from "./index";

const VALID = `---
adr: "0007"
title: 采用 Outbox 模式
status: accepted
date: 2026-11-03
deciders: [human:lily]
supersedes: []
related: [e.payments]
---

# 背景

正文。
`;

const front = (overrides: Record<string, unknown> = {}) => ({
  adr: "0007",
  title: "采用 Outbox 模式",
  status: "accepted",
  date: "2026-11-03",
  deciders: ["human:lily"],
  supersedes: [],
  related: [],
  ...overrides,
});

describe("ADR front-matter", () => {
  it("解析合法 ADR", () => {
    const p = parseAdr(VALID);
    expect(p.findings).toEqual([]);
    expect(p.front?.title).toBe("采用 Outbox 模式");
    expect(p.body).toContain("正文");
  });

  it("缺 front-matter → adr/front-matter", () => {
    expect(parseAdr("# 只有正文\n").findings.map((f) => f.code)).toContain("adr/front-matter");
  });

  it("合法字段无 finding", () => {
    expect(checkAdr(front(), "0007-x.md")).toEqual([]);
  });

  it("缺 title / 非法 status / 非法 date 各自报错", () => {
    expect(checkAdr(front({ title: "" }), "0007-x.md").map((f) => f.code)).toContain("adr/title");
    expect(checkAdr(front({ status: "done" }), "0007-x.md").map((f) => f.code)).toContain("adr/status");
    expect(checkAdr(front({ date: "2026/11/03" }), "0007-x.md").map((f) => f.code)).toContain("adr/date");
  });

  it("文件名编号与 front-matter 不一致 → adr/filename", () => {
    expect(checkAdr(front(), "0008-x.md").map((f) => f.code)).toContain("adr/filename");
  });

  it("superseded 但没有 supersedes 链 → adr/supersedes-chain", () => {
    const f = checkAdr(front({ status: "superseded" }), "0007-x.md");
    expect(f.map((x) => x.code)).toContain("adr/supersedes-chain");
  });

  it("normalizeAdrNumber 补零", () => {
    expect(normalizeAdrNumber(7)).toBe("0007");
    expect(normalizeAdrNumber("0007")).toBe("0007");
    expect(normalizeAdrNumber(123)).toBe("0123");
  });
});

describe("ADR 目录", () => {
  function dirWith(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "covenant-adr-"));
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content);
    }
    return dir;
  }

  it("校验真实 ADR 目录（本仓库 docs/design/adr）", () => {
    const { records, findings } = checkAdrDir("docs/design/adr");
    expect(records.length).toBeGreaterThanOrEqual(2);
    expect(findings).toEqual([]);
  });

  it("supersedes 指向不存在的编号 → adr/supersedes-target", () => {
    const dir = dirWith({
      "0007-a.md": VALID,
      "0009-b.md": `---\nadr: "0009"\ntitle: 新决策\nstatus: superseded\ndate: 2026-11-03\nsupersedes: ["0008"]\n---\n`,
    });
    const { findings } = checkAdrDir(dir);
    expect(findings.map((f) => f.code)).toContain("adr/supersedes-target");
  });

  it("README.md 不参与校验", () => {
    const dir = dirWith({
      "README.md": "# 随便写的索引\n",
      "0007-a.md": VALID,
    });
    expect(checkAdrDir(dir).findings).toEqual([]);
  });
});

describe("ADR 跨文档引用", () => {
  const records = [
    {
      file: "docs/design/adr/0001-a.md",
      front: { adr: "0001", title: "A", status: "accepted", date: "2026-11-03" },
      findings: [],
    },
    {
      file: "docs/design/adr/0002-b.md",
      front: { adr: "0002", title: "B", status: "proposed", date: "2026-11-03" },
      findings: [],
    },
  ];

  it("accepted ADR 未被引用 → warning adr/unreferenced", () => {
    const f = checkAcceptedAdrReferenced(records, new Set());
    expect(f.map((x) => x.code)).toContain("adr/unreferenced");
    expect(f[0]!.severity).toBe("warning");
  });

  it("proposed ADR 不要求引用", () => {
    const f = checkAcceptedAdrReferenced(records.filter((r) => (r.front.status as string) !== "accepted"), new Set());
    expect(f).toEqual([]);
  });

  it("collectAdrRefs 同时收集文档级与元素级 link", () => {
    const docs: CovenantDoc[] = [
      {
        covenant: "0.1",
        id: "t/a",
        profile: "c4-container@1",
        meta: { title: "t", purpose: "p", non_goals: [] },
        elements: [
          {
            id: "e.x",
            kind: "container",
            name: "X",
            summary: "s",
            links: [{ kind: "adr", ref: "0002" }],
          },
        ],
        links: [{ kind: "adr", ref: "0001" }],
      },
    ];
    const refs = collectAdrRefs(docs);
    expect(refs.has("0001")).toBe(true);
    expect(refs.has("0002")).toBe(true);
  });
});
