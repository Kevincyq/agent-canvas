import { NextResponse } from "next/server";

import { getDefaultToolGateway } from "@/lib/tools/registry";

export const runtime = "nodejs";

export async function GET() {
  const gateway = getDefaultToolGateway();
  return NextResponse.json({
    runtime: "cloud_web",
    connectors: gateway.list(),
  });
}
