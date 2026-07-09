export const DEFAULT_FLUXINK_HWR_UI_RESOURCE_URI = "ui://fluxink/fluxink-hwr-canvas.html";

export const HWR_TOOL_ALIASES = {
  showHandwritingCanvas: [
    "show_handwriting_canvas",
    "fluxink-mcp-show-handwriting-canvas",
  ],
  recognizeHandwriting: [
    "recognize_handwriting",
    "fluxink-mcp-recognize-handwriting",
  ],
} as const;

export const ALLOWED_MCP_HOST_TOOL_NAMES = new Set([
  ...HWR_TOOL_ALIASES.showHandwritingCanvas,
  ...HWR_TOOL_ALIASES.recognizeHandwriting,
]);

export function isAllowedFluxInkUiResourceUri(uri: string): boolean {
  return uri.startsWith("ui://fluxink/");
}

function normalizeToolName(toolName: string): string {
  return toolName.replaceAll("_", "-");
}

export function isRecognizeHandwritingToolName(toolName: string): boolean {
  const normalized = normalizeToolName(toolName);

  return HWR_TOOL_ALIASES.recognizeHandwriting.some(
    (alias) => normalizeToolName(alias) === normalized,
  );
}
