# Canvas Agent MVP

一个可嵌入公司 Portal 的 Canvas Agent MCP demo。Web UI 提供 AI Chat、FluxInk 手写画布和语音说明录入，服务端 API 使用 OpenAI Agents JS 做意图识别，并通过 MCP client 连接 TCL FluxInk MCP server。当前 demo 聚焦一条链路：用户在 Chat 中通过对话唤起手写画布，画布嵌入到对应对话流里，停笔后由 FluxInk widget 自动识别结构化结果；语音录音由浏览器 Azure Speech SDK 实时转写，转写内容作为 `attached file` 附件，手写结构化内容作为 AskAI prompt 发送给云端 AI。

## 技术栈

- Next.js + React + TypeScript
- OpenAI Agents JS
- MCP Streamable HTTP，SSE 作为探测兜底
- FluxInk MCP App widget 手写画布，由浏览器 MCP Apps Host 嵌入 `ui://fluxink/fluxink-hwr-canvas.html`
- Azure Speech SDK 浏览器实时 ASR + 服务端 STS token 签发

## 目录结构

```text
src/app/page.tsx                    Portal iframe 入口页面
src/app/api/agent/route.ts          Agent 对话 API
src/app/api/asr/realtime/session/route.ts Azure Speech STS token 签发
src/app/api/mcp/inspect/route.ts    MCP 连通性探测 API
src/app/api/mcp/host/route.ts       MCP Apps Host JSON-RPC proxy
src/app/api/mcp/ui-resource/route.ts FluxInk widget UI resource proxy
src/app/api/hwr/recognize/route.ts  FluxInk widget http-first 识别代理
src/app/api/health/route.ts         健康检查 API
src/components/chat/ChatPanel.tsx   聊天 UI
src/components/canvas/FluxInkWidgetHost.tsx
src/components/voice/VoiceRecorder.tsx
src/lib/agent/agent.ts              OpenAI Agents JS 封装
src/lib/agent/intent.ts             意图识别输出解析和 fallback
src/lib/mcp/client.ts               MCP server 连接封装
src/lib/voice/timeline.ts           语音转写 timeline 与附件生成
src/types/agent.ts                  前后端共享协议
```

## 环境变量

复制 `.env.example` 为 `.env.local` 后配置（预发环境变量由 GitLab CI 注入，见 `.env.staging.example`）：

```bash
TURING_API_BASE=https://live-turing.cn.llm.tcljd.com/api/v1
TURING_API_KEY=
TURING_MODEL=turing/gpt-5.5
TAVILY_API_KEY=
WEB_SEARCH_TIMEOUT_MS=15000
WEB_SEARCH_MAX_RESULTS=5
AZURE_STT_KEY=
AZURE_STT_REGION=eastasia
ASR_LANGUAGE_CODE=zh
MCP_SERVER_URL=https://mcp.fluxink.ai/servers/d706699b03524ba6aa84423954c43f3f/mcp
MCP_SERVER_NAME=FluxInk TCL MCP
MCP_AUTH_TOKEN=
PORTAL_FRAME_ANCESTOR_ORIGIN=https://ai.eaglelab.tcl.com https://ai.tcl.com
```

`TURING_API_KEY` 未配置时，AskAI 只能使用本地 fallback，不能完成真实 AI 问答。`TAVILY_API_KEY` 是真实 Web Search 的服务端凭据；未配置时搜索工具会明确失败，不会回退到 Mock 搜索结果。
云端实时 ASR 使用 Azure Speech Services（`AZURE_STT_KEY` + `AZURE_STT_REGION`）。服务端 `POST /api/asr/realtime/session` 签发短时 STS token，浏览器通过 Azure Speech SDK 直连麦克风做连续识别。

## API

- `POST /api/agent`：接收用户消息、历史对话和画布摘要。手写/画布意图返回 `open_handwriting_canvas` action；普通 AskAI 问答在 `message` 中直接返回云端模型回答。
- `POST /api/asr/realtime/session`：签发 Azure Speech STS token（实时 ASR）。
- `POST /api/mcp/host`：MCP Apps Host allowlist JSON-RPC proxy，用于 FluxInk widget 调用 tools/resources。
- `GET /api/mcp/ui-resource`：读取 FluxInk MCP App widget HTML resource。
- `POST /api/hwr/recognize`：FluxInk widget 的 same-origin recognition proxy，用于规避生产域名 CORS 限制。
- `GET /api/mcp/inspect`：服务端探测 MCP server，返回 transport、工具列表、资源列表或错误。
- `GET /api/health`：部署健康检查。

## 当前交互

- 用户在对话框输入“打开手写画布”“我想手写数学公式”等意图。
- Agent 返回回复后，在这条回复下方嵌入手写画布，而不是切到独立工作区。
- 用户书写时不需要手动提交识别；FluxInk widget 在停笔后自动识别并通过 AppBridge 把结构化结果回填到底部 AskAI 输入框。
- 用户可在画布下方录入语音说明；浏览器通过 Azure Speech SDK 做实时 ASR，转写文本作为 `attached file` 附件预览。
- 画布支持全屏和回到对话两种显示态；回到对话后仍位于触发它的那条消息下方，用户可以继续聊天。
- AskAI 输入框只显示手写结构化内容；语音转写在附件预览区展示。发送时，手写内容作为 prompt，语音转写作为 attachment 传给云端 AI。
- 用户可以在 AskAI 输入框继续补充“帮我解这道题”“转换成 JSON”等任务，再点击发送给云端 AI；输入框 Enter 发送，Shift+Enter 换行。

## FluxInk 边界

- 当前画布 UI 直接来自 FluxInk MCP App widget resource，宿主由本项目实现。
- 结构化识别结果来自 FluxInk widget 调用的 MCP recognition 链路；生产域名通过 same-origin `/api/hwr/recognize` 代理规避 CORS 限制。
- 与 Claude 中的效果差异主要来自宿主能力、浏览器环境、AppBridge 实现和 Claude 产品层的展示后处理，不代表 FluxInk 识别引擎不同。

## Portal iframe 嵌入

部署后将 Web URL 配置到 Portal iframe：

```html
<iframe
  src="https://dralk-demo.tcljd.com"
  title="Canvas Agent"
  style="width: 100%; height: 720px; border: 0"
></iframe>
```

生产环境需要把 `PORTAL_FRAME_ANCESTOR_ORIGIN` 设置为 Portal origin，确保 CSP 允许被该 Portal 嵌入；多个 origin 使用空格或逗号分隔。Docker 构建阶段未注入该变量时，预发默认允许 `https://ai.eaglelab.tcl.com` 和 `https://ai.tcl.com`。

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

预发环境：**https://dralk-demo.tcljd.com**  
GitLab 仓库：`https://eaglelab-gitlab.tcljd.com/yangqin.chen/agent_canvas`（仅作代码版本管理）

### 发布流程（本地部署，不用 GitLab CI）

```bash
# 1. push 代码到 GitLab
git push origin feature/mcp-app-widget-host

# 2. 本地一键部署到预发服务器
cp deploy/deploy.env.example deploy/deploy.env   # 首次
pnpm run deploy:staging
```

流程：`rsync` 代码 → 上传 `.env.local` → 服务器 `docker build` + `docker compose up` → Nginx HTTPS 反代。

### 首次准备

```bash
cp deploy/deploy.env.example deploy/deploy.env
# 配置 SSH_KEY、STAGING_HOST 等；确保 .env.local 已填写 TURING_API_KEY
```

服务器 Nginx/TLS 与 Docker 初始化见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

### 验证

```bash
curl -s https://dralk-demo.tcljd.com/api/health
```
