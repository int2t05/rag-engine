/**
 * @fileoverview 聊天列表组件
 * @description 展示对话历史列表，支持创建新对话和删除已有对话
 */

"use client";
import { Chat } from "@/lib/api";
import { PlusIcon, TrashIcon } from "@/components/icons";

interface ChatListProps {
  /** 对话列表 */
  chats: Chat[];
  /** 当前选中的对话 */
  currentChat: Chat | null;
  /** 选中对话的处理函数 */
  onSelectChat: (chat: Chat) => void;
  /** 删除对话的处理函数 */
  onDeleteChat: (chat: Chat) => void;
  /** 创建新对话的点击处理 */
  onNewChat: () => void;
  /** 是否正在加载 */
  loading?: boolean;
  /** 多选：已选中的对话 ID */
  selectedIds?: number[];
  /** 多选：切换选中 */
  onToggleSelect?: (chat: Chat) => void;
  /** 多选：全选当前列表 */
  onSelectAll?: () => void;
  /** 多选：打开批量删除确认 */
  onBatchDelete?: () => void;
}

/**
 * 聊天列表组件
 */
export function ChatList({
  chats,
  currentChat,
  onSelectChat,
  onDeleteChat,
  onNewChat,
  loading = false,
  selectedIds = [],
  onToggleSelect,
  onSelectAll,
  onBatchDelete,
}: ChatListProps) {
  const selectionEnabled = Boolean(onToggleSelect && onSelectAll && onBatchDelete);

  return (
    <>
      {/* 新建对话按钮 */}
      <div className="border-b border-border p-3">
        <button
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
        >
          <PlusIcon className="w-4 h-4" />
          新建对话
        </button>
      </div>

      {selectionEnabled && chats.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          <button
            type="button"
            onClick={onSelectAll}
            className="rounded border border-border px-2 py-1 text-xs text-muted hover:bg-surface-muted hover:text-ink"
          >
            全选
          </button>
          <button
            type="button"
            onClick={onBatchDelete}
            disabled={selectedIds.length === 0}
            className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded border border-red-200 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            批量删除 ({selectedIds.length})
          </button>
        </div>
      )}

      {/* 对话列表 */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {loading ? (
          <div className="p-4 text-center text-sm text-muted">
            加载中...
          </div>
        ) : chats.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted">
            暂无对话记录
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => onSelectChat(chat)}
                className={`group cursor-pointer rounded-lg p-3 transition-colors ${
                  currentChat?.id === chat.id
                    ? "bg-accent-muted text-accent"
                    : "text-ink hover:bg-surface-muted"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {selectionEnabled && (
                      <input
                        type="checkbox"
                        className="flex-shrink-0 rounded border-border text-accent focus:ring-accent"
                        checked={selectedIds.includes(chat.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          onToggleSelect?.(chat);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`选择 ${chat.title}`}
                      />
                    )}
                    <span className="text-sm font-medium truncate flex-1">
                      {chat.title}
                    </span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteChat(chat);
                    }}
                    className="flex-shrink-0 p-1 text-muted opacity-0 transition-all group-hover:opacity-100 hover:text-red-500"
                    title="删除对话"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="mt-1 text-xs text-muted">
                  {new Date(chat.created_at).toLocaleDateString("zh-CN")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
