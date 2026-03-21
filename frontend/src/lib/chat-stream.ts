/**
 * @fileoverview 对话 SSE 与历史消息解析
 * @description 与 POST /api/chat/{id}/messages 返回的 SSE 行格式及助手消息中的 RAG 上下文编码约定一致
 */

import type { Citation } from "@/lib/api";
import { citationsFromRagContextBase64 } from "@/lib/rag-context";

/**
 * 历史消息内容拆分：Base64(上下文 JSON) + "__LLM_RESPONSE__" + LLM 正文
 */
export function parseCitationsFromContent(content: string): {
  text: string;
  citations: Citation[];
} {
  if (!content.includes("__LLM_RESPONSE__")) {
    return { text: content, citations: [] };
  }
  const parts = content.split("__LLM_RESPONSE__");
  const contextBase64 = parts[0];
  const llmResponse = parts.slice(1).join("__LLM_RESPONSE__");
  const citations = citationsFromRagContextBase64(contextBase64);
  return { text: llmResponse, citations };
}

/** 解析 SSE 行中的 data 载荷（兼容 \\r、data: 后空格有无） */
export function sseDataPayload(line: string): string | null {
  const t = line.replace(/\r$/, "").trimEnd();
  if (!t.toLowerCase().startsWith("data:")) return null;
  return t.slice(5).trimStart();
}
