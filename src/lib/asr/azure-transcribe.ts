import type { AsrConfig } from "@/lib/asr/config";
import type { VoiceSegment } from "@/lib/voice/timeline";

type AzureNBestItem = {
  Display?: string;
  Lexical?: string;
  Confidence?: number;
};

type AzureDetailedResult = {
  RecognitionStatus?: string;
  DisplayText?: string;
  NBest?: AzureNBestItem[];
  Offset?: number;
  Duration?: number;
};

function ticksToMs(ticks: number | undefined): number {
  if (!Number.isFinite(ticks)) {
    return 0;
  }

  return Math.max(0, Math.round(ticks / 10000));
}

function pickTranscriptionText(payload: AzureDetailedResult): string {
  const displayText = typeof payload.DisplayText === "string" ? payload.DisplayText.trim() : "";
  if (displayText) {
    return displayText;
  }

  const best = payload.NBest?.[0];
  const fromBest =
    typeof best?.Display === "string"
      ? best.Display.trim()
      : typeof best?.Lexical === "string"
        ? best.Lexical.trim()
        : "";

  return fromBest;
}

function resolveSpeechContentType(mimeType: string): string {
  if (mimeType.includes("wav")) {
    return "audio/wav; codecs=audio/pcm; samplerate=16000";
  }

  return mimeType || "audio/wav; codecs=audio/pcm; samplerate=16000";
}

export async function transcribeWithAzure(
  config: AsrConfig,
  input: {
    bytes: ArrayBuffer;
    mimeType: string;
    captureStartMs: number;
  },
): Promise<{ text: string; segments: VoiceSegment[] }> {
  const url = new URL(
    `https://${config.azureRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`,
  );
  url.searchParams.set("language", config.azureLocale);
  url.searchParams.set("format", "detailed");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": config.azureKey,
      "Content-Type": resolveSpeechContentType(input.mimeType),
      Accept: "application/json;text/xml",
    },
    body: input.bytes,
  });

  const payload = (await response.json().catch(() => ({}))) as AzureDetailedResult;

  if (!response.ok) {
    throw new Error(
      typeof payload.RecognitionStatus === "string"
        ? payload.RecognitionStatus
        : `Azure speech transcription failed (${response.status}).`,
    );
  }

  const text = pickTranscriptionText(payload);

  if (!text) {
    return { text: "", segments: [] };
  }

  const startMs = input.captureStartMs + ticksToMs(payload.Offset);
  const endMs = startMs + ticksToMs(payload.Duration);

  return {
    text,
    segments: [
      {
        id: "cloud-azure-1",
        text,
        startMs,
        endMs: Math.max(startMs, endMs),
        source: "cloud_asr",
      },
    ],
  };
}
