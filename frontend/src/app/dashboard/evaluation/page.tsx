/**
 * @fileoverview RAG 评估任务列表页面
 * @description 展示评估任务列表，支持创建、查看、执行操作
 */

"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { evaluationApi, EvaluationTask, ApiError } from "@/lib/api";
import { formatMetricsChips, evaluationTypeLabel } from "@/lib/evaluation-metrics";
import { PATH } from "@/lib/routes";
import { PlusIcon, ChartBarIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Toast } from "@/components/Toast";
import { EvaluationStatusBadge } from "@/components/EvaluationStatusBadge";

export default function EvaluationPage() {
  const [list, setList] = useState<EvaluationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<EvaluationTask | null>(null);
  const [toast, setToast] = useState({
    msg: "",
    type: "success" as "success" | "error" | "info",
    show: false,
  });

  const showToast = useCallback(
    (msg: string, type: "success" | "error" | "info" = "error") => {
      setToast({ msg, type, show: true });
    },
    [],
  );

  const fetchList = useCallback(async () => {
    try {
      setError("");
      const data = await evaluationApi.list();
      setList(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "获取评估任务列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const doDelete = useCallback(async () => {
    if (!confirmDelete) return;
    const t = confirmDelete;
    setDeleting(t.id);
    try {
      await evaluationApi.delete(t.id, {
        force: t.status === "running",
      });
      setList((prev) => prev.filter((item) => item.id !== t.id));
      showToast("评估任务已删除", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "删除失败", "error");
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
    }
  }, [confirmDelete, showToast]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">RAG 评估</h1>
          <p className="text-sm text-gray-500 mt-1">
            创建评估任务，使用 RAGAS 等指标评估检索与生成效果
          </p>
        </div>
        <Link
          href={PATH.evaluationNew}
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          新建评估
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {list.length === 0 && !error ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <ChartBarIcon className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            还没有评估任务
          </h3>
          <p className="text-gray-500 mb-6 text-sm">
            创建评估任务，添加测试用例，对知识库进行 RAG 质量评估
          </p>
          <Link
            href={PATH.evaluationNew}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            新建评估
          </Link>
        </div>
      ) : (
        <div className="stagger-reveal grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((task) => (
            <div
              key={task.id}
              className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-md"
            >
              <div className="mb-3 flex items-start justify-between gap-2">
                <Link
                  href={PATH.evaluationDetail(task.id)}
                  className="line-clamp-1 text-base font-semibold text-gray-800 transition-colors hover:text-blue-600"
                >
                  {task.name}
                </Link>
                <EvaluationStatusBadge status={task.status} className="shrink-0" />
              </div>
              <p className="text-sm text-gray-500 mb-3 line-clamp-2 min-h-[2.5rem]">
                {task.description || "暂无描述"}
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
                <span>Top-K: {task.top_k}</span>
                <span>类型: {evaluationTypeLabel(task.evaluation_type)}</span>
              </div>
              <p
                className={`text-xs mb-4 line-clamp-2 ${
                  task.evaluation_metrics?.length
                    ? "text-slate-600"
                    : "text-gray-400"
                }`}
                title={
                  task.evaluation_metrics?.length
                    ? formatMetricsChips(task.evaluation_metrics)
                    : undefined
                }
              >
                指标:{" "}
                {task.evaluation_metrics?.length
                  ? formatMetricsChips(task.evaluation_metrics)
                  : "类型默认"}
              </p>
              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                <Link
                  href={PATH.evaluationDetail(task.id)}
                  className="flex-1 text-center py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  详情
                </Link>
                <button
                  onClick={() => setConfirmDelete(task)}
                  disabled={deleting === task.id}
                  className="flex-1 text-center py-1.5 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {deleting === task.id
                    ? "删除中..."
                    : task.status === "running"
                      ? "强制删除"
                      : "删除"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title={
          confirmDelete?.status === "running"
            ? "强制删除评估任务"
            : "删除评估任务"
        }
        description={
          confirmDelete?.status === "running"
            ? `任务「${confirmDelete.name}」正在执行中。强制删除将立即移除任务及数据，后台进程可能仍会短暂运行直至结束。确定继续？`
            : `确定要删除评估任务「${confirmDelete?.name}」吗？此操作不可恢复，测试用例和评估结果将一并删除。`
        }
        confirmText={confirmDelete?.status === "running" ? "强制删除" : "删除"}
        variant="danger"
        loading={deleting !== null}
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
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
