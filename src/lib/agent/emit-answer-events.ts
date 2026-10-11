import {
  isCompleteContentBlock,
  isCompletePlotSpec,
  isCompleteSvgSpec,
} from "@/lib/content/complete-visual";
import { extractRenderChartSpecs } from "@/lib/plot/extract-charts";
import { extractRenderSvgSpecs } from "@/lib/svg/extract";
import type { AgentRunResponse } from "@/types/agent-runtime";
import type { AgentRuntimeEventSink } from "@/types/agent-stream";

export function emitCompleteAnswerEvents(
  result: AgentRunResponse,
  onEvent?: AgentRuntimeEventSink,
): void {
  if (!onEvent) {
    return;
  }

  const charts = extractRenderChartSpecs(result.actions);
  const svgSpecs = extractRenderSvgSpecs(result.actions);
  onEvent({ type: "answer.message", message: result.message });
  for (const block of result.blocks) {
    if (isCompleteContentBlock(block)) {
      onEvent({ type: "block.completed", block });
    }
  }
  for (const spec of charts) {
    if (isCompletePlotSpec(spec)) {
      onEvent({ type: "chart.completed", spec });
    }
  }
  for (const spec of svgSpecs) {
    if (isCompleteSvgSpec(spec)) {
      onEvent({ type: "svg.completed", spec });
    }
  }
}
