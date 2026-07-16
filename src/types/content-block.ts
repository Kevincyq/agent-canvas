import { z } from "zod";

const BlockBaseSchema = z.object({
  id: z.string().min(1),
  title: z.string().optional(),
});

export const MarkdownBlockSchema = BlockBaseSchema.extend({
  type: z.literal("markdown"),
  sourceFormat: z.literal("markdown").default("markdown"),
  source: z.string(),
});

export const TableBlockSchema = BlockBaseSchema.extend({
  type: z.literal("table"),
  sourceFormat: z.literal("table_json").default("table_json"),
  columns: z.array(z.string()).min(1),
  rows: z.array(z.array(z.string())),
});

export const MermaidBlockSchema = BlockBaseSchema.extend({
  type: z.literal("mermaid"),
  sourceFormat: z.literal("mermaid").default("mermaid"),
  diagramType: z.enum(["flowchart", "mindmap", "architecture", "gantt", "sequence", "other"]).default("other"),
  source: z.string().min(1),
});

export const LatexBlockSchema = BlockBaseSchema.extend({
  type: z.literal("latex"),
  sourceFormat: z.literal("latex").default("latex"),
  source: z.string().min(1),
});

export const GraphNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  x: z.number().optional(),
  y: z.number().optional(),
});

export const GraphEdgeSchema = z.object({
  id: z.string().optional(),
  source: z.string().min(1),
  target: z.string().min(1),
  label: z.string().optional(),
});

export const GraphBlockSchema = BlockBaseSchema.extend({
  type: z.literal("graph"),
  sourceFormat: z.enum(["graph_json", "graphml"]).default("graph_json"),
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
});

export const MediaBlockSchema = BlockBaseSchema.extend({
  type: z.literal("media"),
  sourceFormat: z.enum(["svg", "image_url"]),
  source: z.string().min(1),
  alt: z.string().default("AI 生成图像"),
});

export const ContentBlockSchema = z.discriminatedUnion("type", [
  MarkdownBlockSchema,
  TableBlockSchema,
  MermaidBlockSchema,
  LatexBlockSchema,
  GraphBlockSchema,
  MediaBlockSchema,
]);

export const ContentBlocksSchema = z.array(ContentBlockSchema).default([]);

export type MarkdownBlock = z.infer<typeof MarkdownBlockSchema>;
export type TableBlock = z.infer<typeof TableBlockSchema>;
export type MermaidBlock = z.infer<typeof MermaidBlockSchema>;
export type LatexBlock = z.infer<typeof LatexBlockSchema>;
export type GraphBlock = z.infer<typeof GraphBlockSchema>;
export type MediaBlock = z.infer<typeof MediaBlockSchema>;
export type ContentBlock = z.infer<typeof ContentBlockSchema>;

export function getContentBlockTypeLabel(block: ContentBlock): string {
  switch (block.type) {
    case "markdown":
      return "文本";
    case "table":
      return "表格";
    case "mermaid":
      switch (block.diagramType) {
        case "flowchart":
          return "流程图";
        case "mindmap":
          return "思维导图";
        case "architecture":
          return "架构图";
        case "gantt":
          return "甘特图";
        case "sequence":
          return "时序图";
        default:
          return "Mermaid 图表";
      }
    case "latex":
      return "公式";
    case "graph":
      return "结构图";
    case "media":
      return "图像 / SVG";
  }
}

export function getBlockSource(block: ContentBlock): string {
  if (block.type === "table") {
    return JSON.stringify({ columns: block.columns, rows: block.rows }, null, 2);
  }

  if (block.type === "graph") {
    return JSON.stringify({ nodes: block.nodes, edges: block.edges }, null, 2);
  }

  return block.source;
}

export function getBlockDownloadExtension(block: ContentBlock): string {
  switch (block.type) {
    case "markdown":
      return "md";
    case "table":
    case "graph":
      return "json";
    case "mermaid":
      return "mmd";
    case "latex":
      return "tex";
    case "media":
      return block.sourceFormat === "svg" ? "svg" : "txt";
  }
}
