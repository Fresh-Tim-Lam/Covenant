/**
 * 补丁的文本级编辑（保留注释的唯一手段）。
 *
 * 为什么不"解析→改对象→dump"：会丢失注释，而设计理由就写在注释里。
 * 因此这些函数只做「追加块 / 改三行 / 删块 / rev+1」，其余字节一律不动。
 * 本文件不读写文件，也不判断补丁是否合法（那是 gate.ts 与 apply.ts 的职责）。
 */
import type { StatusOp } from "./parse";

const q = (v: unknown): string => JSON.stringify(v ?? "");

const ID_LINE = /^  - id:\s*"?([^"\s]+)"?\s*$/;
const STATUS_LINE = /^    status:\s*\S+\s*$/;

/** 单条批注 → YAML 文本块（JSON 字符串是合法的 YAML 双引号标量） */
export function annotationYaml(value: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`  - id: ${q(value.id)}`);
  lines.push(`    target: ${JSON.stringify(value.target ?? {})}`);
  lines.push(`    type: ${q(value.type)}`);
  lines.push(`    severity: ${q(value.severity)}`);
  lines.push(`    title: ${q(value.title)}`);
  if (value.body) lines.push(`    body: ${q(value.body)}`);
  lines.push(`    status: ${q(value.status)}`);
  lines.push(`    author: ${q(value.author)}`);
  lines.push(`    created: ${q(value.created)}`);
  if (value.ai_hint) lines.push(`    ai_hint: ${q(value.ai_hint)}`);
  return lines.join("\n");
}

/** 在 annotations 段落末尾追加文本块；无该段落则新建（保留其余字节） */
export function appendAnnotations(text: string, values: Record<string, unknown>[]): string {
  if (values.length === 0) return text;
  const block = values.map(annotationYaml).join("\n");
  const lines = text.split(/\r?\n/);

  // `annotations: []` → 展开为块序列
  const inline = lines.findIndex((l) => /^annotations:\s*\[\]\s*$/.test(l));
  if (inline >= 0) {
    lines[inline] = "annotations:";
    lines.splice(inline + 1, 0, block);
    return lines.join("\n");
  }

  const idx = lines.findIndex((l) => /^annotations:\s*$/.test(l));
  if (idx < 0) {
    return `${text.replace(/\s+$/, "")}\n\nannotations:\n${block}\n`;
  }

  // 段落 = 其后所有缩进行/空行/注释行；插在段落最后一个非空行之后
  let end = idx + 1;
  while (
    end < lines.length &&
    (lines[end] === "" || /^\s/.test(lines[end]!) || /^\s*#/.test(lines[end]!))
  ) {
    end++;
  }
  let insertAt = end;
  while (insertAt > idx + 1 && (lines[insertAt - 1] ?? "").trim() === "") insertAt--;
  return [...lines.slice(0, insertAt), block, ...lines.slice(insertAt)].join("\n");
}

/** 整块替换批注（文本级）：保留块外注释与其它批注，只重写目标块。 */
export function replaceAnnotationBlocks(
  text: string,
  edits: { id: string; value: Record<string, unknown> }[],
): string {
  if (edits.length === 0) return text;
  const lines = text.split(/\r?\n/);
  for (const edit of edits) {
    const start = lines.findIndex((l) => {
      const m = ID_LINE.exec(l);
      return m?.[1] === edit.id;
    });
    if (start < 0) continue;
    let end = start + 1;
    while (end < lines.length && !(ID_LINE.test(lines[end]!) || /^[A-Za-z_]/.test(lines[end]!))) end++;
    lines.splice(start, end - start, ...annotationYaml(edit.value).split("\n"));
  }
  return lines.join("\n");
}

/**
 * 删除批注块（文本级）：只删目标 `  - id:` 块，其余字节不动。
 * 若删空则规范化为 `annotations: []`，保证仍能通过 schema。
 */
export function removeAnnotationBlocks(text: string, ids: string[]): string {
  if (ids.length === 0) return text;
  const lines = text.split(/\r?\n/);
  for (const id of ids) {
    const start = lines.findIndex((l) => {
      const m = ID_LINE.exec(l);
      return m?.[1] === id;
    });
    if (start < 0) continue;
    let end = start + 1;
    while (end < lines.length && !(ID_LINE.test(lines[end]!) || /^[A-Za-z_]/.test(lines[end]!))) end++;
    lines.splice(start, end - start);
  }
  const annIdx = lines.findIndex((l) => /^annotations:\s*$/.test(l));
  if (annIdx >= 0) {
    let hasItem = false;
    for (let i = annIdx + 1; i < lines.length; i++) {
      const l = lines[i]!;
      if (/^[A-Za-z_]/.test(l)) break;
      if (/^  - id:/.test(l)) {
        hasItem = true;
        break;
      }
    }
    if (!hasItem) {
      // 只改这一行为空数组，保留段内注释（注释本身不是批注项）
      lines[annIdx] = "annotations: []";
    }
  }
  return lines.join("\n");
}

/** meta.rev += 1（只改这一行） */
export function bumpRev(text: string): string {
  const re = /^(\s+rev:\s*)(\d+)\s*$/m;
  if (!re.test(text)) return text;
  return text.replace(re, (_m, prefix: string, n: string) => `${prefix}${Number(n) + 1}`);
}

/**
 * 状态流转的文本编辑：只动目标批注块内的 status/updated/resolution 三行，
 * 其余字节（含注释、其他批注）保持不变。
 */
export function applyStatusChanges(
  text: string,
  changes: StatusOp[],
  by: string,
  at: string,
): string {
  if (changes.length === 0) return text;
  const lines = text.split(/\r?\n/);
  for (const c of changes) {
    const start = lines.findIndex((l) => {
      const m = ID_LINE.exec(l);
      return m?.[1] === c.id;
    });
    if (start < 0) continue;

    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^  - id:/.test(lines[i]!) || /^[A-Za-z_]/.test(lines[i]!)) {
        end = i;
        break;
      }
    }

    let si = -1;
    for (let i = start; i < end; i++) {
      if (STATUS_LINE.test(lines[i]!)) {
        si = i;
        break;
      }
    }
    if (si < 0) continue;
    lines[si] = `    status: ${JSON.stringify(c.status)}`;

    let ui = -1;
    for (let i = start; i < end; i++) {
      if (/^    updated:/.test(lines[i]!)) {
        ui = i;
        break;
      }
    }
    if (ui < 0) {
      lines.splice(si + 1, 0, `    updated: ${JSON.stringify(at)}`);
      end++;
      ui = si + 1;
    } else {
      lines[ui] = `    updated: ${JSON.stringify(at)}`;
    }

    const closing = c.status === "resolved" || c.status === "wontfix";
    let ri = -1;
    for (let i = start; i < end; i++) {
      if (/^    resolution:/.test(lines[i]!)) {
        ri = i;
        break;
      }
    }
    if (closing) {
      const line = `    resolution: ${JSON.stringify({ by, at })}`;
      if (ri < 0) {
        lines.splice(ui + 1, 0, line);
        end++;
      } else {
        lines[ri] = line;
      }
    } else if (ri >= 0) {
      lines.splice(ri, 1);
      end--;
    }
  }
  return lines.join("\n");
}


/** 元素 YAML 块（与 annotationYaml 类似，字段更少） */
export function elementYaml(value: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`  - id: ${value.id}`);
  lines.push(`    kind: ${value.kind}`);
  lines.push(`    name: ${value.name}`);
  if (value.summary) lines.push(`    summary: ${value.summary}`);
  if (value.tech) lines.push(`    tech: ${value.tech}`);
  if (value.impl_status) lines.push(`    impl_status: ${value.impl_status}`);
  if (Array.isArray(value.evidence) && value.evidence.length > 0) {
    lines.push(`    evidence:`);
    for (const ev of value.evidence) {
      lines.push(`      - kind: ${ev.kind}`);
      lines.push(`        path: ${ev.path}`);
      if (ev.lines) lines.push(`        lines: "${ev.lines}"`);
    }
  }
  if (value.props && typeof value.props === "object" && Object.keys(value.props).length > 0) {
    lines.push(`    props: ${JSON.stringify(value.props)}`);
  }
  return lines.join("\n");
}

export function appendElements(text: string, values: Record<string, unknown>[]): string {
  if (values.length === 0) return text;
  const block = values.map(elementYaml).join("\n");
  return insertUnderSection(text, "elements", block);
}

/** 关系条目 YAML：relation 必填 id/kind/from/to/summary（schema 顺序），可选 impl_status/props */
export function relationYaml(value: Record<string, unknown>): string {
  const lines: string[] = [];
  lines.push(`  - id: ${value.id}`);
  lines.push(`    kind: ${value.kind}`);
  lines.push(`    from: ${value.from}`);
  lines.push(`    to: ${value.to}`);
  if (value.summary) lines.push(`    summary: ${value.summary}`);
  if (value.impl_status) lines.push(`    impl_status: ${value.impl_status}`);
  if (value.props && typeof value.props === "object" && Object.keys(value.props).length > 0) {
    lines.push(`    props: ${JSON.stringify(value.props)}`);
  }
  return lines.join("\n");
}

/** 追加到 relations: 段。此前关系 add 被误用 appendElements 落进 elements 块（E9） */
export function appendRelations(text: string, values: Record<string, unknown>[]): string {
  if (values.length === 0) return text;
  const block = values.map(relationYaml).join("\n");
  return insertUnderSection(text, "relations", block);
}

/** 在顶层 `section:` 段内插入预序列化的块（保留段尾空行风格） */
function insertUnderSection(text: string, section: string, block: string): string {
  const lines = text.split(/\r?\n/);
  const idx = lines.findIndex((l) => new RegExp("^" + section + ":\\s*$").test(l));
  if (idx < 0) return text;
  let end = idx + 1;
  while (end < lines.length && (lines[end] === "" || /^\s/.test(lines[end]!) || /^\s*#/.test(lines[end]!))) end++;
  let insertAt = end;
  while (insertAt > idx + 1 && (lines[insertAt - 1] ?? "").trim() === "") insertAt--;
  return [...lines.slice(0, insertAt), block, ...lines.slice(insertAt)].join("\n");
}

export function removeNamedBlocks(text: string, section: string, ids: string[]): string {
  if (ids.length === 0) return text;
  const lines = text.split(/\r?\n/);
  const sectionIdx = lines.findIndex((l) => new RegExp("^" + section + ":\\s*$").test(l));
  if (sectionIdx < 0) return text;
  const removeSet = new Set(ids);
  const out: string[] = [];
  let skip = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (i >= sectionIdx && /^\s+- id: /.test(line)) {
      const m = line.match(/- id: (\S+)/);
      if (m && removeSet.has(m[1]!)) { skip = true; continue; }
      skip = false;
    } else if (skip && /^\s+- id: /.test(line)) {
      skip = false;
    } else if (skip && !/^\s/.test(line) && line.trim() !== "" && !/^\s*#/.test(line)) {
      skip = false;
    }
    if (!skip) out.push(line);
  }
  return out.join("\n");
}

