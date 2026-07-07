import { z } from "zod";

export const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
  t: z.number().optional(),
});

export const HwrModeSchema = z.enum(["general", "structure"]);
export const HwrRecognitionModeSchema = z.enum(["text", "math", "chemical", "structure"]);

export const CanvasOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("add_text"),
    id: z.string().optional(),
    text: z.string(),
    x: z.number(),
    y: z.number(),
  }),
  z.object({
    type: z.literal("add_stroke"),
    id: z.string().optional(),
    points: z.array(PointSchema).min(1),
    color: z.string().optional(),
    width: z.number().positive().optional(),
  }),
  z.object({
    type: z.literal("clear"),
  }),
  z.object({
    type: z.literal("highlight"),
    targetId: z.string(),
  }),
]);

export const AgentActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("reply"),
    message: z.string(),
  }),
  z.object({
    type: z.literal("open_handwriting_canvas"),
    mode: HwrModeSchema.default("general"),
    language: z.string().default(""),
    prompt: z.string(),
    force_new: z.boolean().default(true),
  }),
]);

export const AgentRequestSchema = z.object({
  message: z.string().min(1),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .default([]),
  canvas: z
    .object({
      isOpen: z.boolean(),
      strokeCount: z.number().int().nonnegative(),
      textCount: z.number().int().nonnegative(),
      selectedElementId: z.string().nullable(),
    })
    .optional(),
});

export const AgentResponseSchema = z.object({
  message: z.string(),
  actions: z.array(AgentActionSchema),
});

export const HwrOpenRequestSchema = z.object({
  mode: HwrModeSchema.default("general"),
  language: z.string().default(""),
  prompt: z.string().min(1),
  force_new: z.boolean().default(true),
});

export const HwrOpenResponseSchema = z.object({
  ok: z.boolean(),
  type: z.string().optional(),
  reuse: z.boolean().optional(),
  mode: HwrModeSchema.optional(),
  language: z.string().optional(),
  prompt: z.string().optional(),
  apiBaseUrl: z.string().optional(),
  message: z.string().optional(),
  toolName: z.string().optional(),
  error: z.string().optional(),
});

export const HandwritingStrokeSchema = z.object({
  points: z.array(PointSchema).min(1),
  width: z.number().positive().optional(),
  color: z.string().optional(),
});

export const HandwritingPayloadSchema = z.object({
  strokes: z.array(HandwritingStrokeSchema).min(1),
  canvas: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    devicePixelRatio: z.number().positive(),
  }),
});

export const HwrRecognizeRequestSchema = z.object({
  strokes: HandwritingPayloadSchema,
  mode: HwrModeSchema.default("general"),
  recognitionMode: HwrRecognitionModeSchema.optional(),
  language: z.string().default(""),
});

export const HwrRecognizeResponseSchema = z.object({
  ok: z.boolean(),
  text: z.string().optional(),
  rawResult: z.unknown().optional(),
  toolName: z.string().optional(),
  error: z.string().optional(),
});

export type Point = z.infer<typeof PointSchema>;
export type HwrMode = z.infer<typeof HwrModeSchema>;
export type HwrRecognitionMode = z.infer<typeof HwrRecognitionModeSchema>;
export type CanvasOperation = z.infer<typeof CanvasOperationSchema>;
export type AgentAction = z.infer<typeof AgentActionSchema>;
export type AgentRequest = z.infer<typeof AgentRequestSchema>;
export type AgentResponse = z.infer<typeof AgentResponseSchema>;
export type HwrOpenRequest = z.infer<typeof HwrOpenRequestSchema>;
export type HwrOpenResponse = z.infer<typeof HwrOpenResponseSchema>;
export type HandwritingPayload = z.infer<typeof HandwritingPayloadSchema>;
export type HwrRecognizeRequest = z.infer<typeof HwrRecognizeRequestSchema>;
export type HwrRecognizeResponse = z.infer<typeof HwrRecognizeResponseSchema>;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};
