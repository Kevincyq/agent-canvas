import type { VoiceSegment } from "@/lib/voice/timeline";

type AzureSessionPayload = {
  ok: boolean;
  token?: string;
  region?: string;
  language?: string;
  error?: string;
};

type AzureRealtimeAsrCallbacks = {
  getElapsedMs: () => number;
  onInterim: (text: string) => void;
  onSegment: (segment: VoiceSegment) => void;
  onActiveChange: (active: boolean) => void;
  onError: (message: string) => void;
};

export type AzureRealtimeAsrHandle = {
  stop: () => void;
};

export async function startAzureRealtimeAsr(
  callbacks: AzureRealtimeAsrCallbacks,
): Promise<AzureRealtimeAsrHandle> {
  const sessionResponse = await fetch("/api/asr/realtime/session", {
    method: "POST",
  });
  const sessionPayload = (await sessionResponse.json()) as AzureSessionPayload;

  if (!sessionResponse.ok || !sessionPayload.ok || !sessionPayload.token || !sessionPayload.region) {
    throw new Error(sessionPayload.error || "无法创建 Azure 实时转写会话。");
  }

  const SpeechSDK = await import("microsoft-cognitiveservices-speech-sdk");

  const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(
    sessionPayload.token,
    sessionPayload.region,
  );
  speechConfig.speechRecognitionLanguage = sessionPayload.language || "zh-CN";

  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

  let segmentIndex = 0;
  let segmentStartMs = callbacks.getElapsedMs();
  let stopped = false;

  recognizer.recognizing = (_sender, event) => {
    if (stopped) {
      return;
    }

    if (event.result.reason === SpeechSDK.ResultReason.RecognizingSpeech) {
      callbacks.onInterim(event.result.text.trim());
    }
  };

  recognizer.recognized = (_sender, event) => {
    if (stopped) {
      return;
    }

    if (event.result.reason !== SpeechSDK.ResultReason.RecognizedSpeech) {
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

  recognizer.canceled = (_sender, event) => {
    if (stopped) {
      return;
    }

    if (event.reason === SpeechSDK.CancellationReason.Error) {
      callbacks.onError(event.errorDetails || "Azure 实时转写失败。");
    }

    callbacks.onActiveChange(false);
  };

  await new Promise<void>((resolve, reject) => {
    recognizer.startContinuousRecognitionAsync(
      () => {
        callbacks.onActiveChange(true);
        resolve();
      },
      (error) => {
        reject(new Error(error || "无法启动 Azure 实时转写。"));
      },
    );
  });

  const stop = () => {
    if (stopped) {
      return;
    }

    stopped = true;

    recognizer.stopContinuousRecognitionAsync(
      () => {
        recognizer.close();
        audioConfig.close();
        callbacks.onActiveChange(false);
      },
      () => {
        recognizer.close();
        audioConfig.close();
        callbacks.onActiveChange(false);
      },
    );
  };

  return { stop };
}
