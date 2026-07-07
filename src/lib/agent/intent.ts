import {
  AgentResponseSchema,
  type AgentAction,
  type AgentRequest,
  type AgentResponse,
} from "@/types/agent";

export function stripJsonFence(value: string): string {
  const trimmed = value.trim();

  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  return trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
}

export function parseAgentResponse(rawOutput: string): AgentResponse {
  const parsed = JSON.parse(stripJsonFence(rawOutput)) as unknown;
  return AgentResponseSchema.parse(parsed);
}

export function createFallbackResponse(request: AgentRequest): AgentResponse {
  const text = request.message.toLowerCase();
  const actions: AgentAction[] = [];
  const isStructureIntent =
    text.includes("分子") ||
    text.includes("结构式") ||
    text.includes("化学结构") ||
    text.includes("molecule") ||
    text.includes("chemical structure") ||
    text.includes("smiles");

  if (
    text.includes("画布") ||
    text.includes("canvas") ||
    text.includes("白板") ||
    text.includes("手写") ||
    text.includes("写") ||
    text.includes("draw") ||
    text.includes("sketch") ||
    text.includes("math") ||
    text.includes("公式") ||
    text.includes("化学") ||
    isStructureIntent
  ) {
    actions.push({
      type: "open_handwriting_canvas",
      mode: isStructureIntent ? "structure" : "general",
      language: "",
      prompt: request.message,
      force_new: true,
    });
  }

  return {
    message:
      actions.length > 0
        ? "我已识别到手写输入意图，正在对话中打开手写画布。你可以直接书写，停笔后我会自动识别并更新结构化结果。"
        : "当前未配置 OPENAI_API_KEY，无法调用云端 AI 处理这个问题。请配置后重试；手写画布和 FluxInk MCP 识别链路仍可继续本地验证。",
    actions:
      actions.length > 0
        ? actions
        : [
            {
              type: "reply",
              message: "等待用户进一步说明任务。",
            },
          ],
  };
}

export function buildAgentPrompt(request: AgentRequest): string {
  return JSON.stringify(
    {
      task:
        "Return only a JSON object matching the required schema. Open handwriting canvas only for handwriting/canvas intent; otherwise answer the user as AskAI.",
      userMessage: request.message,
      recentHistory: request.history,
      canvas: request.canvas,
      outputContract: {
        message: "Short natural-language response for the user in Chinese.",
        actions: [
          {
            type: "reply | open_handwriting_canvas",
          },
        ],
      },
    },
    null,
    2,
  );
}
