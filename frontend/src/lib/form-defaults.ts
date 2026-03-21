/**
 * 与后端 schema / 文档处理默认一致，供表单占位、解析与说明文案复用。
 * @see backend/app/schemas/knowledge.py、document_processor.py、schemas/evaluation.py
 */

export const DEFAULT_CHUNK_SIZE = 1000;
export const DEFAULT_CHUNK_OVERLAP = 200;

/** 与后端 `replace` 路由 Query 上限一致（`routes_documents.replace_document_endpoint`） */
export const REPLACE_CHUNK_PARAM_MAX = 500_000;

/**
 * 解析「替换文档」请求的分块大小（默认 1000，范围 1～REPLACE_CHUNK_PARAM_MAX）。
 */
export function parseReplaceChunkSize(input: string): number {
  const t = input.trim();
  if (t === "") return DEFAULT_CHUNK_SIZE;
  const n = Number(t);
  if (!Number.isFinite(n)) return DEFAULT_CHUNK_SIZE;
  return Math.min(REPLACE_CHUNK_PARAM_MAX, Math.max(1, Math.floor(n)));
}

/**
 * 解析「替换文档」请求的重叠字符数（须小于 chunk_size；空串时取默认并与块大小协调）。
 */
export function parseReplaceChunkOverlap(input: string, chunkSize: number): number {
  const t = input.trim();
  const cap = Math.max(0, chunkSize - 1);
  if (t === "") {
    return Math.min(DEFAULT_CHUNK_OVERLAP, cap);
  }
  const n = Number(t);
  if (!Number.isFinite(n)) {
    return Math.min(DEFAULT_CHUNK_OVERLAP, cap);
  }
  return Math.min(
    cap,
    Math.min(REPLACE_CHUNK_PARAM_MAX, Math.max(0, Math.floor(n))),
  );
}
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
