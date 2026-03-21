/**
 * @fileoverview 评估任务详情页数据与操作
 * @description 依赖接口：
 * - GET /api/evaluation/resolve/{id}（经 getEvaluationTaskDeduped）
 * - GET /api/evaluation/{id}/results
 * - POST /api/evaluation/{id}/run
 * - POST /api/evaluation/{id}/test-cases/import
 * - DELETE /api/evaluation/{id}
 * 无自动轮询；用户点击「刷新状态」时合并拉任务与结果。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { evaluationApi, ApiError, type EvaluationResult, type EvaluationTask } from "@/lib/api";
import { PATH } from "@/lib/routes";
import { parseEvaluationQaJson } from "@/lib/evaluation-import";
import {
  addMissingIdToStorage,
  getEvaluationTaskDeduped,
  knownMissingTaskIds,
  readMissingIdsFromStorage,
  removeMissingIdFromStorage,
} from "@/lib/evaluation-task-utils";

export function useEvaluationTaskDetail(taskId: number) {
  const router = useRouter();

  const [task, setTask] = useState<EvaluationTask | null>(null);
  const [results, setResults] = useState<EvaluationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [runSubmitting, setRunSubmitting] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [error, setError] = useState("");
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState({
    msg: "",
    type: "success" as "success" | "error" | "info",
    show: false,
  });
  const [importingJson, setImportingJson] = useState(false);
  const detailJsonFileRef = useRef<HTMLInputElement>(null);

  const showToastMsg = useCallback(
    (msg: string, type: "success" | "error" | "info" = "error") => {
      setToast({ msg, type, show: true });
    },
    [],
  );

  const toggleDetail = useCallback((key: string) => {
    setExpandedDetails((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const fetchTask = useCallback(async () => {
    try {
      const t = await getEvaluationTaskDeduped(taskId);
      setTask(t);
      knownMissingTaskIds.delete(taskId);
      removeMissingIdFromStorage(taskId);
      return t;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        knownMissingTaskIds.add(taskId);
        addMissingIdToStorage(taskId);
        router.replace(PATH.evaluation);
        return null;
      }
      setError(err instanceof ApiError ? err.message : "获取任务失败");
      return null;
    }
  }, [taskId, router]);

  const fetchResults = useCallback(async () => {
    try {
      const r = await evaluationApi.getResults(taskId);
      setResults(r);
    } catch {
      setResults([]);
    }
  }, [taskId]);

  const refreshTaskAndResults = useCallback(async () => {
    const t = await fetchTask();
    await fetchResults();
    return t;
  }, [fetchTask, fetchResults]);

  useEffect(() => {
    if (Number.isNaN(taskId)) {
      router.replace(PATH.evaluation);
      return;
    }

    if (knownMissingTaskIds.has(taskId) || readMissingIdsFromStorage().has(taskId)) {
      setLoading(false);
      router.replace(PATH.evaluation);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const t = await fetchTask();
        if (cancelled) return;
        if (!t) return;
        await fetchResults();
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "获取任务失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [taskId, router, fetchTask, fetchResults]);

  const handleRun = useCallback(async () => {
    setRunSubmitting(true);
    setError("");
    try {
      await evaluationApi.run(taskId);
      await fetchTask();
      await fetchResults();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "执行失败");
    } finally {
      setRunSubmitting(false);
    }
  }, [taskId, fetchTask, fetchResults]);

  /** 任务卡在「执行中」（如后端重启）时使用，对应 POST .../run?force=true */
  const handleForceRun = useCallback(async () => {
    setRunSubmitting(true);
    setError("");
    try {
      await evaluationApi.run(taskId, { force: true });
      await fetchTask();
      await fetchResults();
      showToastMsg("已强制重新排队执行", "success");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "执行失败");
    } finally {
      setRunSubmitting(false);
    }
  }, [taskId, fetchTask, fetchResults, showToastMsg]);

  const handleRefreshStatus = useCallback(async () => {
    setRefreshingStatus(true);
    try {
      await refreshTaskAndResults();
    } finally {
      setRefreshingStatus(false);
    }
  }, [refreshTaskAndResults]);

  const handleImportJsonFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      setImportingJson(true);
      try {
        const text = await file.text();
        const parsed = parseEvaluationQaJson(text);
        const res = await evaluationApi.importTestCases(taskId, {
          test_cases: parsed,
        });
        await fetchTask();
        showToastMsg(
          `已导入 ${res.imported} 条${res.skipped ? `，跳过空问题 ${res.skipped} 条` : ""}`,
          "success",
        );
      } catch (err) {
        showToastMsg(err instanceof ApiError ? err.message : String(err), "error");
      } finally {
        setImportingJson(false);
      }
    },
    [taskId, fetchTask, showToastMsg],
  );

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await evaluationApi.delete(taskId, {
        force: task?.status === "running",
      });
      showToastMsg("评估任务已删除", "success");
      setTimeout(() => router.replace(PATH.evaluation), 400);
    } catch (err) {
      showToastMsg(err instanceof ApiError ? err.message : "删除失败", "error");
      setDeleting(false);
    }
  }, [taskId, task?.status, router, showToastMsg]);

  return {
    task,
    results,
    loading,
    error,
    runSubmitting,
    refreshingStatus,
    expandedDetails,
    deleting,
    showDeleteConfirm,
    setShowDeleteConfirm,
    toast,
    setToast,
    importingJson,
    detailJsonFileRef,
    showToastMsg,
    toggleDetail,
    handleRun,
    handleForceRun,
    handleRefreshStatus,
    handleImportJsonFile,
    handleDelete,
  };
}
