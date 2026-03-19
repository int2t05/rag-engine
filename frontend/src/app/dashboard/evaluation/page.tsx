/**
 * @fileoverview RAG 评估任务列表页面
 * @description 展示评估任务列表，支持创建、查看、执行操作
 */

"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { evaluationApi, EvaluationTask, ApiError } from "@/lib/api";
import { PlusIcon, ChartBarIcon } from "@/components/icons";

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

export default function EvaluationPage() {
  const [list, setList] = useState<EvaluationTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
          href="/dashboard/evaluation/new"
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
            href="/dashboard/evaluation/new"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            新建评估
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((task) => (
            <div
              key={task.id}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between mb-3">
                <Link
                  href={`/dashboard/evaluation/${task.id}`}
                  className="text-base font-semibold text-gray-800 hover:text-blue-600 transition-colors line-clamp-1"
                >
                  {task.name}
                </Link>
                <span
                  className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0 ${
                    STATUS_CLASS[task.status] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {STATUS_LABEL[task.status] ?? task.status}
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-3 line-clamp-2 min-h-[2.5rem]">
                {task.description || "暂无描述"}
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-4">
                <span>Top-K: {task.top_k}</span>
                <span>类型: {task.evaluation_type}</span>
              </div>
              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                <Link
                  href={`/dashboard/evaluation/${task.id}`}
                  className="flex-1 text-center py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  详情
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
