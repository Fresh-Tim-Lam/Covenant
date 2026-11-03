import yaml from "js-yaml";
import type { CovenantDoc, Finding, ParseResult } from "./types";

/**
 * YAML 锚点/别名禁令的启发式检测。
 * 只匹配「行首或空白后紧跟 &/* + 标识符」的 token，避免误伤 `e.*`、字符串中的运算符。
 */
const ANCHOR_RE = /(^|\s)[&*][A-Za-z_][\w-]*\s*(?=:|$|\s)/;

export function parseDocument(text: string, file: string): ParseResult {
  const findings: Finding[] = [];

  // L0-a：禁锚点/别名（H7「未知即错误」的一种）
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const stripped = line.replace(/#.*$/, "");
    const m = ANCHOR_RE.exec(stripped);
    if (m) {
      findings.push({
        code: "parse/anchor",
        level: "L0",
        severity: "error",
        message: `禁止 YAML 锚点/别名（检测到 "${m[2] ?? ""}"），请显式展开`,
        path: `${file}:${i + 1}`,
        fixHint: "删除 &name / *name，重复内容直接写出来",
      });
    }
  }
  if (findings.length > 0) return { findings };

  // L0-b：YAML 1.2 core schema（CORE_SCHEMA）
  // 关键：不使用 DEFAULT_SCHEMA，否则 ISO 时间戳会被解析成 Date 对象（GAP-03）
  let doc: unknown;
  try {
    doc = yaml.load(text, { filename: file, schema: yaml.CORE_SCHEMA });
  } catch (e) {
    const err = e as Error;
    findings.push({
      code: "parse/yaml",
      level: "L0",
      severity: "error",
      message: err.message.split("\n")[0] ?? "YAML 解析失败",
      path: file,
      fixHint: "检查缩进、冒号后空格、重复键、Tab 字符",
    });
    return { findings };
  }

  if (doc === null || doc === undefined) {
    findings.push({ code: "parse/empty", level: "L0", severity: "error", message: "文档为空", path: file });
    return { findings };
  }
  if (typeof doc !== "object" || Array.isArray(doc)) {
    findings.push({ code: "parse/not-object", level: "L0", severity: "error", message: "顶层必须是映射（mapping）", path: file });
    return { findings };
  }

  return { doc: doc as CovenantDoc, findings };
}
