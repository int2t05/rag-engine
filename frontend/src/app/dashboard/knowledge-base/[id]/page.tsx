"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

/* ---------- types ---------- */

interface ProcessingTask {
  id: number;
  status: string;
  error_message: string | null;
  document_id: number | null;
  knowledge_base_id: number;
  created_at: string;
  updated_at: string;
}

interface DocumentItem {
  id: number;
  file_name: string;
  file_path: string;
  file_hash: string;
  file_size: number;
  content_type: string;
  knowledge_base_id: number;
  created_at: string;
  updated_at: string;
  processing_tasks: ProcessingTask[];
}

interface KnowledgeBase {
  id: number;
  name: string;
  description: string | null;
  user_id: number;
  created_at: string;
  updated_at: string;
  documents: DocumentItem[];
}

interface UploadResult {
  upload_id?: number;
  document_id?: number;
  file_name: string;
  temp_path?: string;
  status: string;
  message?: string;
  skip_processing: boolean;
}

interface TaskStatus {
  document_id: number | null;
  status: string;
  error_message: string | null;
  upload_id: number;
  file_name: string;
}

interface RetrievalResult {
  content: string;
  metadata: Record<string, any>;
  score: number;
}

/* ---------- helpers ---------- */

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

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

/* ---------- main page ---------- */

export default function KnowledgeBaseDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [kb, setKb] = useState<KnowledgeBase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // upload
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // processing
  const [processing, setProcessing] = useState(false);
  const [taskMap, setTaskMap] = useState<Record<number, TaskStatus>>({});
  const [pollingTaskIds, setPollingTaskIds] = useState<number[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // retrieval test
  const [query, setQuery] = useState("");
  const [topK, setTopK] = useState(5);
  const [retrieving, setRetrieving] = useState(false);
  const [retrievalResults, setRetrievalResults] = useState<RetrievalResult[]>([]);
  const [retrievalError, setRetrievalError] = useState("");

  /* ---------- fetch kb ---------- */
  const fetchKb = useCallback(async () => {
    try {
      setError("");
      const data = await api.get(`/api/knowledge-base/${id}`);
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

  /* ---------- upload ---------- */
  const handleUpload = async (files: FileList | File[]) => {
    if (!files.length) return;
    setUploading(true);
    try {
      const formData = new FormData();
      Array.from(files).forEach((f) => formData.append("files", f));

      const results: UploadResult[] = await api.post(
        `/api/knowledge-base/${id}/documents/upload`,
        formData,
      );
      setUploadResults(results);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "上传失败");
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

  /* ---------- process ---------- */
  const handleProcess = async () => {
    const toProcess = uploadResults.filter((r) => !r.skip_processing);
    if (!toProcess.length) return;

    setProcessing(true);
    try {
      const res = await api.post(
        `/api/knowledge-base/${id}/documents/process`,
        uploadResults,
      );
      const tasks: { upload_id: number; task_id: number }[] = res.tasks;
      if (tasks.length > 0) {
        const ids = tasks.map((t) => t.task_id);
        setPollingTaskIds(ids);
      } else {
        await fetchKb();
        setUploadResults([]);
      }
    } catch (err) {
      alert(err instanceof ApiError ? err.message : "处理失败");
    } finally {
      setProcessing(false);
    }
  };

  /* ---------- poll tasks ---------- */
  useEffect(() => {
    if (pollingTaskIds.length === 0) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    const poll = async () => {
      try {
        const idsStr = pollingTaskIds.join(",");
        const data: Record<string, TaskStatus> = await api.get(
          `/api/knowledge-base/${id}/documents/tasks?task_ids=${idsStr}`,
        );
        const mapped: Record<number, TaskStatus> = {};
        for (const [k, v] of Object.entries(data)) {
          mapped[Number(k)] = v;
        }
        setTaskMap(mapped);

        const allDone = Object.values(mapped).every(
          (t) => t.status === "completed" || t.status === "failed",
        );
        if (allDone) {
          setPollingTaskIds([]);
          setUploadResults([]);
          await fetchKb();
        }
      } catch {
        // ignore polling errors
      }
    };

    poll();
    pollingRef.current = setInterval(poll, 3000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [pollingTaskIds, id, fetchKb]);

  /* ---------- retrieval test ---------- */
  const handleRetrieval = async () => {
    if (!query.trim()) return;
    setRetrieving(true);
    setRetrievalError("");
    setRetrievalResults([]);
    try {
      const data = await api.post("/api/knowledge-base/test-retrieval", {
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

  /* ---------- render ---------- */
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
      {/* Back */}
      <Link
        href="/dashboard/knowledge-base"
        className="text-sm text-gray-500 hover:text-gray-700 transition-colors inline-flex items-center gap-1"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        返回列表
      </Link>

      {/* KB Info */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{kb.name}</h1>
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

      {/* Document Upload */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">上传文档</h2>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
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

        {/* Upload Results */}
        {uploadResults.length > 0 && (
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-medium text-gray-700">上传结果</h3>
            {uploadResults.map((r, i) => (
              <div
                key={i}
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
              <button
                onClick={handleProcess}
                disabled={processing || isPolling}
                className="mt-2 w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {processing
                  ? "提交处理中..."
                  : `处理 ${pendingUploads.length} 个文档`}
              </button>
            )}
          </div>
        )}

        {/* Polling status */}
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

      {/* Documents List */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
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
            {kb.documents.map((doc) => {
              const lastTask = doc.processing_tasks[doc.processing_tasks.length - 1];
              return (
                <div
                  key={doc.id}
                  className="py-3 flex items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
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
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {lastTask && <StatusBadge status={lastTask.status} />}
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">
                      {doc.content_type}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Retrieval Test */}
      {kb.documents.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            检索测试
          </h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRetrieval()}
              placeholder="输入查询语句..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
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

          {retrievalError && (
            <div className="mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {retrievalError}
            </div>
          )}

          {retrievalResults.length > 0 && (
            <div className="mt-4 space-y-3">
              {retrievalResults.map((r, i) => (
                <div
                  key={i}
                  className="border border-gray-200 rounded-lg p-4"
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
    </div>
  );
}

/* ---------- icons ---------- */

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
    </svg>
  );
}
