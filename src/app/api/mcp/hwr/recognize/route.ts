import { NextResponse } from "next/server";

import { recognizeHandwriting } from "@/lib/mcp/client";
import { HwrRecognizeRequestSchema } from "@/types/agent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const payload = HwrRecognizeRequestSchema.parse(body);
    const result = await recognizeHandwriting(payload);

    return NextResponse.json(result, {
      status: result.ok ? 200 : 502,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Handwriting recognition failed.",
      },
      { status: 400 },
    );
  }
}

