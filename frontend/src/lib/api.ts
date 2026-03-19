const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/* ---------- types ---------- */

export interface ProcessingTask {
  id: number;
  status: string;
  error_message: string | null;
  document_id: number | null;
  knowledge_base_id: number;
  created_at: string;
  updated_at: string;
}

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
}

export interface KnowledgeBase {
  id: number;
  name: string;
  description: string | null;
  user_id: number;
  created_at: string;
  updated_at: string;
  documents: DocumentItem[];
}

export interface UploadResult {
  upload_id?: number;
  document_id?: number;
  file_name: string;
  temp_path?: string;
  status: string;
  message?: string;
  skip_processing: boolean;
}

export interface TaskStatus {
  document_id: number | null;
  status: string;
  error_message: string | null;
  upload_id: number;
  file_name: string;
}

export interface PreviewChunk {
  content: string;
  metadata: Record<string, any> | null;
}

export interface PreviewResult {
  chunks: PreviewChunk[];
  total_chunks: number;
}

export interface RetrievalResult {
  content: string;
  metadata: Record<string, any>;
  score: number;
}

/* ---------- error ---------- */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/* ---------- fetch ---------- */

export async function fetchApi(
  url: string,
  options: RequestInit & { data?: any } = {},
) {
  const { data, ...rest } = options;

  const token =
    typeof window !== "undefined" ? localStorage.getItem("token") : "";

  const isRawBody = data instanceof FormData || data instanceof URLSearchParams;

  const headers: Record<string, string> = {
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(options.headers as Record<string, string>),
  };

  if (data && !isRawBody) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${API_BASE}${url}`, {
    ...rest,
    headers,
    body: isRawBody ? data : data ? JSON.stringify(data) : undefined,
  });

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      window.location.href = "/login";
    }
    throw new ApiError(401, "登录已过期，请重新登录");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail = err.detail;
    let message = "请求失败，请稍后重试";
    if (typeof detail === "string") {
      message = detail;
    } else if (Array.isArray(detail) && detail.length > 0) {
      message = detail.map((e: { msg?: string }) => e.msg || "").filter(Boolean).join("; ") || message;
    } else if (detail && typeof detail === "object" && "msg" in detail) {
      message = (detail as { msg?: string }).msg || message;
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) {
    return null;
  }
  return res.json();
}

export const api = {
  get: (url: string, opts?: Omit<RequestInit, "method">) =>
    fetchApi(url, { ...opts, method: "GET" }),
  post: (url: string, data?: any, opts?: Omit<RequestInit, "method">) =>
    fetchApi(url, { ...opts, method: "POST", data }),
  put: (url: string, data?: any, opts?: Omit<RequestInit, "method">) =>
    fetchApi(url, { ...opts, method: "PUT", data }),
  delete: (url: string, opts?: Omit<RequestInit, "method">) =>
    fetchApi(url, { ...opts, method: "DELETE" }),
};

/* ---------- typed API helpers ---------- */

export const knowledgeBaseApi = {
  list: (skip = 0, limit = 100) =>
    api.get(`/api/knowledge-base?skip=${skip}&limit=${limit}`) as Promise<KnowledgeBase[]>,

  get: (id: number) =>
    api.get(`/api/knowledge-base/${id}`) as Promise<KnowledgeBase>,

  create: (data: { name: string; description?: string | null }) =>
    api.post("/api/knowledge-base", data) as Promise<KnowledgeBase>,

  update: (id: number, data: { name: string; description?: string | null }) =>
    api.put(`/api/knowledge-base/${id}`, data) as Promise<KnowledgeBase>,

  delete: (id: number) =>
    api.delete(`/api/knowledge-base/${id}`) as Promise<{ message: string; warnings?: string[] }>,

  uploadDocuments: (kbId: number, files: FormData) =>
    api.post(`/api/knowledge-base/${kbId}/documents/upload`, files) as Promise<UploadResult[]>,

  previewDocuments: (kbId: number, data: { document_ids: number[]; chunk_size?: number; chunk_overlap?: number }) =>
    api.post(`/api/knowledge-base/${kbId}/documents/preview`, data) as Promise<Record<number, PreviewResult>>,

  processDocuments: (kbId: number, uploadResults: UploadResult[]) =>
    api.post(`/api/knowledge-base/${kbId}/documents/process`, uploadResults) as Promise<{ tasks: { upload_id: number; task_id: number }[] }>,

  getProcessingTasks: (kbId: number, taskIds: number[]) =>
    api.get(`/api/knowledge-base/${kbId}/documents/tasks?task_ids=${taskIds.join(",")}`) as Promise<Record<string, TaskStatus>>,

  getDocument: (kbId: number, docId: number) =>
    api.get(`/api/knowledge-base/${kbId}/documents/${docId}`) as Promise<DocumentItem>,

  cleanup: () =>
    api.post("/api/knowledge-base/cleanup") as Promise<{ message: string }>,

  testRetrieval: (data: { query: string; kb_id: number; top_k: number }) =>
    api.post("/api/knowledge-base/test-retrieval", data) as Promise<{ results: RetrievalResult[] }>,
};

export const authApi = {
  login: (username: string, password: string) => {
    const params = new URLSearchParams();
    params.append("username", username);
    params.append("password", password);
    return api.post("/api/auth/token", params) as Promise<{ access_token: string; token_type: string }>;
  },

  register: (data: { username: string; email: string; password: string }) =>
    api.post("/api/auth/register", data) as Promise<{ id: number; username: string; email: string }>,

  testToken: () =>
    api.post("/api/auth/test-token") as Promise<{ id: number; username: string; email: string }>,
};

/* ---------- chat ---------- */

export interface ChatMessage {
  id?: number;
  role: "user" | "assistant";
  content: string;
  chat_id?: number;
  created_at?: string;
  updated_at?: string;
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

export const chatApi = {
  list: (skip = 0, limit = 100) =>
    api.get(`/api/chat?skip=${skip}&limit=${limit}`) as Promise<Chat[]>,

  get: (id: number) =>
    api.get(`/api/chat/${id}`) as Promise<Chat>,

  create: (data: { title: string; knowledge_base_ids: number[] }) =>
    api.post("/api/chat", data) as Promise<Chat>,

  delete: (id: number) =>
    api.delete(`/api/chat/${id}`) as Promise<{ status: string }>,

  sendMessage: (chatId: number, messages: ChatMessage[]) => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : "";
    return fetch(`${API_BASE}/api/chat/${chatId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({ messages }),
    });
  },
};

/* ---------- api keys ---------- */

export interface ApiKey {
  id: number;
  name: string;
  key: string;
  is_active: boolean;
  user_id: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export const apiKeyApi = {
  list: (skip = 0, limit = 100) =>
    api.get(`/api/api-keys?skip=${skip}&limit=${limit}`) as Promise<ApiKey[]>,

  create: (data: { name: string }) =>
    api.post("/api/api-keys", data) as Promise<ApiKey>,

  update: (id: number, data: { name?: string; is_active?: boolean }) =>
    api.put(`/api/api-keys/${id}`, data) as Promise<ApiKey>,

  delete: (id: number) =>
    api.delete(`/api/api-keys/${id}`) as Promise<ApiKey>,
};
