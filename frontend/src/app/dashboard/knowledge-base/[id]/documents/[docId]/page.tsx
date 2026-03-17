"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api, ApiError } from "@/lib/api";

interface ProcessingTask {
  id: number;
  status: string;
  error_message: string | null;
  document_id: number;
  knowledge_base_id: number;
  created_at: string;
  updated_at: string;
}

interface DocumentDetail {
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
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? {
    label: status,
    color: "text-gray-600 bg-gray-100",
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${s.color}`}
    >
      {s.label}
    </span>
  );
}

export default function DocumentDetailPage() {
  const params = useParams();
  const kbId = params.id as string;
  const docId = params.docId as string;

  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchDocument = useCallback(async () => {
    try {
      setError("");
      const data = await api.get(
        `/api/knowledge-base/${kbId}/documents/${docId}`,
      );
      setDoc(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "获取文档详情失败");
    } finally {
      setLoading(false);
    }
  }, [kbId, docId]);

  useEffect(() => {
    fetchDocument();
  }, [fetchDocument]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-pulse text-gray-400">加载中...</div>
      </div>
    );
  }

  if (error || !doc) {
    return (
      <div className="max-w-3xl mx-auto">
        <Link
          href={`/dashboard/knowledge-base/${kbId}`}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors inline-flex items-center gap-1 mb-4"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          返回知识库
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error || "文档不存在"}
        </div>
      </div>
    );
  }

  const lastTask = doc.processing_tasks[doc.processing_tasks.length - 1];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link
        href={`/dashboard/knowledge-base/${kbId}`}
        className="text-sm text-gray-500 hover:text-gray-700 transition-colors inline-flex items-center gap-1"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        返回知识库
      </Link>

      {/* Document Info */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <FileIcon className="w-6 h-6 text-blue-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-800 truncate">
              {doc.file_name}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              文档 ID: {doc.id}
            </p>
          </div>
          {lastTask && <StatusBadge status={lastTask.status} />}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-gray-100 pt-5">
          <InfoItem label="文件大小" value={formatFileSize(doc.file_size)} />
          <InfoItem label="文件类型" value={doc.content_type} />
          <InfoItem
            label="创建时间"
            value={new Date(doc.created_at).toLocaleString("zh-CN")}
          />
          <InfoItem
            label="更新时间"
            value={new Date(doc.updated_at).toLocaleString("zh-CN")}
          />
        </div>
      </div>

      {/* File Details */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">文件信息</h2>
        <div className="space-y-3">
          <DetailRow label="文件路径" value={doc.file_path} mono />
          <DetailRow label="文件哈希 (SHA-256)" value={doc.file_hash} mono />
          <DetailRow label="所属知识库 ID" value={String(doc.knowledge_base_id)} />
        </div>
      </div>

      {/* Processing Tasks */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          处理任务记录
          <span className="text-sm font-normal text-gray-500 ml-2">
            ({doc.processing_tasks.length} 条)
          </span>
        </h2>

        {doc.processing_tasks.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            暂无处理任务记录
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2.5 px-3 text-gray-500 font-medium">
                    任务 ID
                  </th>
                  <th className="text-left py-2.5 px-3 text-gray-500 font-medium">
                    状态
                  </th>
                  <th className="text-left py-2.5 px-3 text-gray-500 font-medium">
                    错误信息
                  </th>
                  <th className="text-left py-2.5 px-3 text-gray-500 font-medium">
                    创建时间
                  </th>
                  <th className="text-left py-2.5 px-3 text-gray-500 font-medium">
                    更新时间
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {doc.processing_tasks.map((task) => (
                  <tr key={task.id} className="hover:bg-gray-50">
                    <td className="py-2.5 px-3 text-gray-800 font-mono">
                      #{task.id}
                    </td>
                    <td className="py-2.5 px-3">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="py-2.5 px-3 text-gray-600 max-w-xs truncate">
                      {task.error_message || "-"}
                    </td>
                    <td className="py-2.5 px-3 text-gray-500">
                      {new Date(task.created_at).toLocaleString("zh-CN")}
                    </td>
                    <td className="py-2.5 px-3 text-gray-500">
                      {new Date(task.updated_at).toLocaleString("zh-CN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-gray-500">{label}</span>
      <p className="text-sm text-gray-800 mt-0.5 font-medium truncate">
        {value}
      </p>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="text-sm text-gray-500 w-36 flex-shrink-0">{label}</span>
      <span
        className={`text-sm text-gray-800 break-all ${mono ? "font-mono text-xs leading-5" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
      />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
      />
    </svg>
  );
}
