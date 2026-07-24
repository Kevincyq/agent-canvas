import { z } from "zod";

import { stripInlineSourceMentions, stripInlineSourcesFromBlocks } from "@/lib/content/strip-inline-sources";
import type { AgentAction, AgentResponse } from "@/types/agent";
import type { ContentBlock } from "@/types/content-block";

/**
 * Zod schema for SDK Agent `outputType`.
 * Avoid `.default()` / complex discriminated unions — Turing structured output is stricter.
 */
export const AskAiOutputStatusSchema = z.enum([
  "ok",
  "needs_input",
  "needs_approval",
  "failed",
]);

export const AskAiEvidenceSchema = z.object({
  id: z.string(),
  label: z.string(),
  source: z.string(),
});

export const AskAiArtifactRefSchema = z.object({
  id: z.string(),
  title: z.string(),
  artifactType: z.string(),
});

export const AskAiOutputBlockSchema = z.object({
  id: z.string(),
  type: z.enum(["markdown", "table", "mermaid", "latex", "graph", "media"]),
  title: z.string().nullable(),
  sourceFormat: z.string().nullable(),
  source: z.string().nullable(),
  diagramType: z.string().nullable(),
  columns: z.array(z.string()).nullable(),
  rows: z.array(z.array(z.string())).nullable(),
  nodes: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        x: z.number().nullable(),
        y: z.number().nullable(),
      }),
    )
    .nullable(),
  edges: z
    .array(
      z.object({
        source: z.string(),
        target: z.string(),
        label: z.string().nullable(),
      }),
    )
    .nullable(),
  alt: z.string().nullable(),
});

export const AskAiSuggestedActionSchema = z.object({
  type: z.enum([
    "open_handwriting_canvas",
    "open_meeting_workflow",
    "render_chart",
    "reply",
    "none",
  ]),
  mode: z.enum(["general", "structure"]).nullable(),
  language: z.string().nullable(),
  prompt: z.string().nullable(),
  forceNew: z.boolean().nullable(),
  chartKind: z.enum(["function", "line", "bar", "scatter"]).nullable(),
  chartTitle: z.string().nullable(),
  chartExpression: z.string().nullable(),
  replyMessage: z.string().nullable(),
  meetingId: z.string().nullable(),
});

export const AskAiStructuredOutputSchema = z.object({
  message: z.string(),
  status: AskAiOutputStatusSchema,
  blocks: z.array(AskAiOutputBlockSchema),
  evidence: z.array(AskAiEvidenceSchema),
  artifacts: z.array(AskAiArtifactRefSchema),
  suggestedActions: z.array(AskAiSuggestedActionSchema),
});

export type AskAiStructuredOutput = z.infer<typeof AskAiStructuredOutputSchema>;
export type AskAiOutputBlock = z.infer<typeof AskAiOutputBlockSchema>;
export type AskAiSuggestedAction = z.infer<typeof AskAiSuggestedActionSchema>;

function mapBlock(block: AskAiOutputBlock): ContentBlock | null {
  switch (block.type) {
    case "markdown":
      return {
        id: block.id,
        type: "markdown",
        sourceFormat: "markdown",
        title: block.title ?? undefined,
        source: block.source ?? "",
      };
    case "table":
      return {
        id: block.id,
        type: "table",
        sourceFormat: "table_json",
        title: block.title ?? undefined,
        columns: block.columns ?? [],
        rows: block.rows ?? [],
      };
    case "mermaid":
      return {
        id: block.id,
        type: "mermaid",
        sourceFormat: "mermaid",
        title: block.title ?? undefined,
        diagramType:
          block.diagramType === "flowchart" ||
          block.diagramType === "mindmap" ||
          block.diagramType === "architecture" ||
          block.diagramType === "gantt" ||
          block.diagramType === "sequence"
            ? block.diagramType
            : "other",
        source: block.source ?? "",
      };
    case "latex":
      return {
        id: block.id,
        type: "latex",
        sourceFormat: "latex",
        title: block.title ?? undefined,
        source: block.source ?? "",
      };
    case "graph":
      return {
        id: block.id,
        type: "graph",
        sourceFormat: "graph_json",
        title: block.title ?? undefined,
        nodes: (block.nodes ?? []).map((node) => ({
          id: node.id,
          label: node.label,
          x: node.x ?? undefined,
          y: node.y ?? undefined,
        })),
        edges: (block.edges ?? []).map((edge) => ({
          source: edge.source,
          target: edge.target,
          label: edge.label ?? undefined,
        })),
      };
    case "media":
      return {
        id: block.id,
        type: "media",
        sourceFormat: "svg",
        title: block.title ?? undefined,
        source: block.source ?? "",
        alt: block.alt ?? "AI 生成图像",
      };
    default:
      return null;
  }
}

function mapSuggestedAction(action: AskAiSuggestedAction): AgentAction | null {
  switch (action.type) {
    case "open_handwriting_canvas":
      return {
        type: "open_handwriting_canvas",
        mode: action.mode ?? "general",
        language: action.language ?? "",
        prompt: action.prompt ?? "",
        force_new: action.forceNew ?? true,
      };
    case "open_meeting_workflow":
      return {
        type: "open_meeting_workflow",
        meetingId: action.meetingId,
      };
    case "render_chart":
      if (action.chartKind === "function" && action.chartExpression) {
        return {
          type: "render_chart",
          spec: {
            kind: "function",
            title: action.chartTitle ?? undefined,
            expressions: [{ fn: action.chartExpression }],
          },
        };
      }
      if (
        (action.chartKind === "line" ||
          action.chartKind === "bar" ||
          action.chartKind === "scatter") &&
        action.chartTitle
      ) {
        return {
          type: "render_chart",
          spec: {
            kind: action.chartKind,
            title: action.chartTitle,
            series: [{ label: action.chartTitle, points: [{ x: 0, y: 0 }] }],
          },
        };
      }
      return null;
    case "reply":
      return {
        type: "reply",
        message: action.replyMessage ?? "",
      };
    case "none":
      return null;
    default:
      return null;
  }
}

export function structuredOutputToAgentResponse(
  output: AskAiStructuredOutput,
): AgentResponse {
  const blocks = stripInlineSourcesFromBlocks(
    output.blocks
      .map(mapBlock)
      .filter((block): block is ContentBlock => block !== null),
  );
  const actions = output.suggestedActions
    .map(mapSuggestedAction)
    .filter((action): action is AgentAction => action !== null);

  return {
    message: stripInlineSourceMentions(output.message),
    blocks,
    actions,
  };
}

export function createEmptyStructuredOutput(
  message: string,
  status: AskAiStructuredOutput["status"] = "ok",
): AskAiStructuredOutput {
  return {
    message,
    status,
    blocks: [],
    evidence: [],
    artifacts: [],
    suggestedActions: [],
  };
}
