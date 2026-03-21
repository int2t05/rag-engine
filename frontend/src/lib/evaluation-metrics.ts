/** API 不可用时前端兜底（与后端 ALLOWED_METRICS 一致） */
export const DEFAULT_ALLOWED_METRICS: readonly string[] = [
  "faithfulness",
  "answer_relevance",
  "context_precision",
  "context_recall",
  "context_relevance",
  "answer_correctness",
];

/**
 * RAG 评估指标展示名（与后端 ALLOWED_METRICS 键一致）
 */
export const METRIC_LABELS: Record<string, string> = {
  faithfulness: "忠实度",
  answer_relevance: "答案相关性",
  context_precision: "上下文精度",
  context_recall: "上下文召回",
  context_relevance: "上下文相关性",
  answer_correctness: "答案正确性",
};

export function metricLabel(id: string): string {
  return METRIC_LABELS[id] ?? id;
}

/** 用于列表等场景的简短展示 */
export function formatMetricsChips(ids: string[] | null | undefined): string {
  if (!ids?.length) return "";
  return ids.map(metricLabel).join(" · ");
}
