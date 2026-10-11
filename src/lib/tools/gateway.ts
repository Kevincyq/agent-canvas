import type { Connector, ConnectorId, GatewayContext } from "@/types/tool-gateway";
import { createFailedToolReceipt, type ToolReceipt } from "@/types/tool-receipt";

export class ToolGateway {
  private readonly connectors = new Map<ConnectorId, Connector>();

  constructor(connectors: Connector[]) {
    for (const connector of connectors) {
      this.connectors.set(connector.descriptor.id, connector);
    }
  }

  list() {
    return [...this.connectors.values()].map((item) => item.descriptor);
  }

  get(id: ConnectorId): Connector | undefined {
    return this.connectors.get(id);
  }

  /**
   * `TData` is the shape the caller's contract promises; connectors stay untyped
   * so a fixture can be swapped for a remote tool without touching call sites.
   */
  async invoke<TData = unknown>(
    connectorId: ConnectorId,
    operation: string,
    args: Record<string, unknown> = {},
    context: GatewayContext,
  ): Promise<ToolReceipt<TData>> {
    const connector = this.connectors.get(connectorId);
    if (!connector) {
      return createFailedToolReceipt(
        `${connectorId}.${operation}`,
        "CONNECTOR_NOT_FOUND",
        `Tool Gateway 未注册连接器：${connectorId}`,
        false,
      );
    }

    if (!connector.descriptor.operations.includes(operation)) {
      return createFailedToolReceipt(
        `${connectorId}.${operation}`,
        "CONNECTOR_OPERATION_NOT_FOUND",
        `连接器 ${connectorId} 不支持操作 ${operation}`,
        false,
      );
    }

    return (await connector.invoke(operation, args, context)) as ToolReceipt<TData>;
  }
}
