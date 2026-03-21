/**
 * @fileoverview 通用工具函数
 * @description 供多个模块复用的辅助函数
 */

import type { DocumentItem, ProcessingTask } from "./api";

/**
 * 取文档当前应展示的处理任务（按 id 取最新一条，避免 ORM 列表顺序不确定）
 */
export function getLatestProcessingTask(doc: DocumentItem): ProcessingTask | null {
  const tasks = doc.processing_tasks;
  if (!tasks?.length) return null;
  return [...tasks].sort((a, b) => a.id - b.id).at(-1) ?? null;
}

/**
 * 文档是否仍处于处理队列中（不可查看完整详情页）
 */
export function isDocumentProcessing(doc: DocumentItem): boolean {
  const last = getLatestProcessingTask(doc);
  if (!last) return false;
  return last.status === "pending" || last.status === "processing";
}

/**
 * 格式化文件大小
 * @param bytes - 文件大小（字节）
 * @returns 人类可读的格式，如 "1.5 KB"、"2.3 MB"
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
