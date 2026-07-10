"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import { VOICE_ATTACHMENT_NAME } from "@/lib/voice/composer-sync";
import { startAzureRealtimeAsr, type AzureRealtimeAsrHandle } from "@/lib/voice/azure-realtime-asr";
import type { VoiceSegment, VoiceTranscriptPayload } from "@/lib/voice/timeline";

type VoiceRecorderProps = {
  sessionId: string;
  disabled?: boolean;
  compact?: boolean;
  getElapsedMs: () => number;
  onTranscriptChange: (payload: VoiceTranscriptPayload) => void;
};

export type VoiceRecorderHandle = {
  stopAndFlush: () => VoiceTranscriptPayload | null;
  isRecording: () => boolean;
};

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function buildTranscript(segments: VoiceSegment[], interimText: string): string {
  const fromSegments = segments
    .slice()
    .sort((left, right) => left.startMs - right.startMs)
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return [fromSegments, interimText.trim()].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function buildPayload(
  sessionId: string,
  segments: VoiceSegment[],
  interimText: string,
): VoiceTranscriptPayload | null {
  const transcript = buildTranscript(segments, interimText);

  if (!transcript) {
    return null;
  }

  return {
    sessionId,
    transcript,
    segments,
    startMs: segments[0]?.startMs,
    endMs: segments[segments.length - 1]?.endMs,
    source: "cloud_asr",
  };
}

export const VoiceRecorder = forwardRef<VoiceRecorderHandle, VoiceRecorderProps>(function VoiceRecorder(
  { sessionId, disabled = false, compact = false, getElapsedMs, onTranscriptChange },
  ref,
) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [cloudSegments, setCloudSegments] = useState<VoiceSegment[]>([]);
  const [cloudInterimTranscript, setCloudInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recordingRef = useRef(false);
  const recordingStartMsRef = useRef(0);
  const elapsedTimerRef = useRef<number | null>(null);
  const cloudSegmentsRef = useRef<VoiceSegment[]>([]);
  const cloudInterimRef = useRef("");
  const realtimeHandleRef = useRef<AzureRealtimeAsrHandle | null>(null);

  const visibleTranscript = useMemo(
    () => buildTranscript(cloudSegments, cloudInterimTranscript),
    [cloudInterimTranscript, cloudSegments],
  );

  const microphoneSupported = useMemo(
    () => typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia),
    [],
  );

  const emitTranscript = useCallback(
    (nextSegments: VoiceSegment[], interimText: string, immediate = false) => {
      const payload = buildPayload(sessionId, nextSegments, interimText);

      if (!payload) {
        return null;
      }

      if (immediate) {
        onTranscriptChange(payload);
      } else {
        queueMicrotask(() => {
          onTranscriptChange(payload);
        });
      }

      return payload;
    },
    [onTranscriptChange, sessionId],
  );

  const appendCloudSegment = useCallback(
    (segment: VoiceSegment) => {
      const merged = [...cloudSegmentsRef.current, segment].sort((left, right) => left.startMs - right.startMs);
      cloudSegmentsRef.current = merged;
      setCloudSegments(merged);
      setCloudInterimTranscript("");
      emitTranscript(merged, "");
      setError(null);
    },
    [emitTranscript],
  );

  const stopRecording = useCallback(
    (immediate = false) => {
      if (!recordingRef.current && !realtimeHandleRef.current) {
        return buildPayload(sessionId, cloudSegmentsRef.current, cloudInterimRef.current);
      }

      realtimeHandleRef.current?.stop();
      realtimeHandleRef.current = null;
      recordingRef.current = false;
      setRecording(false);
      setTranscribing(false);

      if (elapsedTimerRef.current !== null) {
        window.clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }

      return emitTranscript(cloudSegmentsRef.current, cloudInterimRef.current, immediate);
    },
    [emitTranscript, sessionId],
  );

  useImperativeHandle(
    ref,
    () => ({
      stopAndFlush: () => stopRecording(true),
      isRecording: () => recordingRef.current,
    }),
    [stopRecording],
  );

  const startRecording = useCallback(async () => {
    if (!microphoneSupported || disabled || recordingRef.current) {
      return;
    }

    setError(null);
    setCloudSegments([]);
    setCloudInterimTranscript("");
    cloudSegmentsRef.current = [];
    cloudInterimRef.current = "";

    try {
      recordingStartMsRef.current = getElapsedMs();
      recordingRef.current = true;
      setRecording(true);
      setElapsedMs(0);
      elapsedTimerRef.current = window.setInterval(() => {
        setElapsedMs(getElapsedMs() - recordingStartMsRef.current);
      }, 250);

      const handle = await startAzureRealtimeAsr({
        getElapsedMs,
        onInterim: (text) => {
          cloudInterimRef.current = text;
          setCloudInterimTranscript(text);
          emitTranscript(cloudSegmentsRef.current, text);
        },
        onSegment: appendCloudSegment,
        onActiveChange: setTranscribing,
        onError: (message) => {
          if (!cloudSegmentsRef.current.length && !cloudInterimRef.current.trim()) {
            setError(message);
            return;
          }

          console.warn("[voice-asr]", message);
        },
      });

      realtimeHandleRef.current = handle;
    } catch (startError) {
      stopRecording(true);
      setError(startError instanceof Error ? startError.message : "无法启动实时语音转写，请检查麦克风与 Azure STT 配置。");
    }
  }, [appendCloudSegment, disabled, emitTranscript, getElapsedMs, microphoneSupported, stopRecording]);

  const clearTranscript = useCallback(() => {
    if (recordingRef.current) {
      return;
    }

    setCloudSegments([]);
    setCloudInterimTranscript("");
    setError(null);
    cloudSegmentsRef.current = [];
    cloudInterimRef.current = "";
    onTranscriptChange({
      sessionId,
      transcript: "",
      segments: [],
      source: "cloud_asr",
    });
  }, [onTranscriptChange, sessionId]);

  useEffect(
    () => () => {
      stopRecording(true);
    },
    [stopRecording],
  );

  const statusText = recording
    ? transcribing
      ? "实时转写中"
      : "连接中"
    : visibleTranscript
      ? "已转写"
      : "待录音";

  return (
    <section
      className={compact ? "voice-panel voice-panel-compact" : "voice-panel"}
      aria-label="语音输入"
    >
      <div className="voice-panel-header">
        <div>
          <p className="eyebrow">Voice input</p>
          <h3>语音说明</h3>
        </div>
        <span className={recording ? "voice-status recording" : "voice-status"}>{statusText}</span>
      </div>

      <div className="voice-controls">
        <button
          type="button"
          className={recording ? "voice-button danger" : "voice-button primary"}
          disabled={disabled || !microphoneSupported}
          onClick={recording ? () => stopRecording(true) : startRecording}
        >
          {recording ? "停止录音" : "开始录音"}
        </button>
        <button type="button" className="voice-button" disabled={recording || !visibleTranscript} onClick={clearTranscript}>
          清空转写
        </button>
        <span className="voice-timer">{formatElapsed(elapsedMs)}</span>
      </div>

      {!microphoneSupported ? (
        <p className="voice-hint">当前浏览器不支持麦克风录音。</p>
      ) : (
        <p className="voice-hint">
          使用 Azure Speech 实时转写（中国区可用）；手写 Send 后会自动停录并附加为 {VOICE_ATTACHMENT_NAME}。
        </p>
      )}

      <div className="voice-transcript" aria-live="polite">
        {visibleTranscript ||
          `开始录音后，这里会显示实时转写；发送 AskAI 时会作为 ${VOICE_ATTACHMENT_NAME} 附件。`}
      </div>

      {error ? (
        <p className="voice-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
});
