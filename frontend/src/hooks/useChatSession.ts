/**
 * @fileoverview RAG 对话页：列表、详情、流式发送
 * @description
 * - GET /api/chat、GET /api/chat/{id}（历史消息在详情内）
 * - POST /api/chat、DELETE /api/chat/{id}、POST /api/chat/batch-delete
 * - POST /api/chat/{id}/messages：SSE 流，由本 hook 逐行解析
 * - GET /api/knowledge-base：新建对话时下拉知识库
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { chatApi, knowledgeBaseApi, ApiError, type Chat, type ChatMessage, type Citation } from "@/lib/api";
import { parseFastApiErrorBody } from "@/lib/api-errors";
import { DEFAULT_CHAT_TITLE_PREFIX } from "@/lib/form-defaults";
import { parseCitationsFromContent, sseDataPayload } from "@/lib/chat-stream";
import { citationsFromRagContextBase64 } from "@/lib/rag-context";
import type { EnrichedMessage, KbOption } from "@/components/chat";

function parseChatMessagesFromApi(fullChat: Chat): EnrichedMessage[] {
  return (fullChat.messages || []).map((msg) => {
    if (msg.role === "assistant" && msg.content.includes("__LLM_RESPONSE__")) {
      const { text, citations } = parseCitationsFromContent(msg.content);
      return {
        ...msg,
        content: text,
        citations,
        _clientId: msg.id ? undefined : crypto.randomUUID(),
      };
    }
    return {
      ...msg,
      citations: [] as Citation[],
      _clientId: msg.id ? undefined : crypto.randomUUID(),
    };
  });
}

export function useChatSession() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChat, setCurrentChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<EnrichedMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [newChatTitle, setNewChatTitle] = useState("");
  const [selectedKbs, setSelectedKbs] = useState<number[]>([]);
  const [creatingChat, setCreatingChat] = useState(false);
  const [kbOptions, setKbOptions] = useState<KbOption[]>([]);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Chat | null>(null);
  const [selectedChatIds, setSelectedChatIds] = useState<number[]>([]);
  const [confirmBatchDeleteChats, setConfirmBatchDeleteChats] = useState(false);
  const [batchDeletingChats, setBatchDeletingChats] = useState(false);
  const [toast, setToast] = useState({
    msg: "",
    type: "error" as "success" | "error" | "info",
    show: false,
  });
  const [loading, setLoading] = useState(true);

  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sendAbortRef = useRef<AbortController | null>(null);
  const urlRestoredRef = useRef(false);

  const syncChatToUrl = useCallback(
    (chatId: number | null) => {
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      if (chatId != null) url.searchParams.set("chat", String(chatId));
      else url.searchParams.delete("chat");
      router.replace(url.pathname + url.search);
    },
    [router],
  );

  const showToast = useCallback((msg: string, type: "success" | "error" | "info" = "error") => {
    setToast({ msg, type, show: true });
  }, []);

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

  const fetchKbOptions = useCallback(async () => {
    try {
      const data = await knowledgeBaseApi.list();
      setKbOptions(data.map((kb) => ({ id: kb.id, name: kb.name })));
    } catch {
      /* 静默 */
    }
  }, []);

  useEffect(() => {
    fetchChats();
    fetchKbOptions();
  }, [fetchChats, fetchKbOptions]);

  useEffect(() => {
    const valid = new Set(chats.map((c) => c.id));
    setSelectedChatIds((prev) => prev.filter((id) => valid.has(id)));
  }, [chats]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const lastAssistantPending = useMemo(() => {
    const last = messages[messages.length - 1];
    return Boolean(
      last?.role === "assistant" && (!last.content || !String(last.content).trim()),
    );
  }, [messages]);

  const pollingChatId = currentChat?.id;

  /** 刷新后仍可能后台在写库：轮询直到助手消息非空或超时 */
  useEffect(() => {
    if (pollingChatId == null || sending || streaming || !lastAssistantPending) return;

    let attempts = 0;
    const maxAttempts = 120;
    const timer = window.setInterval(async () => {
      attempts += 1;
      if (attempts > maxAttempts) {
        window.clearInterval(timer);
        return;
      }
      try {
        const fullChat = await chatApi.get(pollingChatId);
        const parsed = parseChatMessagesFromApi(fullChat);
        setCurrentChat(fullChat);
        setMessages(parsed);
        const last = parsed[parsed.length - 1];
        if (last?.role === "assistant" && String(last.content).trim() !== "") {
          window.clearInterval(timer);
        }
      } catch {
        /* 静默 */
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [pollingChatId, sending, streaming, lastAssistantPending]);

  const handleSelectChat = useCallback(
    async (chat: Chat) => {
      syncChatToUrl(chat.id);
      try {
        const fullChat = await chatApi.get(chat.id);
        setCurrentChat(fullChat);
        setMessages(parseChatMessagesFromApi(fullChat));
        setMobileSidebarOpen(false);
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : "获取对话详情失败");
      }
    },
    [showToast, syncChatToUrl],
  );

  /** 从 URL ?chat= 恢复当前会话，避免刷新后丢失选中态 */
  useEffect(() => {
    if (loading || urlRestoredRef.current) return;
    const raw = new URLSearchParams(window.location.search).get("chat");
    const id = raw ? parseInt(raw, 10) : NaN;
    if (raw === null || raw === "" || Number.isNaN(id)) {
      urlRestoredRef.current = true;
      return;
    }
    if (chats.length === 0) {
      if (!loading) {
        syncChatToUrl(null);
        urlRestoredRef.current = true;
      }
      return;
    }
    const c = chats.find((x) => x.id === id);
    if (c) {
      urlRestoredRef.current = true;
      void handleSelectChat(c);
    } else {
      syncChatToUrl(null);
      urlRestoredRef.current = true;
    }
  }, [loading, chats, handleSelectChat, syncChatToUrl]);

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
      syncChatToUrl(chat.id);
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
  }, [newChatTitle, selectedKbs, syncChatToUrl]);

  const handleKbToggle = useCallback((kbId: number) => {
    setSelectedKbs((prev) =>
      prev.includes(kbId) ? prev.filter((id) => id !== kbId) : [...prev, kbId],
    );
  }, []);

  const doDeleteChat = useCallback(async () => {
    if (!confirmDelete) return;
    const chat = confirmDelete;
    try {
      await chatApi.delete(chat.id);
      setChats((prev) => prev.filter((c) => c.id !== chat.id));
      if (currentChat?.id === chat.id) {
        setCurrentChat(null);
        setMessages([]);
        syncChatToUrl(null);
      }
      showToast("对话已删除", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "删除对话失败");
    } finally {
      setConfirmDelete(null);
    }
  }, [confirmDelete, currentChat, showToast, syncChatToUrl]);

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
        syncChatToUrl(null);
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
  }, [selectedChatIds, currentChat, showToast, syncChatToUrl]);

  const handleStopGenerating = useCallback(() => {
    sendAbortRef.current?.abort();
  }, []);

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

    sendAbortRef.current?.abort();
    sendAbortRef.current = new AbortController();
    const signal = sendAbortRef.current.signal;

    try {
      const allMessages: ChatMessage[] = [
        ...prevMessages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: userMsg.content },
      ];
      const response = await chatApi.sendMessage(currentChat.id, allMessages, signal);

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
          let text = typeof parsed.text === "string" ? parsed.text : String(parsed.text);

          if (text.includes("__LLM_RESPONSE__")) {
            const parts = text.split("__LLM_RESPONSE__");
            const contextBase64 = parts[0];
            const llmResponse = parts.slice(1).join("__LLM_RESPONSE__");
            citations = citationsFromRagContextBase64(contextBase64);
            text = llmResponse;
          }

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
          /* 非 JSON 行跳过 */
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
      const aborted =
        (err instanceof DOMException && err.name === "AbortError") ||
        (err instanceof Error && err.name === "AbortError");
      if (aborted && currentChat) {
        try {
          const fullChat = await chatApi.get(currentChat.id);
          setCurrentChat(fullChat);
          setMessages(parseChatMessagesFromApi(fullChat));
        } catch {
          /* 忽略 */
        }
      } else if (!aborted) {
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
      }
    } finally {
      sendAbortRef.current = null;
      setSending(false);
      setStreaming(false);
      inputRef.current?.focus();
    }
  }, [input, currentChat, sending, messages, showToast]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      }
    },
    [handleSendMessage],
  );

  const handleNewChat = useCallback(() => {
    setShowNewChat(true);
    setFormError("");
  }, []);

  const closeNewChatModal = useCallback(() => {
    setShowNewChat(false);
    setNewChatTitle("");
    setSelectedKbs([]);
    setFormError("");
  }, []);

  return {
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
    showToast,
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
  };
}
