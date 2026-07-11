import type { VoiceSegment } from "@/lib/voice/timeline";

type AzureSessionPayload = {
  ok: boolean;
  token?: string;
  region?: string;
  language?: string;
  expiresInSeconds?: number;
  error?: string;
};

export type AzureAsrLifecycleEvent = {
  type: "session_started" | "session_stopped" | "connected" | "disconnected" | "token_refreshed" | "canceled";
  sessionId?: string;
  errorCode?: number;
  message?: string;
};

export type AzureAsrTermination = {
  reason: "session_stopped" | "disconnected" | "canceled" | "token_refresh_failed";
  message: string;
  errorCode?: number;
};

type AzureRealtimeAsrCallbacks = {
  getElapsedMs: () => number;
  onInterim: (text: string) => void;
  onSegment: (segment: VoiceSegment) => void;
  onActiveChange: (active: boolean) => void;
  onLifecycle: (event: AzureAsrLifecycleEvent) => void;
  onTerminated: (termination: AzureAsrTermination) => void;
};

export type AzureRealtimeAsrHandle = {
  stop: () => void;
};

async function requestAzureSession(): Promise<Required<Pick<AzureSessionPayload, "token" | "region" | "language">> & { expiresInSeconds: number }> {
  const response = await fetch("/api/asr/realtime/session", {
    method: "POST",
    signal: AbortSignal.timeout(12_000),
  });
  const payload = (await response.json()) as AzureSessionPayload;

  if (!response.ok || !payload.ok || !payload.token || !payload.region) {
    throw new Error(payload.error || "无法创建 Azure 实时转写会话。");
  }

  return {
    token: payload.token,
    region: payload.region,
    language: payload.language || "zh-CN",
    expiresInSeconds: payload.expiresInSeconds ?? 600,
  };
}

export async function startAzureRealtimeAsr(
  callbacks: AzureRealtimeAsrCallbacks,
): Promise<AzureRealtimeAsrHandle> {
  const initialSession = await requestAzureSession();
  const SpeechSDK = await import("microsoft-cognitiveservices-speech-sdk");
  const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(
    initialSession.token,
    initialSession.region,
  );
  speechConfig.speechRecognitionLanguage = initialSession.language;

  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);
  const connection = SpeechSDK.Connection.fromRecognizer(recognizer);

  let segmentIndex = 0;
  let segmentStartMs = callbacks.getElapsedMs();
  let stopped = false;
  let terminationReported = false;
  let refreshTimer: number | null = null;

  const clearRefreshTimer = () => {
    if (refreshTimer !== null) {
      window.clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  };

  const closeResources = () => {
    clearRefreshTimer();
    connection.close();
    recognizer.stopContinuousRecognitionAsync(
      () => {
        recognizer.close();
        audioConfig.close();
      },
      () => {
        recognizer.close();
        audioConfig.close();
      },
    );
  };

  const terminate = (termination: AzureAsrTermination) => {
    if (stopped || terminationReported) {
      return;
    }

    terminationReported = true;
    stopped = true;
    callbacks.onActiveChange(false);
    callbacks.onTerminated(termination);
    queueMicrotask(closeResources);
  };

  const scheduleTokenRefresh = (expiresInSeconds: number) => {
    clearRefreshTimer();
    const refreshAfterMs = Math.max(60, expiresInSeconds - 120) * 1000;

    refreshTimer = window.setTimeout(async () => {
      if (stopped) {
        return;
      }

      try {
        const refreshed = await requestAzureSession();
        recognizer.authorizationToken = refreshed.token;
        callbacks.onLifecycle({ type: "token_refreshed" });
        scheduleTokenRefresh(refreshed.expiresInSeconds);
      } catch (error) {
        terminate({
          reason: "token_refresh_failed",
          message: error instanceof Error ? error.message : "Azure token 刷新失败。",
        });
      }
    }, refreshAfterMs);
  };

  recognizer.recognizing = (_sender, event) => {
    if (!stopped && event.result.reason === SpeechSDK.ResultReason.RecognizingSpeech) {
      callbacks.onInterim(event.result.text.trim());
    }
  };

  recognizer.recognized = (_sender, event) => {
    if (stopped || event.result.reason !== SpeechSDK.ResultReason.RecognizedSpeech) {
      return;
    }

    const text = event.result.text.trim();
    const endMs = callbacks.getElapsedMs();

    if (!text) {
      return;
    }

    callbacks.onSegment({
      id: `cloud-azure-${segmentIndex}`,
      text,
      startMs: segmentStartMs,
      endMs,
      source: "cloud_asr",
    });
    segmentIndex += 1;
    segmentStartMs = endMs;
    callbacks.onInterim("");
  };

  recognizer.sessionStarted = (_sender, event) => {
    if (!stopped) {
      callbacks.onLifecycle({ type: "session_started", sessionId: event.sessionId });
    }
  };

  recognizer.sessionStopped = (_sender, event) => {
    if (stopped) {
      return;
    }
    callbacks.onLifecycle({ type: "session_stopped", sessionId: event.sessionId });
    terminate({
      reason: "session_stopped",
      message: "Azure 实时转写会话已结束。",
    });
  };

  recognizer.canceled = (_sender, event) => {
    if (stopped) {
      return;
    }
    const message = event.errorDetails || "Azure 实时转写被取消。";
    callbacks.onLifecycle({
      type: "canceled",
      errorCode: event.errorCode,
      message,
    });
    terminate({
      reason: "canceled",
      message,
      errorCode: event.errorCode,
    });
  };

  connection.connected = (event) => {
    if (!stopped) {
      callbacks.onLifecycle({ type: "connected", sessionId: event.sessionId });
    }
  };

  connection.disconnected = (event) => {
    if (stopped) {
      return;
    }
    callbacks.onLifecycle({ type: "disconnected", sessionId: event.sessionId });
    terminate({
      reason: "disconnected",
      message: "与 Azure Speech 的连接已断开。",
    });
  };

  await new Promise<void>((resolve, reject) => {
    const startTimeout = window.setTimeout(() => {
      stopped = true;
      closeResources();
      reject(new Error("连接 Azure Speech 超时。"));
    }, 15_000);

    recognizer.startContinuousRecognitionAsync(
      () => {
        window.clearTimeout(startTimeout);
        if (stopped) {
          return;
        }
        callbacks.onActiveChange(true);
        scheduleTokenRefresh(initialSession.expiresInSeconds);
        resolve();
      },
      (error) => {
        window.clearTimeout(startTimeout);
        if (stopped) {
          return;
        }
        stopped = true;
        closeResources();
        reject(new Error(error || "无法启动 Azure 实时转写。"));
      },
    );
  });

  return {
    stop: () => {
      if (stopped) {
        return;
      }

      stopped = true;
      callbacks.onActiveChange(false);
      closeResources();
    },
  };
}
