/**
 * @fileoverview 编辑知识库页面
 * @description 修改已有知识库的名称和描述
 */

"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { knowledgeBaseApi, ApiError } from "@/lib/api";
import { PATH } from "@/lib/routes";
import { ArrowLeftIcon } from "@/components/icons";

export default function EditKnowledgeBasePage() {
  // ==================== 状态定义 ====================

  /** 知识库名称 */
  const [name, setName] = useState("");
  /** 知识库描述 */
  const [description, setDescription] = useState("");
  /** 错误信息 */
  const [error, setError] = useState("");
  /** 提交状态 */
  const [loading, setLoading] = useState(false);
  /** 数据加载状态 */
  const [fetching, setFetching] = useState(true);

  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  // ==================== 副作用 ====================

  /**
   * 加载知识库数据
   */
  useEffect(() => {
    (async () => {
      try {
        const data = await knowledgeBaseApi.get(Number(id));
        setName(data.name);
        setDescription(data.description || "");
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "获取知识库信息失败");
      } finally {
        setFetching(false);
      }
    })();
  }, [id]);

  // ==================== 事件处理 ====================

  /**
   * 提交表单
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("知识库名称不能为空");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await knowledgeBaseApi.update(Number(id), {
        name: name.trim(),
        description: description.trim() || null,
      });
      router.push(PATH.knowledgeBaseDetail(id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "更新失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  // ==================== 渲染 ====================

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* 返回链接 */}
      <div className="mb-6">
        <Link
          href={PATH.knowledgeBaseDetail(id)}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors inline-flex items-center gap-1"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          返回详情
        </Link>
        <h1 className="text-2xl font-bold text-gray-800 mt-2">编辑知识库</h1>
      </div>

      {/* 表单 */}
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg border border-gray-200 p-6 space-y-5"
      >
        {/* 名称 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            知识库名称 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="知识库显示名称（必填）"
            maxLength={255}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* 描述 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            描述
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="留空可清空描述；填写则保存为简介"
            rows={4}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? "保存中..." : "保存修改"}
          </button>
          <Link
            href={PATH.knowledgeBaseDetail(id)}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}
