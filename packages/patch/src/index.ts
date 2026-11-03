/**
 * @covenant/patch 公共入口：只做 re-export，不放业务逻辑。
 *
 * 目录契约（docs/conventions/module-ownership.md §2）：
 *   parse.ts  补丁模型 + JSON 解析 + 操作分类（最底层，无同目录依赖）
 *   text.ts   文本级编辑（追加/状态流转/删除/rev+1，保留注释，不读写文件）
 *   audit.ts  write-ahead 审计与哈希（sha256/audit 为内部实现，不对外导出）
 *   gate.ts   信任边界门禁（纯函数，不写盘）
 *   apply.ts  编排：前置校验 + text 编辑 + 复验后原子替换
 */
export type { Patch, PatchOp, StatusOp } from "./parse";
export { classifyOps, parsePatch } from "./parse";

export type { Actor, GateOptions } from "./gate";
export { gatePatch, parseActor } from "./gate";

export type { ApplyOptions, ApplyResult } from "./apply";
export { applyPatch } from "./apply";

/** 文本层辅助（barrel 也导出，测试直接覆盖）；removeAnnotationBlocks 仅模块内导出 */
export { annotationYaml, appendAnnotations, applyStatusChanges, bumpRev } from "./text";
