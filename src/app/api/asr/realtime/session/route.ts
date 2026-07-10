import { NextResponse } from "next/server";

import { createAzureSpeechToken } from "@/lib/asr/create-azure-token";
import { getAsrConfig, isAsrConfigured } from "@/lib/asr/config";

export const runtime = "nodejs";

export async function POST() {
  try {
    const config = getAsrConfig();

    if (!isAsrConfigured(config)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing AZURE_STT_KEY or AZURE_STT_REGION for realtime transcription.",
        },
        { status: 501 },
      );
    }

    const session = await createAzureSpeechToken(config);

    return NextResponse.json({
      ok: true,
      ...session,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create Azure speech session.";

    console.error("[asr/realtime/session]", message);

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 502 },
    );
  }
}
