/**
 * @fileoverview 按后端路由前缀划分的 API 方法
 * @description
 * - /api/auth → authApi
 * - /api/knowledge-base → knowledgeBaseApi
 * - /api/chat → chatApi
 * - /api/llm-configs → llmConfigApi
 * - /api/evaluation → evaluationApi
 */

import { API_BASE, api } from "./client";
import type {
  AiRuntimeSettings,
  Chat,
  ChatMessage,
  DocumentItem,
  EvaluationJudgeConfig,
  EvaluationResolveResponse,
  EvaluationResult,
  EvaluationTask,
  EvaluationTestCaseCreate,
  EvaluationTypeInfo,
  KnowledgeBase,
  LlmEmbeddingConfigItem,
  LlmEmbeddingConfigListResponse,
  PreviewResult,
  ProcessDocumentsBody,
  PreviewDocumentsBody,
  ReplaceDocumentChunkParams,
  ReplaceDocumentResult,
  ChunkDetail,
  RetrievalResult,
  RagPipelineOptions,
  TaskStatus,
  UploadResult,
} from "./types";

/**
 * 知识库与文档、检索测试（前缀 /api/knowledge-base）
 */
export const knowledgeBaseApi = {
  list: (skip = 0, limit = 100) =>
    api.get<KnowledgeBase[]>(`/api/knowledge-base?skip=${skip}&limit=${limit}`),

  get: (id: number) => api.get<KnowledgeBase>(`/api/knowledge-base/${id}`),

  create: (data: {
    name: string;
    description?: string | null;
    parent_child_chunking?: boolean;
  }) => api.post<KnowledgeBase>("/api/knowledge-base", data),

  update: (
    id: number,
    data: {
      name: string;
      description?: string | null;
      parent_child_chunking?: boolean;
    },
  ) => api.put<KnowledgeBase>(`/api/knowledge-base/${id}`, data),

  delete: (id: number) =>
    api.delete<{ message: string; warnings?: string[] }>(`/api/knowledge-base/${id}`),

  /** POST .../documents/upload，body 为 FormData（字段名 files） */
  uploadDocuments: (kbId: number, files: FormData) =>
    api.post<UploadResult[]>(`/api/knowledge-base/${kbId}/documents/upload`, files),

  previewDocuments: (kbId: number, data: PreviewDocumentsBody) =>
    api.post<Record<number, PreviewResult>>(`/api/knowledge-base/${kbId}/documents/preview`, data),

  processDocuments: (kbId: number, body: ProcessDocumentsBody) =>
    api.post<{
      tasks: {
        task_id: number;
        upload_id?: number;
        document_id?: number;
      }[];
    }>(`/api/knowledge-base/${kbId}/documents/process`, body),

  getProcessingTasks: (kbId: number, taskIds: number[]) =>
    api.get<Record<string, TaskStatus>>(
      `/api/knowledge-base/${kbId}/documents/tasks?task_ids=${taskIds.join(",")}`,
    ),

  getDocument: (kbId: number, docId: number) =>
    api.get<DocumentItem>(`/api/knowledge-base/${kbId}/documents/${docId}`),

  /**
   * 单条分块详情（引用跳转）
   */
  getChunk: (kbId: number, chunkId: string) =>
    api.get<ChunkDetail>(
      `/api/knowledge-base/${kbId}/chunks/${encodeURIComponent(chunkId)}`,
    ),

  /**
   * 同名重新上传已入库文档，FormData 字段名 `file`；
   * `chunk_size` / `chunk_overlap` 以 Query 传递（与后端 `replace_document_endpoint` 一致）。
   */
  replaceDocument: (
    kbId: number,
    docId: number,
    file: File,
    chunkParams: ReplaceDocumentChunkParams,
  ) => {
    const form = new FormData();
    form.append("file", file);
    const q = new URLSearchParams({
      chunk_size: String(chunkParams.chunk_size),
      chunk_overlap: String(chunkParams.chunk_overlap),
    });
    const pc = chunkParams;
    if (
      pc.parent_chunk_size != null &&
      pc.parent_chunk_overlap != null &&
      pc.child_chunk_size != null &&
      pc.child_chunk_overlap != null
    ) {
      q.set("parent_chunk_size", String(pc.parent_chunk_size));
      q.set("parent_chunk_overlap", String(pc.parent_chunk_overlap));
      q.set("child_chunk_size", String(pc.child_chunk_size));
      q.set("child_chunk_overlap", String(pc.child_chunk_overlap));
    }
    return api.post<ReplaceDocumentResult>(
      `/api/knowledge-base/${kbId}/documents/${docId}/replace?${q}`,
      form,
    );
  },

  deleteDocument: (kbId: number, docId: number) =>
    api.delete<{ message: string; doc_id: number }>(
      `/api/knowledge-base/${kbId}/documents/${docId}`,
    ),

  batchDeleteDocuments: (kbId: number, documentIds: number[]) =>
    api.post<{
      deleted: number[];
      failed: { doc_id: number; detail: string }[];
    }>(`/api/knowledge-base/${kbId}/documents/batch-delete`, {
      document_ids: documentIds,
    }),

  cleanup: () => api.post<{ message: string }>("/api/knowledge-base/cleanup"),

  /** POST /api/knowledge-base/test-retrieval，body: query, kb_id, top_k */
  testRetrieval: (data: { query: string; kb_id: number; top_k: number }) =>
    api.post<{ results: RetrievalResult[] }>("/api/knowledge-base/test-retrieval", data),
};

/**
 * 认证（前缀 /api/auth）
 */
export const authApi = {
  /** OAuth2 密码模式 application/x-www-form-urlencoded */
  login: (username: string, password: string) => {
    const params = new URLSearchParams();
    params.append("username", username);
    params.append("password", password);
    return api.post<{ access_token: string; token_type: string }>(
      "/api/auth/token",
      params,
    );
  },

  register: (data: { username: string; email: string; password: string }) =>
    api.post<{ id: number; username: string; email: string }>(
      "/api/auth/register",
      data,
    ),

  /** POST /api/auth/test-token，需 Bearer */
  testToken: () =>
    api.post<{ id: number; username: string; email: string }>(
      "/api/auth/test-token",
    ),
};

/**
 * 对话与流式消息（前缀 /api/chat）
 */
export const chatApi = {
  list: (skip = 0, limit = 100) =>
    api.get<Chat[]>(`/api/chat?skip=${skip}&limit=${limit}`),

  /** 含完整 messages 历史 */
  get: (id: number) => api.get<Chat>(`/api/chat/${id}`),

  create: (data: { title: string; knowledge_base_ids: number[] }) =>
    api.post<Chat>("/api/chat", data),

  delete: (id: number) => api.delete<{ status: string }>(`/api/chat/${id}`),

  batchDelete: (chatIds: number[]) =>
    api.post<{ deleted: number[]; not_found: number[] }>("/api/chat/batch-delete", {
      chat_ids: chatIds,
    }),

  /**
   * POST /api/chat/{chatId}/messages，SSE 流；不受 fetchApi 默认超时限制
   * @param messages 完整历史，末条须为 user（与 StreamMessagesRequest 一致）
   */
  sendMessage: (
    chatId: number,
    messages: ChatMessage[],
    signal?: AbortSignal,
    ragOptions?: RagPipelineOptions,
  ) => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : "";
    const body: { messages: ChatMessage[]; rag_options?: RagPipelineOptions } = {
      messages,
    };
    if (ragOptions) {
      body.rag_options = ragOptions;
    }
    return fetch(`${API_BASE}/api/chat/${chatId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
      signal,
    });
  },
};

/**
 * LLM / 嵌入多配置（前缀 /api/llm-configs）
 */
export const llmConfigApi = {
  list: () => api.get<LlmEmbeddingConfigListResponse>("/api/llm-configs"),

  create: (data: { name: string; config: AiRuntimeSettings }) =>
    api.post<LlmEmbeddingConfigItem>("/api/llm-configs", data),

  update: (id: number, data: { name?: string; config?: AiRuntimeSettings }) =>
    api.put<LlmEmbeddingConfigItem>(`/api/llm-configs/${id}`, data),

  activate: (id: number) =>
    api.post<LlmEmbeddingConfigItem>(`/api/llm-configs/${id}/activate`),

  delete: (id: number) => api.delete<void>(`/api/llm-configs/${id}`),
};

/**
 * RAG 评估任务（前缀 /api/evaluation）
 */
export const evaluationApi = {
  listTypes: () => api.get<EvaluationTypeInfo[]>("/api/evaluation/types"),

  list: (skip = 0, limit = 100) =>
    api.get<EvaluationTask[]>(`/api/evaluation?skip=${skip}&limit=${limit}`),

  resolve: (id: number) =>
    api.get<EvaluationResolveResponse>(`/api/evaluation/resolve/${id}`),

  get: (id: number) => api.get<EvaluationTask>(`/api/evaluation/${id}`),

  create: (data: {
    name: string;
    description?: string | null;
    knowledge_base_id?: number | null;
    top_k?: number;
    evaluation_type?: string;
    evaluation_metrics?: string[];
    judge_config?: EvaluationJudgeConfig | null;
    test_cases: EvaluationTestCaseCreate[];
  }) => api.post<EvaluationTask>("/api/evaluation", data),

  run: (id: number, options?: { force?: boolean }) => {
    const q = options?.force === true ? "?force=true" : "";
    return api.post<{ message: string; task_id: number }>(`/api/evaluation/${id}/run${q}`);
  },

  getResults: (id: number) =>
    api.get<EvaluationResult[]>(`/api/evaluation/${id}/results`),

  delete: (id: number, options?: { force?: boolean }) => {
    const q = options?.force === true ? "?force=true" : "";
    return api.delete<{ message: string; task_id: number }>(
      `/api/evaluation/${id}${q}`,
    );
  },

  importTestCases: (
    id: number,
    data: { test_cases: EvaluationTestCaseCreate[] },
  ) =>
    api.post<{ task_id: number; imported: number; skipped: number }>(
      `/api/evaluation/${id}/test-cases/import`,
      data,
    ),
};
