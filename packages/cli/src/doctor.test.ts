import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkNode,
  checkVersions,
  checkSchemaJson,
  compareVersions,
  runDoctor,
  scanBom,
} from "./doctor";

describe("doctor：版本比较", () => {
  it("compareVersions 处理 v 前缀与长度差异", () => {
    expect(compareVersions("v22.10.0", "22.9.0")).toBe(1);
    expect(compareVersions("22.0.0", "22.0.0")).toBe(0);
    expect(compareVersions("18.19.0", "22.0.0")).toBe(-1);
    expect(compareVersions("22", "22.0.1")).toBe(-1);
  });

  it("Node < 22 判 fail", () => {
    expect(checkNode("18.19.0").status).toBe("fail");
    expect(checkNode("22.1.0").status).toBe("ok");
  });
});

describe("doctor：schema 与 BOM", () => {
  it("合法 JSON 通过；带 BOM 判 fail", () => {
    const dir = mkdtempSync(join(tmpdir(), "covenant-doctor-"));
    const good = join(dir, "good.json");
    const bad = join(dir, "bad.json");
    writeFileSync(good, JSON.stringify({ a: 1 }));
    writeFileSync(bad, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("{}")]));
    expect(checkSchemaJson(good).status).toBe("ok");
    expect(checkSchemaJson(bad).status).toBe("fail");
    expect(checkSchemaJson(join(dir, "missing.json")).status).toBe("fail");
  });

  it("scanBom 只报文本文件", () => {
    const dir = mkdtempSync(join(tmpdir(), "covenant-doctor-bom-"));
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "a.md"), "ok");
    writeFileSync(join(dir, "sub", "b.ts"), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("x")]));
    writeFileSync(join(dir, "c.png"), Buffer.from([0xef, 0xbb, 0xbf, 0x00]));
    const files = scanBom(dir);
    expect(files).toEqual(["sub/b.ts"]);
  });
});

describe("doctor：整体报告", () => {
  it("本仓库诊断不出现 fail", () => {
    const report = runDoctor(process.cwd());
    const fails = report.results.filter((r) => r.status === "fail");
    expect(fails).toEqual([]);
    const ids = report.results.map((r) => r.id);
    expect(ids).toContain("schema");
    expect(ids).toContain("index");
    expect(ids).toContain("bom");
  });

  it("空目录诊断失败（缺锁文件/workspace/schema）", () => {
    const dir = mkdtempSync(join(tmpdir(), "covenant-doctor-empty-"));
    const report = runDoctor(dir);
    expect(report.ok).toBe(false);
    expect(report.results.some((r) => r.id === "lockfile" && r.status === "fail")).toBe(true);
  });

describe("doctor：版本一致性", () => {
  it("本仓库版本一致", () => {
    expect(checkVersions(process.cwd()).status).toBe("ok");
  });

  it("工作区包版本漂移 → fail", () => {
    const dir = mkdtempSync(join(tmpdir(), "covenant-doctor-ver-"));
    mkdirSync(join(dir, "packages", "p1"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "root", version: "0.1.0" }));
    writeFileSync(join(dir, "packages", "p1", "package.json"), JSON.stringify({ name: "p1", version: "0.0.9" }));
    const r = checkVersions(dir);
    expect(r.status).toBe("fail");
    expect(r.message).toContain("p1");
  });
});
});
