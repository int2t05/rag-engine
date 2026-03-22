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

/** 评估类型 API 值 → 界面展示（仅新建任务使用全流程时，列表/详情仍可能见到历史类型） */
export function evaluationTypeLabel(type: string | null | undefined): string {
  const t = (type ?? "").toLowerCase();
  if (t === "full") return "全流程检索与生成";
  if (t === "retrieval") return "检索评估";
  if (t === "generation") return "生成评估";
  return type ?? "";
}

const JUDGE_FIELD_LABELS: Record<string, string> = {
  chat_provider: "评分对话",
  embeddings_provider: "评分嵌入",
  openai_api_base: "OpenAI Base",
  openai_api_key: "API Key（对话）",
  openai_model: "OpenAI 模型",
  openai_embeddings_api_base: "嵌入 API Base",
  openai_embeddings_api_key: "API Key（嵌入）",
  openai_embeddings_model: "嵌入模型",
  ollama_api_base: "Ollama 地址",
  ollama_model: "Ollama 模型",
  ollama_embeddings_api_base: "嵌入 Ollama 地址",
  ollama_embeddings_model: "嵌入模型",
};

function maskSecret(raw: string): string {
  if (raw.length <= 8) return "••••••••";
  return `${raw.slice(0, 4)}…${raw.slice(-4)}（已保存）`;
}

function formatJudgeValue(key: string, raw: string): string {
  if (key === "chat_provider" || key === "embeddings_provider") {
    if (raw === "openai") return "OpenAI 兼容";
    if (raw === "ollama") return "Ollama";
  }
  if (key === "openai_api_key" || key === "openai_embeddings_api_key") {
    return maskSecret(raw);
  }
  return raw;
}

/** 展示任务上保存的 judge_config（键值简要列表） */
export function formatJudgeConfigLines(
  cfg: Record<string, unknown> | null | undefined,
): { label: string; value: string }[] {
  if (!cfg || typeof cfg !== "object") return [];
  const out: { label: string; value: string }[] = [];
  for (const [k, v] of Object.entries(cfg)) {
    if (v === null || v === undefined || v === "") continue;
    const label = JUDGE_FIELD_LABELS[k] ?? k;
    const s = typeof v === "string" ? v : String(v);
    out.push({ label, value: formatJudgeValue(k, s) });
  }
  return out;
}
