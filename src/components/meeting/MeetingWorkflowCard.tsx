"use client";

import type { MeetingWorkflowRecord } from "@/types/meeting-workflow";

type MeetingWorkflowCardProps = {
  workflow: MeetingWorkflowRecord;
  busy: boolean;
  onFinish: () => void;
  onWriteCalendar: () => void;
};

export function MeetingWorkflowCard({
  workflow,
  busy,
  onFinish,
  onWriteCalendar,
}: MeetingWorkflowCardProps) {
  const completed = workflow.status === "completed";

  return (
    <section className="meeting-workflow-card" aria-label="Meeting Workflow">
      <div className="meeting-workflow-heading">
        <div>
          <span className="meeting-workflow-eyebrow">Meeting Workflow · Mock</span>
          <strong>{workflow.payload.title}</strong>
        </div>
        <span
          className={
            completed
              ? "meeting-workflow-status completed"
              : "meeting-workflow-status running"
          }
        >
          {completed ? "已完成" : "进行中"}
        </span>
      </div>

      <p>{workflow.payload.participants.join(" · ")}</p>

      {completed ? (
        <>
          <div className="meeting-workflow-result">
            <strong>已存入知识库</strong>
            <span>会议转写 + 会议纪要（{workflow.payload.storedSourceIds.length} 个来源）</span>
          </div>
          <div className="meeting-workflow-result">
            <strong>行动项</strong>
            <span>{workflow.payload.actionItems.length} 项，可让 AskAI 写入 Tablet 日历</span>
          </div>
          <button
            type="button"
            className="meeting-workflow-calendar"
            disabled={busy || workflow.payload.actionItems.length === 0}
            onClick={onWriteCalendar}
          >
            让 AskAI 写入 Tablet 日历
          </button>
        </>
      ) : (
        <button
          type="button"
          className="meeting-workflow-finish"
          disabled={busy}
          onClick={onFinish}
        >
          结束会议并存入知识库
        </button>
      )}
    </section>
  );
}
