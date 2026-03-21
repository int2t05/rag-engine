/**
 * 与后端 schema / 文档处理默认一致，供表单占位、解析与说明文案复用。
 * @see backend/app/schemas/knowledge.py、document_processor.py、schemas/evaluation.py
 */

export const DEFAULT_CHUNK_SIZE = 1000;
export const DEFAULT_CHUNK_OVERLAP = 200;
export const DEFAULT_TOP_K = 5;
/** 创建对话时标题留空则使用此前缀（可带时间区分） */
export const DEFAULT_CHAT_TITLE_PREFIX = "新对话";

export function parseChunkSize(input: string): number {
  const t = input.trim();
  if (t === "") return DEFAULT_CHUNK_SIZE;
  const n = Number(t);
  if (!Number.isFinite(n)) return DEFAULT_CHUNK_SIZE;
  return Math.min(10_000, Math.max(100, Math.floor(n)));
}

export function parseChunkOverlap(input: string, chunkSize: number): number {
  const t = input.trim();
  if (t === "") return Math.min(DEFAULT_CHUNK_OVERLAP, chunkSize);
  const n = Number(t);
  if (!Number.isFinite(n)) return Math.min(DEFAULT_CHUNK_OVERLAP, chunkSize);
  return Math.min(chunkSize, Math.max(0, Math.floor(n)));
}

export function parseTopK(input: string): number {
  const t = input.trim();
  if (t === "") return DEFAULT_TOP_K;
  const n = Number(t);
  if (!Number.isFinite(n)) return DEFAULT_TOP_K;
  return Math.min(50, Math.max(1, Math.floor(n)));
}
