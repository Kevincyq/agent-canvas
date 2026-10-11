import { NextResponse } from "next/server";

import { DEFAULT_FLUXINK_HWR_UI_RESOURCE_URI, isAllowedFluxInkUiResourceUri } from "@/lib/mcp/constants";
import { getDefaultToolGateway } from "@/lib/tools/registry";
import type { GatewayContext } from "@/types/tool-gateway";

export const runtime = "nodejs";
export const maxDuration = 120;

const SYSTEM_CONTEXT: GatewayContext = {
  userId: "system",
  tenantId: "system",
  conversationId: "system",
  currentSurface: "canvas",
  selectedSourceIds: [],
  permissions: {},
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const uri = searchParams.get("uri") ?? DEFAULT_FLUXINK_HWR_UI_RESOURCE_URI;

  if (!isAllowedFluxInkUiResourceUri(uri)) {
    return NextResponse.json(
      {
        ok: false,
        error: `UI resource is not allowed: ${uri}`,
      },
      { status: 400 },
    );
  }

  try {
    const receipt = await getDefaultToolGateway().invoke(
      "fluxink",
      "read_ui",
      { uri },
      SYSTEM_CONTEXT,
    );
    if (!receipt.ok) {
      throw new Error(receipt.error?.message ?? "Failed to read MCP UI resource.");
    }
    const resource = receipt.data as { contents?: Array<{ uri?: string; mimeType?: string; html?: string }> };
    const content = resource.contents?.[0];
    if (!content?.html) {
      throw new Error("MCP UI resource returned no HTML.");
    }

    return NextResponse.json({
      ok: true,
      uri: content.uri,
      mimeType: content.mimeType ?? "text/html",
      html: content.html,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to read MCP UI resource.",
      },
      { status: 502 },
    );
  }
}
