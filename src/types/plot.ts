import { z } from "zod";

export const PlotPointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const PlotSeriesSchema = z.object({
  label: z.string(),
  points: z.array(PlotPointSchema).min(1),
});

export const FunctionExpressionSchema = z.object({
  fn: z.string().min(1),
  domain: z.tuple([z.number(), z.number()]).optional(),
  label: z.string().optional(),
  color: z.string().optional(),
});

export const FunctionPlotSpecSchema = z.object({
  kind: z.literal("function"),
  title: z.string().optional(),
  xDomain: z.tuple([z.number(), z.number()]).optional(),
  yDomain: z.tuple([z.number(), z.number()]).optional(),
  expressions: z.array(FunctionExpressionSchema).min(1),
});

export const DataPlotKindSchema = z.enum(["line", "bar", "scatter"]);

export const DataPlotSpecSchema = z.object({
  kind: DataPlotKindSchema,
  title: z.string().optional(),
  xAxisLabel: z.string().optional(),
  yAxisLabel: z.string().optional(),
  series: z.array(PlotSeriesSchema).min(1),
});

export const PlotSpecSchema = z.union([FunctionPlotSpecSchema, DataPlotSpecSchema]);

export type PlotPoint = z.infer<typeof PlotPointSchema>;
export type PlotSeries = z.infer<typeof PlotSeriesSchema>;
export type FunctionExpression = z.infer<typeof FunctionExpressionSchema>;
export type FunctionPlotSpec = z.infer<typeof FunctionPlotSpecSchema>;
export type DataPlotKind = z.infer<typeof DataPlotKindSchema>;
export type DataPlotSpec = z.infer<typeof DataPlotSpecSchema>;
export type PlotSpec = z.infer<typeof PlotSpecSchema>;

export function isFunctionPlotSpec(spec: PlotSpec): spec is FunctionPlotSpec {
  return spec.kind === "function";
}

export function isDataPlotSpec(spec: PlotSpec): spec is DataPlotSpec {
  return spec.kind === "line" || spec.kind === "bar" || spec.kind === "scatter";
}
