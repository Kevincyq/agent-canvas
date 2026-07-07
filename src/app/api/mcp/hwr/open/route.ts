import { NextResponse } from "next/server";

import { openHandwritingCanvas } from "@/lib/mcp/client";
import { HwrOpenRequestSchema } from "@/types/agent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const payload = HwrOpenRequestSchema.parse(body);
    const result = await openHandwritingCanvas(payload);

    return NextResponse.json(result, {
      status: result.ok ? 200 : 502,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "HWR canvas initialization failed.",
      },
      { status: 400 },
    );
  }
}

