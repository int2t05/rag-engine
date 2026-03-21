/**
 * @fileoverview 聊天页面
 * @description RAG 对话主界面，提供聊天、对话管理、引用展示等功能
 *
 * 功能列表：
 * - 对话列表管理（创建、选择、删除）
 * - 实时流式对话
 * - Markdown 消息渲染
 * - 引用来源展示
 * - 响应式移动端适配
 */

"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { chatApi, knowledgeBaseApi, Chat, ChatMessage, ApiError, type Citation } from "@/lib/api";
import { parseFastApiErrorBody } from "@/lib/api-errors";
import { DEFAULT_CHAT_TITLE_PREFIX } from "@/lib/form-defaults";
import { citationsFromRagContextBase64 } from "@/lib/rag-context";
import { ChatIcon, XIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Toast } from "@/components/Toast";
import {
  ChatList,
  MessageBubble,
  LoadingDots,
  NewChatModal,
  KbOption,
  EnrichedMessage,
} from "@/components/chat";

// ==================== 工具函数 ====================

/**
 * 从消息内容中解析引用上下文
 * @description 后端返回格式: Base64(上下文 JSON) + "__LLM_RESPONSE__" + LLM 回复
 */
function parseCitationsFromContent(
  content: string,
): { text: string; citations: Citation[] } {
  if (!content.includes("__LLM_RESPONSE__")) {
    return { text: content, citations: [] };
  }

  const parts = content.split("__LLM_RESPONSE__");
  const contextBase64 = parts[0];
  const llmResponse = parts.slice(1).join("__LLM_RESPONSE__");
  const citations = citationsFromRagContextBase64(contextBase64);
  return { text: llmResponse, citations };
}

/**
 * 取 SSE 行中的 data 载荷。
 * 兼容行尾 \\r、以及 `data:` 与正文之间有无空格（部分代理/服务器格式）。
 */
function sseDataPayload(line: string): string | null {
  const t = line.replace(/\r$/, "").trimEnd();
  if (!t.toLowerCase().startsWith("data:")) return null;
  return t.slice(5).trimStart();
}

// ==================== 主组件 ====================

export default function ChatPage() {
  // ==================== 状态定义 ====================

  /** 对话列表 */
  const [chats, setChats] = useState<Chat[]>([]);
  /** 当前选中的对话 */
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  /** 消息列表 */
  const [messages, setMessages] = useState<EnrichedMessage[]>([]);

  /** 用户输入 */
  const [input, setInput] = useState("");
  /** 是否正在发送消息 */
  const [sending, setSending] = useState(false);
  /** 是否正在流式接收 */
  const [streaming, setStreaming] = useState(false);

  /** 新建对话弹窗 */
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatTitle, setNewChatTitle] = useState("");
  const [selectedKbs, setSelectedKbs] = useState<number[]>([]);
  const [creatingChat, setCreatingChat] = useState(false);

  /** 知识库选项 */
  const [kbOptions, setKbOptions] = useState<KbOption[]>([]);

  /** 移动端侧边栏 */
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  /** 表单验证错误 */
  const [formError, setFormError] = useState("");

  /** 删除确认 */
  const [confirmDelete, setConfirmDelete] = useState<Chat | null>(null);
  /** 批量删除对话 */
  const [selectedChatIds, setSelectedChatIds] = useState<number[]>([]);
  const [confirmBatchDeleteChats, setConfirmBatchDeleteChats] = useState(false);
  const [batchDeletingChats, setBatchDeletingChats] = useState(false);

  /** Toast 提示 */
  const [toast, setToast] = useState({
    msg: "",
    type: "error" as "success" | "error" | "info",
    show: false,
  });

  /** 页面加载状态 */
  const [loading, setLoading] = useState(true);

  // ==================== Refs ====================

  /** 消息列表末尾引用 */
  const messagesEndRef = useRef<HTMLDivElement>(null);
  /** 输入框引用 */
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ==================== 工具函数 ====================

  /** 显示 Toast 提示 */
  const showToast = useCallback((msg: string, type: "success" | "error" | "info" = "error") => {
    setToast({ msg, type, show: true });
  }, []);

  // ==================== 数据获取 ====================

  /**
   * 获取对话列表
   */
  const fetchChats = useCallback(async () => {
    try {
      const data = await chatApi.list();
      setChats(data);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "获取对话列表失败");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  /**
   * 获取知识库选项（用于新建对话）
   */
  const fetchKbOptions = useCallback(async () => {
    try {
      const data = await knowledgeBaseApi.list();
      setKbOptions(data.map((kb) => ({ id: kb.id, name: kb.name })));
    } catch {
      // 静默失败
    }
  }, []);

  // ==================== 副作用 ====================

  useEffect(() => {
    fetchChats();
    fetchKbOptions();
  }, [fetchChats, fetchKbOptions]);

  useEffect(() => {
    const valid = new Set(chats.map((c) => c.id));
    setSelectedChatIds((prev) => prev.filter((id) => valid.has(id)));
  }, [chats]);

  /** 自动滚动到最新消息 */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ==================== 事件处理 ====================

  /**
   * 选择对话
   */
  const handleSelectChat = useCallback(
    async (chat: Chat) => {
      try {
        const fullChat = await chatApi.get(chat.id);
        setCurrentChat(fullChat);

        // 解析历史消息中的引用
        const parsedMessages: EnrichedMessage[] = (fullChat.messages || []).map((msg) => {
          if (msg.role === "assistant" && msg.content.includes("__LLM_RESPONSE__")) {
            const { text, citations } = parseCitationsFromContent(msg.content);
            return { ...msg, content: text, citations, _clientId: msg.id ? undefined : crypto.randomUUID() };
          }
          return { ...msg, citations: [] as Citation[], _clientId: msg.id ? undefined : crypto.randomUUID() };
        });

        setMessages(parsedMessages);
        setMobileSidebarOpen(false);
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : "获取对话详情失败");
      }
    },
    [showToast],
  );

  /**
   * 创建新对话
   */
  const handleCreateChat = useCallback(async () => {
    if (selectedKbs.length === 0) {
      setFormError("请选择至少一个知识库");
      return;
    }

    const title =
      newChatTitle.trim() ||
      `${DEFAULT_CHAT_TITLE_PREFIX} · ${new Date().toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })}`;

    setCreatingChat(true);
    try {
      const chat = await chatApi.create({
        title,
        knowledge_base_ids: selectedKbs,
      });
      setChats((prev) => [chat, ...prev]);
      setCurrentChat(chat);
      setMessages([]);
      setShowNewChat(false);
      setNewChatTitle("");
      setSelectedKbs([]);
      setFormError("");
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "创建对话失败");
    } finally {
      setCreatingChat(false);
    }
  }, [newChatTitle, selectedKbs]);

  /**
   * 切换知识库选中状态
   */
  const handleKbToggle = useCallback((kbId: number) => {
    setSelectedKbs((prev) =>
      prev.includes(kbId) ? prev.filter((id) => id !== kbId) : [...prev, kbId],
    );
  }, []);

  /**
   * 删除对话
   */
  const doDeleteChat = useCallback(async () => {
    if (!confirmDelete) return;
    const chat = confirmDelete;
    try {
      await chatApi.delete(chat.id);
      setChats((prev) => prev.filter((c) => c.id !== chat.id));
      if (currentChat?.id === chat.id) {
        setCurrentChat(null);
        setMessages([]);
      }
      showToast("对话已删除", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "删除对话失败");
    } finally {
      setConfirmDelete(null);
    }
  }, [confirmDelete, currentChat, showToast]);

  const toggleSelectChat = useCallback((chat: Chat) => {
    setSelectedChatIds((prev) =>
      prev.includes(chat.id) ? prev.filter((x) => x !== chat.id) : [...prev, chat.id],
    );
  }, []);

  const selectAllChats = useCallback(() => {
    setSelectedChatIds(chats.map((c) => c.id));
  }, [chats]);

  const doBatchDeleteChats = useCallback(async () => {
    if (selectedChatIds.length === 0) return;
    setBatchDeletingChats(true);
    try {
      const res = await chatApi.batchDelete(selectedChatIds);
      const removed = new Set(res.deleted);
      setChats((prev) => prev.filter((c) => !removed.has(c.id)));
      if (currentChat && removed.has(currentChat.id)) {
        setCurrentChat(null);
        setMessages([]);
      }
      setSelectedChatIds([]);
      setConfirmBatchDeleteChats(false);
      if (res.not_found.length > 0) {
        showToast(
          `已删除 ${res.deleted.length} 个对话（${res.not_found.length} 个 ID 未找到）`,
          "info",
        );
      } else {
        showToast(`已删除 ${res.deleted.length} 个对话`, "success");
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "批量删除失败", "error");
    } finally {
      setBatchDeletingChats(false);
    }
  }, [selectedChatIds, currentChat, showToast]);

  /**
   * 发送消息
   */
  const handleSendMessage = useCallback(async () => {
    if (!input.trim() || !currentChat || sending) return;

    const userMsg: EnrichedMessage = {
      role: "user",
      content: input.trim(),
      citations: [],
      _clientId: crypto.randomUUID(),
    };
    const prevMessages = [...messages];
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);
    setStreaming(false);

    try {
      const allMessages: ChatMessage[] = [
        ...prevMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userMsg.content },
      ];
      const response = await chatApi.sendMessage(currentChat.id, allMessages);

      // 处理 401 未授权
      if (response.status === 401) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("token");
          window.location.href = "/login";
        }
        return;
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(parseFastApiErrorBody(err, "发送消息失败"));
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("无法读取响应");

      const decoder = new TextDecoder();
      let fullContent = "";
      let citations: Citation[] = [];
      /** 上行 SSE 可能在 TCP chunk 边界截断，需拼接半行后再解析 */
      let lineBuf = "";
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "",
          citations: [],
          _clientId: crypto.randomUUID(),
        },
      ]);
      setStreaming(true);

      const handleSseLine = (line: string) => {
        const data = sseDataPayload(line);
        if (data === null) return;
        if (data === "[DONE]") return;

        try {
          const parsed = JSON.parse(data) as { text?: unknown };
          if (!("text" in parsed) || parsed.text === undefined || parsed.text === null) {
            return;
          }
          let text =
            typeof parsed.text === "string" ? parsed.text : String(parsed.text);

          if (text.includes("__LLM_RESPONSE__")) {
            const parts = text.split("__LLM_RESPONSE__");
            const contextBase64 = parts[0];
            const llmResponse = parts.slice(1).join("__LLM_RESPONSE__");
            citations = citationsFromRagContextBase64(contextBase64);
            text = llmResponse;
          }

          // 首包可能只有 Base64+分隔符、尚无 LLM 字符；也要写入 citations，否则「参考来源」不显示
          // 注意：勿用 if (!parsed.text) 提前 return，空字符串 "" 也是合法负载
          if (text) {
            fullContent += text;
          }
          if (text || citations.length > 0) {
            const snapshot = fullContent;
            const snapshotCitations = citations;
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = {
                role: "assistant",
                content: snapshot,
                citations: snapshotCitations,
              };
              return updated;
            });
          }
        } catch {
          /* 单行非合法 JSON 时跳过 */
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        lineBuf += decoder.decode(value, { stream: true });
        const lines = lineBuf.split("\n");
        lineBuf = lines.pop() ?? "";
        for (const line of lines) {
          handleSseLine(line);
        }
      }
      if (lineBuf.trim()) {
        handleSseLine(lineBuf);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "发送消息失败");
      setMessages((prev) => {
        if (
          prev.length > 0 &&
          prev[prev.length - 1].role === "assistant" &&
          !prev[prev.length - 1].content
        ) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setSending(false);
      setStreaming(false);
      inputRef.current?.focus();
    }
  }, [input, currentChat, sending, messages, showToast]);

  /**
   * 键盘事件处理
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage],
  );

  /**
   * 打开新建对话弹窗
   */
  const handleNewChat = useCallback(() => {
    setShowNewChat(true);
    setFormError("");
  }, []);

  // ==================== 渲染 ====================

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-gray-400">加载中...</div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-[calc(100vh-3.5rem)] flex">
      {/* ========== 桌面端：固定左侧栏 ========== */}
      <div className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col flex-shrink-0">
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

      {/* ========== 移动端：可滑动侧边栏 ========== */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          {/* 遮罩层 */}
          <div
            className="fixed inset-0 bg-black/50 animate-fade-in"
            onClick={() => setMobileSidebarOpen(false)}
          />
          {/* 侧边栏内容 */}
          <div className="fixed inset-y-0 left-0 w-72 bg-white flex flex-col z-50 animate-slide-in-left shadow-xl">
            {/* 侧边栏头部 */}
            <div className="p-3 flex items-center justify-between border-b border-gray-200">
              <span className="text-sm font-semibold text-gray-700">对话列表</span>
              <button
                onClick={() => setMobileSidebarOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            {/* 聊天列表 */}
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

      {/* ========== 主聊天区域 ========== */}
      <div className="flex-1 flex flex-col bg-gray-50 min-w-0">
        {currentChat ? (
          <>
            {/* 聊天头部 */}
            <div className="h-12 flex items-center gap-3 px-4 border-b border-gray-200 bg-white flex-shrink-0">
              {/* 移动端：菜单按钮 */}
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="md:hidden text-gray-500 hover:text-gray-700 p-1"
              >
                <svg
                  className="w-5 h-5"
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
              <h2 className="text-sm font-semibold text-gray-800 truncate">
                {currentChat.title}
              </h2>
            </div>

            {/* 消息列表 */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 scrollbar-thin">
              {messages.length === 0 && (
                <div className="text-center text-gray-400 py-12 text-sm">
                  开始发送消息进行问答
                </div>
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

            {/* 输入区域 */}
            <div className="p-3 md:p-4 border-t border-gray-200 bg-white">
              <div className="flex gap-2 md:gap-3 items-end max-w-3xl mx-auto">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
                  className="flex-1 resize-none border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-shadow"
                  rows={1}
                  onInput={(e) => {
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = Math.min(el.scrollHeight, 120) + "px";
                  }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!input.trim() || sending}
                  className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                >
                  <svg
                    className="w-4 h-4"
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
          /* ========== 未选择对话：空状态 ========== */
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="text-center max-w-xs">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ChatIcon className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                选择或创建对话
              </h3>
              <p className="text-gray-500 text-sm mb-6">
                从左侧选择已有对话，或创建新对话开始问答
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <button
                  onClick={() => setMobileSidebarOpen(true)}
                  className="md:hidden inline-flex items-center justify-center gap-2 bg-gray-100 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
                >
                  查看对话列表
                </button>
                <button
                  onClick={handleNewChat}
                  className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  新建对话
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========== 新建对话弹窗 ========== */}
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
        onCancel={() => {
          setShowNewChat(false);
          setNewChatTitle("");
          setSelectedKbs([]);
          setFormError("");
        }}
      />

      {/* ========== 删除确认弹窗 ========== */}
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

      {/* ========== Toast 提示 ========== */}
      <Toast
        message={toast.msg}
        type={toast.type}
        visible={toast.show}
        onClose={() => setToast((p) => ({ ...p, show: false }))}
      />
    </div>
  );
}
