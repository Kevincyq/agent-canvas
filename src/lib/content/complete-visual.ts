import type { ContentBlock } from "@/types/content-block";
import { isDataPlotSpec, isFunctionPlotSpec, type PlotSpec } from "@/types/plot";
import type { SvgSpec } from "@/types/svg";

/**
 * Charts and typed diagrams must only render after a complete object arrives.
 * Partial JSON / truncated Mermaid/SVG is not a product state.
 */
export function isCompleteContentBlock(block: ContentBlock | null | undefined): block is ContentBlock {
  if (!block || !block.id || !block.type) {
    return false;
  }

  switch (block.type) {
    case "markdown":
      return typeof block.source === "string";
    case "latex":
      return Boolean(block.source?.trim());
    case "mermaid":
      return Boolean(block.source?.trim());
    case "table":
      return Array.isArray(block.columns) && block.columns.length > 0 && Array.isArray(block.rows);
    case "graph":
      return Array.isArray(block.nodes) && block.nodes.length > 0 && Array.isArray(block.edges);
    case "media":
      if (block.sourceFormat === "image_url") {
        return Boolean(block.source?.trim());
      }
      return Boolean(block.source?.trim()) && /<svg[\s>]/i.test(block.source) && /<\/svg>/i.test(block.source);
    default:
      return false;
  }
}

export function isCompletePlotSpec(spec: PlotSpec | null | undefined): spec is PlotSpec {
  if (!spec || !spec.kind) {
    return false;
  }
  if (isFunctionPlotSpec(spec)) {
    return spec.expressions.length > 0 && spec.expressions.every((item) => Boolean(item.fn?.trim()));
  }
  if (isDataPlotSpec(spec)) {
    return spec.series.length > 0 && spec.series.every((item) => item.points.length > 0);
  }
  return false;
}

export function isCompleteSvgSpec(spec: SvgSpec | null | undefined): spec is SvgSpec {
  if (!spec?.svg?.trim()) {
    return false;
  }
  return /^\s*<svg[\s>]/i.test(spec.svg) && /<\/svg>/i.test(spec.svg);
}
