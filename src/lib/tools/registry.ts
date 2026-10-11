import { createAzureSpeechToken } from "@/lib/asr/create-azure-token";
import { getAsrConfig, isAsrConfigured } from "@/lib/asr/config";
import {
  callAllowedMcpTool,
  inspectMcpServer,
  readMcpUiResource,
} from "@/lib/mcp/client";
import { DEFAULT_FLUXINK_HWR_UI_RESOURCE_URI, HWR_TOOL_ALIASES } from "@/lib/mcp/constants";
import { startRegisteredWorkflow } from "@/lib/workflows/registry";
import { createMockServiceAdapters } from "@/lib/services/mock";
import { searchWeb } from "@/lib/services/web-search";
import { ToolGateway } from "@/lib/tools/gateway";
import type { Connector, GatewayContext } from "@/types/tool-gateway";
import { createFailedToolReceipt, createToolReceipt } from "@/types/tool-receipt";
import type { RegisteredWorkflowType } from "@/types/workflow-runtime";

const fixture = createMockServiceAdapters();

function asFixtureContext(context: GatewayContext) {
  return context as Parameters<typeof fixture.getCurrentContext>[0];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

const runtimeConnector: Connector = {
  descriptor: {
    id: "runtime",
    displayName: "Agent Runtime Context",
    kind: "runtime",
    operations: ["get_current_context"],
    realIntegration: true,
    adapterId: "runtime.local.v1",
    description: "读取当前会话、Collection 与权限快照。",
  },
  invoke: async (operation, _args, context) => {
    if (operation !== "get_current_context") {
      return createFailedToolReceipt(operation, "CONNECTOR_OPERATION_NOT_FOUND", operation, false);
    }
    return fixture.getCurrentContext(asFixtureContext(context));
  },
};

const pkbConnector: Connector = {
  descriptor: {
    id: "pkb",
    displayName: "Personal Knowledge",
    kind: "fixture",
    operations: ["get_project_context", "search"],
    realIntegration: false,
    adapterId: "pkb.fixture.v1",
    description: "Collection / 知识检索。当前为 SQLite seed Fixture。",
  },
  invoke: async (operation, args, context) => {
    const ctx = asFixtureContext(context);
    if (operation === "get_project_context") {
      return fixture.getProjectContext(ctx, stringArg(args, "projectId") ?? "");
    }
    if (operation === "search") {
      return fixture.searchPersonalKnowledge(
        ctx,
        stringArg(args, "query") ?? "",
        stringArg(args, "projectId") ?? null,
      );
    }
    return createFailedToolReceipt(operation, "CONNECTOR_OPERATION_NOT_FOUND", operation, false);
  },
};

const webSearchConnector: Connector = {
  descriptor: {
    id: "web_search",
    displayName: "Web Search",
    kind: "remote_tool",
    operations: ["search"],
    realIntegration: true,
    adapterId: "web.tavily.v1",
    description: "Tavily 实时搜索。未配置密钥时失败，不回退 Mock。",
  },
  invoke: async (operation, args) => {
    if (operation !== "search") {
      return createFailedToolReceipt(operation, "CONNECTOR_OPERATION_NOT_FOUND", operation, false);
    }
    return searchWeb(stringArg(args, "query") ?? "");
  },
};

const meetingConnector: Connector = {
  descriptor: {
    id: "meeting",
    displayName: "Meeting Context",
    kind: "fixture",
    operations: ["get_context"],
    realIntegration: false,
    adapterId: "meeting.fixture.v1",
    description: "会议上下文读取。内容来自 Fixture。",
  },
  invoke: async (operation, args) => {
    if (operation !== "get_context") {
      return createFailedToolReceipt(operation, "CONNECTOR_OPERATION_NOT_FOUND", operation, false);
    }
    return fixture.getMeetingContext(stringArg(args, "meetingId"));
  },
};

const artifactConnector: Connector = {
  descriptor: {
    id: "artifact",
    displayName: "Artifact Store",
    kind: "runtime",
    operations: ["save"],
    realIntegration: true,
    adapterId: "artifact.sqlite.v1",
    description: "把 typed blocks 写入项目 Artifact。",
  },
  invoke: async (operation, args, context) => {
    if (operation !== "save") {
      return createFailedToolReceipt(operation, "CONNECTOR_OPERATION_NOT_FOUND", operation, false);
    }
    return fixture.saveArtifactToProject({
      conversationId: context.conversationId,
      projectId: stringArg(args, "projectId") ?? "",
      title: stringArg(args, "title") ?? "",
      artifactType: stringArg(args, "artifactType"),
      blocks: Array.isArray(args.blocks) ? args.blocks : [],
      evidence: args.evidence,
      idempotencyKey: stringArg(args, "idempotencyKey"),
    });
  },
};

const todoConnector: Connector = {
  descriptor: {
    id: "todo",
    displayName: "ToDo",
    kind: "fixture",
    operations: ["create"],
    realIntegration: false,
    adapterId: "todo.mock.v1",
    description: "Mock 待办写入，需用户审批。",
  },
  invoke: async (operation, args, context) => {
    if (operation !== "create") {
      return createFailedToolReceipt(operation, "CONNECTOR_OPERATION_NOT_FOUND", operation, false);
    }
    return fixture.createTodo({
      title: stringArg(args, "title") ?? "",
      dueAt: stringArg(args, "dueAt"),
      projectId: stringArg(args, "projectId") ?? context.projectId,
      idempotencyKey: stringArg(args, "idempotencyKey"),
    });
  },
};

const calendarConnector: Connector = {
  descriptor: {
    id: "calendar",
    displayName: "Calendar",
    kind: "fixture",
    operations: ["create_event"],
    realIntegration: false,
    adapterId: "calendar.mock.v1",
    description: "Mock 平板日历写入，需用户审批。",
  },
  invoke: async (operation, args) => {
    if (operation !== "create_event") {
      return createFailedToolReceipt(operation, "CONNECTOR_OPERATION_NOT_FOUND", operation, false);
    }
    return fixture.createCalendarEvent({
      title: stringArg(args, "title") ?? "",
      startAt: stringArg(args, "startAt") ?? "",
      endAt: stringArg(args, "endAt") ?? "",
      notes: stringArg(args, "notes"),
      sourceId: stringArg(args, "sourceId"),
      idempotencyKey: stringArg(args, "idempotencyKey"),
    });
  },
};

const workflowConnector: Connector = {
  descriptor: {
    id: "workflow",
    displayName: "Workflow Engine",
    kind: "workflow",
    operations: ["start_dralk", "start_meeting", "start_writing_assist", "start_translation"],
    realIntegration: true,
    adapterId: "workflow.registry.v1",
    description: "启动已注册 Workflow。Dralk 为 native，Meeting 为 fixture，帮写/翻译为 external_pending。",
  },
  invoke: async (operation, args, context) => {
    const mapping: Record<string, RegisteredWorkflowType> = {
      start_dralk: "dralk_input",
      start_meeting: "meeting",
      start_writing_assist: "writing_assist",
      start_translation: "translation",
    };
    const workflowType = mapping[operation];
    if (!workflowType) {
      return createFailedToolReceipt(operation, "CONNECTOR_OPERATION_NOT_FOUND", operation, false);
    }

    const started = await startRegisteredWorkflow({
      conversationId: context.conversationId,
      workflowType,
      origin: "agent_intent",
      input: (args.input as Record<string, unknown> | undefined) ?? args,
      contextRefs: Array.isArray(args.contextRefs)
        ? (args.contextRefs as never[])
        : [],
      userId: context.userId,
      tenantId: context.tenantId,
    });

    const prompt = stringArg(args, "prompt") ?? "";
    const mode = stringArg(args, "mode") ?? "general";
    const language = stringArg(args, "language") ?? "";

    return createToolReceipt({
      ok: true,
      tool: operation,
      data: {
        workflowId: started.instance.id,
        meetingId: stringArg(args, "meetingId") ?? null,
        status: started.instance.runtimeStatus,
        realIntegration: started.workflowRequest.executionMode === "native",
        registeredWorkflowRequest: started.workflowRequest,
        workflowRequest:
          workflowType === "dralk_input"
            ? {
                type: "dralk_input",
                workflowId: started.instance.id,
                conversationId: started.instance.conversationId,
                origin: "agent_intent",
                status: started.instance.status,
                prompt,
                mode,
                language,
                forceNew: args.forceNew === true,
              }
            : undefined,
      },
    });
  },
};

const fluxinkConnector: Connector = {
  descriptor: {
    id: "fluxink",
    displayName: "FluxInk MCP",
    kind: "remote_tool",
    operations: ["inspect", "recognize", "read_ui"],
    realIntegration: true,
    adapterId: "fluxink.mcp.v1",
    description: "手写识别与 MCP App widget 资源。由 UI Host 调用，不经模型直接调 MCP。",
  },
  invoke: async (operation, args) => {
    if (operation === "inspect") {
      const results = await inspectMcpServer();
      return createToolReceipt({
        ok: results.some((item) => item.ok),
        tool: "fluxink.inspect",
        data: { results },
      });
    }
    if (operation === "recognize") {
      const toolName =
        stringArg(args, "toolName") ?? HWR_TOOL_ALIASES.recognizeHandwriting[0];
      const result = await callAllowedMcpTool(toolName, {
        strokes: args.strokes,
        mode: args.mode,
        ...(stringArg(args, "language") ? { language: stringArg(args, "language") } : {}),
      });
      // callAllowedMcpTool throws on transport failure; FluxInk reports logical
      // failure inside the payload as `success: false`.
      const payload = isRecord(result) ? result : {};
      const failed = payload.success === false;
      return createToolReceipt({
        ok: !failed,
        tool: "fluxink.recognize",
        data: result,
        error: failed
          ? {
              code: "FLUXINK_RECOGNIZE_FAILED",
              message: stringArg(payload, "error") ?? "FluxInk 识别失败",
              retryable: true,
            }
          : undefined,
      });
    }
    if (operation === "read_ui") {
      const uri = stringArg(args, "uri") ?? DEFAULT_FLUXINK_HWR_UI_RESOURCE_URI;
      const resource = await readMcpUiResource(uri);
      return createToolReceipt({
        ok: true,
        tool: "fluxink.read_ui",
        data: resource,
      });
    }
    return createFailedToolReceipt(operation, "CONNECTOR_OPERATION_NOT_FOUND", operation, false);
  },
};

const azureAsrConnector: Connector = {
  descriptor: {
    id: "azure_asr",
    displayName: "Azure Speech",
    kind: "device_input",
    operations: ["issue_token"],
    realIntegration: true,
    adapterId: "asr.azure.realtime.v1",
    description: "签发 Azure 实时转写 STS token。识别在浏览器完成。",
  },
  invoke: async (operation) => {
    if (operation !== "issue_token") {
      return createFailedToolReceipt(operation, "CONNECTOR_OPERATION_NOT_FOUND", operation, false);
    }
    const config = getAsrConfig();
    if (!isAsrConfigured(config)) {
      return createFailedToolReceipt(
        "azure_asr.issue_token",
        "ASR_NOT_CONFIGURED",
        "Missing AZURE_STT_KEY or AZURE_STT_REGION for realtime transcription.",
        false,
      );
    }
    const session = await createAzureSpeechToken(config);
    return createToolReceipt({
      ok: true,
      tool: "azure_asr.issue_token",
      data: session,
    });
  },
};

export function createDefaultToolGateway(): ToolGateway {
  return new ToolGateway([
    runtimeConnector,
    pkbConnector,
    webSearchConnector,
    meetingConnector,
    artifactConnector,
    todoConnector,
    calendarConnector,
    workflowConnector,
    fluxinkConnector,
    azureAsrConnector,
  ]);
}

let defaultGateway: ToolGateway | null = null;

export function getDefaultToolGateway(): ToolGateway {
  if (!defaultGateway) {
    defaultGateway = createDefaultToolGateway();
  }
  return defaultGateway;
}

export function resetDefaultToolGatewayForTests() {
  defaultGateway = null;
}
