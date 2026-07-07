type ContentBlock = {
  type?: string;
  text?: string;
};

export function extractTextFromContentBlocks(content: unknown): string {
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((block): block is ContentBlock => Boolean(block) && typeof block === "object")
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n\n");
}
