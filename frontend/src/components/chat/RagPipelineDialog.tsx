/**
 * @fileoverview 检索 / Embedding 流水线浮动对话框
 * @description 发送后立即展示步骤列表；正文流式开始时自动折叠，仍可手动展开查看
 */

"use client";

import { useMemo } from "react";
import type { RagPipelineOptions } from "@/lib/api";
import type { RagPipelineStep } from "./types";
import { RagProgressPanel } from "./RagProgressPanel";

/** 与 RagOptionsBar 勾选一致：未启用的模块不展示对应 SSE 步骤（兼容旧后端仍推送全部步骤） */
const STEP_ID_REQUIRES_OPTION: Partial<Record<string, keyof RagPipelineOptions>> = {
  query_preprocess: "query_rewrite",
  multi_route: "multi_route",
  parent_child: "parent_child",
  rerank: "rerank",
};

export function filterRagPipelineStepsByOptions(
  steps: RagPipelineStep[],
  opts: RagPipelineOptions,
): RagPipelineStep[] {
  return steps.filter((s) => {
    const optKey = STEP_ID_REQUIRES_OPTION[s.id];
    if (!optKey) return true;
    return Boolean(opts[optKey]);
  });
}

type RagPipelineDialogProps = {
  open: boolean;
  expanded: boolean;
  steps: RagPipelineStep[];
  ragOptions: RagPipelineOptions;
  onToggleExpanded: () => void;
};

export function RagPipelineDialog({
  open,
  expanded,
  steps,
  ragOptions,
  onToggleExpanded,
}: RagPipelineDialogProps) {
  const visibleSteps = useMemo(
    () => filterRagPipelineStepsByOptions(steps, ragOptions),
    [steps, ragOptions],
  );

  if (!open || visibleSteps.length === 0) return null;

  return (
    <div
      className="animate-fade-in pointer-events-auto fixed bottom-[5.5rem] left-3 right-3 z-40 flex justify-center md:bottom-8 md:left-auto md:right-6 md:justify-end"
      role="dialog"
      aria-label="Embedding 检索进度"
    >
      <div className="pointer-events-auto w-full max-w-md shadow-lg shadow-black/10 dark:shadow-black/40">
        <RagProgressPanel
          steps={visibleSteps}
          collapsed={!expanded}
          onToggleCollapsed={onToggleExpanded}
        />
      </div>
    </div>
  );
}
