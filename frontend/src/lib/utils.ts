/**
 * @fileoverview 通用工具函数
 * @description 供多个模块复用的辅助函数
 */

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
