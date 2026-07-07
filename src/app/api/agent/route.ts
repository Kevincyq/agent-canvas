import { NextResponse } from "next/server";

import { runCanvasAgent } from "@/lib/agent/agent";
import { AgentRequestSchema } from "@/types/agent";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    const payload = AgentRequestSchema.parse(body);
    return NextResponse.json(await runCanvasAgent(payload));
  } catch (error) {
    return NextResponse.json(
      {
        message: error instanceof Error ? error.message : "Agent API 请求处理失败",
        actions: [
          {
            type: "reply",
            message: "请求处理失败，请检查输入或服务端配置。",
          },
        ],
      },
      { status: 400 },
    );
  }
}
