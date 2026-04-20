/**
 * @fileoverview 加载动画组件
 * @description 显示助手正在输入的动画效果
 */

/**
 * 加载动画组件
 * @description 三个跳动的圆点，表示 AI 正在生成回复
 */
export function LoadingDots() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl rounded-bl-md border border-border bg-surface px-4 py-3 shadow-sm">
        <div className="flex flex-col gap-2">
          <div className="flex h-5 items-center gap-1.5">
            <span
              className="h-2 w-2 animate-bounce rounded-full bg-accent/70"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="h-2 w-2 animate-bounce rounded-full bg-accent/70"
              style={{ animationDelay: "150ms" }}
            />
            <span
              className="h-2 w-2 animate-bounce rounded-full bg-accent/70"
              style={{ animationDelay: "300ms" }}
            />
          </div>
          <p className="text-xs leading-snug text-muted">请求已发送，正在建立连接…</p>
        </div>
      </div>
    </div>
  );
}
