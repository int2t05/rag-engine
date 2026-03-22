/**
 * @fileoverview 对话页 RAG 流水线选项（与后端 RagPipelineOptions 对齐）
 */

"use client";

import type { RagPipelineOptions } from "@/lib/api";
import { CpuChipIcon } from "@/components/icons";

interface RagOptionsBarProps {
  open: boolean;
  onToggle: () => void;
  options: RagPipelineOptions;
  onChange: (next: RagPipelineOptions) => void;
  topKInput: string;
  onTopKInputChange: (v: string) => void;
  /** 重排前候选数；空串表示后端默认 max(top_k×4, 16) */
  rerankTopNInput: string;
  onRerankTopNInputChange: (v: string) => void;
  disabled?: boolean;
}

type BooleanRagFlag =
  | "query_rewrite"
  | "multi_kb"
  | "hybrid"
  | "multi_route"
  | "rerank"
  | "parent_child";

const MODULE_LABELS: Array<{ key: BooleanRagFlag; label: string }> = [
  { key: "query_rewrite", label: "查询重写" },
  { key: "multi_kb", label: "多库合并" },
  { key: "hybrid", label: "混合检索" },
  { key: "multi_route", label: "多路召回" },
  { key: "rerank", label: "重排" },
  { key: "parent_child", label: "父子块展开" },
];

export function RagOptionsBar({
  open,
  onToggle,
  options,
  onChange,
  topKInput,
  onTopKInputChange,
  rerankTopNInput,
  onRerankTopNInputChange,
  disabled,
}: RagOptionsBarProps) {
  const toggleModule = (key: BooleanRagFlag) => {
    const cur = options[key];
    if (typeof cur !== "boolean") return;
    onChange({ ...options, [key]: !cur });
  };

  const topKLabel = options.rerank ? "重排后片段数" : "Top-K";
  const topKTitle = options.rerank
    ? "重排后最终参与生成与引用的片段数"
    : "检索返回并参与生成与引用的片段数";

  return (
    <div className="mx-auto mb-3 max-w-3xl rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm ring-1 ring-accent/10 md:px-4 md:py-3">
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 rounded-lg text-left transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-40 md:-mx-1 md:px-1 md:py-0.5"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent-muted text-accent shadow-sm">
            <CpuChipIcon className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-sm font-semibold tracking-tight text-ink">
              RAG 检索配置
            </span>
            <span className="mt-0.5 block text-xs text-muted">
              {open ? "调整召回与重排，对当前对话生效" : "点击展开，设置 Top-K、混合检索等"}
            </span>
          </span>
        </span>
        <span
          className={`flex-shrink-0 rounded-md px-2 py-1 text-xs font-medium ${
            open ? "bg-accent-muted text-accent" : "bg-surface-muted text-muted"
          }`}
        >
          {open ? "收起" : "展开"}
        </span>
      </button>
      {open && (
        <div className="mt-3 border-t border-border pt-3 text-sm">
          <div className="mb-3 flex flex-wrap items-end gap-x-4 gap-y-2">
            <label className="flex flex-col gap-1 text-ink">
              <span className="text-xs font-medium text-muted">{topKLabel}</span>
              <input
                type="text"
                inputMode="numeric"
                value={topKInput}
                onChange={(e) => onTopKInputChange(e.target.value.replace(/\D/g, ""))}
                className="w-[4.5rem] rounded-lg border border-border bg-surface px-2.5 py-2 text-sm font-medium text-ink shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                title={topKTitle}
              />
            </label>
            {options.rerank && (
              <label className="flex flex-col gap-1 text-ink">
                <span className="text-xs font-medium text-muted">重排前候选数</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={rerankTopNInput}
                  onChange={(e) => onRerankTopNInputChange(e.target.value.replace(/\D/g, ""))}
                  className="w-[5.5rem] rounded-lg border border-border bg-surface px-2.5 py-2 text-sm font-medium text-ink shadow-sm transition-colors focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
                  placeholder="自动"
                  title="留空则使用后端默认 max(top_k×4, 16)"
                />
              </label>
            )}
          </div>
          <p className="mb-2 text-xs font-medium text-muted">检索能力</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2.5">
            {MODULE_LABELS.map(({ key, label }) => (
              <label
                key={key}
                className="inline-flex cursor-pointer items-center gap-2 text-ink"
              >
                <input
                  type="checkbox"
                  checked={Boolean(options[key])}
                  onChange={() => toggleModule(key)}
                  className="h-4 w-4 rounded border-border text-accent focus:ring-accent"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
