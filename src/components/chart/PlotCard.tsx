"use client";

import { DataChartPlaceholder } from "@/components/chart/DataChartPlaceholder";
import { FunctionPlotCard } from "@/components/chart/FunctionPlotCard";
import { isDataPlotSpec, isFunctionPlotSpec, type PlotSpec } from "@/types/plot";

type PlotCardProps = {
  spec: PlotSpec;
};

export function PlotCard({ spec }: PlotCardProps) {
  if (isFunctionPlotSpec(spec)) {
    return <FunctionPlotCard spec={spec} />;
  }

  if (isDataPlotSpec(spec)) {
    return <DataChartPlaceholder spec={spec} />;
  }

  return null;
}
