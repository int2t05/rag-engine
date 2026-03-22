/**
 * @fileoverview RAG 评估任务详情页面
 * @description 展示任务详情、执行评估、查看结果；数据逻辑见 useEvaluationTaskDetail
 */

"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { EvaluationTestCase } from "@/lib/api";
import { PATH } from "@/lib/routes";
import {
  METRIC_LABELS,
  evaluationTypeLabel,
  formatJudgeConfigLines,
} from "@/lib/evaluation-metrics";
import { useEvaluationTaskDetail } from "@/hooks/useEvaluationTaskDetail";
import { ArrowLeftIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Toast } from "@/components/Toast";
import { EvaluationStatusBadge } from "@/components/EvaluationStatusBadge";

function formatScore(v: number | null | undefined): string {
  if (v == null) return "-";
  return (Math.round(v * 1000) / 1000).toFixed(3);
}

export default function EvaluationDetailPage() {
  const params = useParams();
  const taskId = Number(params.id);

  const {
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
    toggleDetail,
    handleRun,
    handleForceRun,
    handleRefreshStatus,
    handleImportJsonFile,
    handleDelete,
  } = useEvaluationTaskDetail(taskId);

  const [showForceRunConfirm, setShowForceRunConfirm] = useState(false);

  const testCaseMap = new Map(
    (task?.test_cases ?? []).map((tc) => [tc.id, tc] as [number, EvaluationTestCase]),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-muted">加载中...</div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="mx-auto max-w-3xl">
        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            {error}
          </div>
        )}
        <Link href={PATH.evaluation} className="text-sm text-accent hover:underline">
          返回列表
        </Link>
      </div>
    );
  }

  const canRun =
    (task.status === "pending" || task.status === "failed") && !runSubmitting;

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

  const showMetricScore = (metricId: string) =>
    !effectiveMetricIds?.length || effectiveMetricIds.includes(metricId);

  const judgeConfigLines =
    task.judge_config && typeof task.judge_config === "object"
      ? formatJudgeConfigLines(task.judge_config as Record<string, unknown>)
      : [];

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <Link
          href={PATH.evaluation}
          className="inline-flex items-center gap-1 text-sm text-muted transition-colors hover:text-ink"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          返回列表
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink">{task.name}</h1>
            <p className="mt-1 text-sm text-muted">{task.description || "暂无描述"}</p>
          </div>
          <div className="flex items-center gap-2">
            <EvaluationStatusBadge status={task.status} />
            {canRun && (
              <button
                type="button"
                onClick={handleRun}
                disabled={runSubmitting}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
              >
                {runSubmitting ? "启动中…" : "开始评估"}
              </button>
            )}
            {task.status === "running" && (
              <>
                <button
                  type="button"
                  onClick={handleRefreshStatus}
                  disabled={refreshingStatus}
                  className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface-muted disabled:opacity-50"
                >
                  {refreshingStatus ? "刷新中…" : "刷新状态"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForceRunConfirm(true)}
                  disabled={runSubmitting}
                  className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-50"
                >
                  {runSubmitting ? "提交中…" : "强制重新执行"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
              className="rounded-lg px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
            >
              {deleting ? "删除中..." : task.status === "running" ? "强制删除" : "删除"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {task.status === "failed" && task.error_message && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {task.error_message}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-muted">知识库</p>
          <p className="mt-1 text-sm font-medium text-ink">
            {task.knowledge_base_id ?? "未关联"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-muted">Top-K</p>
          <p className="mt-1 text-sm font-medium text-ink">{task.top_k}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-muted">评估类型</p>
          <p className="mt-1 text-sm font-medium text-ink">
            {evaluationTypeLabel(task.evaluation_type)}
          </p>
        </div>
      </div>

      {judgeConfigLines.length > 0 && (
        <div className="mb-6 rounded-xl border border-border bg-surface p-4">
          <p className="mb-2 text-xs text-muted">评分模型覆盖（RAGAS）</p>
          <dl className="grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
            {judgeConfigLines.map(({ label, value }, idx) => (
              <div key={`${label}-${idx}`} className="flex flex-wrap gap-x-2">
                <dt className="text-muted">{label}</dt>
                <dd className="font-mono text-xs text-ink break-all">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="mb-6 rounded-xl border border-border bg-surface p-4">
        <p className="mb-2 text-xs text-muted">选用指标</p>
        {effectiveMetricIds?.length ? (
          <div className="flex flex-wrap gap-2">
            {effectiveMetricIds.map((id) => (
              <span
                key={id}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-800"
              >
                {METRIC_LABELS[id] ?? id}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">任务完成后摘要中会列出实际计算的指标。</p>
        )}
      </div>

      {task.status !== "running" && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
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
            className="text-sm font-medium text-accent hover:text-accent-hover disabled:opacity-50"
          >
            {importingJson ? "导入中…" : "从 JSON 批量追加用例"}
          </button>
          <span className="text-xs text-muted">与新建评估页相同格式；执行中不可导入</span>
        </div>
      )}

      {task.test_cases && task.test_cases.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-xl border border-border bg-surface">
          <div className="border-b border-border bg-surface-muted px-4 py-3">
            <h3 className="font-semibold text-ink">测试用例</h3>
          </div>
          <div className="divide-y divide-border">
            {task.test_cases.map((tc, idx) => (
              <div key={tc.id} className="p-4">
                <div className="mb-2">
                  <p className="text-xs text-muted">问题 #{idx + 1}</p>
                  <p className="mt-0.5 text-sm text-ink">{tc.query}</p>
                </div>
                {tc.reference && (
                  <div>
                    <p className="text-xs text-muted">参考答案</p>
                    <p className="mt-0.5 text-sm text-muted">{tc.reference}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="border-b border-border bg-surface-muted px-4 py-3">
            <h3 className="font-semibold text-ink">评估结果明细</h3>
          </div>
          <div className="divide-y divide-border">
            {results.map((r, idx) => {
              const tc = r.test_case_id ? testCaseMap.get(r.test_case_id) : null;
              const contextsKey = `${r.id}-contexts`;
              const judgeKey = `${r.id}-judge`;
              const contextsExpanded = expandedDetails.has(contextsKey);
              const judgeExpanded = expandedDetails.has(judgeKey);
              const hasContexts = r.retrieved_contexts && (r.retrieved_contexts as unknown[]).length > 0;
              const hasJudgeDetails = r.judge_details && Object.keys(r.judge_details as object).length > 0;
              return (
                <div key={r.id} className="p-4 transition-colors hover:bg-surface-muted/50">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs text-muted">结果 #{idx + 1}</span>
                  </div>
                  {tc && (
                    <div className="mb-2 rounded-lg bg-surface-muted p-2">
                      <p className="text-xs text-muted">测试问题</p>
                      <p className="mt-0.5 text-sm text-ink">{tc.query}</p>
                      {tc.reference && (
                        <>
                          <p className="mt-2 text-xs text-muted">参考答案</p>
                          <p className="mt-0.5 text-sm text-muted">{tc.reference}</p>
                        </>
                      )}
                    </div>
                  )}
                  {r.generated_answer && (
                    <div className="mb-2">
                      <p className="text-xs text-muted">生成答案</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink">
                        {r.generated_answer}
                      </p>
                    </div>
                  )}
                  <div className="mb-2 flex flex-wrap gap-3 text-xs">
                    {showMetricScore("context_relevance") && r.context_relevance != null && (
                      <span className="text-muted">
                        上下文相关性: {formatScore(r.context_relevance)}
                      </span>
                    )}
                    {showMetricScore("faithfulness") && r.faithfulness != null && (
                      <span className="text-muted">忠实度: {formatScore(r.faithfulness)}</span>
                    )}
                    {showMetricScore("answer_relevance") && r.answer_relevance != null && (
                      <span className="text-muted">
                        答案相关性: {formatScore(r.answer_relevance)}
                      </span>
                    )}
                    {showMetricScore("context_recall") && r.context_recall != null && (
                      <span className="text-muted">召回: {formatScore(r.context_recall)}</span>
                    )}
                    {showMetricScore("context_precision") && r.context_precision != null && (
                      <span className="text-muted">精度: {formatScore(r.context_precision)}</span>
                    )}
                    {showMetricScore("answer_correctness") &&
                      r.judge_details &&
                      typeof (r.judge_details as Record<string, unknown>).answer_correctness ===
                        "number" && (
                        <span className="text-muted">
                          答案正确性:{" "}
                          {formatScore(
                            (r.judge_details as Record<string, unknown>).answer_correctness as number,
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
                            className="text-xs text-accent hover:underline"
                          >
                            {contextsExpanded ? "收起" : "展开"} 检索上下文
                          </button>
                          {contextsExpanded && (
                            <div className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-surface-muted p-2 text-xs text-ink">
                              {(r.retrieved_contexts as string[]).map((ctx, i) => (
                                <div
                                  key={i}
                                  className="mb-2 border-b border-border pb-2 last:border-0"
                                >
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
                            className="text-xs text-accent hover:underline"
                          >
                            {judgeExpanded ? "收起" : "展开"} 评判详情
                          </button>
                          {judgeExpanded && (
                            <pre className="mt-1 max-h-48 overflow-y-auto rounded bg-surface-muted p-2 text-xs text-ink">
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
        <div className="rounded-xl border border-border bg-surface p-8 text-center text-muted">
          暂无评估结果
        </div>
      )}

      {results.length === 0 && (task.status === "pending" || task.status === "running") && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center text-muted">
          {task.status === "running"
            ? "评估正在后台执行，完成后请点击上方「刷新状态」查看最新结果。"
            : "点击「开始评估」按钮执行评估"}
        </div>
      )}

      {results.length === 0 && task.status === "failed" && (
        <div className="rounded-xl border border-border bg-surface p-8 text-center text-muted">
          评估失败，无结果
        </div>
      )}

      <ConfirmDialog
        open={showForceRunConfirm}
        title="强制重新执行"
        description="当任务一直显示「执行中」但实际已停止（例如后端重启）时使用。将把任务重置为待执行并重新排队。若评估仍在后台运行，请勿重复操作。"
        confirmText="强制重新执行"
        variant="default"
        loading={runSubmitting}
        onConfirm={() => {
          void handleForceRun().finally(() => setShowForceRunConfirm(false));
        }}
        onCancel={() => setShowForceRunConfirm(false)}
      />

      <ConfirmDialog
        open={showDeleteConfirm}
        title={task.status === "running" ? "强制删除评估任务" : "删除评估任务"}
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
