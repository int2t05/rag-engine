/**
 * 将后端（FastAPI / Pydantic）返回的原始错误文案转为面向用户的友好提示。
 */

const VALUE_ERROR_PREFIX = /^value error\s*,\s*/i;

/** 与后端 UserCreate 校验一致，便于表单提示复用 */
export const PASSWORD_MIN_LENGTH = 8;

export function humanizeApiErrorMessage(raw: string): string {
  if (!raw || typeof raw !== "string") return raw;
  let s = raw.trim();
  s = s.replace(VALUE_ERROR_PREFIX, "").trim();

  const map: Record<string, string> = {
    "Not Found": "未找到对应内容",
    "Internal Server Error": "服务暂时不可用，请稍后再试",
    Unauthorized: "没有权限执行此操作",
    Forbidden: "没有权限执行此操作",
  };
  if (map[s]) return map[s];

  return s;
}

export function humanizeApiErrorMessagesJoined(parts: string[]): string {
  return parts.map((p) => humanizeApiErrorMessage(p)).filter(Boolean).join("；");
}

/** 解析 fetch 到的 FastAPI 错误 JSON（与 fetchApi 逻辑一致） */
export function parseFastApiErrorBody(
  err: { detail?: unknown },
  fallback: string,
): string {
  const detail = err.detail;
  if (typeof detail === "string") return humanizeApiErrorMessage(detail);
  if (Array.isArray(detail) && detail.length > 0) {
    return (
      humanizeApiErrorMessagesJoined(
        detail.map((e: { msg?: string }) => e.msg || ""),
      ) || fallback
    );
  }
  if (detail && typeof detail === "object" && "msg" in detail) {
    return humanizeApiErrorMessage((detail as { msg?: string }).msg || fallback);
  }
  return fallback;
}
