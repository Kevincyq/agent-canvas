import { NextResponse } from "next/server";

import { conversationTaskStore } from "@/lib/task/task-store";
import { CreateConversationRequestSchema } from "@/types/task";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId") ?? "local-user";
    const limit = Number(searchParams.get("limit") ?? "50");
    const conversations = conversationTaskStore.list(
      userId,
      Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 100) : 50,
    );
    return NextResponse.json({ conversations });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to list conversations" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as unknown;
    const payload = CreateConversationRequestSchema.parse(body ?? {});
    const conversation = conversationTaskStore.create(payload);
    return NextResponse.json({ conversation }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to create conversation" },
      { status: 400 },
    );
  }
}
