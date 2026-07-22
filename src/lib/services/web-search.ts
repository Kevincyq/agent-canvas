import { getNumberEnv, getOptionalEnv } from "@/lib/env";
import { createFailedToolReceipt, createToolReceipt, type ToolReceipt } from "@/types/tool-receipt";

export type WebSearchHit = {
  url: string;
  title: string;
  snippet: string;
  score?: number;
};

export type WebSearchData = {
  query: string;
  provider: "tavily";
  hits: WebSearchHit[];
};

type TavilyResponse = {
  results?: Array<{
    url?: string;
    title?: string;
    content?: string;
    score?: number;
  }>;
};

/**
 * Real Web Search boundary. Never falls back to fixture results: a missing or
 * failed provider must be visible so AskAI cannot present mock data as live web.
 */
export async function searchWeb(query: string): Promise<ToolReceipt<WebSearchData>> {
  const apiKey = getOptionalEnv("TAVILY_API_KEY");
  if (!apiKey) {
    return createFailedToolReceipt(
      "search_web",
      "WEB_SEARCH_NOT_CONFIGURED",
      "真实 Web Search 未配置。请在服务端设置 TAVILY_API_KEY。",
      false,
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    getNumberEnv("WEB_SEARCH_TIMEOUT_MS", 15000),
  );

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "advanced",
        max_results: Math.min(Math.max(getNumberEnv("WEB_SEARCH_MAX_RESULTS", 5), 1), 10),
        include_answer: false,
        include_raw_content: false,
      }),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return createFailedToolReceipt(
        "search_web",
        "WEB_SEARCH_PROVIDER_ERROR",
        `Tavily Web Search 返回 HTTP ${response.status}${detail ? `: ${detail.slice(0, 240)}` : ""}`,
        response.status >= 500 || response.status === 429,
      );
    }

    const payload = (await response.json()) as TavilyResponse;
    const hits: WebSearchHit[] = (payload.results ?? []).flatMap((item) => {
      if (!item.url || !item.title) {
        return [];
      }
      return [
        {
          url: item.url,
          title: item.title,
          snippet: item.content?.trim() ?? "",
          score: item.score,
        },
      ];
    });

    return createToolReceipt({
      ok: true,
      tool: "search_web",
      data: {
        query,
        provider: "tavily",
        hits,
      },
    });
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return createFailedToolReceipt(
      "search_web",
      aborted ? "WEB_SEARCH_TIMEOUT" : "WEB_SEARCH_NETWORK_ERROR",
      aborted
        ? "真实 Web Search 请求超时。"
        : `真实 Web Search 请求失败：${error instanceof Error ? error.message : String(error)}`,
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
}
