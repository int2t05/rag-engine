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
      <div className="p-3 border-b border-gray-200">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          新建对话
        </button>
      </div>

      {selectionEnabled && chats.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between gap-2 flex-wrap">
          <button
            type="button"
            onClick={onSelectAll}
            className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
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
          <div className="p-4 text-center text-gray-400 text-sm">
            加载中...
          </div>
        ) : chats.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">
            暂无对话记录
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => onSelectChat(chat)}
                className={`group p-3 rounded-lg cursor-pointer transition-colors ${
                  currentChat?.id === chat.id
                    ? "bg-blue-50 text-blue-700"
                    : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {selectionEnabled && (
                      <input
                        type="checkbox"
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
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
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all p-1 flex-shrink-0"
                    title="删除对话"
                  >
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="text-xs text-gray-400 mt-1">
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
