import type { AgentAction } from "@/types/agent";
import { SvgSpecSchema, type SvgSpec } from "@/types/svg";

const SVG_FENCE_PATTERN = /```svg\s*([\s\S]*?)```/gi;

export function extractRenderSvgSpecs(actions: AgentAction[]): SvgSpec[] {
  return actions
    .filter((action): action is Extract<AgentAction, { type: "render_svg" }> => action.type === "render_svg")
    .map((action) => action.spec);
}

export function extractLegacySvgFences(content: string): {
  content: string;
  specs: SvgSpec[];
} {
  const specs: SvgSpec[] = [];
  let index = 0;

  const remainingContent = content.replace(SVG_FENCE_PATTERN, (_match, svg: string) => {
    const parsed = SvgSpecSchema.safeParse({
      title: specs.length === 0 ? "规范图形" : `规范图形 ${specs.length + 1}`,
      alt: "AI 根据手写结构描述生成的规范图形",
      svg: svg.trim(),
    });

    if (!parsed.success) {
      return _match;
    }

    specs.push(parsed.data);
    index += 1;
    return "";
  });

  return {
    content: remainingContent.replace(/\n{3,}/g, "\n\n").trim(),
    specs,
  };
}
