/**
 * @fileoverview 与 FastAPI Pydantic 响应对齐的前端 DTO 类型
 * @description 各模块 schema 见 backend/app/schemas 与对应 routes
 */

/**
 * 文档处理任务状态
 * @description 记录文档上传后的处理进度
 */
export interface ProcessingTask {
  id: number;
  status: string;
  error_message: string | null;
  document_id: number | null;
  knowledge_base_id: number;
  created_at: string;
  updated_at: string;
}

/** 知识库中的已入库文档 */
export interface DocumentItem {
  id: number;
  file_name: string;
  file_path: string;
  file_hash: string;
  file_size: number;
  content_type: string;
  knowledge_base_id: number;
  created_at: string;
  updated_at: string;
  processing_tasks: ProcessingTask[];
  chunk_count?: number | null;
}

/** 尚未关联 Document 的上传队列任务（知识库详情接口可能返回） */
export interface PendingUploadTask {
  task_id: number;
  status: string;
  file_name: string;
  error_message: string | null;
}

export interface KnowledgeBase {
  id: number;
  name: string;
  description: string | null;
  /** 新文档入库时使用父子分块（父块仅库表，子块入向量） */
  parent_child_chunking: boolean;
  user_id: number;
  created_at: string;
  updated_at: string;
  documents: DocumentItem[];
  pending_upload_tasks?: PendingUploadTask[];
}

export interface UploadResult {
  upload_id?: number;
  document_id?: number;
  file_name: string;
  temp_path?: string;
  status: string;
  message?: string;
  skip_processing: boolean;
  /** 与同名已入库文档内容不同：将覆盖该文档并增量更新向量 */
  replace?: boolean;
  file_hash?: string;
  file_size?: number;
  content_type?: string;
}

/** POST .../documents/{docId}/replace 同名覆盖并增量更新向量 */
export interface ReplaceDocumentResult {
  document_id: number;
  file_name: string;
  file_hash: string;
  file_size: number;
  message: string;
}

export interface TaskStatus {
  document_id: number | null;
  status: string;
  error_message: string | null;
  upload_id: number | null;
  file_name: string | null;
}

export interface PreviewChunk {
  content: string;
  metadata: Record<string, unknown> | null;
}

export interface PreviewResult {
  chunks: PreviewChunk[];
  total_chunks: number;
}

export interface RetrievalResult {
  content: string;
  metadata: Record<string, unknown>;
  score: number;
}

/** RAG 对话引用片段（由流式载荷解析） */
export interface Citation {
  index: number;
  page_content: string;
  metadata: Record<string, unknown>;
}

/** 与后端 RagPipelineOptions 对齐（POST /api/chat/{id}/messages） */
export interface RagPipelineOptions {
  top_k: number;
  query_rewrite: boolean;
  multi_kb: boolean;
  hybrid: boolean;
  multi_route: boolean;
  rerank: boolean;
  parent_child: boolean;
  rerank_top_n?: number | null;
  hybrid_vector_weight: number;
}

/** GET /api/knowledge-base/{kb_id}/chunks/{chunk_id} */
export interface ChunkDetail {
  id: string;
  kb_id: number;
  document_id: number;
  file_name: string;
  chunk_metadata: Record<string, unknown> | null;
  document_file_path: string | null;
}

export interface ChatMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
  chat_id?: number;
  created_at?: string;
  updated_at?: string;
  citations?: Citation[];
}

export interface Chat {
  id: number;
  title: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
  knowledge_base_ids: number[];
}

/** 与后端 EvaluationJudgeConfig 一致：任务级 RAGAS 评分覆盖（与全局模型配置合并） */
export interface EvaluationJudgeConfig {
  chat_provider?: "openai" | "ollama";
  embeddings_provider?: "openai" | "ollama";
  openai_api_base?: string;
  openai_api_key?: string;
  openai_model?: string;
  openai_embeddings_api_base?: string;
  openai_embeddings_api_key?: string;
  openai_embeddings_model?: string;
  ollama_api_base?: string;
  ollama_model?: string;
  ollama_embeddings_api_base?: string;
  ollama_embeddings_model?: string;
}

export interface EvaluationTestCaseCreate {
  query: string;
  reference?: string | null;
}

export interface EvaluationTestCase {
  id: number;
  query: string;
  reference: string | null;
}

export interface EvaluationTask {
  id: number;
  name: string;
  description: string | null;
  knowledge_base_id: number | null;
  top_k: number;
  evaluation_type: string;
  evaluation_metrics?: string[] | null;
  judge_config?: EvaluationJudgeConfig | null;
  status: string;
  error_message: string | null;
  summary: Record<string, unknown> | null;
  test_cases?: EvaluationTestCase[] | null;
}

/** GET /api/evaluation/resolve/{id}：无任务时仍 200，ok=false */
export interface EvaluationResolveResponse {
  ok: boolean;
  task_id: number;
  task?: EvaluationTask;
}

export interface EvaluationResult {
  id: number;
  task_id: number;
  test_case_id: number | null;
  retrieved_contexts: unknown[] | null;
  generated_answer: string | null;
  context_relevance: number | null;
  faithfulness: number | null;
  answer_relevance: number | null;
  context_recall: number | null;
  context_precision: number | null;
  ragas_score: number | null;
  passed: number | null;
  judge_details: Record<string, unknown> | null;
}

/** GET /api/evaluation/types 单项 */
export interface EvaluationTypeInfo {
  type: string;
  label: string;
  description: string;
  metrics: string[];
  allowed_metrics?: string[];
  needs_retrieval: boolean;
  needs_generation: boolean;
}

/** 与后端 AiRuntimeSettings 对齐 */
export interface AiRuntimeSettings {
  embeddings_provider: string;
  chat_provider: string;
  openai_api_base: string;
  openai_api_key: string;
  openai_model: string;
  openai_embeddings_model: string;
  openai_embeddings_api_base: string;
  openai_embeddings_api_key: string;
  ollama_api_base: string;
  ollama_embeddings_api_base: string;
  ollama_model: string;
  ollama_embeddings_model: string;
}

export interface LlmEmbeddingConfigItem {
  id: number;
  name: string;
  config: AiRuntimeSettings;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LlmEmbeddingConfigListResponse {
  items: LlmEmbeddingConfigItem[];
  active_id: number | null;
}
