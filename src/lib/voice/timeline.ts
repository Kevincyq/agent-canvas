import type { AgentAttachment } from "@/types/agent";

export type VoiceSegment = {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  source: "browser_interim" | "cloud_asr";
};

export type VoiceTranscriptPayload = {
  sessionId: string;
  transcript: string;
  segments: VoiceSegment[];
  startMs?: number;
  endMs?: number;
  source: "browser_interim" | "cloud_asr" | "mixed";
};

export function createVoiceTranscriptAttachment(
  payload: VoiceTranscriptPayload,
): AgentAttachment | null {
  const content = payload.transcript.trim();

  if (!content) {
    return null;
  }

  const segmentStart = payload.segments.find((segment) => Number.isFinite(segment.startMs))?.startMs;
  const segmentEnd = [...payload.segments]
    .reverse()
    .find((segment) => Number.isFinite(segment.endMs))?.endMs;

  return {
    id: "file",
    name: "attached file",
    kind: "voice_transcript",
    mimeType: "text/plain",
    content,
    createdAt: new Date().toISOString(),
    metadata: {
      sessionId: payload.sessionId,
      startMs: payload.startMs ?? segmentStart,
      endMs: payload.endMs ?? segmentEnd,
      segmentCount: payload.segments.length,
      source: payload.source,
    },
  };
}

