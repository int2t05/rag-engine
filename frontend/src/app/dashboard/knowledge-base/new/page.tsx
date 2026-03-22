/**
 * @fileoverview 新建知识库页面
 * @description 创建新的知识库，填写名称和描述
 */

"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { knowledgeBaseApi, ApiError } from "@/lib/api";
import { PATH } from "@/lib/routes";
import { ArrowLeftIcon } from "@/components/icons";

export default function NewKnowledgeBasePage() {
  const router = useRouter();

  // ==================== 状态定义 ====================

  /** 知识库名称 */
  const [name, setName] = useState("");
  /** 知识库描述 */
  const [description, setDescription] = useState("");
  /** 父子分块入库（与后端知识库字段一致） */
  const [parentChildChunking, setParentChildChunking] = useState(false);
  /** 错误信息 */
  const [error, setError] = useState("");
  /** 提交状态 */
  const [loading, setLoading] = useState(false);

  // ==================== 事件处理 ====================

  /**
   * 提交表单
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 表单验证
    if (!name.trim()) {
      setError("知识库名称不能为空");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await knowledgeBaseApi.create({
        name: name.trim(),
        description: description.trim() || null,
        parent_child_chunking: parentChildChunking,
      });
      router.push(PATH.knowledgeBase);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "创建失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  // ==================== 渲染 ====================

  return (
    <div className="max-w-2xl mx-auto">
      {/* 返回链接 */}
      <div className="mb-6">
        <Link
          href={PATH.knowledgeBase}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors inline-flex items-center gap-1"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          返回列表
        </Link>
        <h1 className="text-2xl font-bold text-gray-800 mt-2">新建知识库</h1>
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
            placeholder="例如：产品手册、内部规范（必填）"
            maxLength={255}
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50/80 p-3">
          <input
            id="kb-pc-new"
            type="checkbox"
            checked={parentChildChunking}
            onChange={(e) => setParentChildChunking(e.target.checked)}
            className="mt-0.5 rounded border-gray-300"
          />
          <label htmlFor="kb-pc-new" className="text-sm text-gray-700">
            <span className="font-medium">父子分块入库</span>
            <span className="mt-0.5 block text-xs text-gray-500">
              开启后新文档仅将子块写入向量库，父块存 MySQL；对话中仍需勾选「父子块展开」才会用父块全文回答。
            </span>
          </label>
        </div>

        {/* 描述 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            描述
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="留空则不保存描述；可写用途、文档范围等便于日后识别"
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
            {loading ? "创建中..." : "创建知识库"}
          </button>
          <Link
            href={PATH.knowledgeBase}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}
