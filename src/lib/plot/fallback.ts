import { normalizeFunctionExpression } from "@/lib/plot/normalize";
import type { FunctionPlotSpec, PlotSpec } from "@/types/plot";

const PLOT_INTENT_PATTERN =
  /(函数图|函数图像|图像|曲线图|画图|绘制|plot|graph|chart|f\s*\(\s*x\s*\)\s*=)/i;

export function isPlotIntent(message: string): boolean {
  return PLOT_INTENT_PATTERN.test(message);
}

export function tryBuildPlotSpecFromMessage(message: string): PlotSpec | null {
  const functionMatch = message.match(/f\s*\(\s*x\s*\)\s*=\s*([^,\n。；;]+)/i);

  if (functionMatch) {
    const rawExpression = functionMatch[1].trim();
    const fn = normalizeFunctionExpression(rawExpression);

    const spec: FunctionPlotSpec = {
      kind: "function",
      title: `f(x) = ${rawExpression}`,
      expressions: [{ fn, domain: [-3, 3], label: "f(x)" }],
    };

    return spec;
  }

  if (!isPlotIntent(message)) {
    return null;
  }

  return null;
}
