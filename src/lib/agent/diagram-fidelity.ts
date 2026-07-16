import type { AgentRequest, AgentResponse } from "@/types/agent";

type RecognizedShape =
  | "quadrilateral"
  | "rectangle"
  | "square"
  | "box"
  | "circle"
  | "ellipse"
  | "oval"
  | "triangle"
  | "diamond"
  | "四边形"
  | "矩形"
  | "正方形"
  | "圆"
  | "圆形"
  | "椭圆"
  | "椭圆形"
  | "三角形"
  | "菱形";

export type RecognizedDiagramNode = {
  shape: RecognizedShape;
  label: string;
};

const SHAPE_TERMS: RecognizedShape[] = [
  "quadrilateral",
  "rectangle",
  "square",
  "triangle",
  "diamond",
  "ellipse",
  "circle",
  "oval",
  "box",
  "四边形",
  "正方形",
  "三角形",
  "椭圆形",
  "矩形",
  "菱形",
  "圆形",
  "椭圆",
  "圆",
];

const CONNECTOR_TERMS = [
  "straight line",
  "curved line",
  "polyline",
  "connector",
  "arrow",
  "curve",
  "line",
  "arc",
  "直线",
  "曲线",
  "折线",
  "连接线",
  "箭头",
  "弧线",
  "圆弧",
];

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeLabel(value: string): string {
  const label = value
    .trim()
    .replace(/^[\s:：,，;；-]+|[\s:：,，;；-]+$/g, "")
    .replace(/\s+/g, " ");

  return /^[a-z]$/i.test(label) ? label.toUpperCase() : label;
}

/**
 * Parses FluxInk's current linear shape description. Shape and connector words
 * are visual metadata; only the text following a shape is a semantic node.
 */
export function extractRecognizedDiagramNodes(message: string): RecognizedDiagramNode[] {
  const shapeAlternation = SHAPE_TERMS.map(escapeRegex).join("|");
  const boundaryAlternation = [...SHAPE_TERMS, ...CONNECTOR_TERMS]
    .map(escapeRegex)
    .join("|");
  const pattern = new RegExp(
    `(?:^|[\\s,，;；])(${shapeAlternation})\\s+(.+?)(?=\\s+(?:${boundaryAlternation})(?=\\s|$)|[\\n,，;；]|$)`,
    "giu",
  );
  const nodes: RecognizedDiagramNode[] = [];

  for (const match of message.matchAll(pattern)) {
    const label = normalizeLabel(match[2] ?? "");

    if (!label || label.length > 80) {
      continue;
    }

    nodes.push({
      shape: (match[1] ?? "").toLowerCase() as RecognizedShape,
      label,
    });

    if (nodes.length >= 32) {
      break;
    }
  }

  return nodes;
}

function sanitizeMermaidLabel(label: string): string {
  return label
    .replace(/[\r\n]+/g, " ")
    .replace(/"/g, "'")
    .replace(/\[/g, "（")
    .replace(/\]/g, "）")
    .trim();
}

function renderMindmapNode(id: string, node: RecognizedDiagramNode): string {
  const label = sanitizeMermaidLabel(node.label);

  if (["circle", "圆", "圆形"].includes(node.shape)) {
    return `${id}(("${label}"))`;
  }

  if (["ellipse", "oval", "椭圆", "椭圆形"].includes(node.shape)) {
    return `${id}("${label}")`;
  }

  return `${id}["${label}"]`;
}

export function buildFaithfulMindmapSource(nodes: RecognizedDiagramNode[]): string {
  const [root, ...children] = nodes;

  if (!root) {
    return "mindmap";
  }

  return [
    "mindmap",
    `  ${renderMindmapNode("root", root)}`,
    ...children.map((node, index) => `    ${renderMindmapNode(`node_${index + 1}`, node)}`),
  ].join("\n");
}

function isMindmapRequest(message: string): boolean {
  return /思维导图|mind\s*map/i.test(message);
}

/**
 * Prompt constraints reduce mistakes, but this deterministic guard protects the
 * fixed third-party recognition contract from model semantic expansion.
 */
export function enforceHandwritingMindmapFidelity(
  request: AgentRequest,
  response: AgentResponse,
): AgentResponse {
  if (!isMindmapRequest(request.message)) {
    return response;
  }

  const nodes = extractRecognizedDiagramNodes(request.message);

  if (nodes.length < 2) {
    return response;
  }

  const source = buildFaithfulMindmapSource(nodes);
  const title = `${nodes[0].label} 思维导图`;
  let replaced = false;
  const blocks = response.blocks.map((block) => {
    if (replaced || block.type !== "mermaid") {
      return block;
    }

    replaced = true;
    return {
      ...block,
      title,
      diagramType: "mindmap" as const,
      source,
    };
  });

  if (!replaced) {
    blocks.push({
      id: "mindmap-fidelity-1",
      type: "mermaid",
      sourceFormat: "mermaid",
      diagramType: "mindmap",
      title,
      source,
    });
  }

  return {
    ...response,
    message: "已按手写识别中的节点与直接分支关系生成思维导图。",
    blocks,
  };
}
