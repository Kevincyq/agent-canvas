import type { AgentRunResponse } from "@/types/agent-runtime";
import type { ContentBlock } from "@/types/content-block";
import type { PlotSpec } from "@/types/plot";
import type { SvgSpec } from "@/types/svg";

export const AGENT_STREAM_EVENT_TYPES = [
  "run.started",
  "tool.started",
  "tool.completed",
  "answer.delta",
  "answer.message",
  "block.delta",
  "block.completed",
  "chart.completed",
  "svg.completed",
  "done",
  "error",
] as const;

export type AgentStreamEventType = (typeof AGENT_STREAM_EVENT_TYPES)[number];

/** Marks placeholder blocks built from `block.delta`, dropped once real blocks land. */
export const STREAMING_BLOCK_ID_PREFIX = "stream-block-";

export type AgentStreamEvent =
  | {
      type: "run.started";
      requestId: string;
      conversationId?: string;
    }
  | {
      type: "tool.started";
      requestId: string;
      toolName: string;
      connectorId?: string;
    }
  | {
      type: "tool.completed";
      requestId: string;
      toolName: string;
      connectorId?: string;
      ok: boolean;
    }
  /** Incremental text of the final answer; append in arrival order. */
  | {
      type: "answer.delta";
      delta: string;
    }
  /** Authoritative full answer text; replaces anything accumulated from deltas. */
  | {
      type: "answer.message";
      message: string;
    }
  /**
   * Incremental markdown-block text, keyed by position because a block's real
   * id is itself still streaming. Placeholder blocks are replaced wholesale
   * once `block.completed` arrives.
   */
  | {
      type: "block.delta";
      blockId: string;
      title?: string;
      delta: string;
    }
  | {
      type: "block.completed";
      block: ContentBlock;
    }
  | {
      type: "chart.completed";
      spec: PlotSpec;
    }
  | {
      type: "svg.completed";
      spec: SvgSpec;
    }
  | {
      type: "done";
      result: AgentRunResponse;
    }
  | {
      type: "error";
      message: string;
    };

export type AgentRuntimeEventSink = (event: AgentStreamEvent) => void;
