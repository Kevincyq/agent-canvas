import { Agent } from "@openai/agents";

import type { AgentContext } from "@/lib/agent/context";
import { askAiInputGuardrails, askAiOutputGuardrails } from "@/lib/agent/guardrails";
import { getProviderConfig } from "@/lib/agent/provider";
import { AskAiStructuredOutputSchema } from "@/lib/agent/result";
import { createAskAiTools } from "@/lib/agent/tools/registry";
import { SEED_MEETING, SEED_PROJECT } from "@/lib/services/mock/fixtures";

export const ASK_AI_AGENT_INSTRUCTIONS = `
你是 Ask AI Agent（Portal PoC）：普通问答、项目检索、会议上下文、产物保存、手写画布意图识别。
你必须通过 structured output 返回最终结果；中间事实获取优先调用 tools。

可用工具：
- get_current_context
- get_project_context（种子项目 ${SEED_PROJECT.id} / ${SEED_PROJECT.name}）
- search_personal_knowledge
- search_web（PoC Mock）
- get_meeting_context（种子会议 ${SEED_MEETING.id}）
- save_artifact_to_project（可直接执行的写入，返回 Tool Receipt）
- create_todo（需要用户审批，M5 才会恢复；M3 组合任务请优先用 save_artifact_to_project）

规则：
1. 涉及项目事实、会议、知识库时，先调用至少一个 Read Tool，不要编造 Source。
2. 需要持久保存总结/方案时，调用 save_artifact_to_project，并把 receipt 写入 evidence（id 可用 executionId，source=tool_receipt:<tool>）。
3. 禁止在没有 Tool Receipt evidence 时声称“已写入待办/已创建待办/已保存到项目”。
4. 普通闲聊可不调用工具；手写画布意图用 suggestedActions.open_handwriting_canvas。
5. message 用简短中文引导；实质内容放 blocks（markdown/table/mermaid/latex/graph/media）。
6. status 通常 ok；需要用户补充用 needs_input；失败用 failed。
7. 多轮依赖 Session，不要假设客户端传 recentHistory。
8. 不用的 nullable 字段填 null；evidence/artifacts/suggestedActions 无内容时返回 []。
`;

export function createAskAiAgent(providerModel?: string) {
  const model = providerModel ?? getProviderConfig().model;

  return new Agent<AgentContext, typeof AskAiStructuredOutputSchema>({
    name: "Ask AI Agent",
    model,
    instructions: ASK_AI_AGENT_INSTRUCTIONS,
    outputType: AskAiStructuredOutputSchema,
    tools: createAskAiTools(),
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

/** Test/spike helper to rebuild agent after provider/tool changes. */
export function resetAskAiAgentForTests() {
  askAiAgentSingleton = null;
}
