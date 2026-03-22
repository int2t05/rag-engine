/**
 * 与后端 schema / 文档处理默认一致，供表单占位、解析与说明文案复用。
 * @see backend/app/schemas/knowledge.py、document_processor.py、schemas/evaluation.py
 */

import type { RagPipelineOptions } from "@/lib/api/types";

export const DEFAULT_CHUNK_SIZE = 1000;
export const DEFAULT_CHUNK_OVERLAP = 200;

/** 父子分块入库：与后端由 1000/200 推导的默认父/子 splitter 一致（未填写输入时使用） */
export const DEFAULT_PARENT_CHUNK_SIZE = 2000;
export const DEFAULT_PARENT_CHUNK_OVERLAP = 200;
export const DEFAULT_CHILD_CHUNK_SIZE = 500;
export const DEFAULT_CHILD_CHUNK_OVERLAP = 80;

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

/** 父子分块：父块大小（字符），空串为 DEFAULT_PARENT_CHUNK_SIZE */
export function parseParentChunkSizeForIngest(input: string): number {
  const t = input.trim();
  if (t === "") return DEFAULT_PARENT_CHUNK_SIZE;
  const n = Number(t);
  if (!Number.isFinite(n)) return DEFAULT_PARENT_CHUNK_SIZE;
  return Math.min(10_000, Math.max(400, Math.floor(n)));
}

export function parseParentChunkOverlapForIngest(
  input: string,
  parentChunkSize: number,
): number {
  const t = input.trim();
  const cap = Math.max(0, parentChunkSize - 1);
  if (t === "") {
    return Math.min(DEFAULT_PARENT_CHUNK_OVERLAP, cap);
  }
  const n = Number(t);
  if (!Number.isFinite(n)) {
    return Math.min(DEFAULT_PARENT_CHUNK_OVERLAP, cap);
  }
  return Math.min(cap, Math.max(0, Math.floor(n)));
}

/** 父子分块：子块大小（字符），空串为 DEFAULT_CHILD_CHUNK_SIZE */
export function parseChildChunkSizeForIngest(input: string): number {
  const t = input.trim();
  if (t === "") return DEFAULT_CHILD_CHUNK_SIZE;
  const n = Number(t);
  if (!Number.isFinite(n)) return DEFAULT_CHILD_CHUNK_SIZE;
  return Math.min(10_000, Math.max(100, Math.floor(n)));
}

export function parseChildChunkOverlapForIngest(
  input: string,
  childChunkSize: number,
): number {
  const t = input.trim();
  const cap = Math.max(0, childChunkSize - 1);
  if (t === "") {
    return Math.min(DEFAULT_CHILD_CHUNK_OVERLAP, cap);
  }
  const n = Number(t);
  if (!Number.isFinite(n)) {
    return Math.min(DEFAULT_CHILD_CHUNK_OVERLAP, cap);
  }
  return Math.min(cap, Math.max(0, Math.floor(n)));
}

export function parseTopK(input: string): number {
  const t = input.trim();
  if (t === "") return DEFAULT_TOP_K;
  const n = Number(t);
  if (!Number.isFinite(n)) return DEFAULT_TOP_K;
  return Math.min(50, Math.max(1, Math.floor(n)));
}

/** 与后端 RagPipelineOptions 默认一致（全关 = Native 向量检索） */
export const DEFAULT_RAG_OPTIONS: RagPipelineOptions = {
  top_k: 4,
  query_rewrite: false,
  multi_kb: false,
  hybrid: false,
  multi_route: false,
  rerank: false,
  parent_child: false,
  hybrid_vector_weight: 0.5,
};

/** 对话 RAG top_k：1～100，与后端 schema 上限一致 */
export function parseChatRagTopK(input: string): number {
  const t = input.trim();
  if (t === "") return DEFAULT_RAG_OPTIONS.top_k;
  const n = Number(t);
  if (!Number.isFinite(n)) return DEFAULT_RAG_OPTIONS.top_k;
  return Math.min(100, Math.max(1, Math.floor(n)));
}

/** 重排前候选数：空串表示交给后端默认 max(top_k*4, 16)；否则 1～200 */
export function parseChatRerankTopN(input: string): number | null {
  const t = input.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.min(200, Math.max(1, Math.floor(n)));
}
