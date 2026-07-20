import { getDb } from "@/lib/db/client";

export type ToolMetric = {
  toolName: string;
  total: number;
  completed: number;
  failed: number;
  successRate: number;
  avgLatencyMs: number | null;
};

type ToolMetricRow = {
  tool_name: string;
  total: number;
  completed: number;
  failed: number;
  avg_latency_ms: number | null;
};

export function summarizeToolMetrics(options?: {
  conversationId?: string;
  limitTools?: number;
}): ToolMetric[] {
  const conversationId = options?.conversationId;
  const limitTools = Math.min(Math.max(options?.limitTools ?? 50, 1), 100);

  const rows = (
    conversationId
      ? getDb()
          .prepare(
            `SELECT
               tool_name,
               COUNT(*) AS total,
               SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
               SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
               AVG(
                 CASE
                   WHEN completed_at IS NOT NULL
                   THEN (julianday(completed_at) - julianday(started_at)) * 86400000
                   ELSE NULL
                 END
               ) AS avg_latency_ms
             FROM tool_runs
             WHERE conversation_id = ?
             GROUP BY tool_name
             ORDER BY total DESC
             LIMIT ?`,
          )
          .all(conversationId, limitTools)
      : getDb()
          .prepare(
            `SELECT
               tool_name,
               COUNT(*) AS total,
               SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
               SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
               AVG(
                 CASE
                   WHEN completed_at IS NOT NULL
                   THEN (julianday(completed_at) - julianday(started_at)) * 86400000
                   ELSE NULL
                 END
               ) AS avg_latency_ms
             FROM tool_runs
             GROUP BY tool_name
             ORDER BY total DESC
             LIMIT ?`,
          )
          .all(limitTools)
  ) as ToolMetricRow[];

  return rows.map((row) => {
    const total = Number(row.total) || 0;
    const completed = Number(row.completed) || 0;
    const failed = Number(row.failed) || 0;
    return {
      toolName: row.tool_name,
      total,
      completed,
      failed,
      successRate: total === 0 ? 0 : completed / total,
      avgLatencyMs:
        row.avg_latency_ms === null || Number.isNaN(Number(row.avg_latency_ms))
          ? null
          : Math.round(Number(row.avg_latency_ms)),
    };
  });
}
