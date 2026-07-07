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
