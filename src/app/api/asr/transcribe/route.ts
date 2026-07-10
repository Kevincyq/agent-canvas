import { NextResponse } from "next/server";

import { transcribeWithAzure } from "@/lib/asr/azure-transcribe";
import { getAsrConfig, isAsrConfigured } from "@/lib/asr/config";
import { normalizeAudioForAsr } from "@/lib/asr/normalize-audio";

export const runtime = "nodejs";
export const maxDuration = 60;

const MIN_ASR_AUDIO_BYTES = 1200;

function parseTimelineMs(value: FormDataEntryValue | null, fallback: number): number {
  if (typeof value !== "string") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.includes("multipart/form-data") && !contentType.includes("application/x-www-form-urlencoded")) {
      return NextResponse.json(
        {
          ok: false,
          error: "Expected multipart form data with an audio file.",
        },
        { status: 400 },
      );
    }

    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File) || audio.size === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing audio file.",
        },
        { status: 400 },
      );
    }

    if (audio.size < MIN_ASR_AUDIO_BYTES) {
      return NextResponse.json(
        {
          ok: false,
          error: "Audio clip is too short for transcription.",
        },
        { status: 400 },
      );
    }

    const config = getAsrConfig();

    if (!isAsrConfigured(config)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Missing AZURE_STT_KEY or AZURE_STT_REGION.",
        },
        { status: 501 },
      );
    }

    const startMs = parseTimelineMs(formData.get("startMs"), 0);
    const endMs = parseTimelineMs(formData.get("endMs"), startMs);
    const bytes = await audio.arrayBuffer();
    const fileName = audio.name || "recording.webm";
    const mimeType = audio.type || "audio/webm";
    const normalizedAudio = await normalizeAudioForAsr(bytes, fileName, mimeType);

    const result = await transcribeWithAzure(config, {
      bytes: normalizedAudio.bytes,
      mimeType: normalizedAudio.mimeType,
      captureStartMs: startMs,
    });

    return NextResponse.json({
      ok: true,
      text: result.text,
      segments: result.segments,
      startMs,
      endMs: Math.max(startMs, endMs),
      provider: config.provider,
      language: config.azureLocale,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ASR transcription failed.";

    console.error("[asr/transcribe]", message);

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 502 },
    );
  }
}
