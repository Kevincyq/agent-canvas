import { consumeAgentSse } from "@/lib/agent/consume-sse";
import type { AgentRunResponse } from "@/types/agent-runtime";
import type { AgentStreamEvent } from "@/types/agent-stream";

const TOOL_PROGRESS_LABELS: Record<string, string> = {
  get_current_context: "读取当前上下文",
  get_project_context: "读取知识库",
  search_personal_knowledge: "检索个人知识",
  search_web: "联网搜索",
  get_meeting_context: "读取会议上下文",
  start_dralk_workflow: "打开 Dralk",
  start_meeting_workflow: "启动会议",
  start_writing_assist_workflow: "启动帮写",
  start_translation_workflow: "启动翻译",
  save_artifact_to_project: "保存笔记",
  create_todo: "创建待办",
  create_calendar_event: "写入日历",
};

export function progressLabelForStreamEvent(event: AgentStreamEvent): string | null {
  if (event.type === "run.started") {
    return "开始处理";
  }
  if (event.type === "tool.started") {
    return `正在${TOOL_PROGRESS_LABELS[event.toolName] ?? event.toolName}`;
  }
  if (event.type === "tool.completed") {
    return event.ok
      ? `${TOOL_PROGRESS_LABELS[event.toolName] ?? event.toolName}完成`
      : `${TOOL_PROGRESS_LABELS[event.toolName] ?? event.toolName}失败`;
  }
  if (
    event.type === "answer.delta" ||
    event.type === "answer.message" ||
    event.type === "block.delta" ||
    event.type === "block.completed"
  ) {
    return "正在生成答复";
  }
  if (event.type === "chart.completed" || event.type === "svg.completed") {
    return "正在渲染完整图表";
  }
  return null;
}

export async function postAgentEndpoint(
  path: "/api/agent/run" | "/api/agent/resume",
  body: unknown,
  onEvent?: (event: AgentStreamEvent) => void | Promise<void>,
): Promise<AgentRunResponse> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("text/event-stream")) {
    return consumeAgentSse(response, onEvent);
  }

  const payload = (await response.json()) as AgentRunResponse;
  if (!response.ok) {
    throw new Error(payload.message || "Agent 请求失败");
  }
  return payload;
}
