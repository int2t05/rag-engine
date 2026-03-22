/** API 不可用时前端兜底（与后端 ALLOWED_METRICS 一致） */
export const DEFAULT_ALLOWED_METRICS: readonly string[] = [
  "faithfulness",
  "answer_relevance",
  "context_precision",
  "context_recall",
  "context_relevance",
  "answer_correctness",
];

/** 与后端 METRICS_ALLOWED_BY_TYPE 一致：各评估类型可勾选的指标 */
export const METRICS_BY_EVAL_TYPE: Record<string, readonly string[]> = {
  full: [...DEFAULT_ALLOWED_METRICS],
  retrieval: ["context_relevance", "context_precision", "context_recall"],
  generation: ["faithfulness", "answer_relevance", "answer_correctness"],
};

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
