# @covenant/mcp

## 职责
MCP stdio 服务：把 check/render/build/patch/apply/diff/index/brief/read_doc 暴露给外部 Agent（9 个工具）。

## 依赖
- 内部：core/validate/layout/render/patch/diff/indexer/ai
- 被依赖：无（对外进程入口）

## 公共接口
- `startServer()`、`SERVER_INFO`、工具注册表（`covenant_*`）

## 设计取舍
- 零第三方 MCP SDK：手写 JSON-RPC，减少供应链与版本风险。
- 错误结构化返回，不抛裸异常；工具名/参数保持稳定。

## 约束
- 不写文件（工具内部复用 CLI 能力时也必须只读或走门禁）。
- 不改变 `PROTOCOL_VERSION` 除非协议兼容性评审。