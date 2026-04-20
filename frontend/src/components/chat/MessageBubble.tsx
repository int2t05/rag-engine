/**
 * @fileoverview 消息气泡组件
 * @description 渲染单条聊天消息，支持用户消息和助手消息
 */

import { Markdown } from "@/components/Markdown";
import { Citations } from "./Citations";
import type { EnrichedMessage } from "./types";

interface MessageBubbleProps {
  /** 消息数据 */
  message: EnrichedMessage;
  /** 当前对话 ID，用于引用详情页「返回对话」 */
  chatId?: number;
}

/**
 * 消息气泡组件
 * @description 渲染单条聊天消息，包括文本内容和引用来源
 */
export function MessageBubble({ message, chatId }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const assistantWaitingPipeline =
    !isUser &&
    !String(message.content ?? "").trim() &&
    Boolean(message.ragPipeline?.length);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[92%] md:max-w-2xl rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-accent text-surface rounded-br-md"
            : "border border-border bg-surface text-ink rounded-bl-md shadow-sm"
        }`}
      >
        {/* 消息内容；检索步骤在页面级 RagPipelineDialog 中展示 */}
        {isUser ? (
          <Markdown content={message.content} className="md-content-user" />
        ) : (
          <>
            {assistantWaitingPipeline && (
              <p className="text-sm text-muted">检索与向量化进行中，见下方进度面板…</p>
            )}
            {!message.content?.trim() &&
              (!message.ragPipeline || message.ragPipeline.length === 0) && (
                <p className="text-sm text-muted">正在等待服务响应…</p>
              )}
            {Boolean(message.content?.trim()) && <Markdown content={message.content} />}
          </>
        )}

        {/* 引用来源（仅助手消息） */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <Citations citations={message.citations} chatId={chatId} />
        )}
      </div>
    </div>
  );
}
