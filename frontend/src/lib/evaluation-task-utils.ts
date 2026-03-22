/**
 * @fileoverview 评估任务详情页的「已知不存在 id」缓存
 * @description sessionStorage 记录曾 404 的 taskId，避免前进返回时重复打接口
 */

/** 内存：已确认不存在的任务 id（热更新会丢） */
export const knownMissingTaskIds = new Set<number>();

const MISSING_STORAGE_KEY = "rag_eval_missing_task_ids";

export function readMissingIdsFromStorage(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(MISSING_STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? arr.map(Number).filter((n) => !Number.isNaN(n)) : []);
  } catch {
    return new Set();
  }
}

export function addMissingIdToStorage(id: number) {
  if (typeof window === "undefined") return;
  const s = readMissingIdsFromStorage();
  s.add(id);
  sessionStorage.setItem(MISSING_STORAGE_KEY, JSON.stringify(Array.from(s)));
}

export function removeMissingIdFromStorage(id: number) {
  if (typeof window === "undefined") return;
  const s = readMissingIdsFromStorage();
  s.delete(id);
  sessionStorage.setItem(MISSING_STORAGE_KEY, JSON.stringify(Array.from(s)));
}
