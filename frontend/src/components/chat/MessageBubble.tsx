/**
 * @fileoverview 消息气泡组件
 * @description 渲染单条聊天消息，支持用户消息和助手消息
 */

import { ChatMessage } from "@/lib/api";
import { Markdown } from "@/components/Markdown";
import { Citations } from "./Citations";

interface MessageBubbleProps {
  /** 消息数据 */
  message: ChatMessage;
  /** 当前对话 ID，用于引用详情页「返回对话」 */
  chatId?: number;
}

/**
 * 消息气泡组件
 * @description 渲染单条聊天消息，包括文本内容和引用来源
 */
export function MessageBubble({ message, chatId }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] md:max-w-2xl rounded-2xl px-4 py-3 ${
          isUser
            ? "bg-accent text-surface rounded-br-md"
            : "border border-border bg-surface text-ink rounded-bl-md shadow-sm"
        }`}
      >
        {/* 消息内容 */}
        {isUser ? (
          <Markdown content={message.content} className="md-content-user" />
        ) : (
          <Markdown content={message.content} />
        )}

        {/* 引用来源（仅助手消息） */}
        {!isUser && message.citations && message.citations.length > 0 && (
          <Citations citations={message.citations} chatId={chatId} />
        )}
      </div>
    </div>
  );
}
