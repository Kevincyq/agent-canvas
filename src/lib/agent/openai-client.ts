import {
  setDefaultOpenAIClient,
  setOpenAIAPI,
} from "@openai/agents";
import OpenAI from "openai";

import { getOptionalEnv } from "@/lib/env";

export type OpenAIApiMode = "chat_completions" | "responses";

const DEFAULT_TURING_API_BASE = "https://live-turing.cn.llm.tcljd.com/api/v1";
const DEFAULT_TURING_MODEL = "turing/gpt-5.5";

export function isTuringProxyConfigured(): boolean {
  return Boolean(getOptionalEnv("TURING_API_KEY"));
}

export function getConfiguredOpenAIApiKey(): string {
  return getOptionalEnv("TURING_API_KEY") || getOptionalEnv("OPENAI_API_KEY");
}

export function getConfiguredOpenAIBaseUrl(): string {
  const baseUrl =
    getOptionalEnv("TURING_API_BASE") ||
    getOptionalEnv("OPENAI_BASE_URL") ||
    (isTuringProxyConfigured() ? DEFAULT_TURING_API_BASE : "");

  return baseUrl.replace(/\/$/, "");
}

export function getConfiguredOpenAIModel(): string {
  return (
    getOptionalEnv("TURING_MODEL") ||
    getOptionalEnv("OPENAI_MODEL") ||
    (isTuringProxyConfigured() ? DEFAULT_TURING_MODEL : "gpt-4.1-mini")
  );
}

export function getConfiguredOpenAIApiMode(): OpenAIApiMode {
  const explicitMode = getOptionalEnv("OPENAI_API");

  if (explicitMode === "chat_completions" || explicitMode === "responses") {
    return explicitMode;
  }

  if (isTuringProxyConfigured() || getConfiguredOpenAIBaseUrl()) {
    return "chat_completions";
  }

  return "responses";
}

export function createConfiguredOpenAIClient(): OpenAI {
  const apiKey = getConfiguredOpenAIApiKey();
  const baseURL = getConfiguredOpenAIBaseUrl();

  if (!apiKey) {
    throw new Error("Missing TURING_API_KEY or OPENAI_API_KEY.");
  }

  return new OpenAI({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
  });
}

export function configureOpenAIClient(): string | null {
  const apiKey = getConfiguredOpenAIApiKey();

  if (!apiKey) {
    return null;
  }

  setDefaultOpenAIClient(createConfiguredOpenAIClient());
  setOpenAIAPI(getConfiguredOpenAIApiMode());

  return apiKey;
}
