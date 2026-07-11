import {
  AgentResponseSchema,
  type AgentAction,
  type AgentRequest,
  type AgentResponse,
} from "@/types/agent";
import { tryBuildPlotSpecFromMessage } from "@/lib/plot/fallback";

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

  const plotSpec = tryBuildPlotSpecFromMessage(request.message);

  if (plotSpec) {
    return {
      message: plotSpec.kind === "function"
        ? `已根据请求绘制函数图像。${plotSpec.title ? `（${plotSpec.title}）` : ""}`
        : "已识别图表请求，但当前 fallback 仅支持 f(x)=... 形式的函数图。",
      actions: plotSpec.kind === "function" ? [{ type: "render_chart", spec: plotSpec }] : [],
    };
  }

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
        : "当前未配置 TURING_API_KEY 或 OPENAI_API_KEY，无法调用云端 AI。请配置后重试；手写画布和 FluxInk MCP 识别链路仍可继续本地验证。",
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
      attachments: request.attachments.map((attachment) => ({
        id: attachment.id,
        name: attachment.name,
        kind: attachment.kind,
        mimeType: attachment.mimeType,
        content: attachment.content,
        metadata: attachment.metadata,
      })),
      outputContract: {
        message: "Short natural-language response for the user in Chinese.",
        actions: [
          {
            type: "reply | open_handwriting_canvas | render_chart | render_svg",
          },
        ],
        renderChartExamples: {
          function: {
            type: "render_chart",
            spec: {
              kind: "function",
              title: "f(x) = 5x^2 + 1",
              xDomain: [-3, 3],
              expressions: [{ fn: "5 * x^2 + 1", domain: [-3, 3], label: "f(x)" }],
            },
          },
          bar: {
            type: "render_chart",
            spec: {
              kind: "bar",
              title: "季度销售额",
              xAxisLabel: "季度",
              yAxisLabel: "销售额",
              series: [
                {
                  label: "2025",
                  points: [
                    { x: 1, y: 100 },
                    { x: 2, y: 120 },
                    { x: 3, y: 90 },
                    { x: 4, y: 150 },
                  ],
                },
              ],
            },
          },
        },
        renderSvgExample: {
          type: "render_svg",
          spec: {
            title: "项目结构图",
            alt: "中心节点 Project 分别连接 A、B、C 三个子节点",
            svg: '<svg viewBox="0 0 640 360" xmlns="http://www.w3.org/2000/svg"><circle cx="160" cy="180" r="60" fill="none" stroke="#2563eb"/><text x="160" y="185" text-anchor="middle">Project</text></svg>',
          },
        },
      },
    },
    null,
    2,
  );
}
