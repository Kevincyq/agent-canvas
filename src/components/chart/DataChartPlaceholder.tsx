"use client";

import type { DataPlotSpec } from "@/types/plot";

const KIND_LABEL: Record<DataPlotSpec["kind"], string> = {
  line: "折线图",
  bar: "柱状图",
  scatter: "散点图",
};

type DataChartPlaceholderProps = {
  spec: DataPlotSpec;
};

export function DataChartPlaceholder({ spec }: DataChartPlaceholderProps) {
  return (
    <figure className="plot-card plot-card-pending" aria-label={spec.title ?? KIND_LABEL[spec.kind]}>
      {spec.title ? <figcaption className="plot-card-title">{spec.title}</figcaption> : null}
      <p className="plot-card-notice">
        {KIND_LABEL[spec.kind]}将在 Phase 2 通过 ECharts 渲染；当前已保存结构化 spec。
      </p>
      <div className="plot-card-preview">
        {spec.series.map((series) => (
          <div key={series.label} className="plot-card-series">
            <strong>{series.label}</strong>
            <ul>
              {series.points.slice(0, 6).map((point) => (
                <li key={`${series.label}-${point.x}-${point.y}`}>
                  ({point.x}, {point.y})
                </li>
              ))}
              {series.points.length > 6 ? <li>…共 {series.points.length} 个点</li> : null}
            </ul>
          </div>
        ))}
      </div>
    </figure>
  );
}
