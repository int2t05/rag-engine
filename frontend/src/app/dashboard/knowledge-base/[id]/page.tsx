/**
 * @fileoverview 知识库详情页面
 * @description 展示知识库详情，包含文档上传、预览、处理、检索测试等功能
 */

"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  knowledgeBaseApi,
  ApiError,
  KnowledgeBase,
  DocumentItem,
  RetrievalResult,
} from "@/lib/api";
import { useDocumentPipeline } from "@/hooks/useDocumentPipeline";
import { PATH } from "@/lib/routes";
import {
  ArrowLeftIcon,
  EditIcon,
  UploadIcon,
  FileIcon,
  ChevronRightIcon,
  TrashIcon,
} from "@/components/icons";
import { Toast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  formatFileSize,
  getDisplayProcessingTask,
  isDocumentProcessing,
} from "@/lib/utils";
import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
  DEFAULT_TOP_K,
  parseTopK,
} from "@/lib/form-defaults";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: {
    label: "等待处理",
    color: "border border-amber-200/90 bg-amber-50 text-amber-950",
  },
  processing: {
    label: "处理中",
    color: "border border-sky-200/90 bg-sky-50 text-sky-950",
  },
  completed: {
    label: "已完成",
    color: "border border-emerald-200/90 bg-emerald-50 text-emerald-950",
  },
  failed: { label: "失败", color: "border border-rose-200/90 bg-rose-50 text-rose-950" },
  exists: {
    label: "内容相同",
    color: "border border-border bg-surface-muted text-muted",
  },
  pending_replace: {
    label: "待覆盖更新",
    color: "border border-amber-200/90 bg-amber-50 text-amber-950",
  },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? {
    label: status,
    color: "border border-border bg-surface-muted text-muted",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.color}`}>
      {s.label}
    </span>
  );
}

export default function KnowledgeBaseDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState({ msg: "", type: "success" as "success" | "error" | "info", show: false });

  const [cleaning, setCleaning] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<number | null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<DocumentItem | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<number[]>([]);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);

  const [query, setQuery] = useState("");
  /** 检索条数；留空则按默认 */
  const [topKInput, setTopKInput] = useState("");
  const [retrieving, setRetrieving] = useState(false);
  const [retrievalResults, setRetrievalResults] = useState<RetrievalResult[]>([]);
  const [retrievalError, setRetrievalError] = useState("");

  const showToast = useCallback((msg: string, type: "success" | "error" | "info" = "error") => {
    setToast({ msg, type, show: true });
  }, []);

  const handleDeleteDocument = useCallback(async () => {
    if (!confirmDeleteDoc || !kb) return;
    const doc = confirmDeleteDoc;
    setDeletingDoc(doc.id);
    try {
      await knowledgeBaseApi.deleteDocument(kb.id, doc.id);
      setKb((prev) =>
        prev
          ? { ...prev, documents: prev.documents.filter((d) => d.id !== doc.id) }
          : null,
      );
      showToast("文档已删除", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "删除失败", "error");
    } finally {
      setDeletingDoc(null);
      setConfirmDeleteDoc(null);
    }
  }, [confirmDeleteDoc, kb, showToast]);

  useEffect(() => {
    if (!kb) return;
    const valid = new Set(kb.documents.map((d) => d.id));
    setSelectedDocIds((prev) => prev.filter((id) => valid.has(id)));
  }, [kb]);

  const handleBatchDeleteDocuments = useCallback(async () => {
    if (!kb || selectedDocIds.length === 0) return;
    setBatchDeleting(true);
    try {
      const res = await knowledgeBaseApi.batchDeleteDocuments(kb.id, selectedDocIds);
      const removed = new Set(res.deleted);
      setKb((prev) =>
        prev
          ? {
              ...prev,
              documents: prev.documents.filter((d) => !removed.has(d.id)),
            }
          : null,
      );
      setSelectedDocIds([]);
      setConfirmBatchDelete(false);
      if (res.failed.length > 0) {
        showToast(
          `已删除 ${res.deleted.length} 个，${res.failed.length} 个未删除或失败`,
          "info",
        );
      } else {
        showToast(`已删除 ${res.deleted.length} 个文档`, "success");
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "批量删除失败", "error");
    } finally {
      setBatchDeleting(false);
    }
  }, [kb, selectedDocIds, showToast]);

  const fetchKb = useCallback(async () => {
    try {
      setError("");
      const data = await knowledgeBaseApi.get(Number(id));
      setKb(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "获取详情失败");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchKb();
  }, [fetchKb]);

  const pendingUploadTaskIds = useMemo(
    () => kb?.pending_upload_tasks?.map((t) => t.task_id) ?? [],
    [kb?.pending_upload_tasks],
  );

  const {
    uploading,
    uploadResults,
    dragOver,
    setDragOver,
    fileInputRef,
    processing,
    pollingTaskIds,
    chunkSizeInput,
    setChunkSizeInput,
    chunkOverlapInput,
    setChunkOverlapInput,
    previewing,
    previewData,
    previewError,
    showPreview,
    setShowPreview,
    expandedChunks,
    onFileChange,
    onDrop,
    handlePreview,
    handleProcess,
    toggleChunkExpand,
  } = useDocumentPipeline(Number(id), {
    fetchKb,
    showToast,
    pendingUploadTaskIds,
  });

  const handleCleanup = async () => {
    setCleaning(true);
    try {
      const data = await knowledgeBaseApi.cleanup();
      showToast(data.message || "清理完成", "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "清理失败", "error");
    } finally {
      setCleaning(false);
    }
  };

  const handleRetrieval = async () => {
    if (!query.trim()) return;
    setRetrieving(true);
    setRetrievalError("");
    setRetrievalResults([]);
    try {
      const data = await knowledgeBaseApi.testRetrieval({
        query: query.trim(),
        kb_id: Number(id),
        top_k: parseTopK(topKInput),
      });
      setRetrievalResults(data.results);
    } catch (err) {
      setRetrievalError(err instanceof ApiError ? err.message : "检索失败");
    } finally {
      setRetrieving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-gray-400">加载中...</div>
      </div>
    );
  }

  if (error || !kb) {
    return (
      <div className="max-w-3xl mx-auto">
        <Link
          href={PATH.knowledgeBase}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors inline-flex items-center gap-1 mb-4"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          返回列表
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error || "知识库不存在"}
        </div>
      </div>
    );
  }

  const pendingUploads = uploadResults.filter((r) => !r.skip_processing);
  const isPolling =
    pollingTaskIds.length > 0 || (kb.pending_upload_tasks?.length ?? 0) > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link
        href={PATH.knowledgeBase}
        className="text-sm text-gray-500 hover:text-gray-700 transition-colors inline-flex items-center gap-1"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        返回列表
      </Link>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4 gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-800 truncate">{kb.name}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {kb.description || "暂无描述"}
            </p>
            {kb.parent_child_chunking ? (
              <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1 inline-block">
                已启用父子分块入库（新文档子块入向量；对话需勾选「父子块展开」）
              </p>
            ) : null}
          </div>
          <Link
            href={PATH.knowledgeBaseEdit(kb.id)}
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 border border-blue-200 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
          >
            <EditIcon className="w-4 h-4" />
            编辑
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm border-t border-gray-100 pt-4">
          <div>
            <span className="text-gray-500">文档数</span>
            <p className="text-gray-800 mt-0.5 font-medium">{kb.documents.length}</p>
          </div>
          <div>
            <span className="text-gray-500">创建时间</span>
            <p className="text-gray-800 mt-0.5">
              {new Date(kb.created_at).toLocaleString("zh-CN")}
            </p>
          </div>
          <div>
            <span className="text-gray-500">更新时间</span>
            <p className="text-gray-800 mt-0.5">
              {new Date(kb.updated_at).toLocaleString("zh-CN")}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">上传文档</h2>
          <button
            onClick={handleCleanup}
            disabled={cleaning}
            className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 hover:bg-gray-50 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            title="清理过期的临时上传文件（超过 24 小时）"
          >
            <TrashIcon className="w-3.5 h-3.5" />
            {cleaning ? "清理中..." : "清理临时文件"}
          </button>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragOver
              ? "border-blue-400 bg-blue-50"
              : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
          }`}
        >
          <UploadIcon className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          {uploading ? (
            <p className="text-sm text-blue-600 font-medium">上传中...</p>
          ) : (
            <>
              <p className="text-sm text-gray-600 font-medium">
                拖拽文件到此处，或点击选择文件
              </p>
              <p className="text-xs text-gray-400 mt-1">
                支持 PDF、TXT、Markdown、DOCX 等格式
              </p>
              <p className="text-xs text-gray-500 mt-3 max-w-lg mx-auto leading-relaxed">
                去重规则：仅当与当前知识库中已有文档{" "}
                <span className="text-gray-700 font-medium">文件名相同且内容完全一致</span>
                时才会跳过上传；若仅同名但内容有变化，将覆盖原文档并增量更新向量。
              </p>
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onFileChange}
            accept=".pdf,.txt,.md,.docx,.doc,.csv,.json"
          />
        </div>

        {uploadResults.length > 0 && (
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-medium text-gray-700">上传结果</h3>
            {uploadResults.map((r, i) => (
              <div
                key={r.upload_id ?? r.document_id ?? `upload-${i}`}
                className="flex items-start justify-between gap-3 px-3 py-2.5 bg-gray-50 rounded-lg text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <FileIcon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                    <span className="text-gray-800 font-medium truncate">{r.file_name}</span>
                  </div>
                  {r.status === "exists" && (
                    <p className="text-xs text-gray-500 mt-1 pl-6 leading-relaxed">
                      与库内已有文档相比，文件名与内容均完全一致，故跳过重复上传与处理。
                    </p>
                  )}
                  {r.status === "pending_replace" && (
                    <p className="text-xs text-amber-900/80 mt-1 pl-6 leading-relaxed">
                      文件名与库内文档相同但内容已变化；点击「处理」后将覆盖原文档并增量更新向量。
                    </p>
                  )}
                  {r.status === "pending" && (
                    <p className="text-xs text-gray-500 mt-1 pl-6 leading-relaxed">
                      新文件，提交处理后将写入知识库。
                    </p>
                  )}
                </div>
                <div className="flex-shrink-0 pt-0.5">
                  <StatusBadge status={r.status} />
                </div>
              </div>
            ))}

            {pendingUploads.length > 0 && (
              <>
                <div className="mt-3 p-3 bg-gray-50 rounded-xl space-y-3">
                  <div>
                    <h4 className="text-xs font-medium text-gray-600 tracking-wide">
                      分块参数（仅影响预览）
                    </h4>
                    <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">
                      不填则采用系统默认：块大小 {DEFAULT_CHUNK_SIZE} 字符、重叠{" "}
                      {DEFAULT_CHUNK_OVERLAP} 字符（与向量化处理默认一致）。实际入库处理由服务端配置决定。
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">
                        每块最大字符数
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={chunkSizeInput}
                        onChange={(e) =>
                          setChunkSizeInput(e.target.value.replace(/\D/g, ""))
                        }
                        placeholder={`默认 ${DEFAULT_CHUNK_SIZE}`}
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">
                        块之间重叠字符数
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={chunkOverlapInput}
                        onChange={(e) =>
                          setChunkOverlapInput(e.target.value.replace(/\D/g, ""))
                        }
                        placeholder={`默认 ${DEFAULT_CHUNK_OVERLAP}`}
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handlePreview}
                    disabled={previewing || isPolling}
                    className="flex-1 bg-white text-blue-600 border border-blue-300 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {previewing ? "预览中..." : "预览分块"}
                  </button>
                  <button
                    onClick={handleProcess}
                    disabled={processing || isPolling}
                    className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  >
                    {processing
                      ? "提交处理中..."
                      : `处理 ${pendingUploads.length} 个文档`}
                  </button>
                </div>

                {previewError && (
                  <div className="mt-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                    {previewError}
                  </div>
                )}

                {showPreview && Object.keys(previewData).length > 0 && (
                  <div className="mt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-700">分块预览</h4>
                      <button
                        onClick={() => setShowPreview(false)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        收起
                      </button>
                    </div>
                    {Object.entries(previewData).map(([docId, preview]) => {
                      const uploadResult = uploadResults.find(
                        (r) =>
                          r.upload_id === Number(docId) ||
                          r.document_id === Number(docId),
                      );
                      const fileName =
                        uploadResult?.file_name || `文档 #${docId}`;
                      return (
                        <div
                          key={docId}
                          className="border border-gray-200 rounded-xl overflow-hidden"
                        >
                          <div className="px-3 py-2 bg-gray-50 flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">
                              {fileName}
                            </span>
                            <span className="text-xs text-gray-500">
                              共 {preview.total_chunks} 个分块
                            </span>
                          </div>
                          <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 scrollbar-thin">
                            {preview.chunks.map((chunk, idx) => {
                              const chunkKey = `${docId}-${idx}`;
                              const isExpanded = expandedChunks.has(chunkKey);
                              return (
                                <div
                                  key={chunkKey}
                                  className="px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                                  onClick={() => toggleChunkExpand(chunkKey)}
                                >
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-mono text-gray-400">
                                      #{idx + 1}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-gray-400">
                                        {chunk.content.length} 字符
                                      </span>
                                      <span className="text-xs text-blue-500">
                                        {isExpanded ? "收起" : "展开"}
                                      </span>
                                    </div>
                                  </div>
                                  <p
                                    className={`text-xs text-gray-600 whitespace-pre-wrap ${
                                      isExpanded ? "" : "line-clamp-3"
                                    }`}
                                  >
                                    {chunk.content}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {isPolling && (
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-sm text-blue-800">
            <div
              className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin flex-shrink-0"
              aria-hidden
            />
            <span>
              正在处理文档，各文件状态与错误信息请查看下方「文档列表」。
            </span>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-800">
            文档列表
            <span className="text-sm font-normal text-gray-500 ml-2">
              ({kb.documents.length} 个文档)
            </span>
          </h2>
          {kb.documents.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setSelectedDocIds(kb.documents.map((d) => d.id))
                }
                className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
              >
                全选
              </button>
              <button
                type="button"
                onClick={() => setSelectedDocIds([])}
                disabled={selectedDocIds.length === 0}
                className="text-xs text-gray-600 hover:text-gray-800 px-2 py-1 rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40"
              >
                取消选择
              </button>
              <button
                type="button"
                onClick={() => setConfirmBatchDelete(true)}
                disabled={selectedDocIds.length === 0}
                className="text-xs text-red-600 hover:text-red-700 px-2 py-1 rounded border border-red-200 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                批量删除 ({selectedDocIds.length})
              </button>
            </div>
          )}
        </div>

        {kb.documents.length === 0 &&
        !(kb.pending_upload_tasks && kb.pending_upload_tasks.length > 0) ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            暂无文档，请先上传文件
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {(kb.pending_upload_tasks ?? []).map((t) => (
              <div
                key={`pending-${t.task_id}`}
                className="py-3 flex items-center justify-between gap-4 -mx-2 px-2 rounded-lg bg-amber-50/50 border border-amber-100/80"
              >
                <div className="flex-1 flex items-center gap-3 min-w-0">
                  <FileIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {t.file_name}
                    </p>
                    <p className="text-xs text-amber-700/90">
                      正在入库与向量化…
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={t.status} />
                  <span className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                </div>
              </div>
            ))}
            {kb.documents.map((doc: DocumentItem) => {
              const displayTask = getDisplayProcessingTask(doc);
              const busy = isDocumentProcessing(doc);
              const rowMain = (
                <>
                  <FileIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">
                      {doc.file_name}
                    </p>
                    <p className="text-xs text-gray-400">
                      {formatFileSize(doc.file_size)} &middot;{" "}
                      {new Date(doc.created_at).toLocaleString("zh-CN")}
                    </p>
                  </div>
                </>
              );
              return (
                <div
                  key={doc.id}
                  className={`py-3 flex items-center justify-between gap-4 -mx-2 px-2 rounded-lg transition-colors ${
                    busy
                      ? "bg-amber-50/50 border border-amber-100/80"
                      : "hover:bg-gray-50 group"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                    checked={selectedDocIds.includes(doc.id)}
                    onChange={() =>
                      setSelectedDocIds((prev) =>
                        prev.includes(doc.id)
                          ? prev.filter((x) => x !== doc.id)
                          : [...prev, doc.id],
                      )
                    }
                    aria-label={`选择 ${doc.file_name}`}
                  />
                  {busy ? (
                    <div
                      className="flex-1 flex items-center gap-3 min-w-0 cursor-not-allowed"
                      title="处理完成后可查看详情"
                    >
                      {rowMain}
                    </div>
                  ) : (
                    <Link
                      href={PATH.documentDetail(kb.id, doc.id)}
                      className="flex-1 flex items-center gap-3 min-w-0"
                    >
                      {rowMain}
                    </Link>
                  )}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {displayTask && <StatusBadge status={displayTask.status} />}
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded hidden sm:inline-block">
                      {doc.content_type}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setConfirmDeleteDoc(doc);
                      }}
                      disabled={deletingDoc === doc.id}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="删除文档"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                    {busy ? (
                      <span
                        className="p-1 text-amber-500/80"
                        title="处理中"
                        aria-hidden
                      >
                        <ChevronRightIcon className="w-4 h-4 opacity-40" />
                      </span>
                    ) : (
                      <Link
                        href={PATH.documentDetail(kb.id, doc.id)}
                        className="p-1 text-gray-300 hover:text-gray-500"
                      >
                        <ChevronRightIcon className="w-4 h-4" />
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {kb.documents.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            检索测试
          </h2>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRetrieval()}
              placeholder="输入要向量检索的问题或关键词…"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-gray-500 whitespace-nowrap">
                返回条数
              </label>
              <div className="flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={topKInput}
                onChange={(e) =>
                  setTopKInput(e.target.value.replace(/\D/g, ""))
                }
                placeholder={`默认 ${DEFAULT_TOP_K}`}
                title={`留空则使用 ${DEFAULT_TOP_K} 条`}
                className="w-[5.5rem] border border-gray-300 rounded-lg px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={handleRetrieval}
                disabled={retrieving || !query.trim()}
                className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex-shrink-0"
              >
                {retrieving ? "检索中..." : "检索"}
              </button>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mt-2">
            返回条数留空则取前 {DEFAULT_TOP_K} 条最相关片段（与评估/对话检索默认习惯一致，可填 1–50）。
          </p>

          {retrievalError && (
            <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {retrievalError}
            </div>
          )}

          {retrievalResults.length > 0 && (
            <div className="mt-4 space-y-3">
              {retrievalResults.map((r, i) => (
                <div
                  key={`retrieval-${i}-${r.score}`}
                  className="border border-gray-200 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-500">
                      #{i + 1}
                    </span>
                    <span className="text-xs text-blue-600 font-mono">
                      score: {r.score.toFixed(4)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {r.content}
                  </p>
                  {r.metadata && Object.keys(r.metadata).length > 0 && (
                    <div className="mt-2 pt-2 border-t border-gray-100">
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(r.metadata).map(([k, v]) => (
                          <span
                            key={k}
                            className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded"
                          >
                            {k}: {String(v)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteDoc}
        title="删除文档"
        description={`确定要删除文档「${confirmDeleteDoc?.file_name}」吗？此操作不可恢复，向量索引和文件将被清除。`}
        confirmText="删除"
        variant="danger"
        loading={deletingDoc !== null}
        onConfirm={handleDeleteDocument}
        onCancel={() => setConfirmDeleteDoc(null)}
      />

      <ConfirmDialog
        open={confirmBatchDelete}
        title="批量删除文档"
        description={`确定删除已选中的 ${selectedDocIds.length} 个文档吗？此操作不可恢复，向量索引与文件将被清除。`}
        confirmText="删除"
        variant="danger"
        loading={batchDeleting}
        onConfirm={handleBatchDeleteDocuments}
        onCancel={() => setConfirmBatchDelete(false)}
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
