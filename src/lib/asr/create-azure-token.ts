import { normalizeAzureLocale, type AsrConfig } from "@/lib/asr/config";

const AZURE_TOKEN_TTL_SECONDS = 600;

function resolveTokenUrl(region: string): string {
  return `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`;
}

export async function createAzureSpeechToken(config: AsrConfig): Promise<{
  token: string;
  region: string;
  language: string;
  expiresInSeconds: number;
}> {
  const response = await fetch(resolveTokenUrl(config.azureRegion), {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": config.azureKey,
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": "0",
    },
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).trim();
    throw new Error(
      detail || `Failed to issue Azure speech token (${response.status}).`,
    );
  }

  const token = (await response.text()).trim();

  if (!token) {
    throw new Error("Azure speech token response was empty.");
  }

  return {
    token,
    region: config.azureRegion,
    language: normalizeAzureLocale(config.languageCode),
    expiresInSeconds: AZURE_TOKEN_TTL_SECONDS,
  };
}
