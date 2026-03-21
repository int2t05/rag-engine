/**
 * @fileoverview 聊天页面
 * @description RAG 对话主界面；数据与 SSE 逻辑见 useChatSession
 */

"use client";

import { ChatIcon, XIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Toast } from "@/components/Toast";
import {
  ChatList,
  MessageBubble,
  LoadingDots,
  NewChatModal,
} from "@/components/chat";
import { useChatSession } from "@/hooks/useChatSession";

export default function ChatPage() {
  const {
    chats,
    currentChat,
    messages,
    input,
    setInput,
    sending,
    streaming,
    showNewChat,
    newChatTitle,
    setNewChatTitle,
    selectedKbs,
    creatingChat,
    kbOptions,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    formError,
    confirmDelete,
    setConfirmDelete,
    selectedChatIds,
    confirmBatchDeleteChats,
    setConfirmBatchDeleteChats,
    batchDeletingChats,
    toast,
    setToast,
    loading,
    messagesEndRef,
    inputRef,
    handleSelectChat,
    handleCreateChat,
    handleKbToggle,
    doDeleteChat,
    toggleSelectChat,
    selectAllChats,
    doBatchDeleteChats,
    handleSendMessage,
    handleStopGenerating,
    handleKeyDown,
    handleNewChat,
    closeNewChatModal,
  } = useChatSession();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-3.5rem)]">
      <div className="hidden w-64 flex-shrink-0 flex-col border-r border-gray-200 bg-white md:flex">
        <ChatList
          chats={chats}
          currentChat={currentChat}
          onSelectChat={handleSelectChat}
          onDeleteChat={(chat) => setConfirmDelete(chat)}
          onNewChat={handleNewChat}
          selectedIds={selectedChatIds}
          onToggleSelect={toggleSelectChat}
          onSelectAll={selectAllChats}
          onBatchDelete={() => setConfirmBatchDeleteChats(true)}
        />
      </div>

      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="animate-fade-in fixed inset-0 bg-black/50"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden
          />
          <div className="animate-slide-in-left fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 p-3">
              <span className="text-sm font-semibold text-gray-700">对话列表</span>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <ChatList
              chats={chats}
              currentChat={currentChat}
              onSelectChat={handleSelectChat}
              onDeleteChat={(chat) => setConfirmDelete(chat)}
              onNewChat={handleNewChat}
              selectedIds={selectedChatIds}
              onToggleSelect={toggleSelectChat}
              onSelectAll={selectAllChats}
              onBatchDelete={() => setConfirmBatchDeleteChats(true)}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col bg-gray-50">
        {currentChat ? (
          <>
            <div className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="p-1 text-gray-500 hover:text-gray-700 md:hidden"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={1.5}
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                  />
                </svg>
              </button>
              <h2 className="truncate text-sm font-semibold text-gray-800">{currentChat.title}</h2>
            </div>

            <div className="scrollbar-thin flex-1 space-y-4 overflow-y-auto p-4 md:p-6">
              {messages.length === 0 && (
                <div className="py-12 text-center text-sm text-gray-400">开始发送消息进行问答</div>
              )}
              {messages.map((msg, idx) => (
                <MessageBubble
                  key={msg.id ?? msg._clientId ?? `msg-${idx}`}
                  message={msg}
                />
              ))}
              {sending && !streaming && <LoadingDots />}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-gray-200 bg-white p-3 md:p-4">
              <div className="mx-auto flex max-w-3xl items-end gap-2 md:gap-3">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
                  className="flex-1 resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm transition-shadow focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={1}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                  }}
                />
                {(sending || streaming) && (
                  <button
                    type="button"
                    onClick={handleStopGenerating}
                    className="flex-shrink-0 rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
                  >
                    停止
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSendMessage}
                  disabled={!input.trim() || sending}
                  className="flex-shrink-0 rounded-xl bg-blue-600 p-3 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6">
            <div className="max-w-xs text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
                <ChatIcon className="h-8 w-8 text-gray-400" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-gray-800">选择或创建对话</h3>
              <p className="mb-6 text-sm text-gray-500">从左侧选择已有对话，或创建新对话开始问答</p>
              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 md:hidden"
                >
                  查看对话列表
                </button>
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
                >
                  新建对话
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <NewChatModal
        visible={showNewChat}
        title={newChatTitle}
        onTitleChange={setNewChatTitle}
        selectedKbs={selectedKbs}
        onKbToggle={handleKbToggle}
        kbOptions={kbOptions}
        error={formError}
        loading={creatingChat}
        onCreate={handleCreateChat}
        onCancel={closeNewChatModal}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        title="删除对话"
        description={`确定要删除对话「${confirmDelete?.title}」吗？删除后无法恢复。`}
        confirmText="删除"
        variant="danger"
        onConfirm={doDeleteChat}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmDialog
        open={confirmBatchDeleteChats}
        title="批量删除对话"
        description={`确定删除已选中的 ${selectedChatIds.length} 个对话吗？删除后无法恢复。`}
        confirmText="删除"
        variant="danger"
        loading={batchDeletingChats}
        onConfirm={doBatchDeleteChats}
        onCancel={() => setConfirmBatchDeleteChats(false)}
      />

      <Toast
        message={toast.msg}
        type={toast.type}
        visible={toast.show}
        onClose={() => setToast((p) => ({ ...p, show: false }))}
      />
    </div>
  );
}
