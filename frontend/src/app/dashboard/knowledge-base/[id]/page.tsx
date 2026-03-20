/**
 * @fileoverview 知识库详情页面
 * @description 展示知识库详情，包含文档上传、预览、处理、检索测试等功能
 */

"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  knowledgeBaseApi,
  ApiError,
  KnowledgeBase,
  DocumentItem,
  UploadResult,
  TaskStatus,
  PreviewResult,
  RetrievalResult,
} from "@/lib/api";
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
import { formatFileSize } from "@/lib/utils";

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "等待处理", color: "text-yellow-600 bg-yellow-50" },
  processing: { label: "处理中", color: "text-blue-600 bg-blue-50" },
  completed: { label: "已完成", color: "text-green-600 bg-green-50" },
  failed: { label: "失败", color: "text-red-600 bg-red-50" },
  exists: { label: "已存在", color: "text-gray-600 bg-gray-100" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, color: "text-gray-600 bg-gray-100" };
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

  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [processing, setProcessing] = useState(false);
  const [taskMap, setTaskMap] = useState<Record<number, TaskStatus>>({});
  const [pollingTaskIds, setPollingTaskIds] = useState<number[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [chunkSize, setChunkSize] = useState(1000);
  const [chunkOverlap, setChunkOverlap] = useState(200);
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<Record<number, PreviewResult>>({});
  const [previewError, setPreviewError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());

  const [cleaning, setCleaning] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<number | null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<DocumentItem | null>(null);

  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(5);
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

  const handleUpload = async (files: FileList | File[]) => {
    if (!files.length) return;
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append("files", f));
      const results: UploadResult[] = await knowledgeBaseApi.uploadDocuments(Number(id), formData);
      setUploadResults(results);
      showToast(`已上传 ${results.length} 个文件`, "success");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "上传失败", "error");
    } finally {
      setUploading(false);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleUpload(e.target.files);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) handleUpload(e.dataTransfer.files);
  };

  const handlePreview = async () => {
    const docIds = uploadResults
      .filter((r) => !r.skip_processing)
      .map((r) => r.upload_id)
      .filter((uid): uid is number => uid !== undefined);

    if (!docIds.length) return;

    setPreviewing(true);
    setPreviewError("");
    setPreviewData({});
    try {
      const data = await knowledgeBaseApi.previewDocuments(Number(id), {
        document_ids: docIds,
        chunk_size: chunkSize,
        chunk_overlap: chunkOverlap,
      });
      setPreviewData(data);
      setShowPreview(true);
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.message : "预览失败");
    } finally {
      setPreviewing(false);
    }
  };

  const handleProcess = async () => {
    const toProcess = uploadResults.filter((r) => !r.skip_processing);
    if (!toProcess.length) return;

    setProcessing(true);
    try {
      const res = await knowledgeBaseApi.processDocuments(Number(id), uploadResults);
      const tasks: { upload_id: number; task_id: number }[] = res.tasks;
      if (tasks.length > 0) {
        setPollingTaskIds(tasks.map((t) => t.task_id));
      } else {
        await fetchKb();
        setUploadResults([]);
      }
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "处理失败", "error");
    } finally {
      setProcessing(false);
    }
  };

  useEffect(() => {
    if (pollingTaskIds.length === 0) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    const poll = async () => {
      try {
        const data = await knowledgeBaseApi.getProcessingTasks(Number(id), pollingTaskIds);
        const mapped: Record<number, TaskStatus> = {};
        for (const [k, v] of Object.entries(data)) {
          mapped[Number(k)] = v as TaskStatus;
        }
        setTaskMap(mapped);

        const allDone = Object.values(mapped).every(
          (t) => t.status === "completed" || t.status === "failed",
        );
        if (allDone) {
          setPollingTaskIds([]);
          setUploadResults([]);
          await fetchKb();
          showToast("文档处理完成", "success");
        }
      } catch {
        // ignore
      }
    };

    poll();
    pollingRef.current = setInterval(poll, 3000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [pollingTaskIds, id, fetchKb, showToast]);

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
        top_k: topK,
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
          href="/dashboard/knowledge-base"
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
  const isPolling = pollingTaskIds.length > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link
        href="/dashboard/knowledge-base"
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
          </div>
          <Link
            href={`/dashboard/knowledge-base/${kb.id}/edit`}
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
                className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-gray-700 truncate">{r.file_name}</span>
                </div>
                <StatusBadge status={r.status} />
              </div>
            ))}

            {pendingUploads.length > 0 && (
              <>
                <div className="mt-3 p-3 bg-gray-50 rounded-xl space-y-3">
                  <h4 className="text-xs font-medium text-gray-600 uppercase tracking-wide">
                    分块参数
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        块大小 (chunk_size)
                      </label>
                      <input
                        type="number"
                        value={chunkSize}
                        onChange={(e) => setChunkSize(Number(e.target.value))}
                        min={100}
                        max={10000}
                        step={100}
                        className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">
                        重叠大小 (chunk_overlap)
                      </label>
                      <input
                        type="number"
                        value={chunkOverlap}
                        onChange={(e) => setChunkOverlap(Number(e.target.value))}
                        min={0}
                        max={chunkSize}
                        step={50}
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
                        (r) => r.upload_id === Number(docId),
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
                                  onClick={() => {
                                    setExpandedChunks((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(chunkKey)) next.delete(chunkKey);
                                      else next.add(chunkKey);
                                      return next;
                                    });
                                  }}
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
          <div className="mt-4 space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <h3 className="text-sm font-medium text-blue-700">
                正在处理文档...
              </h3>
            </div>
            {Object.entries(taskMap).map(([taskId, task]) => (
              <div
                key={taskId}
                className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <FileIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-gray-700 truncate">
                    {task.file_name || `任务 #${taskId}`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={task.status} />
                  {task.error_message && (
                    <span className="text-xs text-red-500 max-w-[200px] truncate">
                      {task.error_message}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          文档列表
          <span className="text-sm font-normal text-gray-500 ml-2">
            ({kb.documents.length} 个文档)
          </span>
        </h2>

        {kb.documents.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            暂无文档，请先上传文件
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {kb.documents.map((doc: DocumentItem) => {
              const lastTask =
                doc.processing_tasks[doc.processing_tasks.length - 1];
              return (
                <div
                  key={doc.id}
                  className="py-3 flex items-center justify-between gap-4 hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors group"
                >
                  <Link
                    href={`/dashboard/knowledge-base/${kb.id}/documents/${doc.id}`}
                    className="flex-1 flex items-center gap-3 min-w-0"
                  >
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
                  </Link>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {lastTask && <StatusBadge status={lastTask.status} />}
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
                    <Link
                      href={`/dashboard/knowledge-base/${kb.id}/documents/${doc.id}`}
                      className="p-1 text-gray-300 hover:text-gray-500"
                    >
                      <ChevronRightIcon className="w-4 h-4" />
                    </Link>
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
              placeholder="输入查询语句..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="flex gap-2">
              <select
                value={topK}
                onChange={(e) => setTopK(Number(e.target.value))}
                className="border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {[3, 5, 10, 15, 20].map((n) => (
                  <option key={n} value={n}>
                    Top {n}
                  </option>
                ))}
              </select>
              <button
                onClick={handleRetrieval}
                disabled={retrieving || !query.trim()}
                className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex-shrink-0"
              >
                {retrieving ? "检索中..." : "检索"}
              </button>
            </div>
          </div>

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

      <Toast
        message={toast.msg}
        type={toast.type}
        visible={toast.show}
        onClose={() => setToast((p) => ({ ...p, show: false }))}
      />
    </div>
  );
}
