/**
 * @fileoverview HTTP 客户端：Base URL、超时、JWT、fetchApi 封装
 * @description 流式对话 POST /api/chat/{id}/messages 使用独立 fetch（无默认超时），见 endpoints 中 chatApi.sendMessage
 */

import { parseFastApiErrorBody } from "../api-errors";

/** API 基础地址，默认本地后端 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * 默认请求超时（毫秒）。
 * RAG/LLM 冷启动或向量检索常超过 30s；可用 NEXT_PUBLIC_API_TIMEOUT_MS（5000–3600000）覆盖。
 */
function parseApiTimeoutMs(): number {
  const raw =
    typeof process.env.NEXT_PUBLIC_API_TIMEOUT_MS === "string"
      ? process.env.NEXT_PUBLIC_API_TIMEOUT_MS.trim()
      : "";
  if (raw && /^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n >= 5_000 && n <= 3_600_000) return n;
  }
  return 120_000;
}

export const DEFAULT_TIMEOUT_MS = parseApiTimeoutMs();

/**
 * API 错误：携带 HTTP 状态码与可读消息（来自 FastAPI detail）
 */
export class ApiError extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** fetchApi 扩展选项（timeoutMs / data 不传给原生 fetch） */
export type FetchApiOptions = RequestInit & {
  data?: unknown;
  /** 单次请求超时毫秒数；不传则用默认 */
  timeoutMs?: number;
};

/**
 * 统一 JSON API 请求：Authorization、401 清 token、204、超时 Abort
 */
export async function fetchApi<T = unknown>(
  url: string,
  options: FetchApiOptions = {},
): Promise<T> {
  const { data, timeoutMs, ...rest } = options;
  const effectiveTimeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;

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

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const controller = rest.signal ? undefined : new AbortController();
  if (controller) {
    timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs);
  }

  try {
    const res = await fetch(`${API_BASE}${url}`, {
      ...rest,
      signal: controller?.signal ?? rest.signal,
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
      const message = parseFastApiErrorBody(err, "请求失败，请稍后重试");
      throw new ApiError(res.status, message);
    }

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

/** REST 快捷方法，供各模块 *Api 使用 */
export const api = {
  get: <T = unknown>(url: string, opts?: Omit<FetchApiOptions, "method">) =>
    fetchApi<T>(url, { ...opts, method: "GET" }),

  post: <T = unknown>(url: string, data?: unknown, opts?: Omit<FetchApiOptions, "method">) =>
    fetchApi<T>(url, { ...opts, method: "POST", data }),

  put: <T = unknown>(url: string, data?: unknown, opts?: Omit<FetchApiOptions, "method">) =>
    fetchApi<T>(url, { ...opts, method: "PUT", data }),

  delete: <T = unknown>(url: string, opts?: Omit<FetchApiOptions, "method">) =>
    fetchApi<T>(url, { ...opts, method: "DELETE" }),
};
