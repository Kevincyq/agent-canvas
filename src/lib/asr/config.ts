import { getOptionalEnv } from "@/lib/env";

const DEFAULT_ASR_LANGUAGE = "zh";

export type AsrProvider = "azure-stt";

export type AsrConfig = {
  provider: AsrProvider;
  azureKey: string;
  azureRegion: string;
  languageCode: string;
  azureLocale: string;
};

export function normalizeAsrLanguageCode(languageCode: string): string {
  const trimmed = languageCode.trim().toLowerCase();

  if (!trimmed) {
    return DEFAULT_ASR_LANGUAGE;
  }

  if (trimmed === "zh-cn" || trimmed === "zh_cn") {
    return "zh";
  }

  return trimmed.split("-")[0] ?? DEFAULT_ASR_LANGUAGE;
}

export function normalizeAzureLocale(languageCode: string): string {
  const trimmed = languageCode.trim();

  if (trimmed.includes("-")) {
    return trimmed;
  }

  const base = normalizeAsrLanguageCode(trimmed);
  const localeMap: Record<string, string> = {
    zh: "zh-CN",
    en: "en-US",
    ja: "ja-JP",
    ko: "ko-KR",
    fr: "fr-FR",
    de: "de-DE",
    es: "es-ES",
  };

  return localeMap[base] ?? `${base}-${base.toUpperCase()}`;
}

export function getAsrConfig(): AsrConfig {
  const azureKey = getOptionalEnv("AZURE_STT_KEY");
  const azureRegion = getOptionalEnv("AZURE_STT_REGION");
  const languageCode = getOptionalEnv("ASR_LANGUAGE_CODE", DEFAULT_ASR_LANGUAGE);
  const azureLocale = normalizeAzureLocale(languageCode);

  return {
    provider: "azure-stt",
    azureKey,
    azureRegion,
    languageCode,
    azureLocale,
  };
}

export function isAsrConfigured(config: Pick<AsrConfig, "azureKey" | "azureRegion">): boolean {
  return config.azureKey.length > 0 && config.azureRegion.length > 0;
}
