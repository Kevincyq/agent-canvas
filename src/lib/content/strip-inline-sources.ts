import type { ContentBlock } from "@/types/content-block";

/**
 * Remove inline "来源/Sources" prose from answer text.
 * Citations belong in the EvidenceList UI, not in message/blocks body.
 */
export function stripInlineSourceMentions(text: string): string {
  if (!text.trim()) {
    return text;
  }

  let next = text
    // Trailing markdown / plain sections headed by 来源 / Sources / References.
    .replace(
      /(?:\n|^)\s*(?:#{1,6}\s*)?(?:\*{1,2}|_{1,2})?(?:来源参考|来源说明|参考来源|参考文献|引用链接|参考链接|来源|Sources?|References?)(?:\*{1,2}|_{1,2})?\s*[:：]?[\s\S]*$/iu,
      "",
    )
    // Whole lines that are only a source blurb.
    .replace(
      /^(?:[-*•]\s*)?(?:来源参考|来源说明|参考来源|参考文献|来源|Sources?|References?)\s*[:：].*$/gim,
      "",
    )
    // Trailing sentence on the last non-empty paragraph: "...。来源参考：..."
    .replace(
      /([。！？])\s*(?:来源参考|参考来源|参考文献|来源)\s*[:：][^\n]*$/u,
      "$1",
    );

  next = next.replace(/\n{3,}/g, "\n\n").trim();
  return next;
}

export function stripInlineSourcesFromBlocks(blocks: ContentBlock[]): ContentBlock[] {
  return blocks
    .map((block) => {
      if (block.type === "markdown") {
        const source = stripInlineSourceMentions(block.source);
        if (!source) {
          return null;
        }
        return { ...block, source };
      }
      return block;
    })
    .filter((block): block is ContentBlock => block !== null);
}
