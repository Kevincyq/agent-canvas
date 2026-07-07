import { Agent, connectMcpServers, run } from "@openai/agents";

import { getOptionalEnv } from "@/lib/env";
import { buildAgentPrompt, createFallbackResponse, parseAgentResponse } from "@/lib/agent/intent";
import { createStreamableHttpMcpServer } from "@/lib/mcp/client";
import type { AgentRequest, AgentResponse } from "@/types/agent";

type ConnectedMcpServers = {
  active: unknown[];
  close: () => Promise<void>;
};

const AGENT_INSTRUCTIONS = `
你是一个 AskAI + Canvas Agent，用于普通问答和连接 FluxInk MCP handwriting recognition demo。
你必须只输出 JSON，不要输出 Markdown，不要解释 schema。

目标：
1. 识别用户是否只是普通问答；如果是，直接在 message 中回答用户。
2. 识别用户是否要手写、绘制、草图、写数学公式、写化学公式、画分子结构或输入手写内容。
3. 如果用户需要手写输入，返回 open_handwriting_canvas action。
4. 如果用户已经把手写识别结果放进输入框，并要求解题、分析、整理、转换格式或继续处理，应直接回答，不要再次打开画布。
5. 不要直接编造或调用任意 MCP 工具名。

输出必须符合：
{
  "message": "给用户看的中文回复。普通问答时这里就是完整回答；打开画布时这里是短回复",
  "actions": [
    { "type": "reply", "message": "..." },
    {
      "type": "open_handwriting_canvas",
      "mode": "general",
      "language": "",
      "prompt": "用户原始请求",
      "force_new": true
    }
  ]
}

mode 规则：
- 默认使用 "general"。
- 用户明确说化学结构、分子结构、SMILES、molecule、chemical structure 时使用 "structure"。

普通问答规则：
- actions 返回 []。
- 用中文回答。
- 数学内容可使用 LaTeX。
`;

async function connectMcpForAgent(): Promise<ConnectedMcpServers | null> {
  try {
    return (await connectMcpServers([createStreamableHttpMcpServer()] as never[], {
      connectInParallel: true,
    })) as ConnectedMcpServers;
  } catch {
    return null;
  }
}

export async function runCanvasAgent(request: AgentRequest): Promise<AgentResponse> {
  if (!process.env.OPENAI_API_KEY) {
    return createFallbackResponse(request);
  }

  const connectedServers = await connectMcpForAgent();

  try {
    const agent = new Agent({
      name: "Canvas Agent Intent Router",
      model: getOptionalEnv("OPENAI_MODEL", "gpt-4.1-mini"),
      instructions: AGENT_INSTRUCTIONS,
      mcpServers: (connectedServers?.active ?? []) as never[],
    });

    const result = await run(agent, buildAgentPrompt(request));
    return parseAgentResponse(String(result.finalOutput ?? ""));
  } catch (error) {
    const fallback = createFallbackResponse(request);

    return {
      ...fallback,
      message:
        error instanceof Error
          ? `模型意图识别失败，已使用本地 fallback：${error.message}`
          : "模型意图识别失败，已使用本地 fallback。",
    };
  } finally {
    await connectedServers?.close().catch(() => undefined);
  }
}
