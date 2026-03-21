/**
 * @fileoverview API 请求封装模块
 * @description 统一管理所有 API 请求，包括认证、超时、错误处理、数据转换等
 */

import { parseFastApiErrorBody } from "./api-errors";

// ==================== 配置常量 ====================

/** API 基础地址，默认指向本地后端服务 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/** 默认请求超时时间（毫秒） */
const DEFAULT_TIMEOUT_MS = 30_000;

// ==================== 类型定义 ====================

/**
 * 文档处理任务状态
 * @description 记录文档上传后的处理进度
 */
export interface ProcessingTask {
  /** 任务唯一标识 */
  id: number;
  /** 任务状态: pending-等待, processing-处理中, completed-完成, failed-失败 */
  status: string;
  /** 错误信息（当 status 为 failed 时） */
  error_message: string | null;
  /** 关联的文档 ID */
  document_id: number | null;
  /** 所属知识库 ID */
  knowledge_base_id: number;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;
}

/**
 * 文档项
 * @description 表示知识库中的一份已上传文档
 */
export interface DocumentItem {
  /** 文档唯一标识 */
  id: number;
  /** 原始文件名 */
  file_name: string;
  /** MinIO 存储路径 */
  file_path: string;
  /** 文件 SHA-256 哈希值（用于去重） */
  file_hash: string;
  /** 文件大小（字节） */
  file_size: number;
  /** MIME 类型 */
  content_type: string;
  /** 所属知识库 ID */
  knowledge_base_id: number;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;
  /** 关联的处理任务列表 */
  processing_tasks: ProcessingTask[];
  /** 分块个数 */
  chunk_count?: number | null;
}

/**
 * 尚未入库的队列任务（仅 document_id 仍为空时由详情接口返回）
 */
export interface PendingUploadTask {
  task_id: number;
  status: string;
  file_name: string;
  error_message: string | null;
}

/**
 * 知识库
 * @description RAG 系统的核心知识管理单元
 */
export interface KnowledgeBase {
  /** 知识库唯一标识 */
  id: number;
  /** 知识库名称 */
  name: string;
  /** 知识库描述 */
  description: string | null;
  /** 创建者用户 ID */
  user_id: number;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;
  /** 包含的文档列表 */
  documents: DocumentItem[];
  /** 处理中且尚未关联 Document 的上传任务（刷新页面后仍可展示进度） */
  pending_upload_tasks?: PendingUploadTask[];
}

/**
 * 上传结果
 * @description 文件上传 API 的响应数据
 */
export interface UploadResult {
  /** 上传记录 ID（用于后续处理） */
  upload_id?: number;
  /** 已有文档 ID（跳过上传时） */
  document_id?: number;
  /** 文件名 */
  file_name: string;
  /** MinIO 临时路径 */
  temp_path?: string;
  /** 上传状态: pending-待处理, exists-已存在, completed-完成 */
  status: string;
  /** 状态消息 */
  message?: string;
  /** 是否跳过处理（已有文档时为 true） */
  skip_processing: boolean;
}

/**
 * 任务状态
 * @description 文档处理任务的实时状态
 */
export interface TaskStatus {
  /** 关联的文档 ID */
  document_id: number | null;
  /** 任务状态 */
  status: string;
  /** 错误信息 */
  error_message: string | null;
  /** 上传记录 ID（完成后可能仍保留关联） */
  upload_id: number | null;
  /** 文件名 */
  file_name: string | null;
}

/**
 * 预览块
 * @description 文档分块预览的单个块
 */
export interface PreviewChunk {
  /** 块文本内容 */
  content: string;
  /** 块元数据（如页码、来源等） */
  metadata: Record<string, unknown> | null;
}

/**
 * 预览结果
 * @description 分块预览 API 的响应
 */
export interface PreviewResult {
  /** 分块列表 */
  chunks: PreviewChunk[];
  /** 总分块数 */
  total_chunks: number;
}

/**
 * 检索结果
 * @description 向量检索返回的单个结果
 */
export interface RetrievalResult {
  /** 文档片段内容 */
  content: string;
  /** 片段元数据 */
  metadata: Record<string, unknown>;
  /** 相似度分数（越高越相关） */
  score: number;
}

/**
 * 引用来源
 * @description RAG 对话中用于显示参考文档片段
 */
export interface Citation {
  /** 引用编号（从 1 开始） */
  index: number;
  /** 文档片段内容 */
  page_content: string;
  /** 片段元数据（如来源文件、页码等） */
  metadata: Record<string, unknown>;
}

/**
 * 对话消息
 * @description 一次对话中的单条消息
 */
export interface ChatMessage {
  /** 消息 ID（服务器生成） */
  id?: number;
  /** 消息角色: user-用户, assistant-助手 */
  role: "user" | "assistant";
  /** 消息内容 */
  content: string;
  /** 所属对话 ID */
  chat_id?: number;
  /** 创建时间 */
  created_at?: string;
  /** 更新时间 */
  updated_at?: string;
  /** 引用列表（仅 assistant 消息有） */
  citations?: Citation[];
}

/**
 * 对话
 * @description 一次完整的对话会话
 */
export interface Chat {
  /** 对话唯一标识 */
  id: number;
  /** 对话标题 */
  title: string;
  /** 创建者用户 ID */
  user_id: number;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;
  /** 对话消息列表 */
  messages: ChatMessage[];
  /** 关联的知识库 ID 列表 */
  knowledge_base_ids: number[];
}

/**
 * RAG 评估测试用例（创建任务时使用）
 */
export interface EvaluationTestCaseCreate {
  query: string;
  reference?: string | null;
}

/**
 * 评估测试用例（接口返回）
 */
export interface EvaluationTestCase {
  id: number;
  query: string;
  reference: string | null;
}

/**
 * RAG 评估任务
 */
export interface EvaluationTask {
  id: number;
  name: string;
  description: string | null;
  knowledge_base_id: number | null;
  top_k: number;
  evaluation_type: string;
  /** 自定义指标列表；未传则按 evaluation_type 使用后端默认 */
  evaluation_metrics?: string[] | null;
  status: string;
  error_message: string | null;
  summary: Record<string, unknown> | null;
  /** GET 任务详情时由后端 joinedload 返回 */
  test_cases?: EvaluationTestCase[] | null;
}

/**
 * RAG 评估结果（单个测试用例的指标）
 */
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

/**
 * GET /api/evaluation/types 单项（与后端 get_evaluation_types_config 一致）
 */
export interface EvaluationTypeInfo {
  type: string;
  label: string;
  description: string;
  metrics: string[];
  /** 可选指标全集（多选自定义时用） */
  allowed_metrics?: string[];
  needs_retrieval: boolean;
  needs_generation: boolean;
}

/**
 * API 密钥
 * @description 用于外部系统访问的密钥
 */
export interface ApiKey {
  /** 密钥唯一标识 */
  id: number;
  /** 密钥名称（用户自定义） */
  name: string;
  /** 密钥值（创建时返回完整值） */
  key: string;
  /** 是否启用 */
  is_active: boolean;
  /** 所属用户 ID */
  user_id: number;
  /** 最后使用时间 */
  last_used_at: string | null;
  /** 创建时间 */
  created_at: string;
  /** 更新时间 */
  updated_at: string;
}

// ==================== 错误处理 ====================

/**
 * API 错误类
 * @extends Error
 * @description 用于处理 API 请求错误，包含 HTTP 状态码和业务错误消息
 *
 * @example
 * try {
 *   await chatApi.list();
 * } catch (err) {
 *   if (err instanceof ApiError) {
 *     console.error(`${err.status}: ${err.message}`);
 *   }
 * }
 */
export class ApiError extends Error {
  /** HTTP 状态码 */
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// ==================== API 请求核心函数 ====================

/**
 * 通用 API 请求函数
 * @description 统一的请求封装，处理认证头、错误解析、响应转换
 *
 * @param url - 请求 URL（相对路径）
 * @param options - 请求配置选项
 * @param options.data - 请求体数据（会自动序列化）
 * @param options.headers - 自定义请求头
 * @returns Promise 响应数据（自动解析为 JSON）
 * @throws {ApiError} 请求失败时抛出，包含状态码和错误消息
 *
 * @example
 * const data = await fetchApi<User[]>('/api/users');
 */
export async function fetchApi<T = unknown>(
  url: string,
  options: RequestInit & { data?: unknown } = {},
): Promise<T> {
  const { data, ...rest } = options;

  // 从 localStorage 获取认证令牌
  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : "";

  // 判断是否为特殊数据类型（不需要设置 Content-Type）
  const isRawBody = data instanceof FormData || data instanceof URLSearchParams;

  // 构建请求头
  const headers: Record<string, string> = {
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(options.headers as Record<string, string>),
  };

  // 设置 Content-Type（特殊类型除外）
  if (data && !isRawBody) {
    headers["Content-Type"] = "application/json";
  }

  // 请求超时（默认 30 秒，流式请求由调用方自行控制）
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const controller = rest.signal ? undefined : new AbortController();
  if (controller) {
    timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  }

  try {
    const res = await fetch(`${API_BASE}${url}`, {
      ...rest,
      signal: controller?.signal ?? rest.signal,
      headers,
      body: isRawBody ? data : data ? JSON.stringify(data) : undefined,
    });

    // 处理 401 未授权 - 清除 token 并跳转登录页
    if (res.status === 401) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
        window.location.href = "/login";
      }
      throw new ApiError(401, "登录已过期，请重新登录");
    }

    // 处理请求失败 - 解析错误响应
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const message = parseFastApiErrorBody(err, "请求失败，请稍后重试");
      throw new ApiError(res.status, message);
    }

    // 处理 204 无内容响应
    if (res.status === 204) {
      return null as T;
    }

    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError(408, "请求超时，请稍后重试");
    }
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// ==================== RESTful API 方法封装 ====================

/**
 * RESTful API 方法快捷调用
 * @description 提供 get/post/put/delete 快捷方法
 */
export const api = {
  /**
   * GET 请求
   * @param url - 请求路径
   * @param opts - 其他 RequestInit 选项
   */
  get: <T = unknown>(url: string, opts?: Omit<RequestInit, "method">) =>
    fetchApi<T>(url, { ...opts, method: "GET" }),

  /**
   * POST 请求
   * @param url - 请求路径
   * @param data - 请求体数据
   * @param opts - 其他 RequestInit 选项
   */
  post: <T = unknown>(url: string, data?: unknown, opts?: Omit<RequestInit, "method">) =>
    fetchApi<T>(url, { ...opts, method: "POST", data }),

  /**
   * PUT 请求
   * @param url - 请求路径
   * @param data - 请求体数据
   * @param opts - 其他 RequestInit 选项
   */
  put: <T = unknown>(url: string, data?: unknown, opts?: Omit<RequestInit, "method">) =>
    fetchApi<T>(url, { ...opts, method: "PUT", data }),

  /**
   * DELETE 请求
   * @param url - 请求路径
   * @param opts - 其他 RequestInit 选项
   */
  delete: <T = unknown>(url: string, opts?: Omit<RequestInit, "method">) =>
    fetchApi<T>(url, { ...opts, method: "DELETE" }),
};

// ==================== 知识库 API ====================

/**
 * 知识库相关 API
 * @description 提供知识库的 CRUD 操作、文档上传、处理、检索等功能
 *
 * @example
 * // 获取知识库列表
 * const kbs = await knowledgeBaseApi.list();
 *
 * // 上传文档
 * const formData = new FormData();
 * formData.append('files', file);
 * await knowledgeBaseApi.uploadDocuments(kbId, formData);
 */
export const knowledgeBaseApi = {
  /**
   * 获取知识库列表
   * @param skip - 跳过的记录数（分页）
   * @param limit - 返回的记录数限制
   * @returns 知识库数组
   */
  list: (skip = 0, limit = 100) =>
    api.get<KnowledgeBase[]>(`/api/knowledge-base?skip=${skip}&limit=${limit}`),

  /**
   * 获取单个知识库详情
   * @param id - 知识库 ID
   * @returns 知识库详情（含文档列表）
   */
  get: (id: number) =>
    api.get<KnowledgeBase>(`/api/knowledge-base/${id}`),

  /**
   * 创建知识库
   * @param data - 知识库数据
   * @param data.name - 知识库名称
   * @param data.description - 知识库描述（可选）
   * @returns 创建的知识库
   */
  create: (data: { name: string; description?: string | null }) =>
    api.post<KnowledgeBase>("/api/knowledge-base", data),

  /**
   * 更新知识库
   * @param id - 知识库 ID
   * @param data - 更新数据
   * @param data.name - 知识库名称
   * @param data.description - 知识库描述
   * @returns 更新后的知识库
   */
  update: (id: number, data: { name: string; description?: string | null }) =>
    api.put<KnowledgeBase>(`/api/knowledge-base/${id}`, data),

  /**
   * 删除知识库
   * @param id - 知识库 ID
   * @returns 删除结果（含警告信息）
   */
  delete: (id: number) =>
    api.delete<{ message: string; warnings?: string[] }>(`/api/knowledge-base/${id}`),

  /**
   * 上传文档到知识库
   * @param kbId - 知识库 ID
   * @param files - FormData 文件对象
   * @returns 上传结果数组
   *
   * @example
   * const formData = new FormData();
   * files.forEach(f => formData.append('files', f));
   * const results = await knowledgeBaseApi.uploadDocuments(kbId, formData);
   */
  uploadDocuments: (kbId: number, files: FormData) =>
    api.post<UploadResult[]>(`/api/knowledge-base/${kbId}/documents/upload`, files),

  /**
   * 预览文档分块结果
   * @param kbId - 知识库 ID
   * @param data - 预览参数
   * @param data.document_ids - 文档 ID 数组
   * @param data.chunk_size - 分块大小（字符数）
   * @param data.chunk_overlap - 分块重叠大小
   * @returns 预览结果映射（document_id -> PreviewResult）
   */
  previewDocuments: (
    kbId: number,
    data: { document_ids: number[]; chunk_size?: number; chunk_overlap?: number },
  ) =>
    api.post<Record<number, PreviewResult>>(`/api/knowledge-base/${kbId}/documents/preview`, data),

  /**
   * 处理文档（向量化）
   * @param kbId - 知识库 ID
   * @param uploadResults - 上传结果（用于关联任务）
   * @returns 处理任务信息
   */
  processDocuments: (kbId: number, uploadResults: UploadResult[]) =>
    api.post<{ tasks: { upload_id: number; task_id: number }[] }>(
      `/api/knowledge-base/${kbId}/documents/process`,
      uploadResults,
    ),

  /**
   * 获取文档处理任务状态
   * @param kbId - 知识库 ID
   * @param taskIds - 任务 ID 数组
   * @returns 任务状态映射（task_id -> TaskStatus）
   */
  getProcessingTasks: (kbId: number, taskIds: number[]) =>
    api.get<Record<string, TaskStatus>>(
      `/api/knowledge-base/${kbId}/documents/tasks?task_ids=${taskIds.join(",")}`,
    ),

  /**
   * 获取单个文档详情
   * @param kbId - 知识库 ID
   * @param docId - 文档 ID
   * @returns 文档详情（含处理任务记录）
   */
  getDocument: (kbId: number, docId: number) =>
    api.get<DocumentItem>(`/api/knowledge-base/${kbId}/documents/${docId}`),

  /**
   * 删除文档
   * @param kbId - 知识库 ID
   * @param docId - 文档 ID
   * @returns 删除结果
   */
  deleteDocument: (kbId: number, docId: number) =>
    api.delete<{ message: string; doc_id: number }>(
      `/api/knowledge-base/${kbId}/documents/${docId}`,
    ),

  /**
   * 批量删除文档
   */
  batchDeleteDocuments: (
    kbId: number,
    documentIds: number[],
  ) =>
    api.post<{
      deleted: number[];
      failed: { doc_id: number; detail: string }[];
    }>(`/api/knowledge-base/${kbId}/documents/batch-delete`, {
      document_ids: documentIds,
    }),

  /**
   * 清理临时文件
   * @description 清理未在运行中的上传临时记录及 MinIO 临时对象（与后端 cleanup 一致）
   * @returns 清理结果消息
   */
  cleanup: () =>
    api.post<{ message: string }>("/api/knowledge-base/cleanup"),

  /**
   * 测试检索功能
   * @param data - 检索参数
   * @param data.query - 查询语句
   * @param data.kb_id - 知识库 ID
   * @param data.top_k - 返回结果数量
   * @returns 检索结果列表
   */
  testRetrieval: (data: { query: string; kb_id: number; top_k: number }) =>
    api.post<{ results: RetrievalResult[] }>("/api/knowledge-base/test-retrieval", data),
};

// ==================== 认证 API ====================

/**
 * 认证相关 API
 * @description 提供用户注册、登录、Token 验证等功能
 */
export const authApi = {
  /**
   * 用户登录
   * @param username - 用户名
   * @param password - 密码
   * @returns JWT 访问令牌
   *
   * @example
   * const { access_token } = await authApi.login('user', 'pass');
   * localStorage.setItem('token', access_token);
   */
  login: (username: string, password: string) => {
    const params = new URLSearchParams();
    params.append("username", username);
    params.append("password", password);
    return api.post<{ access_token: string; token_type: string }>(
      "/api/auth/token",
      params,
    );
  },

  /**
   * 用户注册
   * @param data - 注册信息
   * @param data.username - 用户名（唯一）
   * @param data.email - 邮箱（唯一）
   * @param data.password - 密码
   * @returns 创建的用户信息
   */
  register: (data: { username: string; email: string; password: string }) =>
    api.post<{ id: number; username: string; email: string }>(
      "/api/auth/register",
      data,
    ),

  /**
   * 验证令牌有效性
   * @returns 当前用户信息（如果令牌有效）
   */
  testToken: () =>
    api.post<{ id: number; username: string; email: string }>(
      "/api/auth/test-token",
    ),
};

// ==================== 对话 API ====================

/**
 * 对话相关 API
 * @description 提供对话的 CRUD 和消息发送功能
 *
 * @example
 * // 获取对话列表
 * const chats = await chatApi.list();
 *
 * // 发送消息（流式）
 * const response = await chatApi.sendMessage(chatId, messages);
 * const reader = response.body.getReader();
 */
export const chatApi = {
  /**
   * 获取对话列表
   * @param skip - 跳过的记录数
   * @param limit - 返回的记录数限制
   * @returns 对话数组
   */
  list: (skip = 0, limit = 100) =>
    api.get<Chat[]>(`/api/chat?skip=${skip}&limit=${limit}`),

  /**
   * 获取对话详情
   * @param id - 对话 ID
   * @returns 对话详情（含消息列表）
   */
  get: (id: number) =>
    api.get<Chat>(`/api/chat/${id}`),

  /**
   * 创建新对话
   * @param data - 对话数据
   * @param data.title - 对话标题
   * @param data.knowledge_base_ids - 关联的知识库 ID 数组
   * @returns 创建的对话
   */
  create: (data: { title: string; knowledge_base_ids: number[] }) =>
    api.post<Chat>("/api/chat", data),

  /**
   * 删除对话
   * @param id - 对话 ID
   * @returns 删除状态
   */
  delete: (id: number) =>
    api.delete<{ status: string }>(`/api/chat/${id}`),

  /**
   * 批量删除对话
   */
  batchDelete: (chatIds: number[]) =>
    api.post<{ deleted: number[]; not_found: number[] }>(
      "/api/chat/batch-delete",
      { chat_ids: chatIds },
    ),

  /**
   * 发送消息（流式响应）
   * @description 使用 Server-Sent Events (SSE) 返回流式响应
   * @param chatId - 对话 ID
   * @param messages - 消息历史
   * @returns Fetch Response 对象（需自行处理流式读取）
   *
   * @example
   * const response = await chatApi.sendMessage(chatId, messages);
   * const reader = response.body.getReader();
   * while (true) {
   *   const { done, value } = await reader.read();
   *   if (done) break;
   *   console.log(decoder.decode(value));
   * }
   */
  sendMessage: (chatId: number, messages: ChatMessage[], signal?: AbortSignal) => {
    const token =
      typeof window !== "undefined" ? localStorage.getItem("token") : "";
    return fetch(`${API_BASE}/api/chat/${chatId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ messages }),
      signal,
    });
  },
};

// ==================== API 密钥 API ====================

/**
 * API 密钥相关 API
 * @description 提供 API 密钥的 CRUD 管理功能
 */
export const apiKeyApi = {
  /**
   * 获取 API 密钥列表
   * @param skip - 跳过的记录数
   * @param limit - 返回的记录数限制
   * @returns API 密钥数组
   */
  list: (skip = 0, limit = 100) =>
    api.get<ApiKey[]>(`/api/api-keys?skip=${skip}&limit=${limit}`),

  /**
   * 创建 API 密钥
   * @param data - 创建参数
   * @param data.name - 密钥名称
   * @returns 创建的密钥（含完整 key 值，仅此一次可查看）
   */
  create: (data: { name: string }) =>
    api.post<ApiKey>("/api/api-keys", data),

  /**
   * 更新 API 密钥
   * @param id - 密钥 ID
   * @param data - 更新数据
   * @param data.name - 密钥名称（可选）
   * @param data.is_active - 是否启用（可选）
   * @returns 更新后的密钥
   */
  update: (id: number, data: { name?: string; is_active?: boolean }) =>
    api.put<ApiKey>(`/api/api-keys/${id}`, data),

  /**
   * 删除 API 密钥
   * @param id - 密钥 ID
   * @returns 删除的密钥
   */
  delete: (id: number) =>
    api.delete<ApiKey>(`/api/api-keys/${id}`),
};

// ==================== RAG 评估 API ====================

/**
 * RAG 评估相关 API（与 backend app.api.api_v1.evaluation 对齐）
 */
export const evaluationApi = {
  /** 评估类型配置列表（标签、说明、指标），供创建任务时下拉展示 */
  listTypes: () => api.get<EvaluationTypeInfo[]>("/api/evaluation/types"),

  list: (skip = 0, limit = 100) =>
    api.get<EvaluationTask[]>(`/api/evaluation?skip=${skip}&limit=${limit}`),

  get: (id: number) =>
    api.get<EvaluationTask>(`/api/evaluation/${id}`),

  create: (data: {
    name: string;
    description?: string | null;
    knowledge_base_id?: number | null;
    top_k?: number;
    evaluation_type?: string;
    /** 指定后只计算这些指标；不传则按 evaluation_type 默认 */
    evaluation_metrics?: string[];
    test_cases: EvaluationTestCaseCreate[];
  }) => api.post<EvaluationTask>("/api/evaluation", data),

  run: (id: number) =>
    api.post<{ message: string; task_id: number }>(`/api/evaluation/${id}/run`),

  getResults: (id: number) =>
    api.get<EvaluationResult[]>(`/api/evaluation/${id}/results`),

  delete: (id: number) =>
    api.delete<{ message: string; task_id: number }>(`/api/evaluation/${id}`),

  /**
   * 向已有任务批量追加测试用例（请求体与创建任务时的 test_cases 结构一致）
   */
  importTestCases: (
    id: number,
    data: { test_cases: EvaluationTestCaseCreate[] },
  ) =>
    api.post<{ task_id: number; imported: number; skipped: number }>(
      `/api/evaluation/${id}/test-cases/import`,
      data,
    ),
};
