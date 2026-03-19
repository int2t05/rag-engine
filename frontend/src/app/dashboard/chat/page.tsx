"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { chatApi, knowledgeBaseApi, Chat, ChatMessage, ApiError } from "@/lib/api";
import { PlusIcon, TrashIcon, ChatIcon, XIcon } from "@/components/icons";
import { Markdown } from "@/components/Markdown";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Toast } from "@/components/Toast";

interface KbOption {
  id: number;
  name: string;
}

export default function ChatPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatTitle, setNewChatTitle] = useState("");
  const [selectedKbs, setSelectedKbs] = useState<number[]>([]);
  const [kbOptions, setKbOptions] = useState<KbOption[]>([]);
  const [creatingChat, setCreatingChat] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [toast, setToast] = useState({ msg: "", type: "error" as "success" | "error" | "info", show: false });
  const [confirmDelete, setConfirmDelete] = useState<Chat | null>(null);
  const [formError, setFormError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const showToast = (msg: string, type: "success" | "error" | "info" = "error") => {
    setToast({ msg, type, show: true });
  };

  const fetchChats = useCallback(async () => {
    try {
      const data = await chatApi.list();
      setChats(data);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "获取对话列表失败");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchKbOptions = useCallback(async () => {
    try {
      const data = await knowledgeBaseApi.list();
      setKbOptions(data.map((kb: any) => ({ id: kb.id, name: kb.name })));
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchChats();
    fetchKbOptions();
  }, [fetchChats, fetchKbOptions]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSelectChat = async (chat: Chat) => {
    try {
      const fullChat = await chatApi.get(chat.id);
      setCurrentChat(fullChat);
      setMessages(fullChat.messages || []);
      setMobileSidebarOpen(false);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "获取对话详情失败");
    }
  };

  const handleCreateChat = async () => {
    if (!newChatTitle.trim()) {
      setFormError("请输入对话标题");
      return;
    }
    if (selectedKbs.length === 0) {
      setFormError("请选择至少一个知识库");
      return;
    }

    setCreatingChat(true);
    try {
      const chat = await chatApi.create({
        title: newChatTitle,
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
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !currentChat || sending) return;

    const userMsg: ChatMessage = { role: "user", content: input.trim() };
    const prevMessages = [...messages];
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);
    setStreaming(false);

    try {
      const allMessages = [...prevMessages, userMsg];
      const response = await chatApi.sendMessage(currentChat.id, allMessages);

      if (response.status === 401) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("token");
          window.location.href = "/login";
        }
        return;
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        const msg =
          typeof err.detail === "string"
            ? err.detail
            : err.detail?.msg || "发送消息失败";
        throw new Error(msg);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("无法读取响应");

      const decoder = new TextDecoder();
      let fullContent = "";
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      setStreaming(true);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            if (parsed.text) {
              fullContent += parsed.text;
              const snapshot = fullContent;
              setMessages((prev) => {
                const updated = [...prev];
                updated[updated.length - 1] = {
                  role: "assistant",
                  content: snapshot,
                };
                return updated;
              });
            }
          } catch {
            // skip parse errors
          }
        }
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "发送消息失败");
      setMessages((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].role === "assistant" && !prev[prev.length - 1].content) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    } finally {
      setSending(false);
      setStreaming(false);
      inputRef.current?.focus();
    }
  };

  const doDeleteChat = async () => {
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
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-pulse text-gray-400">加载中...</div>
      </div>
    );
  }

  const chatListContent = (
    <>
      <div className="p-3 border-b border-gray-200">
        <button
          onClick={() => {
            setShowNewChat(true);
            setFormError("");
          }}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />
          新建对话
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {chats.length === 0 ? (
          <div className="p-4 text-center text-gray-400 text-sm">
            暂无对话记录
          </div>
        ) : (
          <div className="p-2 space-y-0.5">
            {chats.map((chat) => (
              <div
                key={chat.id}
                onClick={() => handleSelectChat(chat)}
                className={`group p-3 rounded-lg cursor-pointer transition-colors ${
                  currentChat?.id === chat.id
                    ? "bg-blue-50 text-blue-700"
                    : "hover:bg-gray-100 text-gray-700"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate flex-1">
                    {chat.title}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(chat);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-all p-1 flex-shrink-0"
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

  return (
    <div className="h-full min-h-[calc(100vh-3.5rem)] flex">
      {/* Desktop Chat List */}
      <div className="hidden md:flex w-64 bg-white border-r border-gray-200 flex-col flex-shrink-0">
        {chatListContent}
      </div>

      {/* Mobile Chat List */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="fixed inset-0 bg-black/50 animate-fade-in"
            onClick={() => setMobileSidebarOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-72 bg-white flex flex-col z-50 animate-slide-in-left shadow-xl">
            <div className="p-3 flex items-center justify-between border-b border-gray-200">
              <span className="text-sm font-semibold text-gray-700">对话列表</span>
              <button onClick={() => setMobileSidebarOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <XIcon className="w-4 h-4" />
              </button>
            </div>
            {chatListContent}
          </div>
        </div>
      )}

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-gray-50 min-w-0">
        {currentChat ? (
          <>
            {/* Chat Header */}
            <div className="h-12 flex items-center gap-3 px-4 border-b border-gray-200 bg-white flex-shrink-0">
              <button
                onClick={() => setMobileSidebarOpen(true)}
                className="md:hidden text-gray-500 hover:text-gray-700 p-1"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
              <h2 className="text-sm font-semibold text-gray-800 truncate">
                {currentChat.title}
              </h2>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 scrollbar-thin">
              {messages.length === 0 && (
                <div className="text-center text-gray-400 py-12 text-sm">
                  开始发送消息进行问答
                </div>
              )}
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] md:max-w-2xl rounded-2xl px-4 py-3 ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-br-md"
                        : "bg-white border border-gray-200 text-gray-800 rounded-bl-md shadow-sm"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <Markdown content={msg.content} />
                    ) : (
                      <Markdown content={msg.content} className="md-content-user" />
                    )}
                  </div>
                </div>
              ))}
              {sending && !streaming && (
                <div className="flex justify-start">
                  <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                    <div className="flex gap-1.5 items-center h-5">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
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
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        ) : (
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
                  onClick={() => {
                    setShowNewChat(true);
                    setFormError("");
                  }}
                  className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                  新建对话
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto animate-scale-in">
            <h2 className="text-lg font-bold text-gray-900 mb-4">新建对话</h2>

            {formError && (
              <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  对话标题
                </label>
                <input
                  type="text"
                  value={newChatTitle}
                  onChange={(e) => setNewChatTitle(e.target.value)}
                  placeholder="例如：项目文档问答"
                  className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  选择知识库（可多选）
                </label>
                <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
                  {kbOptions.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">
                      暂无可用知识库，请先创建知识库并上传文档
                    </p>
                  ) : (
                    kbOptions.map((kb) => (
                      <label
                        key={kb.id}
                        className="flex items-center gap-2.5 p-2 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedKbs.includes(kb.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedKbs((prev) => [...prev, kb.id]);
                            } else {
                              setSelectedKbs((prev) =>
                                prev.filter((id) => id !== kb.id),
                              );
                            }
                          }}
                          className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{kb.name}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowNewChat(false);
                  setNewChatTitle("");
                  setSelectedKbs([]);
                  setFormError("");
                }}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateChat}
                disabled={creatingChat}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {creatingChat ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      <ConfirmDialog
        open={!!confirmDelete}
        title="删除对话"
        description={`确定要删除对话「${confirmDelete?.title}」吗？删除后无法恢复。`}
        confirmText="删除"
        variant="danger"
        onConfirm={doDeleteChat}
        onCancel={() => setConfirmDelete(null)}
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
