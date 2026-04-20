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
  RagOptionsBar,
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
    ragOptions,
    setRagOptions,
    ragPanelOpen,
    setRagPanelOpen,
    topKInput,
    setTopKInput,
    rerankTopNInput,
    setRerankTopNInput,
  } = useChatSession();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="animate-pulse text-sm text-muted">加载中...</div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      <div className="hidden h-full min-h-0 w-64 flex-shrink-0 flex-col border-r border-border bg-surface md:flex">
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
          <div className="animate-slide-in-left fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-border p-3">
              <span className="text-sm font-semibold text-ink">对话列表</span>
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(false)}
                className="p-1 text-muted hover:text-ink"
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

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface-muted">
        {currentChat ? (
          <>
            <div className="flex h-12 flex-shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="p-1 text-muted hover:text-ink md:hidden"
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
              <h2 className="truncate text-sm font-semibold text-ink">{currentChat.title}</h2>
            </div>

            <div className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden overscroll-y-contain p-4 md:p-6">
              {messages.length === 0 && (
                <div className="py-12 text-center text-sm text-muted">开始发送消息进行问答</div>
              )}
              {messages.map((msg, idx) => (
                <MessageBubble
                  key={msg.id ?? msg._clientId ?? `msg-${idx}`}
                  message={msg}
                  chatId={currentChat.id}
                />
              ))}
              {sending &&
                !streaming &&
                messages[messages.length - 1]?.role !== "assistant" && <LoadingDots />}
              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-border bg-surface p-3 md:p-4">
              <RagOptionsBar
                open={ragPanelOpen}
                onToggle={() => setRagPanelOpen((o) => !o)}
                options={ragOptions}
                onChange={setRagOptions}
                topKInput={topKInput}
                onTopKInputChange={setTopKInput}
                rerankTopNInput={rerankTopNInput}
                onRerankTopNInputChange={setRerankTopNInput}
                disabled={sending || streaming}
              />
              <div className="mx-auto flex max-w-3xl items-end gap-2 md:gap-3">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
                  className="flex-1 resize-none rounded-xl border border-border bg-surface px-4 py-3 text-sm text-ink transition-shadow placeholder:text-muted focus:border-transparent focus:outline-none focus:ring-2 focus:ring-accent/35"
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
                  className="flex-shrink-0 rounded-xl bg-accent p-3 text-surface transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
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
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-muted">
                <ChatIcon className="h-8 w-8 text-muted" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-ink">选择或创建对话</h3>
              <p className="mb-6 text-sm text-muted">从左侧选择已有对话，或创建新对话开始问答</p>
              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setMobileSidebarOpen(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-surface-muted px-4 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-border/40 md:hidden"
                >
                  查看对话列表
                </button>
                <button
                  type="button"
                  onClick={handleNewChat}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-surface transition-colors hover:bg-accent-hover"
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
