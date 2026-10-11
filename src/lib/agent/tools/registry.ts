import {
  createCalendarEventTool,
  createTodoTool,
  getCurrentContextTool,
  getMeetingContextTool,
  getProjectContextTool,
  saveArtifactToProjectTool,
  searchPersonalKnowledgeTool,
  searchWebTool,
  startDralkWorkflowTool,
  startMeetingWorkflowTool,
  startTranslationWorkflowTool,
  startWritingAssistWorkflowTool,
} from "@/lib/agent/tools/definitions";

export function createAskAiTools() {
  return [
    getCurrentContextTool,
    getProjectContextTool,
    searchPersonalKnowledgeTool,
    searchWebTool,
    getMeetingContextTool,
    startDralkWorkflowTool,
    startMeetingWorkflowTool,
    startWritingAssistWorkflowTool,
    startTranslationWorkflowTool,
    saveArtifactToProjectTool,
    createTodoTool,
    createCalendarEventTool,
  ];
}

export const ASK_AI_READ_TOOL_NAMES = [
  "get_current_context",
  "get_project_context",
  "search_personal_knowledge",
  "search_web",
  "get_meeting_context",
] as const;

export const ASK_AI_WRITE_TOOL_NAMES = [
  "save_artifact_to_project",
  "create_todo",
  "create_calendar_event",
] as const;

export const ASK_AI_WORKFLOW_TOOL_NAMES = [
  "start_dralk_workflow",
  "start_meeting_workflow",
  "start_writing_assist_workflow",
  "start_translation_workflow",
] as const;
