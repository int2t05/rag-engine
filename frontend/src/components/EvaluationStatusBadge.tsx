/**
 * @fileoverview 评估任务状态标签（与后端 task.status 一致）
 * @description 使用琥珀/天青/翠/玫语义色，避免通用 gray-100 + blue 组合
 */

const LABELS: Record<string, string> = {
  pending: "待执行",
  running: "执行中",
  completed: "已完成",
  failed: "失败",
};

const CLASSES: Record<string, string> = {
  pending: "border border-amber-200/90 bg-amber-50 text-amber-950",
  running: "border border-sky-200/90 bg-sky-50 text-sky-950",
  completed: "border border-emerald-200/90 bg-emerald-50 text-emerald-950",
  failed: "border border-rose-200/90 bg-rose-50 text-rose-950",
};

type Props = {
  status: string;
  className?: string;
};

export function EvaluationStatusBadge({ status, className = "" }: Props) {
  const styles =
    CLASSES[status] ?? "border border-border bg-surface-muted text-muted";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${styles} ${className}`.trim()}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
