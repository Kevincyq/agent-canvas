import type { ToolReceipt } from "@/types/tool-receipt";

export const CONNECTOR_IDS = [
  "runtime",
  "pkb",
  "web_search",
  "meeting",
  "artifact",
  "todo",
  "calendar",
  "workflow",
  "fluxink",
  "azure_asr",
] as const;

export type ConnectorId = (typeof CONNECTOR_IDS)[number];

export type ConnectorKind = "runtime" | "fixture" | "remote_tool" | "workflow" | "device_input";

export type ConnectorDescriptor = {
  id: ConnectorId;
  displayName: string;
  kind: ConnectorKind;
  operations: string[];
  realIntegration: boolean;
  adapterId: string;
  description: string;
};

export type GatewayContext = {
  userId: string;
  tenantId: string;
  conversationId: string;
  projectId?: string;
  currentSurface: string;
  selectedSourceIds: string[];
  permissions: Record<string, boolean>;
};

export type Connector = {
  descriptor: ConnectorDescriptor;
  invoke: (
    operation: string,
    args: Record<string, unknown>,
    context: GatewayContext,
  ) => Promise<ToolReceipt>;
};

export type ToolGatewaySnapshot = {
  runtime: "cloud_web";
  connectors: ConnectorDescriptor[];
};
