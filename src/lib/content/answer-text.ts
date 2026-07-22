import {
  getBlockSource,
  getContentBlockTypeLabel,
  type ContentBlock,
} from "@/types/content-block";

/** Plain-text export of a full AskAI answer for copy / share / download. */
export function buildAnswerPlainText(
  message: string | undefined,
  blocks: ContentBlock[] = [],
): string {
  const parts: string[] = [];
  const intro = message?.trim();

  if (intro) {
    parts.push(intro);
  }

  for (const block of blocks) {
    const title = block.title || getContentBlockTypeLabel(block);
    const source = getBlockSource(block).trim();
    parts.push(source ? `## ${title}\n\n${source}` : `## ${title}`);
  }

  return parts.join("\n\n---\n\n").trim();
}
