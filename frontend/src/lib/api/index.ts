/**
 * @fileoverview 前端 API 层统一出口
 * @description 类型见 ./types；HTTP 见 ./client；按业务见 ./endpoints
 */

export type { FetchApiOptions } from "./client";
export {
  API_BASE,
  DEFAULT_TIMEOUT_MS,
  ApiError,
  api,
  fetchApi,
} from "./client";

export type {
  AiRuntimeSettings,
  Chat,
  ChatMessage,
  Citation,
  DocumentItem,
  EvaluationResolveResponse,
  EvaluationResult,
  EvaluationTask,
  EvaluationTestCase,
  EvaluationTestCaseCreate,
  EvaluationTypeInfo,
  KnowledgeBase,
  LlmEmbeddingConfigItem,
  LlmEmbeddingConfigListResponse,
  PendingUploadTask,
  PreviewChunk,
  PreviewResult,
  ProcessingTask,
  RetrievalResult,
  TaskStatus,
  UploadResult,
} from "./types";

export {
  authApi,
  chatApi,
  evaluationApi,
  knowledgeBaseApi,
  llmConfigApi,
} from "./endpoints";
