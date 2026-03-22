/**
 * 与后端 RagPipelineOptions 默认值一致（未传 rag_options 时的 Native 行为）。
 */
import type { RagPipelineOptions } from "@/lib/api/types";

export const DEFAULT_RAG_PIPELINE_OPTIONS: RagPipelineOptions = {
  top_k: 4,
  query_rewrite: false,
  multi_kb: false,
  hybrid: false,
  multi_route: false,
  rerank: false,
  parent_child: false,
  hybrid_vector_weight: 0.5,
};
