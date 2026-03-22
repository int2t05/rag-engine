/**
 * @fileoverview 对话页 RAG 流水线选项（与后端 RagPipelineOptions 对齐）
 */

"use client";

import type { RagPipelineOptions } from "@/lib/api";

interface RagOptionsBarProps {
  open: boolean;
  onToggle: () => void;
  options: RagPipelineOptions;
  onChange: (next: RagPipelineOptions) => void;
  topKInput: string;
  onTopKInputChange: (v: string) => void;
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
  disabled,
}: RagOptionsBarProps) {
  const toggleModule = (key: BooleanRagFlag) => {
    const cur = options[key];
    if (typeof cur !== "boolean") return;
    onChange({ ...options, [key]: !cur });
  };

  return (
    <div className="mx-auto mb-2 max-w-3xl">
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40"
      >
        {open ? "▼ 收起 RAG 选项" : "▶ RAG 检索选项"}
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50/80 p-3 text-xs">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-gray-600">
              Top-K
              <input
                type="text"
                inputMode="numeric"
                value={topKInput}
                onChange={(e) => onTopKInputChange(e.target.value.replace(/\D/g, ""))}
                className="w-14 rounded border border-gray-300 px-2 py-1 text-gray-800"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {MODULE_LABELS.map(({ key, label }) => (
              <label
                key={key}
                className="inline-flex cursor-pointer items-center gap-1.5 text-gray-700"
              >
                <input
                  type="checkbox"
                  checked={Boolean(options[key])}
                  onChange={() => toggleModule(key)}
                  className="rounded border-gray-300"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
