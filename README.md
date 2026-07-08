# Canvas Agent MVP

一个可嵌入公司 Portal 的 Canvas Agent MCP demo。Web UI 提供 AI Chat 和手写画布，服务端 API 使用 OpenAI Agents JS 做意图识别，并通过 MCP client 连接 TCL FluxInk MCP server。当前 demo 聚焦一条链路：用户在 Chat 中通过对话唤起手写画布，画布嵌入到对应对话流里，停笔超过 1 秒自动识别并持续更新结构化结果，用户点击 Send 后把识别结果送入 AskAI 输入框，再由用户补充任务并发送给云端 AI。

## 技术栈

- Next.js + React + TypeScript
- OpenAI Agents JS
- MCP Streamable HTTP，SSE 作为探测兜底
- 原生 `<canvas>` 手写画布，停笔 debounce 后服务端提交 strokes 到 FluxInk HWR MCP tool。当前 demo 不是直接渲染 FluxInk 的 MCP App widget。

## 目录结构

```text
src/app/page.tsx                    Portal iframe 入口页面
src/app/api/agent/route.ts          Agent 对话 API
src/app/api/mcp/inspect/route.ts    MCP 连通性探测 API
src/app/api/mcp/hwr/open/route.ts   初始化 FluxInk HWR 画布
src/app/api/mcp/hwr/recognize/route.ts 提交手写 strokes 并识别
src/app/api/health/route.ts         健康检查 API
src/components/chat/ChatPanel.tsx   聊天 UI
src/components/canvas/HandwritingCanvas.tsx
src/lib/agent/agent.ts              OpenAI Agents JS 封装
src/lib/agent/intent.ts             意图识别输出解析和 fallback
src/lib/mcp/client.ts               MCP server 连接封装
src/lib/canvas/actions.ts           前端画布 action reducer
src/types/agent.ts                  前后端共享协议
```

## 环境变量

复制 `.env.example` 为 `.env.local` 后配置：

```bash
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4.1-mini
MCP_SERVER_URL=https://mcp.fluxink.ai/servers/d706699b03524ba6aa84423954c43f3f/mcp
MCP_SERVER_NAME=FluxInk TCL MCP
MCP_AUTH_TOKEN=
PORTAL_FRAME_ANCESTOR_ORIGIN=https://portal.company.com
```

`OPENAI_API_KEY` 未配置时，`/api/agent` 只使用本地 fallback 规则：仍可打开画布并验证 FluxInk MCP 识别，但不能完成云端 AskAI 问答。`MCP_AUTH_TOKEN` 只在服务端使用，不会暴露给浏览器。

## API

- `POST /api/agent`：接收用户消息、历史对话和画布摘要。手写/画布意图返回 `open_handwriting_canvas` action；普通 AskAI 问答在 `message` 中直接返回云端模型回答。
- `POST /api/mcp/hwr/open`：调用 MCP `show_handwriting_canvas`，初始化手写画布。
- `POST /api/mcp/hwr/recognize`：调用 MCP `recognize_handwriting`，提交本地 strokes 并返回识别文本。服务端会把本地 stroke payload 转成 FluxInk widget 使用的二维点数组 `Array<Array<{ x, y, t }>>`。
- `GET /api/mcp/inspect`：服务端探测 MCP server，返回 transport、工具列表、资源列表或错误。
- `GET /api/health`：部署健康检查。

## 当前交互

- 用户在对话框输入“打开手写画布”“我想手写数学公式”等意图。
- Agent 返回回复后，在这条回复下方嵌入手写画布，而不是切到独立工作区。
- 用户书写时不需要手动提交识别；停笔超过 1 秒后，前端自动调用 `/api/mcp/hwr/recognize` 并更新结构化结果。
- 画布支持全屏和回到对话两种显示态；回到对话后仍位于触发它的那条消息下方，用户可以继续聊天。
- 结构化结果区提供 `Copy` 和 `Send to AskAI`；`Send to AskAI` 会把当前识别结果填入底部 AskAI 输入框并聚焦输入框，不会直接替用户发送。
- 用户可以在 AskAI 输入框继续补充“帮我解这道题”“转换成 JSON”等任务，再点击发送给云端 AI；输入框 Enter 发送，Shift+Enter 换行。

## FluxInk 边界

- 当前画布 UI 是本项目的本地 React/native canvas 实现。
- MCP `show_handwriting_canvas` 用于确认 FluxInk HWR 画布工具可用并取得初始化信息；页面没有直接挂载 `ui://fluxink/fluxink-hwr-canvas.html`。
- 结构化识别结果来自 FluxInk MCP `recognize_handwriting` tool。本地服务端会把本地笔画转换成 FluxInk widget 使用的 `Array<Array<{ x, y, t }>>` 再提交。
- 与 Claude 中的效果差异主要来自 UI 宿主不同：Claude 直接承载 FluxInk MCP App widget，本 demo 使用本地 canvas 和本地结果区，因此工具栏、坐标采样、预处理和展示后处理不会完全一致。

## Portal iframe 嵌入

部署后将 Web URL 配置到 Portal iframe：

```html
<iframe
  src="https://agent-canvas.company.com"
  title="Canvas Agent"
  style="width: 100%; height: 720px; border: 0"
></iframe>
```

生产环境需要把 `PORTAL_FRAME_ANCESTOR_ORIGIN` 设置为 Portal origin，确保 CSP 允许被该 Portal 嵌入。

## 安全边界

- OpenAI 和 MCP 密钥只放在服务端环境变量。
- 浏览器只访问同源 Next.js API，不直接访问 MCP server。
- 当前 demo 只允许调用 HWR 相关 MCP tools，并兼容 `show_handwriting_canvas` / `fluxink-mcp-show-handwriting-canvas`、`recognize_handwriting` / `fluxink-mcp-recognize-handwriting` 两组工具名。
- 生产环境应继续补充审计日志、用户身份透传和更细粒度的 tool allowlist。
- Portal SSO 用户上下文如果需要透传，应由服务端验证后再映射成 MCP request header。

## 本地开发

按需安装依赖并启动开发服务：

```bash
npm install
npm run dev
```

本文件仅提供命令说明，当前实现过程没有自动安装依赖、编译或构建项目。

## 预发 / Demo 部署

GitLab push 后自动部署到独立预发服务器的完整步骤见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

流程摘要：

1. 预发服务器执行 `deploy/scripts/bootstrap-server.sh` 一次性初始化
2. 在 GitLab **Settings → CI/CD → Variables** 配置 `STAGING_HOST`、`STAGING_SSH_PRIVATE_KEY`、`TURING_API_KEY` 等
3. push 到 `main` 或 `feature/mcp-app-widget-host` 触发 Pipeline
4. 通过 `STAGING_PUBLIC_URL` 公网访问
