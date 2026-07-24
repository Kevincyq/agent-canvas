import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { runAgentTurn } from "@/lib/agent/agent";
import { writeAuditEvent } from "@/lib/observability/audit";
import { resolvePortalUserContext } from "@/lib/portal/user-context";
import { AgentRunRequestSchema } from "@/types/agent-runtime";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const body = (await request.json()) as unknown;
    const payload = AgentRunRequestSchema.parse(body);
    const portal = resolvePortalUserContext({
      headers: request.headers,
      bodyUserId: payload.userId,
      bodyTenantId: payload.tenantId,
    });

    writeAuditEvent({
      requestId,
      conversationId: payload.conversationId,
      userId: portal.userId,
      tenantId: portal.tenantId,
      eventType: "agent.run.start",
      payload: {
        messagePreview: payload.message.slice(0, 120),
        hasAttachments: payload.attachments.length > 0,
        projectId: payload.projectId ?? null,
        portalSource: portal.source,
      },
    });

    if (process.env.NODE_ENV === "development" && payload.message.trim() === "/typed-blocks-demo") {
      const { conversationTaskStore } = await import("@/lib/task/task-store");
      const { titleFromFirstMessage } = await import("@/lib/task/task-state");
      const conversation = conversationTaskStore.ensure(payload.conversationId, {
        title: titleFromFirstMessage(payload.message),
        originSurface: "askai",
        userId: portal.userId,
        tenantId: portal.tenantId,
      });

      const demoBlocks = [
        {
          id: "demo-markdown",
          type: "markdown" as const,
          sourceFormat: "markdown" as const,
          title: "项目说明",
          source: "## Project A\n这是一段可编辑的 **Markdown** 文本。",
        },
        {
          id: "demo-mermaid",
          type: "mermaid" as const,
          sourceFormat: "mermaid" as const,
          diagramType: "flowchart" as const,
          title: "开发流程",
          source: "flowchart LR\n  A[需求] --> B[开发]\n  B --> C[测试]\n  C --> D[发布]",
        },
        {
          id: "demo-mindmap",
          type: "mermaid" as const,
          sourceFormat: "mermaid" as const,
          diagramType: "mindmap" as const,
          title: "产品思维导图",
          source:
            "mindmap\n  root((Agent Canvas))\n    输入\n      手写\n      语音\n    理解\n      识别\n      推理\n    输出\n      文档\n      图表",
        },
        {
          id: "demo-latex",
          type: "latex" as const,
          sourceFormat: "latex" as const,
          title: "求根公式",
          source: "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
        },
        {
          id: "demo-table",
          type: "table" as const,
          sourceFormat: "table_json" as const,
          title: "任务表",
          columns: ["阶段", "负责人", "状态"],
          rows: [
            ["需求", "PM", "已完成"],
            ["开发", "RD", "进行中"],
          ],
        },
        {
          id: "demo-graph",
          type: "graph" as const,
          sourceFormat: "graph_json" as const,
          title: "系统结构图",
          nodes: [
            { id: "portal", label: "Portal", x: 120, y: 210 },
            { id: "askai", label: "AskAI", x: 360, y: 110 },
            { id: "dralk", label: "Dralk", x: 360, y: 310 },
            { id: "mcp", label: "MCP Server", x: 600, y: 210 },
          ],
          edges: [
            { source: "portal", target: "askai", label: "提问" },
            { source: "portal", target: "dralk", label: "手写" },
            { source: "dralk", target: "mcp", label: "识别" },
            { source: "askai", target: "mcp", label: "调用" },
          ],
        },
      ];

      const userMessage = conversationTaskStore.appendMessage({
        conversationId: conversation.id,
        role: "user",
        content: payload.message,
      });
      const assistantMessage = conversationTaskStore.appendMessage({
        conversationId: conversation.id,
        role: "assistant",
        content: "已生成文本、公式、流程图、思维导图、表格和结构图六种可编辑内容。",
        blocks: demoBlocks,
        actions: [],
      });

      return NextResponse.json({
        conversationId: conversation.id,
        sessionId: conversation.sessionId,
        status: "ready",
        message: "已生成文本、公式、流程图、思维导图、表格和结构图六种可编辑内容。",
        blocks: demoBlocks,
        actions: [],
        userMessageId: userMessage.id,
        assistantMessageId: assistantMessage.id,
      });
    }

    const result = await runAgentTurn({
      ...payload,
      userId: portal.userId,
      tenantId: portal.tenantId,
      signal: request.signal,
    });

    writeAuditEvent({
      requestId: result.requestId ?? requestId,
      conversationId: result.conversationId,
      userId: portal.userId,
      tenantId: portal.tenantId,
      eventType: "agent.run.end",
      payload: {
        status: result.status,
        outputStatus: result.outputStatus ?? null,
        approvalCount: result.approvals?.length ?? 0,
        evidenceCount: result.evidence?.length ?? 0,
        artifactCount: result.artifacts?.length ?? 0,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    writeAuditEvent({
      requestId,
      eventType: "agent.run.end",
      payload: {
        status: "failed",
        error: error instanceof Error ? error.message : "Agent run 请求处理失败",
      },
    });
    return NextResponse.json(
      {
        conversationId: "",
        sessionId: "",
        status: "failed",
        message: error instanceof Error ? error.message : "Agent run 请求处理失败",
        blocks: [],
        actions: [
          {
            type: "reply",
            message: "请求处理失败，请检查输入或服务端配置。",
          },
        ],
        userMessageId: "",
        assistantMessageId: "",
      },
      { status: 400 },
    );
  }
}
