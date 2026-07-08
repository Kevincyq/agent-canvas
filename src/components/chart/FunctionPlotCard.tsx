"use client";

import functionPlot from "function-plot";
import { useEffect, useRef } from "react";

import { inferFunctionPlotDomains, normalizeFunctionExpression } from "@/lib/plot/normalize";
import type { FunctionPlotSpec } from "@/types/plot";

type FunctionPlotCardProps = {
  spec: FunctionPlotSpec;
};

const PLOT_WIDTH = 520;
const PLOT_HEIGHT = 320;

export function FunctionPlotCard({ spec }: FunctionPlotCardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const target = containerRef.current;

    if (!target) {
      return;
    }

    target.innerHTML = "";

    const { xDomain } = inferFunctionPlotDomains(spec.expressions);
    const resolvedXDomain = spec.xDomain ?? xDomain;

    try {
      functionPlot({
        target,
        width: PLOT_WIDTH,
        height: PLOT_HEIGHT,
        grid: true,
        xAxis: {
          domain: [...resolvedXDomain],
          label: "x",
        },
        yAxis: spec.yDomain
          ? {
              domain: [...spec.yDomain],
              label: "y",
            }
          : {
              label: "y",
            },
        data: spec.expressions.map((expression) => ({
          fn: normalizeFunctionExpression(expression.fn),
          range: expression.domain ?? resolvedXDomain,
          color: expression.color,
        })),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "函数图像渲染失败";
      target.textContent = message;
    }

    return () => {
      target.innerHTML = "";
    };
  }, [spec]);

  return (
    <figure className="plot-card plot-card-function" aria-label={spec.title ?? "函数图像"}>
      {spec.title ? <figcaption className="plot-card-title">{spec.title}</figcaption> : null}
      <div ref={containerRef} className="plot-card-canvas" />
    </figure>
  );
}
