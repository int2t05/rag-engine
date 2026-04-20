/**
 * @fileoverview RAG 流式阶段：检索与生成进度展示
 */

import type { RagPipelineStep } from "./types";

export function RagProgressPanel({ steps }: { steps: RagPipelineStep[] }) {
  if (steps.length === 0) return null;

  const activeIdx = steps.findIndex((s) => !s.done);

  return (
    <div className="rounded-xl border border-accent/25 bg-gradient-to-br from-accent/[0.07] via-surface to-surface px-3.5 py-3.5 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accent">
          <svg
            className="h-[18px] w-[18px]"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.75}
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.847a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
            />
          </svg>
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tight text-ink">Embedding 检索流水线</div>
          <p className="mt-0.5 text-[11px] leading-snug text-muted">
            含查询向量化、向量库召回与可选重排；完成后开始输出正文
          </p>
        </div>
      </div>

      <ol className="relative ml-0.5 space-y-0 border-l-2 border-border pl-4">
        {steps.map((s, i) => {
          const isDone = Boolean(s.done);
          const isRunning = activeIdx >= 0 && i === activeIdx;

          return (
            <li
              key={`${s.id}-${i}`}
              className={`relative pb-3 last:pb-0 ${isRunning ? "text-ink" : "text-muted"}`}
            >
              <span
                className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 ${
                  isDone
                    ? "border-emerald-600 bg-emerald-500"
                    : isRunning
                      ? "border-accent bg-accent ring-4 ring-accent/20"
                      : "border-border bg-surface-muted"
                }`}
                aria-hidden
              />
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center">
                  {isDone ? (
                    <span className="text-[11px] font-bold text-emerald-600" aria-hidden>
                      ✓
                    </span>
                  ) : isRunning ? (
                    <span
                      className="inline-block h-3.5 w-3.5 rounded-full border-2 border-accent/35 border-t-accent animate-spin"
                      aria-hidden
                    />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-border" aria-hidden />
                  )}
                </span>
                <span
                  className={`text-[13px] leading-relaxed ${
                    isRunning ? "font-medium text-ink" : isDone ? "text-muted" : "text-muted/80"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
