/**
 * @fileoverview RAG 评估任务详情页面
 * @description 展示任务详情、执行评估、查看结果
 */

"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  evaluationApi,
  EvaluationTask,
  EvaluationResult,
  EvaluationTestCase,
  ApiError,
} from "@/lib/api";
import { PATH } from "@/lib/routes";
import { parseEvaluationQaJson } from "@/lib/evaluation-import";
import { METRIC_LABELS } from "@/lib/evaluation-metrics";
import { ArrowLeftIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Toast } from "@/components/Toast";

const STATUS_LABEL: Record<string, string> = {
  pending: "待执行",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  running: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

function formatScore(v: number | null | undefined): string {
  if (v == null) return "-";
  return (Math.round(v * 1000) / 1000).toFixed(3);
}

/** 同一 taskId 并发合并为一次请求（React Strict Mode 会重复跑 effect） */
const inflightTaskGet = new Map<number, Promise<EvaluationTask>>();
function getEvaluationTaskDeduped(id: number): Promise<EvaluationTask> {
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
      inflightTaskGet.delete(id);
    });
  inflightTaskGet.set(id, p);
  return p;
}

/** 已确认不存在的任务 id（内存，热更新会丢） */
const knownMissingTaskIds = new Set<number>();

const MISSING_STORAGE_KEY = "rag_eval_missing_task_ids";

function readMissingIdsFromStorage(): Set<number> {
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

function addMissingIdToStorage(id: number) {
  if (typeof window === "undefined") return;
  const s = readMissingIdsFromStorage();
  s.add(id);
  sessionStorage.setItem(MISSING_STORAGE_KEY, JSON.stringify(Array.from(s)));
}

function removeMissingIdFromStorage(id: number) {
  if (typeof window === "undefined") return;
  const s = readMissingIdsFromStorage();
  s.delete(id);
  sessionStorage.setItem(MISSING_STORAGE_KEY, JSON.stringify(Array.from(s)));
}

export default function EvaluationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = Number(params.id);

  const [task, setTask] = useState<EvaluationTask | null>(null);
  const [results, setResults] = useState<EvaluationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
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

  const testCaseMap = new Map(
    (task?.test_cases ?? []).map((tc) => [tc.id, tc] as [number, EvaluationTestCase]),
  );
  const toggleDetail = (key: string) => {
    setExpandedDetails((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
  }, [taskId]);

  const fetchResults = useCallback(async () => {
    try {
      const r = await evaluationApi.getResults(taskId);
      setResults(r);
    } catch {
      setResults([]);
    }
  }, [taskId]);

  // 仅依赖 taskId：不要把 fetchTask/fetchResults/router 放进依赖，否则回调引用抖动会导致 effect 死循环、反复 GET
  useEffect(() => {
    if (isNaN(taskId)) {
      router.replace(PATH.evaluation);
      return;
    }

    if (
      knownMissingTaskIds.has(taskId) ||
      readMissingIdsFromStorage().has(taskId)
    ) {
      setLoading(false);
      router.replace(PATH.evaluation);
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      setError("");
      try {
        const t = await getEvaluationTaskDeduped(taskId);
        if (cancelled) return;
        setTask(t);
        knownMissingTaskIds.delete(taskId);
        removeMissingIdFromStorage(taskId);
        const r = await evaluationApi.getResults(taskId);
        if (cancelled) return;
        setResults(r);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          knownMissingTaskIds.add(taskId);
          addMissingIdToStorage(taskId);
          router.replace(PATH.evaluation);
          return;
        }
        setError(err instanceof ApiError ? err.message : "获取任务失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 故意只随 taskId 拉取，避免无限请求
  }, [taskId]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setError("");

    try {
      await evaluationApi.run(taskId);
      const poll = async () => {
        const t = await fetchTask();
        if (!t) {
          // 404 或任务已删：停止轮询，否则会每 2 秒打一次 GET
          setRunning(false);
          return;
        }
        if (t.status === "completed" || t.status === "failed") {
          await fetchResults();
          setRunning(false);
          return;
        }
        setTimeout(poll, 2000);
      };
      setTimeout(poll, 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "执行失败");
      setRunning(false);
    }
  }, [taskId, fetchTask, fetchResults]);

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
        showToastMsg(
          err instanceof ApiError ? err.message : String(err),
          "error",
        );
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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-gray-400">加载中...</div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="max-w-3xl mx-auto">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}
        <Link
          href={PATH.evaluation}
          className="text-sm text-blue-600 hover:underline"
        >
          返回列表
        </Link>
      </div>
    );
  }

  const canRun =
    (task.status === "pending" || task.status === "failed") && !running;

  const metrics =
    task.summary && typeof task.summary === "object"
      ? (task.summary as Record<string, unknown>)
      : null;

  const metricsFromRun =
    metrics && Array.isArray(metrics["metrics"])
      ? (metrics["metrics"] as string[])
      : null;
  const effectiveMetricIds =
    task.evaluation_metrics?.length ? task.evaluation_metrics : metricsFromRun;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <Link
          href={PATH.evaluation}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors inline-flex items-center gap-1"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          返回列表
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4 mt-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{task.name}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {task.description || "暂无描述"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full ${
                STATUS_CLASS[task.status] ?? "bg-gray-100 text-gray-600"
              }`}
            >
              {STATUS_LABEL[task.status] ?? task.status}
            </span>
            {canRun && (
              <button
                onClick={handleRun}
                disabled={running}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {running ? "执行中..." : "开始评估"}
              </button>
            )}
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              className="px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
            >
              {deleting
                ? "删除中..."
                : task.status === "running"
                  ? "强制删除"
                  : "删除"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {task.status === "failed" && task.error_message && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
          {task.error_message}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">知识库</p>
          <p className="text-sm font-medium text-gray-800 mt-1">
            {task.knowledge_base_id ?? "未关联"}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Top-K</p>
          <p className="text-sm font-medium text-gray-800 mt-1">{task.top_k}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">评估类型</p>
          <p className="text-sm font-medium text-gray-800 mt-1">
            {task.evaluation_type}
          </p>
        </div>
        {metrics && typeof metrics.ragas_score === "number" && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">RAGAS 综合分</p>
            <p className="text-lg font-semibold text-blue-600 mt-1">
              {formatScore(metrics.ragas_score as number)}
            </p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
        <p className="text-xs text-gray-500 mb-2">选用指标</p>
        {effectiveMetricIds?.length ? (
          <div className="flex flex-wrap gap-2">
            {effectiveMetricIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-50 border border-slate-200 text-slate-800"
              >
                {METRIC_LABELS[id] ?? id}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-600">
            未指定自定义指标，将按评估类型使用后端默认指标集；任务完成后摘要中会列出实际计算的指标。
          </p>
        )}
      </div>

      {task.status !== "running" && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6 flex flex-wrap items-center gap-3">
          <input
            ref={detailJsonFileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={handleImportJsonFile}
          />
          <button
            type="button"
            disabled={importingJson}
            onClick={() => detailJsonFileRef.current?.click()}
            className="text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
          >
            {importingJson ? "导入中…" : "从 JSON 批量追加用例"}
          </button>
          <span className="text-xs text-gray-500">
            与新建评估页相同格式；执行中不可导入
          </span>
        </div>
      )}

      {task.test_cases && task.test_cases.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-gray-800">测试用例</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {task.test_cases.map((tc, idx) => (
              <div key={tc.id} className="p-4">
                <div className="mb-2">
                  <p className="text-xs text-gray-500">问题 #{idx + 1}</p>
                  <p className="text-sm text-gray-800 mt-0.5">{tc.query}</p>
                </div>
                {tc.reference && (
                  <div>
                    <p className="text-xs text-gray-500">参考答案</p>
                    <p className="text-sm text-gray-600 mt-0.5">{tc.reference}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
            <h3 className="font-semibold text-gray-800">评估结果明细</h3>
          </div>
          <div className="divide-y divide-gray-100">
            {results.map((r, idx) => {
              const tc = r.test_case_id ? testCaseMap.get(r.test_case_id) : null;
              const contextsKey = `${r.id}-contexts`;
              const judgeKey = `${r.id}-judge`;
              const contextsExpanded = expandedDetails.has(contextsKey);
              const judgeExpanded = expandedDetails.has(judgeKey);
              const hasContexts = r.retrieved_contexts && (r.retrieved_contexts as unknown[]).length > 0;
              const hasJudgeDetails = r.judge_details && Object.keys(r.judge_details as object).length > 0;
              return (
                <div
                  key={r.id}
                  className="p-4 hover:bg-gray-50/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-gray-500">结果 #{idx + 1}</span>
                    {r.ragas_score != null && (
                      <span className="text-sm font-medium text-blue-600">
                        RAGAS: {formatScore(r.ragas_score)}
                      </span>
                    )}
                  </div>
                  {tc && (
                    <div className="mb-2 p-2 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500">测试问题</p>
                      <p className="text-sm text-gray-800 mt-0.5">{tc.query}</p>
                      {tc.reference && (
                        <>
                          <p className="text-xs text-gray-500 mt-2">参考答案</p>
                          <p className="text-sm text-gray-600 mt-0.5">{tc.reference}</p>
                        </>
                      )}
                    </div>
                  )}
                  {r.generated_answer && (
                    <div className="mb-2">
                      <p className="text-xs text-gray-500">生成答案</p>
                      <p className="text-sm text-gray-800 mt-0.5 whitespace-pre-wrap">
                        {r.generated_answer}
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3 text-xs mb-2">
                    {r.context_relevance != null && (
                      <span className="text-gray-600">
                        上下文相关性: {formatScore(r.context_relevance)}
                      </span>
                    )}
                    {r.faithfulness != null && (
                      <span className="text-gray-600">
                        忠实度: {formatScore(r.faithfulness)}
                      </span>
                    )}
                    {r.answer_relevance != null && (
                      <span className="text-gray-600">
                        答案相关性: {formatScore(r.answer_relevance)}
                      </span>
                    )}
                    {r.context_recall != null && (
                      <span className="text-gray-600">
                        召回: {formatScore(r.context_recall)}
                      </span>
                    )}
                    {r.context_precision != null && (
                      <span className="text-gray-600">
                        精度: {formatScore(r.context_precision)}
                      </span>
                    )}
                    {r.judge_details &&
                      typeof (r.judge_details as Record<string, unknown>)
                        .answer_correctness === "number" && (
                        <span className="text-gray-600">
                          答案正确性:{" "}
                          {formatScore(
                            (r.judge_details as Record<string, unknown>)
                              .answer_correctness as number,
                          )}
                        </span>
                      )}
                  </div>
                  {(hasContexts || hasJudgeDetails) && (
                    <div className="mt-2 space-y-2">
                      {hasContexts && (
                        <div>
                          <button
                            type="button"
                            onClick={() => toggleDetail(contextsKey)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            {contextsExpanded ? "收起" : "展开"} 检索上下文
                          </button>
                          {contextsExpanded && (
                            <div className="mt-1 p-2 bg-gray-50 rounded text-xs text-gray-700 max-h-48 overflow-y-auto whitespace-pre-wrap">
                              {(r.retrieved_contexts as string[]).map((ctx, i) => (
                                <div key={i} className="mb-2 pb-2 border-b border-gray-200 last:border-0">
                                  {typeof ctx === "string" ? ctx : JSON.stringify(ctx)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {hasJudgeDetails && (
                        <div>
                          <button
                            type="button"
                            onClick={() => toggleDetail(judgeKey)}
                            className="text-xs text-blue-600 hover:underline"
                          >
                            {judgeExpanded ? "收起" : "展开"} 评判详情
                          </button>
                          {judgeExpanded && (
                            <pre className="mt-1 p-2 bg-gray-50 rounded text-xs text-gray-700 max-h-48 overflow-y-auto">
                              {JSON.stringify(r.judge_details, null, 2)}
                            </pre>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {results.length === 0 && task.status === "completed" && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          暂无评估结果
        </div>
      )}

      {results.length === 0 && (task.status === "pending" || task.status === "running") && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          {task.status === "running"
            ? "评估正在后台执行，请稍后刷新页面查看结果"
            : "点击「开始评估」按钮执行评估"}
        </div>
      )}

      {results.length === 0 && task.status === "failed" && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">
          评估失败，无结果
        </div>
      )}

      <ConfirmDialog
        open={showDeleteConfirm}
        title={
          task.status === "running" ? "强制删除评估任务" : "删除评估任务"
        }
        description={
          task.status === "running"
            ? `任务「${task.name}」正在执行中。强制删除将立即移除任务及数据，后台进程可能仍会短暂运行直至结束。确定继续？`
            : `确定要删除评估任务「${task.name}」吗？此操作不可恢复，测试用例和评估结果将一并删除。`
        }
        confirmText={task.status === "running" ? "强制删除" : "删除"}
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      <Toast
        message={toast.msg}
        type={toast.type}
        visible={toast.show}
        onClose={() => setToast((p) => ({ ...p, show: false }))}
      />
    </div>
  );
}
