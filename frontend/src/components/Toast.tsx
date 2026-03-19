/**
 * @fileoverview Toast 提示组件
 * @description 轻量级消息提示组件，支持成功、错误、信息三种类型
 *
 * @example
 * <Toast
 *   message="操作成功"
 *   type="success"
 *   visible={true}
 *   onClose={() => setVisible(false)}
 * />
 */

"use client";

import { useEffect, useState } from "react";

interface ToastProps {
  /** 提示消息内容 */
  message: string;
  /** 提示类型 */
  type?: "success" | "error" | "info";
  /** 是否显示 */
  visible: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 显示时长（毫秒），默认 2500ms */
  duration?: number;
}

/**
 * Toast 提示组件
 *
 * @description 在屏幕底部中央显示提示信息，自动隐藏
 */
export function Toast({
  message,
  type = "success",
  visible,
  onClose,
  duration = 2500,
}: ToastProps) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setLeaving(false);
      return;
    }

    // 动画结束后关闭
    const t = setTimeout(() => setLeaving(true), duration - 250);
    // 完全关闭
    const t2 = setTimeout(onClose, duration);

    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [visible, onClose, duration]);

  if (!visible) return null;

  // 类型对应的样式
  const bgMap = {
    success: "bg-green-600",
    error: "bg-red-600",
    info: "bg-blue-600",
  };

  // 类型对应的图标
  const iconMap = {
    success: (
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    ),
    error: (
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    ),
    info: (
      <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
      </svg>
    ),
  };

  return (
    <div
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-3 rounded-lg text-white text-sm font-medium shadow-lg ${bgMap[type]} ${leaving ? "animate-fade-out" : "animate-fade-in"}`}
      role="alert"
      aria-live="polite"
    >
      {iconMap[type]}
      {message}
    </div>
  );
}
