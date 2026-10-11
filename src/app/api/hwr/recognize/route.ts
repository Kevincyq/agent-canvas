import { NextResponse } from "next/server";
import { z } from "zod";

import { HWR_TOOL_ALIASES } from "@/lib/mcp/constants";
import { getDefaultToolGateway } from "@/lib/tools/registry";
import type { GatewayContext } from "@/types/tool-gateway";

export const runtime = "nodejs";

const WidgetRecognizeRequestSchema = z.object({
  strokes: z
    .array(z.array(z.object({ x: z.number(), y: z.number(), t: z.number() })).min(1))
    .min(1),
  mode: z.enum(["text", "math", "chemical", "structure", "general"]).default("text"),
  language: z.string().optional(),
});

function mapWidgetMode(mode: z.infer<typeof WidgetRecognizeRequestSchema>["mode"]): string {
  return mode === "general" ? "text" : mode;
}

function asFluxInkRecognizePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      success: false,
      error: "MCP recognition result was empty.",
    };
  }

  const record = value as Record<string, unknown>;

  if (record.success === false) {
    return record;
  }

  return {
    success: true,
    error: null,
    ...record,
  };
}

function systemGatewayContext(): GatewayContext {
  return {
    userId: "system",
    tenantId: "system",
    conversationId: "system",
    currentSurface: "canvas",
    selectedSourceIds: [],
    permissions: {},
  };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const payload = WidgetRecognizeRequestSchema.parse(body);
    const receipt = await getDefaultToolGateway().invoke(
      "fluxink",
      "recognize",
      {
        toolName: HWR_TOOL_ALIASES.recognizeHandwriting[0],
        strokes: payload.strokes,
        mode: mapWidgetMode(payload.mode),
        ...(payload.language ? { language: payload.language } : {}),
      },
      systemGatewayContext(),
    );

    const responseBody = asFluxInkRecognizePayload(receipt.data ?? receipt);

    return NextResponse.json(responseBody, {
      status: responseBody.success === false || !receipt.ok ? 502 : 200,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Handwriting recognition failed.",
      },
      { status: 400 },
    );
  }
}
