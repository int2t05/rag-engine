"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

interface KnowledgeBase {
  id: number;
  name: string;
  description: string | null;
  user_id: number;
  created_at: string;
  updated_at: string;
}

export default function KnowledgeBasePage() {
  const [list, setList] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);

  const fetchList = useCallback(async () => {
    try {
      setError("");
      const data = await api.get("/api/knowledge-base");
      setList(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "获取列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleDelete = async (kb: KnowledgeBase) => {
    if (!confirm(`确定要删除知识库「${kb.name}」吗？此操作不可恢复。`)) return;

    setDeleting(kb.id);
    try {
      await api.delete(`/api/knowledge-base/${kb.id}`);
      setList((prev) => prev.filter((item) => item.id !== kb.id));
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "删除失败");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">知识库管理</h1>
          <p className="text-sm text-gray-500 mt-1">
            管理你的知识库，上传文档并进行问答
          </p>
        </div>
        <Link
          href="/dashboard/knowledge-base/new"
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          新建知识库
        </Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {/* Empty State */}
      {list.length === 0 && !error ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <BookIcon className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-800 mb-2">
            还没有知识库
          </h3>
          <p className="text-gray-500 mb-6 text-sm">
            创建你的第一个知识库，开始上传文档并进行问答
          </p>
          <Link
            href="/dashboard/knowledge-base/new"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            创建知识库
          </Link>
        </div>
      ) : (
        /* Card Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((kb) => (
            <div
              key={kb.id}
              className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow group"
            >
              <div className="flex items-start justify-between mb-3">
                <Link
                  href={`/dashboard/knowledge-base/${kb.id}`}
                  className="text-base font-semibold text-gray-800 hover:text-blue-600 transition-colors line-clamp-1"
                >
                  {kb.name}
                </Link>
              </div>

              <p className="text-sm text-gray-500 mb-4 line-clamp-2 min-h-[2.5rem]">
                {kb.description || "暂无描述"}
              </p>

              <div className="text-xs text-gray-400 mb-4">
                创建于 {new Date(kb.created_at).toLocaleDateString("zh-CN")}
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                <Link
                  href={`/dashboard/knowledge-base/${kb.id}`}
                  className="flex-1 text-center py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
                >
                  详情
                </Link>
                <Link
                  href={`/dashboard/knowledge-base/${kb.id}/edit`}
                  className="flex-1 text-center py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded transition-colors"
                >
                  编辑
                </Link>
                <button
                  onClick={() => handleDelete(kb)}
                  disabled={deleting === kb.id}
                  className="flex-1 text-center py-1.5 text-sm text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                >
                  {deleting === kb.id ? "删除中..." : "删除"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
    </svg>
  );
}
