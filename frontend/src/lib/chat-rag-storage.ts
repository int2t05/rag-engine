/**
 * 按对话 ID 在 localStorage 中持久化 RAG 选项，切换会话时恢复。
 */
import type { RagPipelineOptions } from "@/lib/api/types";
import { DEFAULT_RAG_OPTIONS } from "@/lib/form-defaults";

const STORAGE_KEY = "ragEngine.chatRag.v1";

export type StoredChatRag = {
  ragOptions: RagPipelineOptions;
  topKInput: string;
  rerankTopNInput: string;
};

function readAll(): Record<string, StoredChatRag> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw) as unknown;
    if (typeof o !== "object" || o === null) return {};
    return o as Record<string, StoredChatRag>;
  } catch {
    return {};
  }
}

function mergeRagOptions(partial: Partial<RagPipelineOptions> | undefined): RagPipelineOptions {
  return { ...DEFAULT_RAG_OPTIONS, ...partial };
}

/** 读取某对话保存的 RAG 配置；无记录时返回 null */
export function loadChatRag(chatId: number): StoredChatRag | null {
  const row = readAll()[String(chatId)];
  if (!row || typeof row !== "object") return null;
  return {
    topKInput:
      typeof row.topKInput === "string" ? row.topKInput : String(DEFAULT_RAG_OPTIONS.top_k),
    rerankTopNInput: typeof row.rerankTopNInput === "string" ? row.rerankTopNInput : "",
    ragOptions: mergeRagOptions(row.ragOptions),
  };
}

export function saveChatRag(chatId: number, data: StoredChatRag): void {
  if (typeof window === "undefined") return;
  const all = readAll();
  all[String(chatId)] = data;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* 配额满等 */
  }
}

export function removeChatRag(chatId: number): void {
  if (typeof window === "undefined") return;
  const all = readAll();
  delete all[String(chatId)];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/** 新建对话时使用的默认 UI 状态 */
export function defaultStoredChatRag(): StoredChatRag {
  return {
    ragOptions: { ...DEFAULT_RAG_OPTIONS },
    topKInput: String(DEFAULT_RAG_OPTIONS.top_k),
    rerankTopNInput: "",
  };
}
