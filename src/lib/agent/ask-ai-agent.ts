import { Agent } from "@openai/agents";

import type { AgentContext } from "@/lib/agent/context";
import { askAiInputGuardrails, askAiOutputGuardrails } from "@/lib/agent/guardrails";
import { getProviderConfig } from "@/lib/agent/provider";
import { AskAiStructuredOutputSchema } from "@/lib/agent/result";

export const ASK_AI_AGENT_INSTRUCTIONS = `
你是 Ask AI Agent（Portal PoC）：普通问答、手写画布意图识别、以及处理手写识别后的续聊。
你必须通过 structured output 返回结果；不要输出 schema 外的解释文字。

目标：
1. 普通问答、格式化、解题、追问：message 写简短中文引导语，实质内容放在 blocks。
2. 用户明确要打开/新建手写画布时，suggestedActions 加入 open_handwriting_canvas。
3. 若消息已含手写识别结果并要求整理/解题/追问，直接回答，不要再打开画布。
4. 用户说“新开画布/重新手写”时可再次 open_handwriting_canvas，forceNew=true。
5. 不要编造 MCP 工具名；不要声称已写入待办/已创建待办，除非 evidence 含真实 Tool Receipt（当前 M2 无写工具）。
6. 函数图像：suggestedActions 用 render_chart + chartKind=function + chartExpression。
7. attachments 中 voice_transcript 是语音说明补充。
8. 流程图/思维导图用 mermaid block（diagramType=flowchart|mindmap）；结构图用 graph；表格用 table；公式用 latex；正文用 markdown。
9. 手写识别里的 quadrilateral/circle/line/arc 等是形状元数据，不是语义节点。
10. 多轮追问依赖 Session 历史，不要假设客户端会传 recentHistory。
11. status 通常为 ok；需要用户补充时用 needs_input；失败用 failed。
12. evidence / artifacts 没有真实来源时返回空数组。

blocks 字段约定：
- 不用的字段填 null。
- markdown/latex/mermaid/media 主要填 source；table 填 columns/rows；graph 填 nodes/edges。
`;

export function createAskAiAgent(providerModel?: string) {
  const model = providerModel ?? getProviderConfig().model;

  return new Agent<AgentContext, typeof AskAiStructuredOutputSchema>({
    name: "Ask AI Agent",
    model,
    instructions: ASK_AI_AGENT_INSTRUCTIONS,
    outputType: AskAiStructuredOutputSchema,
    inputGuardrails: askAiInputGuardrails,
    outputGuardrails: askAiOutputGuardrails,
  });
}

let askAiAgentSingleton: ReturnType<typeof createAskAiAgent> | null = null;

/** Reuse one Ask AI Agent instance across requests (tools/provider can be swapped later). */
export function getAskAiAgent() {
  if (!askAiAgentSingleton) {
    askAiAgentSingleton = createAskAiAgent();
  }
  return askAiAgentSingleton;
}

/** Test/spike helper to rebuild agent after provider changes. */
export function resetAskAiAgentForTests() {
  askAiAgentSingleton = null;
}
