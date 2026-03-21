/**
 * 解析 RAG 流中前置的 Base64(JSON) 引用载荷。
 * Python 侧若使用 UTF-8 字节再 Base64（或未来 ensure_ascii=False），
 * 浏览器 atob 得到的是按字节展开的「二进制串」，需按 UTF-8 解码后再 JSON.parse。
 */
import type { Citation } from "./api";

export function decodeBase64Utf8(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

export function citationsFromRagContextBase64(contextBase64: string): Citation[] {
  const b64 = contextBase64.replace(/\s/g, "").trim();
  if (!b64) return [];
  try {
    const jsonStr = decodeBase64Utf8(b64);
    const decoded = JSON.parse(jsonStr) as { context?: unknown[] };
    if (!decoded.context || !Array.isArray(decoded.context)) return [];
    return decoded.context.map((doc: unknown, idx: number) => {
      const d = doc as Record<string, unknown>;
      return {
        index: idx + 1,
        page_content: String(d.page_content ?? ""),
        metadata: (d.metadata as Record<string, unknown>) || {},
      };
    });
  } catch {
    try {
      const decoded = JSON.parse(atob(b64)) as { context?: unknown[] };
      if (!decoded.context || !Array.isArray(decoded.context)) return [];
      return decoded.context.map((doc: unknown, idx: number) => {
        const d = doc as Record<string, unknown>;
        return {
          index: idx + 1,
          page_content: String(d.page_content ?? ""),
          metadata: (d.metadata as Record<string, unknown>) || {},
        };
      });
    } catch {
      return [];
    }
  }
}
