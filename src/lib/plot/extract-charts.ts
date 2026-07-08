import type { AgentAction } from "@/types/agent";
import type { PlotSpec } from "@/types/plot";

export function extractRenderChartSpecs(actions: AgentAction[]): PlotSpec[] {
  return actions
    .filter((action): action is Extract<AgentAction, { type: "render_chart" }> => action.type === "render_chart")
    .map((action) => action.spec);
}
