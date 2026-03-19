/**
 * @fileoverview API 密钥管理页面
 * @description 管理用于外部系统访问的 API 密钥，支持创建、启用/禁用、删除操作
 *
 * 功能列表：
 * - 密钥列表展示（桌面表格 / 移动端卡片）
 * - 创建新密钥
 * - 启用/禁用密钥
 * - 复制密钥到剪贴板
 * - 删除密钥（带确认）
 */

"use client";
import { useEffect, useState, useCallback } from "react";
import { apiKeyApi, ApiKey, ApiError } from "@/lib/api";
import { PlusIcon, KeyIcon, CopyIcon, XIcon } from "@/components/icons";
import { Toast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";

export default function ApiKeysPage() {
  // ==================== 状态定义 ====================

  /** 密钥列表 */
  const [keys, setKeys] = useState<ApiKey[]>([]);
  /** 加载状态 */
  const [loading, setLoading] = useState(true);
  /** 错误信息 */
  const [error, setError] = useState("");

  /** 创建弹窗 */
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  /** 新创建的密钥（用于展示，仅显示一次） */
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  /** Toast 提示 */
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error" | "info";
    show: boolean;
  }>({ msg: "", type: "success", show: false });

  /** 删除确认 */
  const [confirmDelete, setConfirmDelete] = useState<ApiKey | null>(null);

  // ==================== 工具函数 ====================

  /** 显示 Toast */
  const showToast = useCallback(
    (msg: string, type: "success" | "error" | "info" = "success") => {
      setToast({ msg, type, show: true });
    },
    [],
  );

  // ==================== 数据获取 ====================

  /**
   * 获取密钥列表
   */
  const fetchKeys = useCallback(async () => {
    try {
      setError("");
      const data = await apiKeyApi.list();
      setKeys(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "获取 API 密钥列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  // ==================== 事件处理 ====================

  /**
   * 创建新密钥
   */
  const handleCreate = useCallback(async () => {
    if (!newKeyName.trim()) {
      setCreateError("请输入密钥名称");
      return;
    }

    setCreating(true);
    setCreateError("");

    try {
      const key = await apiKeyApi.create({ name: newKeyName });
      setKeys((prev) => [key, ...prev]);
      setCreatedKey(key.key); // 仅此一次可查看完整密钥
      setNewKeyName("");
      setShowCreate(false);
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }, [newKeyName]);

  /**
   * 切换密钥启用/禁用状态
   */
  const handleToggleActive = useCallback(
    async (key: ApiKey) => {
      try {
        const updated = await apiKeyApi.update(key.id, {
          is_active: !key.is_active,
        });
        setKeys((prev) => prev.map((k) => (k.id === key.id ? updated : k)));
        showToast(updated.is_active ? "已启用" : "已禁用", "success");
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : "更新失败", "error");
      }
    },
    [showToast],
  );

  /**
   * 确认删除密钥
   */
  const doDeleteKey = useCallback(async () => {
    if (!confirmDelete) return;

    try {
      await apiKeyApi.delete(confirmDelete.id);
      setKeys((prev) => prev.filter((k) => k.id !== confirmDelete.id));
      showToast("密钥已删除", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "删除失败", "error");
    } finally {
      setConfirmDelete(null);
    }
  }, [confirmDelete, showToast]);

  /**
   * 复制到剪贴板
   */
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    showToast("已复制到剪贴板", "success");
  }, [showToast]);

  // ==================== 渲染 ====================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* ========== 页面标题栏 ========== */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">API 密钥</h1>
          <p className="text-sm text-gray-500 mt-1">
            管理用于外部系统访问的 API 密钥
          </p>
        </div>
        <button
          onClick={() => {
            setShowCreate(true);
            setCreateError("");
          }}
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          创建密钥
        </button>
      </div>

      {/* ========== 错误提示 ========== */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6 text-sm">
          {error}
        </div>
      )}

      {/* ========== 新密钥创建成功提示 ========== */}
      {createdKey && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 animate-fade-in">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-green-800 mb-1">
                密钥创建成功
              </h3>
              <p className="text-xs text-green-600 mb-2.5">
                请立即复制保存，关闭后将无法再次查看完整密钥
              </p>
              <code className="text-sm bg-white px-3 py-2 rounded-lg border border-green-200 font-mono break-all block">
                {createdKey}
              </code>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <button
                onClick={() => copyToClipboard(createdKey)}
                className="text-green-700 hover:bg-green-100 p-2 rounded-lg transition-colors"
                title="复制"
              >
                <CopyIcon className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCreatedKey(null)}
                className="text-green-700 hover:bg-green-100 p-2 rounded-lg transition-colors"
                title="关闭"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== 空状态 ========== */}
      {keys.length === 0 && !error ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <KeyIcon className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-800 mb-2">
            还没有 API 密钥
          </h3>
          <p className="text-gray-500 mb-6 text-sm">
            创建 API 密钥以供外部系统访问知识库
          </p>
          <button
            onClick={() => {
              setShowCreate(true);
              setCreateError("");
            }}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <PlusIcon className="w-4 h-4" />
            创建密钥
          </button>
        </div>
      ) : (
        <>
          {/* ========== 桌面端：表格视图 ========== */}
          <div className="hidden md:block">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      名称
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      密钥
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      状态
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      创建时间
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      最近使用
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {keys.map((key) => (
                    <tr
                      key={key.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-gray-800">
                          {key.name}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <code className="text-xs text-gray-500 font-mono">
                            {key.key.slice(0, 12)}...{key.key.slice(-4)}
                          </code>
                          <button
                            onClick={() => copyToClipboard(key.key)}
                            className="text-gray-400 hover:text-blue-500 transition-colors p-0.5"
                            title="复制"
                          >
                            <CopyIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleToggleActive(key)}
                          className={`inline-flex px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                            key.is_active
                              ? "bg-green-100 text-green-700 hover:bg-green-200"
                              : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          {key.is_active ? "启用" : "禁用"}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {new Date(key.created_at).toLocaleDateString("zh-CN")}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {key.last_used_at
                          ? new Date(key.last_used_at).toLocaleDateString(
                              "zh-CN",
                            )
                          : "从未使用"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setConfirmDelete(key)}
                          className="text-red-500 hover:bg-red-50 px-3 py-1 rounded-lg text-sm transition-colors"
                        >
                          删除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ========== 移动端：卡片视图 ========== */}
          <div className="md:hidden space-y-4">
            {keys.map((key) => (
              <div
                key={key.id}
                className="bg-white rounded-xl border border-gray-200 p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-800">
                    {key.name}
                  </span>
                  <button
                    onClick={() => handleToggleActive(key)}
                    className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full transition-colors ${
                      key.is_active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {key.is_active ? "启用" : "禁用"}
                  </button>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <code className="text-xs text-gray-500 font-mono">
                    {key.key.slice(0, 12)}...{key.key.slice(-4)}
                  </code>
                  <button
                    onClick={() => copyToClipboard(key.key)}
                    className="text-gray-400 hover:text-blue-500 p-0.5"
                  >
                    <CopyIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>
                    创建于{" "}
                    {new Date(key.created_at).toLocaleDateString("zh-CN")}
                  </span>
                  <button
                    onClick={() => setConfirmDelete(key)}
                    className="text-red-500 text-xs"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ========== 创建密钥弹窗 ========== */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-scale-in">
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              创建 API 密钥
            </h2>

            {createError && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                {createError}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                密钥名称
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="例如：生产环境密钥"
                className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-400 mt-2">
                请选择一个容易识别的名称，以便管理多个密钥
              </p>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewKeyName("");
                  setCreateError("");
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {creating ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== 删除确认弹窗 ========== */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="删除密钥"
        description={`确定要删除密钥「${confirmDelete?.name}」吗？此操作不可恢复。`}
        confirmText="删除"
        variant="danger"
        onConfirm={doDeleteKey}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* ========== Toast ========== */}
      <Toast
        message={toast.msg}
        type={toast.type}
        visible={toast.show}
        onClose={() => setToast((p) => ({ ...p, show: false }))}
      />
    </div>
  );
}
