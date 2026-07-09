const CANVAS_CONTROL_LINE_PATTERNS = [
  /^打开画布$/i,
  /^打开手写画布$/i,
  /^打开手写/i,
  /^新开画布$/i,
  /^重新开(一个)?画布$/i,
  /^我要手写/i,
  /^手写输入$/i,
  /^写公式$/i,
  /^open\s+canvas$/i,
  /^canvas$/i,
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isCanvasControlLine(line: string): boolean {
  const trimmed = line.trim();

  if (!trimmed) {
    return false;
  }

  return CANVAS_CONTROL_LINE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isWidgetInitStructuredContent(
  structuredContent?: Record<string, unknown>,
): boolean {
  return structuredContent?.type === "hwr_init";
}

export function sanitizeRecognitionForComposer(
  text: string,
  canvasPrompt = "",
): string {
  let result = text.trim();

  if (!result) {
    return "";
  }

  const prompt = canvasPrompt.trim();

  if (prompt) {
    const promptPattern = escapeRegExp(prompt);
    result = result.replace(new RegExp(`^${promptPattern}(\\s*\\n+)?`, "i"), "");
    result = result.replace(new RegExp(`(\\n+\\s*)?${promptPattern}$`, "i"), "");
    result = result.replace(new RegExp(`\\n\\s*${promptPattern}\\s*\\n`, "gi"), "\n");
    result = result.replace(new RegExp(`^${promptPattern}$`, "i"), "");
  }

  result = result
    .split("\n")
    .filter((line) => !isCanvasControlLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!result) {
    return "";
  }

  try {
    const parsed = JSON.parse(result) as { type?: string; prompt?: string };

    if (parsed.type === "hwr_init") {
      return "";
    }

    if (prompt && parsed.prompt?.trim() === prompt) {
      return "";
    }
  } catch {
    // Plain recognition text.
  }

  return result;
}

export function shouldAppendRecognitionToComposer(
  text: string,
  canvasPrompt = "",
): boolean {
  return sanitizeRecognitionForComposer(text, canvasPrompt).length > 0;
}

export function prepareRecognitionForComposer(
  text: string,
  canvasPrompt = "",
): string {
  return sanitizeRecognitionForComposer(text, canvasPrompt);
}
