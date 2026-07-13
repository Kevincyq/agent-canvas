"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";

import {
  startAzureRealtimeAsr,
  type AzureAsrLifecycleEvent,
  type AzureAsrTermination,
  type AzureRealtimeAsrHandle,
} from "@/lib/voice/azure-realtime-asr";
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
  clearTranscript: () => void;
};

type AsrStatus = "idle" | "connecting" | "active" | "recovering" | "interrupted";

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAYS_MS = [1000, 2000, 4000] as const;

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
  const [asrStatus, setAsrStatus] = useState<AsrStatus>("idle");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);

  const recordingRef = useRef(false);
  const recordingStartMsRef = useRef(0);
  const elapsedTimerRef = useRef<number | null>(null);
  const cloudSegmentsRef = useRef<VoiceSegment[]>([]);
  const cloudInterimRef = useRef("");
  const realtimeHandleRef = useRef<AzureRealtimeAsrHandle | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const recordingGenerationRef = useRef(0);
  const startRealtimeAttemptRef = useRef<(generation: number, attempt: number) => void>(() => undefined);

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

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const markInterrupted = useCallback((message: string) => {
    recordingRef.current = false;
    setRecording(false);
    setTranscribing(false);
    setAsrStatus("interrupted");
    setReconnectAttempt(0);
    setError(`实时转写已中断：${message} 请点击“开始录音”重试。`);

    if (elapsedTimerRef.current !== null) {
      window.clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(
    (generation: number, attempt: number, message: string) => {
      if (!recordingRef.current || generation !== recordingGenerationRef.current) {
        return;
      }

      clearReconnectTimer();
      realtimeHandleRef.current = null;

      if (attempt > MAX_RECONNECT_ATTEMPTS) {
        markInterrupted(message);
        return;
      }

      const delayMs = RECONNECT_DELAYS_MS[attempt - 1] ?? RECONNECT_DELAYS_MS.at(-1)!;
      setTranscribing(false);
      setAsrStatus("recovering");
      setReconnectAttempt(attempt);
      setError(`实时转写连接中断，正在恢复（${attempt}/${MAX_RECONNECT_ATTEMPTS}）…`);

      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        startRealtimeAttemptRef.current(generation, attempt);
      }, delayMs);
    },
    [clearReconnectTimer, markInterrupted],
  );

  const startRealtimeAttempt = useCallback(
    async (generation: number, attempt: number) => {
      if (!recordingRef.current || generation !== recordingGenerationRef.current) {
        return;
      }

      let terminated = false;
      let becameActive = false;
      setAsrStatus(attempt > 0 ? "recovering" : "connecting");

      try {
        const handle = await startAzureRealtimeAsr({
          getElapsedMs,
          onInterim: (text) => {
            if (generation !== recordingGenerationRef.current) {
              return;
            }
            cloudInterimRef.current = text;
            setCloudInterimTranscript(text);
            emitTranscript(cloudSegmentsRef.current, text);
          },
          onSegment: (segment) => {
            if (generation === recordingGenerationRef.current) {
              appendCloudSegment(segment);
            }
          },
          onActiveChange: (active) => {
            if (generation !== recordingGenerationRef.current) {
              return;
            }
            setTranscribing(active);
            if (active) {
              becameActive = true;
              setAsrStatus("active");
              setReconnectAttempt(0);
              setError(null);
            }
          },
          onLifecycle: (event: AzureAsrLifecycleEvent) => {
            console.info("[voice-asr]", event);
          },
          onTerminated: (termination: AzureAsrTermination) => {
            if (generation !== recordingGenerationRef.current) {
              return;
            }
            terminated = true;
            console.warn("[voice-asr] terminated", termination);
            scheduleReconnect(generation, becameActive ? 1 : attempt + 1, termination.message);
          },
        });

        if (terminated || !recordingRef.current || generation !== recordingGenerationRef.current) {
          handle.stop();
          return;
        }

        realtimeHandleRef.current = handle;
      } catch (startError) {
        const message = startError instanceof Error
          ? startError.message
          : "无法启动实时语音转写。";
        console.warn("[voice-asr] start failed", message);
        scheduleReconnect(generation, attempt + 1, message);
      }
    },
    [appendCloudSegment, emitTranscript, getElapsedMs, scheduleReconnect],
  );

  startRealtimeAttemptRef.current = (generation, attempt) => {
    void startRealtimeAttempt(generation, attempt);
  };

  const stopRecording = useCallback(
    (immediate = false) => {
      if (!recordingRef.current && !realtimeHandleRef.current && reconnectTimerRef.current === null) {
        return buildPayload(sessionId, cloudSegmentsRef.current, cloudInterimRef.current);
      }

      recordingGenerationRef.current += 1;
      clearReconnectTimer();
      realtimeHandleRef.current?.stop();
      realtimeHandleRef.current = null;
      recordingRef.current = false;
      setRecording(false);
      setTranscribing(false);
      setAsrStatus("idle");
      setReconnectAttempt(0);
      setError(null);

      if (elapsedTimerRef.current !== null) {
        window.clearInterval(elapsedTimerRef.current);
        elapsedTimerRef.current = null;
      }

      return emitTranscript(cloudSegmentsRef.current, cloudInterimRef.current, immediate);
    },
    [clearReconnectTimer, emitTranscript, sessionId],
  );

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

  useImperativeHandle(
    ref,
    () => ({
      stopAndFlush: () => stopRecording(true),
      isRecording: () => recordingRef.current,
      clearTranscript,
    }),
    [clearTranscript, stopRecording],
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

    const generation = recordingGenerationRef.current + 1;
    recordingGenerationRef.current = generation;
    recordingStartMsRef.current = getElapsedMs();
    recordingRef.current = true;
    setRecording(true);
    setAsrStatus("connecting");
    setReconnectAttempt(0);
    setElapsedMs(0);
    elapsedTimerRef.current = window.setInterval(() => {
      setElapsedMs(getElapsedMs() - recordingStartMsRef.current);
    }, 250);
    startRealtimeAttemptRef.current(generation, 0);
  }, [disabled, getElapsedMs, microphoneSupported]);

  useEffect(
    () => () => {
      stopRecording(true);
    },
    [stopRecording],
  );

  const statusText = asrStatus === "recovering"
    ? `正在恢复 ${reconnectAttempt}/${MAX_RECONNECT_ATTEMPTS}`
    : asrStatus === "interrupted"
      ? "转写已中断"
      : recording
        ? transcribing
          ? "实时转写中"
          : "连接中"
        : visibleTranscript
          ? "已转写"
          : "待录音";

  return (
    <section
      className={compact ? "voice-panel voice-panel-compact" : "voice-panel voice-panel-toolbar"}
      aria-label="语音输入"
    >
      <div className="voice-toolbar">
        <div className="voice-toolbar-meta">
          <span className="voice-toolbar-label">语音</span>
          <span
            className={
              asrStatus === "interrupted"
                ? "voice-status interrupted"
                : asrStatus === "recovering"
                  ? "voice-status recovering"
                  : recording
                    ? "voice-status recording"
                    : "voice-status"
            }
          >
            {statusText}
          </span>
          {recording || visibleTranscript ? (
            <span className="voice-timer">{formatElapsed(elapsedMs)}</span>
          ) : null}
        </div>

        <div className="voice-controls">
          <button
            type="button"
            className={recording ? "voice-button danger" : "voice-button primary"}
            disabled={disabled || !microphoneSupported}
            onClick={recording ? () => stopRecording(true) : startRecording}
          >
            {recording ? "停止" : "录音"}
          </button>
          {!recording && visibleTranscript ? (
            <button type="button" className="voice-button ghost" onClick={clearTranscript}>
              清空
            </button>
          ) : null}
        </div>
      </div>

      {!microphoneSupported ? <p className="voice-hint">当前浏览器不支持麦克风录音。</p> : null}

      {recording && cloudInterimTranscript.trim() ? (
        <p className="voice-live-preview" aria-live="polite">
          {cloudInterimTranscript.trim()}
        </p>
      ) : null}

      {error ? (
        <p className="voice-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
});
