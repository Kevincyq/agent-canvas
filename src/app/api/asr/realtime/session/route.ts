import { NextResponse } from "next/server";

import { getDefaultToolGateway } from "@/lib/tools/registry";
import type { GatewayContext } from "@/types/tool-gateway";

export const runtime = "nodejs";

const SYSTEM_CONTEXT: GatewayContext = {
  userId: "system",
  tenantId: "system",
  conversationId: "system",
  currentSurface: "ask_ai",
  selectedSourceIds: [],
  permissions: {},
};

export async function POST() {
  const receipt = await getDefaultToolGateway().invoke(
    "azure_asr",
    "issue_token",
    {},
    SYSTEM_CONTEXT,
  );

  if (!receipt.ok) {
    const notConfigured = receipt.error?.code === "ASR_NOT_CONFIGURED";
    return NextResponse.json(
      {
        ok: false,
        error: receipt.error?.message ?? "Failed to create Azure speech session.",
      },
      { status: notConfigured ? 501 : 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    ...(receipt.data as Record<string, unknown>),
  });
}
