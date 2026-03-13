const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

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

  // FormData / URLSearchParams 由浏览器自动设置 Content-Type，无需手动指定
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
    throw new ApiError(res.status, err.detail || "请求失败，请稍后重试");
  }

  // 204 No Content 无响应体，无需解析 JSON
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
