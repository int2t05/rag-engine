"use client";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { knowledgeBaseApi, KnowledgeBase, ApiError } from "@/lib/api";
import { PlusIcon, BookIcon, FileIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Toast } from "@/components/Toast";

export default function KnowledgeBasePage() {
  const [list, setList] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<KnowledgeBase | null>(null);
  const [toast, setToast] = useState({ msg: "", type: "success" as "success" | "error" | "info", show: false });

  const showToast = (msg: string, type: "success" | "error" | "info" = "error") => {
    setToast({ msg, type, show: true });
  };

  const fetchList = useCallback(async () => {
    try {
      setError("");
      const data = await knowledgeBaseApi.list();
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

  const doDelete = async () => {
    if (!confirmDelete) return;
    const kb = confirmDelete;
    setDeleting(kb.id);
    try {
      await knowledgeBaseApi.delete(kb.id);
      setList((prev) => prev.filter((item) => item.id !== kb.id));
      showToast("知识库已删除", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "删除失败", "error");
    } finally {
      setDeleting(null);
      setConfirmDelete(null);
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
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <BookIcon className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
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
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow group"
            >
              <div className="flex items-start justify-between mb-3">
                <Link
                  href={`/dashboard/knowledge-base/${kb.id}`}
                  className="text-base font-semibold text-gray-800 hover:text-blue-600 transition-colors line-clamp-1"
                >
                  {kb.name}
                </Link>
              </div>

              <p className="text-sm text-gray-500 mb-3 line-clamp-2 min-h-[2.5rem]">
                {kb.description || "暂无描述"}
              </p>

              <div className="flex items-center gap-3 text-xs text-gray-400 mb-4">
                <span className="inline-flex items-center gap-1">
                  <FileIcon className="w-3.5 h-3.5" />
                  {kb.documents?.length ?? 0} 个文档
                </span>
                <span>
                  创建于 {new Date(kb.created_at).toLocaleDateString("zh-CN")}
                </span>
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
                <Link
                  href={`/dashboard/knowledge-base/${kb.id}`}
                  className="flex-1 text-center py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  详情
                </Link>
                <Link
                  href={`/dashboard/knowledge-base/${kb.id}/edit`}
                  className="flex-1 text-center py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  编辑
                </Link>
                <button
                  onClick={() => setConfirmDelete(kb)}
                  disabled={deleting === kb.id}
                  className="flex-1 text-center py-1.5 text-sm text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {deleting === kb.id ? "删除中..." : "删除"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Confirm Delete */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="删除知识库"
        description={`确定要删除知识库「${confirmDelete?.name}」吗？此操作不可恢复，所有关联文档和向量数据将被清除。`}
        confirmText="删除"
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
