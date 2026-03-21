/**
 * @fileoverview 评估任务详情页的请求去重与「已知不存在 id」缓存
 * @description
 * - GET /api/evaluation/resolve/{id} 在 React Strict Mode 下可能连续挂载两次，合并为单次 in-flight Promise
 * - sessionStorage 记录曾 404 的 taskId，避免用户前进返回时重复打接口
 */

import { evaluationApi, ApiError, type EvaluationTask } from "@/lib/api";

/** 同一 taskId 合并为一次 HTTP（并发 + Strict Mode 连续两次挂载） */
const inflightTaskGet = new Map<number, Promise<EvaluationTask>>();
const DEDUP_RELEASE_MS = 800;

/**
 * 通过 resolve 拉取任务；ok=false 时抛 ApiError(404)
 * @param id 任务 ID
 */
export function getEvaluationTaskDeduped(id: number): Promise<EvaluationTask> {
  let p = inflightTaskGet.get(id);
  if (p) return p;
  p = evaluationApi
    .resolve(id)
    .then((res) => {
      if (!res.ok || !res.task) {
        throw new ApiError(404, "评估任务不存在");
      }
      return res.task;
    })
    .finally(() => {
      setTimeout(() => inflightTaskGet.delete(id), DEDUP_RELEASE_MS);
    });
  inflightTaskGet.set(id, p);
  return p;
}

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
