/**
 * @fileoverview 确认对话框组件
 * @description 模态对话框，用于需要用户确认的危险操作
 *
 * @example
 * <ConfirmDialog
 *   open={showDeleteConfirm}
 *   title="删除确认"
 *   description="确定要删除此项吗？此操作不可恢复。"
 *   confirmText="删除"
 *   variant="danger"
 *   onConfirm={handleDelete}
 *   onCancel={() => setShowDeleteConfirm(false)}
 * />
 */

"use client";

import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  /** 是否显示对话框 */
  open: boolean;
  /** 标题 */
  title: string;
  /** 描述文字 */
  description?: string;
  /** 确认按钮文字 */
  confirmText?: string;
  /** 取消按钮文字 */
  cancelText?: string;
  /** 变体：danger-危险操作红色，default-默认蓝色 */
  variant?: "danger" | "default";
  /** 加载状态 */
  loading?: boolean;
  /** 确认回调 */
  onConfirm: () => void;
  /** 取消回调 */
  onCancel: () => void;
}

/**
 * 确认对话框组件
 *
 * @description 模态对话框，支持键盘操作（Enter 确认，Escape 取消）
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  variant = "default",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // 打开时聚焦确认按钮，监听键盘事件
  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();

      const handler = (e: KeyboardEvent) => {
        if (e.key === "Escape") onCancel();
      };

      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }
  }, [open, onCancel]);

  if (!open) return null;

  // 按钮样式
  const btnClass =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700 focus:ring-red-500"
      : "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* 遮罩层 */}
      <div
        className="fixed inset-0 bg-black/50 animate-fade-in"
        onClick={onCancel}
        aria-hidden="true"
      />

      {/* 对话框内容 */}
      <div
        className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-scale-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        <h3 id="dialog-title" className="text-lg font-semibold text-gray-900">
          {title}
        </h3>

        {description && (
          <p className="mt-2 text-sm text-gray-500 leading-relaxed">
            {description}
          </p>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            ref={confirmRef}
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${btnClass}`}
          >
            {loading ? "处理中..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
