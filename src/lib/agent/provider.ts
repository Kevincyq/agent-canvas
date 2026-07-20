import {
  configureOpenAIClient,
  createConfiguredOpenAIClient,
  getConfiguredOpenAIApiKey,
  getConfiguredOpenAIApiMode,
  getConfiguredOpenAIBaseUrl,
  getConfiguredOpenAIModel,
  isTuringProxyConfigured,
  type OpenAIApiMode,
} from "@/lib/agent/openai-client";

/**
 * Provider differences stay here. Workflows/tools/frontend must not branch on Turing vs OpenAI.
 */
export type ProviderConfig = {
  model: string;
  apiMode: OpenAIApiMode;
  baseUrl: string;
  apiKeyEnvName: "TURING_API_KEY" | "OPENAI_API_KEY" | null;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsStructuredOutput: boolean;
  configured: boolean;
};

export function getProviderConfig(): ProviderConfig {
  const configured = Boolean(getConfiguredOpenAIApiKey());
  const usingTuring = isTuringProxyConfigured();

  return {
    model: getConfiguredOpenAIModel(),
    apiMode: getConfiguredOpenAIApiMode(),
    baseUrl: getConfiguredOpenAIBaseUrl(),
    apiKeyEnvName: usingTuring
      ? "TURING_API_KEY"
      : getConfiguredOpenAIApiKey()
        ? "OPENAI_API_KEY"
        : null,
    // M0 spike confirmed these for Turing chat_completions.
    supportsTools: true,
    supportsStreaming: true,
    supportsStructuredOutput: true,
    configured,
  };
}

/** Apply provider defaults to the Agents SDK global client. */
export function applyProviderConfig(): ProviderConfig {
  const config = getProviderConfig();
  if (config.configured) {
    configureOpenAIClient();
  }
  return config;
}

export function createProviderClient() {
  return createConfiguredOpenAIClient();
}
