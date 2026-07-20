import { NextResponse } from "next/server";

import { conversationTaskStore } from "@/lib/task/task-store";
import { PatchConversationRequestSchema } from "@/types/task";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const conversation = conversationTaskStore.getById(id);
    if (!conversation) {
      return NextResponse.json({ message: `Conversation not found: ${id}` }, { status: 404 });
    }

    const messages = conversationTaskStore.listMessages(id);
    return NextResponse.json({ conversation, messages });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to load conversation" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as unknown;
    const payload = PatchConversationRequestSchema.parse(body);
    const conversation = conversationTaskStore.update(id, payload);
    if (!conversation) {
      return NextResponse.json({ message: `Conversation not found: ${id}` }, { status: 404 });
    }
    return NextResponse.json({ conversation });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Failed to update conversation" },
      { status: 400 },
    );
  }
}
