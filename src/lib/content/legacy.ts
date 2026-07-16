import type { SvgSpec } from "@/types/svg";
import type { ContentBlock } from "@/types/content-block";

export function svgSpecsToContentBlocks(specs: SvgSpec[]): ContentBlock[] {
  return specs.map((spec) => ({
    id: crypto.randomUUID(),
    type: "media" as const,
    title: spec.title,
    sourceFormat: "svg" as const,
    source: spec.svg,
    alt: spec.alt,
  }));
}
