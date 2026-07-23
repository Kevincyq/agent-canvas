"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ChatPanel } from "@/components/chat/ChatPanel";
import { FluxInkWidgetHost } from "@/components/canvas/FluxInkWidgetHost";
import { ProjectNav, type ProjectNavItem } from "@/components/nav/ProjectNav";
import { VoiceRecorder, type VoiceRecorderHandle } from "@/components/voice/VoiceRecorder";
import { createCanvasSummary } from "@/lib/canvas/actions";
import {
  buildCompactDralkQueryPayload,
  prepareRecognitionForComposer,
} from "@/lib/canvas/composer";
import { markAndroidTabletDocument } from "@/lib/device/tablet";
import { extractRenderChartSpecs } from "@/lib/plot/extract-charts";
import { extractLegacySvgFences, extractRenderSvgSpecs } from "@/lib/svg/extract";
import { svgSpecsToContentBlocks } from "@/lib/content/legacy";
import { DEFAULT_FLUXINK_HWR_UI_RESOURCE_URI } from "@/lib/mcp/constants";
import { createVoiceTranscriptAttachment, type VoiceTranscriptPayload } from "@/lib/voice/timeline";
import {
  shouldSendVoiceAttachment,
  stripVoiceAttachmentReference,
} from "@/lib/voice/composer-sync";
import type {
  AgentAttachment,
  AgentAction,
  ChatMessage,
  HwrMode,
  HwrOpenResponse,
} from "@/types/agent";
import type { AgentRunResponse, ApprovalCard } from "@/types/agent-runtime";
import type { ContentBlock } from "@/types/content-block";
import type { MeetingWorkflowRecord } from "@/types/meeting-workflow";
import type { ConversationTask } from "@/types/task";
import type { DralkWorkflowRecord, WorkflowRequest } from "@/types/workflow";

const CONVERSATION_STORAGE_KEY = "askai.conversationId";
const WORKFLOW_STORAGE_KEY = "askai.dralkWorkflowId";

const welcomeMessage: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "你好，我是 AskAI Agent",
};

type CanvasStatus = "idle" | "opening" | "ready" | "recognized" | "error";
type CanvasDisplayMode = "inline" | "fullscreen";
type WidgetStatus = "loading" | "ready" | "recognized" | "error";

export function CanvasAgentApp() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([welcomeMessage]);
  const [busy, setBusy] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [activeWorkflow, setActiveWorkflow] = useState<DralkWorkflowRecord | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalCard[]>([]);
  const [meetingWorkflow, setMeetingWorkflow] = useState<MeetingWorkflowRecord | null>(null);
  const [projects, setProjects] = useState<ProjectNavItem[]>([]);
  const [recentConversations, setRecentConversations] = useState<ConversationTask[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<{
    id: string;
    title: string;
    artifactType: string;
    blocks: unknown[];
  } | null>(null);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasAfterMessageId, setCanvasAfterMessageId] = useState<string | null>(null);
  const [canvasStatus, setCanvasStatus] = useState<CanvasStatus>("idle");
  const [widgetStatus, setWidgetStatus] = useState<WidgetStatus>("loading");
  const [canvasDisplayMode, setCanvasDisplayMode] = useState<CanvasDisplayMode>("inline");
  const [canvasCollapsed, setCanvasCollapsed] = useState(false);
  const [hwrMode, setHwrMode] = useState<HwrMode>("general");
  const [hwrLanguage, setHwrLanguage] = useState("");
  const [hwrPrompt, setHwrPrompt] = useState("");
  const [hwrOpenResult, setHwrOpenResult] = useState<HwrOpenResponse | null>(null);
  const [recognitionText, setRecognitionText] = useState("");
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  const [composerDraft, setComposerDraft] = useState("");
  const [composerFocusSignal, setComposerFocusSignal] = useState(0);
  const [widgetSessionId, setWidgetSessionId] = useState(0);
  const [voiceSessionId, setVoiceSessionId] = useState(() => crypto.randomUUID());
  const [voiceAttachment, setVoiceAttachment] = useState<AgentAttachment | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const hwrPromptRef = useRef("");
  const voiceAttachmentRef = useRef<AgentAttachment | null>(null);
  const voiceRecorderRef = useRef<VoiceRecorderHandle | null>(null);
  const canvasSessionStartedAtRef = useRef(0);

  hwrPromptRef.current = hwrPrompt;
  voiceAttachmentRef.current = voiceAttachment;

  useEffect(() => {
    markAndroidTabletDocument();

    function handleViewportChange() {
      markAndroidTabletDocument();
    }

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("orientationchange", handleViewportChange);

    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("orientationchange", handleViewportChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadNav() {
      try {
        const [projectsResponse, conversationsResponse] = await Promise.all([
          fetch("/api/projects"),
          fetch("/api/conversations?limit=50"),
        ]);
        if (cancelled) {
          return;
        }
        if (projectsResponse.ok) {
          const payload = (await projectsResponse.json()) as {
            projects: Array<{
              id: string;
              name: string;
              sources?: Array<unknown>;
            }>;
          };
          setProjects(
            (payload.projects ?? []).map((project) => ({
              id: project.id,
              name: project.name,
            })),
          );
        }
        if (conversationsResponse.ok) {
          const payload = (await conversationsResponse.json()) as {
            conversations: ConversationTask[];
          };
          setRecentConversations(payload.conversations ?? []);
        }
      } catch {
        // Nav is best-effort; chat still works.
      }
    }

    async function hydrateConversation() {
      const storedId = window.localStorage.getItem(CONVERSATION_STORAGE_KEY);
      if (!storedId) {
        if (!cancelled) {
          setHydrating(false);
        }
        return;
      }

      try {
        const response = await fetch(`/api/conversations/${storedId}`);
        if (!response.ok) {
          window.localStorage.removeItem(CONVERSATION_STORAGE_KEY);
          return;
        }

        const payload = (await response.json()) as {
          conversation: ConversationTask;
          messages: ChatMessage[];
          activeWorkflow?: DralkWorkflowRecord | null;
          meetingWorkflow?: MeetingWorkflowRecord | null;
          approvals?: ApprovalCard[];
        };

        if (cancelled) {
          return;
        }

        setConversationId(payload.conversation.id);
        setActiveProjectId(payload.conversation.projectId ?? null);
        setMessages(payload.messages.length > 0 ? payload.messages : [welcomeMessage]);
        setPendingApprovals(payload.approvals ?? []);
        setMeetingWorkflow(payload.meetingWorkflow ?? null);

        if (payload.activeWorkflow) {
          setActiveWorkflow(payload.activeWorkflow);
          window.localStorage.setItem(WORKFLOW_STORAGE_KEY, payload.activeWorkflow.id);
          const wf = payload.activeWorkflow;
          setCanvasOpen(true);
          setCanvasStatus(
            wf.status === "recognized" || wf.status === "attached" ? "recognized" : "ready",
          );
          setWidgetStatus("ready");
          setCanvasDisplayMode("inline");
          setCanvasCollapsed(wf.status === "attached" || wf.status === "recognized");
          setHwrMode(wf.payload.mode);
          setHwrLanguage(wf.payload.language);
          setHwrPrompt(wf.payload.prompt);
          setRecognitionText(wf.payload.queryPayload?.displaySummary ?? "");
          setHwrOpenResult({
            ok: true,
            mode: wf.payload.mode,
            language: wf.payload.language,
            prompt: wf.payload.prompt,
            toolName: "fluxink-widget-host",
          });
          setWidgetSessionId((current) => current + 1);
          canvasSessionStartedAtRef.current = performance.now();
        }
      } catch {
        // Keep welcome state if restore fails; next send creates a new conversation.
      } finally {
        if (!cancelled) {
          setHydrating(false);
        }
      }
    }

    void loadNav();
    void hydrateConversation();

    return () => {
      cancelled = true;
    };
  }, []);

  function persistConversationId(nextId: string) {
    setConversationId(nextId);
    window.localStorage.setItem(CONVERSATION_STORAGE_KEY, nextId);
  }

  async function refreshRecentConversations() {
    try {
      const response = await fetch("/api/conversations?limit=50");
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { conversations: ConversationTask[] };
      setRecentConversations(payload.conversations ?? []);
    } catch {
      // ignore
    }
  }

  async function loadConversationById(nextId: string) {
    setBusy(true);
    try {
      const response = await fetch(`/api/conversations/${nextId}`);
      if (!response.ok) {
        throw new Error("加载任务失败");
      }
      const payload = (await response.json()) as {
        conversation: ConversationTask;
        messages: ChatMessage[];
        activeWorkflow?: DralkWorkflowRecord | null;
        meetingWorkflow?: MeetingWorkflowRecord | null;
        approvals?: ApprovalCard[];
      };
      persistConversationId(payload.conversation.id);
      setActiveProjectId(payload.conversation.projectId ?? null);
      setMessages(payload.messages.length > 0 ? payload.messages : [welcomeMessage]);
      setPendingApprovals(payload.approvals ?? []);
      setMeetingWorkflow(payload.meetingWorkflow ?? null);
      setSelectedArtifact(null);
      setActiveWorkflow(payload.activeWorkflow ?? null);
      setCanvasOpen(Boolean(payload.activeWorkflow));
      if (!payload.activeWorkflow) {
        window.localStorage.removeItem(WORKFLOW_STORAGE_KEY);
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: error instanceof Error ? error.message : "加载任务失败",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Create a task.
   * - `null` / omit with explicit null from top「新任务」→ unassigned (bottom「任务」)
   * - collection id from folder「+」→ nested under that Collection
   * - undefined (legacy) falls back to activeProjectId — prefer callers pass null or id explicitly
   */
  async function handleNewChat(projectIdOverride?: string | null) {
    const projectId =
      projectIdOverride !== undefined ? projectIdOverride : activeProjectId;
    setBusy(true);
    try {
      const response = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "New task",
          projectId: projectId ?? null,
          originSurface: "askai",
        }),
      });
      const payload = (await response.json()) as { conversation?: ConversationTask; message?: string };
      if (!response.ok || !payload.conversation) {
        throw new Error(payload.message || "创建任务失败");
      }
      persistConversationId(payload.conversation.id);
      // Top「新任务」clears collection context; folder「+」keeps / sets that collection.
      setActiveProjectId(payload.conversation.projectId ?? null);
      setMessages([welcomeMessage]);
      setPendingApprovals([]);
      setActiveWorkflow(null);
      setMeetingWorkflow(null);
      setCanvasOpen(false);
      setCanvasAfterMessageId(null);
      setSelectedArtifact(null);
      window.localStorage.removeItem(WORKFLOW_STORAGE_KEY);
      await refreshRecentConversations();
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: error instanceof Error ? error.message : "创建任务失败",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function refreshProjects() {
    try {
      const response = await fetch("/api/projects");
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as {
        projects: Array<{
          id: string;
          name: string;
          sources?: Array<unknown>;
        }>;
      };
      setProjects(
        (payload.projects ?? []).map((project) => ({
          id: project.id,
          name: project.name,
        })),
      );
    } catch {
      // ignore
    }
  }

  async function handleNewProject() {
    const name = window.prompt("新建 Collection 名称", "My Collection");
    if (!name?.trim()) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const payload = (await response.json()) as {
        project?: { id: string; name: string };
        message?: string;
      };
      if (!response.ok || !payload.project) {
        throw new Error(payload.message || "创建 Collection 失败");
      }
      await refreshProjects();
      handleSelectProject(payload.project.id, payload.project.name);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: error instanceof Error ? error.message : "创建 Collection 失败",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handleSelectProject(projectId: string, projectNameHint?: string) {
    const projectName =
      projectNameHint ?? projects.find((item) => item.id === projectId)?.name ?? projectId;
    const current = recentConversations.find((item) => item.id === conversationId);

    // Select Collection as context only — never auto-create a task.
    // Clicking the same Collection again keeps it selected.
    if (current?.projectId === projectId) {
      setActiveProjectId(projectId);
      return;
    }
    if (activeProjectId === projectId && !conversationId) {
      return;
    }

    setActiveProjectId(projectId);
    setConversationId(null);
    window.localStorage.removeItem(CONVERSATION_STORAGE_KEY);
    setMessages([
      {
        id: "collection-switch",
        role: "system",
        content: `已切换到 Collection「${projectName}」。可直接在下方提问，或点该 Collection 旁的 + 新建任务；顶部「新任务」会创建无归属任务。`,
      },
    ]);
    setPendingApprovals([]);
    setActiveWorkflow(null);
    setMeetingWorkflow(null);
    setCanvasOpen(false);
    setCanvasAfterMessageId(null);
    setSelectedArtifact(null);
    window.localStorage.removeItem(WORKFLOW_STORAGE_KEY);
  }

  async function handleOpenArtifact(artifactId: string) {
    try {
      const response = await fetch(`/api/artifacts/${artifactId}`);
      const payload = (await response.json()) as {
        artifact?: {
          id: string;
          title: string;
          artifactType: string;
          blocks: unknown[];
        };
        message?: string;
      };
      if (!response.ok || !payload.artifact) {
        throw new Error(payload.message || "打开 Artifact 失败");
      }
      setSelectedArtifact(payload.artifact);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: error instanceof Error ? error.message : "打开 Artifact 失败",
        },
      ]);
    }
  }

  async function postDralkEvent(
    event: "canvas_opened" | "recognized" | "attached" | "cancelled" | "failed" | "completed",
    extra?: {
      queryPayload?: {
        displaySummary?: string;
        recognitionType?: string;
        structuredContent?: unknown;
        voiceTranscriptRef?: string;
        startMs?: number;
        endMs?: number;
        canvasSessionId?: string;
      };
      errorMessage?: string;
    },
  ) {
    if (!conversationId || !activeWorkflow) {
      return null;
    }

    const response = await fetch("/api/workflows/dralk/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId,
        workflowId: activeWorkflow.id,
        event,
        canvasSessionId: activeWorkflow.payload.canvasSessionId ?? undefined,
        ...extra,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as { workflow: DralkWorkflowRecord };
    setActiveWorkflow(payload.workflow);
    return payload.workflow;
  }

  async function openCanvasFromWorkflowRequest(
    request: WorkflowRequest,
    options?: {
      afterMessageId?: string;
      workflow?: DralkWorkflowRecord | null;
    },
  ) {
    const afterMessageId = options?.afterMessageId;
    const workflow = options?.workflow;
    const nextVoiceSessionId = crypto.randomUUID();

    setActiveWorkflow(
      workflow ?? {
        id: request.workflowId,
        conversationId: request.conversationId,
        workflowType: "dralk_input",
        status: request.status,
        payload: {
          origin: request.origin,
          prompt: request.prompt,
          mode: request.mode,
          language: request.language,
          forceNew: request.forceNew,
          canvasSessionId: null,
          queryPayload: null,
          errorMessage: null,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    );
    window.localStorage.setItem(WORKFLOW_STORAGE_KEY, request.workflowId);

    setCanvasOpen(true);
    setCanvasStatus("opening");
    setWidgetStatus("loading");
    setCanvasDisplayMode("inline");
    setCanvasCollapsed(false);
    setHwrMode(request.mode);
    setHwrLanguage(request.language);
    setHwrPrompt(request.prompt);
    setRecognitionText("");
    setRecognitionError(null);
    setVoiceSessionId(nextVoiceSessionId);
    setVoiceAttachment(null);
    canvasSessionStartedAtRef.current = performance.now();
    if (afterMessageId) {
      setCanvasAfterMessageId(afterMessageId);
    }

    setHwrOpenResult({
      ok: true,
      mode: request.mode,
      language: request.language,
      prompt: request.prompt,
      toolName: "fluxink-widget-host",
    });
    setCanvasStatus("ready");
    setWidgetSessionId((current) => current + 1);

    await fetch("/api/workflows/dralk/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: request.conversationId,
        workflowId: request.workflowId,
        event: "canvas_opened",
        canvasSessionId: workflow?.payload.canvasSessionId ?? undefined,
      }),
    })
      .then(async (response) => {
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { workflow: DralkWorkflowRecord };
        setActiveWorkflow(payload.workflow);
      })
      .catch(() => undefined);
  }

  async function clearDralkSessionLocal() {
    setActiveWorkflow(null);
    setCanvasOpen(false);
    setCanvasCollapsed(false);
    setCanvasAfterMessageId(null);
    setRecognitionText("");
    setRecognitionError(null);
    window.localStorage.removeItem(WORKFLOW_STORAGE_KEY);
  }

  async function handleStartDralk() {
    // Button only opens/focuses the canvas — it does not toggle into an "end" state.
    if (canvasOpen && activeWorkflow) {
      setCanvasCollapsed(false);
      setCanvasDisplayMode("inline");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/workflows/dralk/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId ?? undefined,
          origin: "user_button",
          prompt: "请在画布中边画边说输入内容",
          forceNew: true,
        }),
      });
      const payload = (await response.json()) as {
        conversationId: string;
        workflow?: DralkWorkflowRecord;
        workflowRequest: WorkflowRequest;
        userMessageId?: string;
        assistantMessageId?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message || "启动 Dralk 失败");
      }
      persistConversationId(payload.conversationId);

      // Reload messages so button entry is part of the chat timeline.
      const conversationResponse = await fetch(`/api/conversations/${payload.conversationId}`);
      if (conversationResponse.ok) {
        const conversationPayload = (await conversationResponse.json()) as {
          messages: ChatMessage[];
        };
        setMessages(
          conversationPayload.messages.length > 0
            ? conversationPayload.messages
            : [welcomeMessage],
        );
      }

      const anchorId = payload.assistantMessageId || undefined;
      if (anchorId) {
        setCanvasAfterMessageId(anchorId);
      }
      await openCanvasFromWorkflowRequest(payload.workflowRequest, {
        afterMessageId: anchorId,
        workflow: payload.workflow,
      });
      await refreshRecentConversations();
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: error instanceof Error ? error.message : "启动 Dralk 失败",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function handleStartMeeting() {
    setBusy(true);
    try {
      const response = await fetch("/api/workflows/meeting/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId ?? undefined,
          origin: "user_button",
        }),
      });
      const payload = (await response.json()) as {
        conversationId?: string;
        workflow?: MeetingWorkflowRecord;
        message?: string;
      };
      if (!response.ok || !payload.conversationId || !payload.workflow) {
        throw new Error(payload.message || "启动会议失败");
      }
      persistConversationId(payload.conversationId);
      setMeetingWorkflow(payload.workflow);
      await loadConversationById(payload.conversationId);
      await refreshRecentConversations();
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: error instanceof Error ? error.message : "启动会议失败",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function handleFinishMeeting() {
    if (!meetingWorkflow) {
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/workflows/meeting/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: meetingWorkflow.conversationId,
          workflowId: meetingWorkflow.id,
        }),
      });
      const payload = (await response.json()) as {
        workflow?: MeetingWorkflowRecord;
        message?: string;
      };
      if (!response.ok || !payload.workflow) {
        throw new Error(payload.message || "结束会议失败");
      }
      setMeetingWorkflow(payload.workflow);
      await loadConversationById(meetingWorkflow.conversationId);
      await refreshRecentConversations();
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: error instanceof Error ? error.message : "结束会议失败",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function handleWriteMeetingCalendar() {
    const action = meetingWorkflow?.payload.actionItems[0];
    const sourceId = meetingWorkflow?.payload.storedSourceIds.find((id) =>
      id.endsWith("_minutes"),
    );
    if (!action) {
      return;
    }
    await handleSend(
      `请从会议纪要来源 ${sourceId ?? "刚才的会议纪要"} 核实行动项，并把「${action.title}」写入 Tablet 日历。时间使用 ${action.dueAt}，安排 30 分钟；idempotencyKey 使用 ${action.id}。请调用 create_calendar_event 并展示写入结果。`,
    );
  }

  const canvasSummary = useMemo(
    () =>
      createCanvasSummary(
        canvasOpen,
        [],
        null,
      ),
    [canvasOpen],
  );

  const getCanvasElapsedMs = useCallback(() => {
    if (canvasSessionStartedAtRef.current <= 0) {
      return 0;
    }

    return Math.max(0, Math.round(performance.now() - canvasSessionStartedAtRef.current));
  }, []);

  async function handleSend(message: string) {
    const cleanedMessage = stripVoiceAttachmentReference(message);
    const outboundAttachments = shouldSendVoiceAttachment(voiceAttachmentRef.current)
      ? [voiceAttachmentRef.current!]
      : [];

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: cleanedMessage,
      attachments: outboundAttachments,
    };

    setMessages((current) => [...current, userMessage]);
    setBusy(true);
    setVoiceAttachment(null);
    voiceAttachmentRef.current = null;
    voiceRecorderRef.current?.clearTranscript();

    try {
      const compactDralk = recognitionText.trim()
        ? buildCompactDralkQueryPayload({
            recognitionText,
            canvasPrompt: hwrPromptRef.current,
            voiceTranscriptRef: outboundAttachments[0]?.id ?? null,
            startMs: 0,
            endMs: getCanvasElapsedMs(),
            canvasSessionId: activeWorkflow?.payload.canvasSessionId ?? null,
          })
        : null;

      if (activeWorkflow && compactDralk?.displaySummary) {
        await postDralkEvent("attached", {
          queryPayload: {
            displaySummary: compactDralk.displaySummary,
            recognitionType: compactDralk.recognitionType,
            structuredContent: compactDralk.structuredContent,
            voiceTranscriptRef: compactDralk.voiceTranscriptRef ?? undefined,
            startMs: compactDralk.startMs,
            endMs: compactDralk.endMs,
            canvasSessionId: compactDralk.canvasSessionId ?? undefined,
          },
        });
      }

      const response = await fetch("/api/agent/run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId: conversationId ?? undefined,
          projectId: activeProjectId,
          message: cleanedMessage,
          canvas: canvasSummary,
          attachments: outboundAttachments,
          dralkContext: compactDralk?.displaySummary ? compactDralk : undefined,
        }),
      });

      const payload = (await response.json()) as AgentRunResponse;

      if (!response.ok) {
        throw new Error(payload.message || "Agent run 请求失败");
      }

      persistConversationId(payload.conversationId);
      setPendingApprovals(payload.approvals ?? []);
      await refreshRecentConversations();

      const legacySvg = extractLegacySvgFences(payload.message);
      const legacySvgBlocks = svgSpecsToContentBlocks([
        ...extractRenderSvgSpecs(payload.actions),
        ...legacySvg.specs,
      ]);
      const charts = extractRenderChartSpecs(payload.actions);
      const opensCanvas =
        Boolean(payload.workflowRequest) ||
        payload.actions.some((action) => action.type === "open_handwriting_canvas");
      const hasRichAnswer =
        payload.blocks.length > 0 || legacySvgBlocks.length > 0 || charts.length > 0;
      // Canvas-open turns should not surface an「AskAI 答复」stub — the canvas is the result.
      const answerContent =
        opensCanvas && !hasRichAnswer
          ? ""
          : legacySvg.content ||
            (legacySvg.specs.length > 0 ? "已生成规范图形。" : payload.message);
      const assistantMessage: ChatMessage = {
        id: payload.assistantMessageId || crypto.randomUUID(),
        role: "assistant",
        content: answerContent,
        blocks: [...payload.blocks, ...legacySvgBlocks],
        charts,
        evidence: opensCanvas && !hasRichAnswer ? undefined : payload.evidence,
        artifacts: payload.artifacts,
      };

      setMessages((current) => {
        const withoutTempUser = current.filter((item) => item.id !== userMessage.id);
        return [
          ...withoutTempUser,
          {
            ...userMessage,
            id: payload.userMessageId || userMessage.id,
          },
          assistantMessage,
        ];
      });

      if (payload.workflowRequest) {
        setCanvasAfterMessageId(assistantMessage.id);
        await openCanvasFromWorkflowRequest(payload.workflowRequest, {
          afterMessageId: assistantMessage.id,
        });
      } else if (payload.actions.some((action) => action.type === "open_handwriting_canvas")) {
        const action = payload.actions.find(
          (item) => item.type === "open_handwriting_canvas",
        ) as Extract<AgentAction, { type: "open_handwriting_canvas" }>;
        const startResponse = await fetch("/api/workflows/dralk/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: payload.conversationId,
            origin: "agent_intent",
            prompt: action.prompt,
            mode: action.mode,
            language: action.language,
            forceNew: action.force_new,
          }),
        });
        if (startResponse.ok) {
          const started = (await startResponse.json()) as {
            workflow?: DralkWorkflowRecord;
            workflowRequest: WorkflowRequest;
          };
          setCanvasAfterMessageId(assistantMessage.id);
          await openCanvasFromWorkflowRequest(started.workflowRequest, {
            afterMessageId: assistantMessage.id,
            workflow: started.workflow,
          });
        }
      } else if (payload.actions.some((action) => action.type === "open_meeting_workflow")) {
        const action = payload.actions.find(
          (item) => item.type === "open_meeting_workflow",
        ) as Extract<AgentAction, { type: "open_meeting_workflow" }>;
        const startResponse = await fetch("/api/workflows/meeting/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: payload.conversationId,
            origin: "agent_intent",
            meetingId: action.meetingId ?? undefined,
          }),
        });
        if (startResponse.ok) {
          const started = (await startResponse.json()) as {
            workflow?: MeetingWorkflowRecord;
          };
          setMeetingWorkflow(started.workflow ?? null);
        }
      } else if (recognitionText.trim() || outboundAttachments.length > 0) {
        // This turn consumed Dralk input — close local session.
        await clearDralkSessionLocal();
      }
      // If Dralk canvas is still open without being consumed, keep activeWorkflow.

      if (canvasOpen && (recognitionText.trim() || outboundAttachments.length > 0)) {
        setCanvasCollapsed(true);
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: error instanceof Error ? error.message : "未知错误",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function handleApprovalDecide(input: {
    callId: string;
    decision: "approve" | "reject";
  }) {
    if (!conversationId || pendingApprovals.length === 0) {
      return;
    }

    const runStateId = pendingApprovals[0]?.runStateId;
    setBusy(true);
    try {
      const response = await fetch("/api/agent/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          runStateId,
          decisions: [
            {
              callId: input.callId,
              decision: input.decision,
              message:
                input.decision === "reject" ? "用户拒绝了该待办写入。" : undefined,
            },
          ],
        }),
      });
      const payload = (await response.json()) as AgentRunResponse;
      if (!response.ok) {
        throw new Error(payload.message || "审批恢复失败");
      }

      setPendingApprovals(payload.approvals ?? []);
      const assistantMessage: ChatMessage = {
        id: payload.assistantMessageId || crypto.randomUUID(),
        role: "assistant",
        content: payload.message,
        blocks: payload.blocks,
        charts: extractRenderChartSpecs(payload.actions),
        evidence: payload.evidence,
        artifacts: payload.artifacts,
      };
      setMessages((current) => [...current, assistantMessage]);
      await refreshRecentConversations();

      if (payload.workflowRequest) {
        await openCanvasFromWorkflowRequest(payload.workflowRequest, {
          afterMessageId: assistantMessage.id,
        });
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "system",
          content: error instanceof Error ? error.message : "审批恢复失败",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  function handleCreateDocument(sourceMessageId: string, title: string, blocks: ContentBlock[]) {
    const documentId = crypto.randomUUID();
    const documentBlocks = structuredClone(blocks).map((block, index) => ({
      ...block,
      id: `${documentId}-block-${index + 1}`,
    }));
    const documentMessage: ChatMessage = {
      id: documentId,
      role: "assistant",
      content: "",
      document: {
        title,
        sourceMessageId,
        createdAt: new Date().toISOString(),
      },
      blocks: documentBlocks,
    };

    setMessages((current) => [...current, documentMessage]);
  }

  const stableWidgetRecognitionChange = useCallback(
    (payload: { text: string; status: WidgetStatus; error?: string | null }) => {
      setWidgetStatus(payload.status);
      setRecognitionText(payload.text);
      setRecognitionError(payload.error ?? null);

      if (payload.status === "recognized") {
        setCanvasStatus("recognized");
        if (conversationId && activeWorkflow) {
          const compact = buildCompactDralkQueryPayload({
            recognitionText: payload.text,
            canvasPrompt: hwrPromptRef.current,
            canvasSessionId: activeWorkflow.payload.canvasSessionId,
          });
          void fetch("/api/workflows/dralk/event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversationId,
              workflowId: activeWorkflow.id,
              event: "recognized",
              queryPayload: {
                displaySummary: compact.displaySummary,
                recognitionType: compact.recognitionType,
                structuredContent: compact.structuredContent,
                canvasSessionId: compact.canvasSessionId,
              },
            }),
          })
            .then(async (response) => {
              if (!response.ok) {
                return;
              }
              const body = (await response.json()) as { workflow: DralkWorkflowRecord };
              setActiveWorkflow(body.workflow);
            })
            .catch(() => undefined);
        }
        return;
      }

      if (payload.status === "error") {
        setCanvasStatus("error");
        return;
      }

      if (payload.status === "ready") {
        setCanvasStatus("ready");
      }
    },
    [activeWorkflow, conversationId],
  );

  const handleSendResultToComposer = useCallback((text: string) => {
    if (voiceRecorderRef.current?.isRecording()) {
      const payload = voiceRecorderRef.current.stopAndFlush();
      const attachment = payload ? createVoiceTranscriptAttachment(payload) : voiceAttachmentRef.current;
      if (attachment) {
        setVoiceAttachment(attachment);
        voiceAttachmentRef.current = attachment;
      }
    }

    const prepared = stripVoiceAttachmentReference(prepareRecognitionForComposer(text, hwrPromptRef.current));

    if (!prepared) {
      return;
    }

    setCanvasDisplayMode("inline");
    setCanvasCollapsed(true);
    setComposerDraft((current) => {
      const sanitizedCurrent = stripVoiceAttachmentReference(
        prepareRecognitionForComposer(current, hwrPromptRef.current),
      );

      if (!sanitizedCurrent) {
        return prepared;
      }

      if (sanitizedCurrent.includes(prepared)) {
        return sanitizedCurrent;
      }

      return `${sanitizedCurrent}\n\n${prepared}`;
    });
    setComposerFocusSignal((current) => current + 1);
  }, []);

  const handleVoiceTranscriptChange = useCallback((payload: VoiceTranscriptPayload) => {
    const attachment = createVoiceTranscriptAttachment(payload);
    setVoiceAttachment(attachment);
    voiceAttachmentRef.current = attachment;
  }, []);

  const handleCanvasDisplayModeChange = useCallback((mode: CanvasDisplayMode) => {
    setCanvasDisplayMode(mode);
    if (mode === "fullscreen") {
      setCanvasCollapsed(false);
    }
  }, []);

  const canvasSlot = canvasOpen ? (
    <div
      className={
        canvasDisplayMode === "fullscreen"
          ? "canvas-session canvas-session-fullscreen"
          : canvasCollapsed
            ? "canvas-session canvas-session-inline canvas-session-collapsed"
            : "canvas-session canvas-session-inline"
      }
    >
      {canvasCollapsed ? (
        <div className="canvas-collapsed-summary" role="status">
          <div className="canvas-collapsed-copy">
            <span className="canvas-collapsed-icon" aria-hidden="true">✓</span>
            <div>
              <strong>手写内容已就绪</strong>
              <p>可在下方输入框补充说明后发送 AskAI。</p>
              {voiceAttachment?.content.trim() ? (
                <span className="canvas-voice-attached">语音已附加</span>
              ) : null}
            </div>
          </div>
          <button type="button" onClick={() => setCanvasCollapsed(false)}>
            展开
          </button>
        </div>
      ) : null}
      <div
        className={canvasCollapsed ? "canvas-session-content is-collapsed" : "canvas-session-content"}
        aria-hidden={canvasCollapsed}
        inert={canvasCollapsed}
      >
        <FluxInkWidgetHost
          key={widgetSessionId}
          displayMode={canvasDisplayMode}
          mode={hwrMode}
          language={hwrLanguage}
          prompt={hwrPrompt}
          uiResourceUri={DEFAULT_FLUXINK_HWR_UI_RESOURCE_URI}
          openResult={hwrOpenResult}
          recognitionError={recognitionError}
          onDisplayModeChange={handleCanvasDisplayModeChange}
          onRecognitionChange={stableWidgetRecognitionChange}
          onSendResultToComposer={handleSendResultToComposer}
        />
        <VoiceRecorder
          ref={voiceRecorderRef}
          sessionId={voiceSessionId}
          disabled={busy || hydrating}
          getElapsedMs={getCanvasElapsedMs}
          onTranscriptChange={handleVoiceTranscriptChange}
          compact={canvasDisplayMode === "fullscreen"}
        />
      </div>
    </div>
  ) : null;

  return (
    <main className={navOpen ? "app-shell nav-open" : "app-shell"}>
      <button
        type="button"
        className="nav-backdrop"
        aria-label="关闭导航栏"
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />
      <ProjectNav
        projects={projects}
        recent={recentConversations}
        activeConversationId={conversationId}
        activeProjectId={activeProjectId}
        busy={busy || hydrating}
        onNewChat={(projectId) => {
          void handleNewChat(projectId);
        }}
        onNewProject={() => {
          void handleNewProject();
        }}
        onSelectConversation={(id) => {
          void loadConversationById(id);
        }}
        onSelectProject={(id) => {
          void handleSelectProject(id);
        }}
        onRequestClose={() => setNavOpen(false)}
      />
      <ChatPanel
        canvasSlot={canvasSlot}
        canvasAfterMessageId={canvasAfterMessageId}
        draft={composerDraft}
        focusComposerSignal={composerFocusSignal}
        voiceAttachment={voiceAttachment}
        approvals={pendingApprovals}
        meetingWorkflow={meetingWorkflow}
        messages={messages}
        busy={busy || hydrating}
        navOpen={navOpen}
        onToggleNav={() => setNavOpen((open) => !open)}
        onDraftChange={setComposerDraft}
        onSend={handleSend}
        onStartDralk={handleStartDralk}
        onStartMeeting={handleStartMeeting}
        onFinishMeeting={handleFinishMeeting}
        onWriteMeetingCalendar={handleWriteMeetingCalendar}
        onCreateDocument={handleCreateDocument}
        onApprovalDecide={handleApprovalDecide}
        onOpenArtifact={(artifactId) => {
          void handleOpenArtifact(artifactId);
        }}
      />
      {selectedArtifact ? (
        <aside className="artifact-drawer" aria-label="Artifact 详情">
          <header className="artifact-drawer-header">
            <div>
              <strong>{selectedArtifact.title}</strong>
              <small>{selectedArtifact.artifactType}</small>
            </div>
            <button type="button" onClick={() => setSelectedArtifact(null)}>
              关闭
            </button>
          </header>
          <pre className="artifact-drawer-body">
            {JSON.stringify(selectedArtifact.blocks, null, 2)}
          </pre>
        </aside>
      ) : null}
    </main>
  );
}
