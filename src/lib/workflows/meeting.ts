import {
  getMeetingWorkflowById,
  getRunningMeetingWorkflow,
  insertMeetingWorkflow,
  updateMeetingWorkflow,
} from "@/lib/db/repositories/meeting-workflows";
import { upsertProjectSource } from "@/lib/db/repositories/projects";
import {
  SEED_MEETING,
  SEED_MEETING_COMPLETION,
} from "@/lib/services/mock/fixtures";
import { conversationTaskStore } from "@/lib/task/task-store";
import {
  MeetingWorkflowPayloadSchema,
  type MeetingWorkflowRecord,
  type StartMeetingWorkflowRequest,
} from "@/types/meeting-workflow";

export function startMeetingWorkflow(input: StartMeetingWorkflowRequest): {
  conversationId: string;
  workflow: MeetingWorkflowRecord;
} {
  const conversation = conversationTaskStore.ensure(input.conversationId, {
    userId: input.userId,
    title: "AskAI · 会议",
    originSurface: "meeting",
  });
  const existing = getRunningMeetingWorkflow(conversation.id);
  if (existing) {
    return { conversationId: conversation.id, workflow: existing };
  }

  const payload = MeetingWorkflowPayloadSchema.parse({
    origin: input.origin,
    meetingId: input.meetingId ?? SEED_MEETING.id,
    title: SEED_MEETING.title,
    participants: [...SEED_MEETING.participants],
    startedAt: new Date().toISOString(),
    endedAt: null,
    transcript: null,
    summary: null,
    actionItems: [],
    storedSourceIds: [],
  });
  const workflow = insertMeetingWorkflow({
    conversationId: conversation.id,
    payload,
  });
  conversationTaskStore.update(conversation.id, {
    status: "running",
    currentStep: "meeting:running",
    title: conversation.title === "New chat" || conversation.title === "New task" ? "AskAI · 会议" : conversation.title,
  });

  if (input.origin === "user_button") {
    conversationTaskStore.appendMessage({
      conversationId: conversation.id,
      role: "user",
      content: "开始会议",
    });
    conversationTaskStore.appendMessage({
      conversationId: conversation.id,
      role: "assistant",
      content: `已唤起「${SEED_MEETING.title}」Meeting Workflow。会议进行中；结束后会把转写和纪要存入知识库。`,
    });
  }

  return { conversationId: conversation.id, workflow };
}

export function finishMeetingWorkflow(input: {
  conversationId: string;
  workflowId: string;
}): MeetingWorkflowRecord {
  const workflow = getMeetingWorkflowById(input.workflowId);
  if (!workflow || workflow.conversationId !== input.conversationId) {
    throw new Error("Meeting workflow not found");
  }
  if (workflow.status === "completed") {
    return workflow;
  }

  const transcriptId = `src_${workflow.payload.meetingId}_transcript`;
  const minutesId = `src_${workflow.payload.meetingId}_minutes`;
  upsertProjectSource({
    id: transcriptId,
    projectId: SEED_MEETING.projectId,
    title: `${workflow.payload.title} · 会议转写`,
    sourceType: "meeting_transcript",
    content: SEED_MEETING_COMPLETION.transcript,
  });
  upsertProjectSource({
    id: minutesId,
    projectId: SEED_MEETING.projectId,
    title: `${workflow.payload.title} · 会议纪要`,
    sourceType: "meeting_minutes",
    content: [
      SEED_MEETING_COMPLETION.summary,
      "",
      "行动项：",
      ...SEED_MEETING_COMPLETION.actionItems.map(
        (item) => `- ${item.title}；负责人：${item.owner}；截止：${item.dueAt}`,
      ),
    ].join("\n"),
  });

  const updated = updateMeetingWorkflow(workflow.id, {
    status: "completed",
    payload: MeetingWorkflowPayloadSchema.parse({
      ...workflow.payload,
      endedAt: new Date().toISOString(),
      transcript: SEED_MEETING_COMPLETION.transcript,
      summary: SEED_MEETING_COMPLETION.summary,
      actionItems: SEED_MEETING_COMPLETION.actionItems.map((item) => ({ ...item })),
      storedSourceIds: [transcriptId, minutesId],
    }),
  });
  if (!updated) {
    throw new Error("Failed to complete meeting workflow");
  }

  conversationTaskStore.update(input.conversationId, {
    status: "ready",
    currentStep: null,
  });
  conversationTaskStore.appendMessage({
    conversationId: input.conversationId,
    role: "assistant",
    content:
      "会议已结束。Mock 转写与会议纪要已存入个人知识库，现在可以直接询问会议结论或让 AskAI 把行动项写入 Tablet 日历。",
    evidence: [
      {
        id: transcriptId,
        label: `${workflow.payload.title} · 会议转写`,
        source: `pkb:${transcriptId}`,
      },
      {
        id: minutesId,
        label: `${workflow.payload.title} · 会议纪要`,
        source: `pkb:${minutesId}`,
      },
    ],
  });

  return updated;
}
