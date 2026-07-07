import { NextResponse } from "next/server";

import { DEFAULT_FLUXINK_HWR_UI_RESOURCE_URI, isAllowedFluxInkUiResourceUri } from "@/lib/mcp/constants";
import { readMcpUiResource } from "@/lib/mcp/client";

export const runtime = "nodejs";

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
    const resource = await readMcpUiResource(uri);
    const content = resource.contents[0];

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
