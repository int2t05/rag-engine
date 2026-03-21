/**
 * @fileoverview 文档详情页面
 * @description 展示单个文档的详细信息和处理任务记录
 */

"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { knowledgeBaseApi, DocumentItem, ApiError } from "@/lib/api";
import {
  DEFAULT_CHUNK_OVERLAP,
  DEFAULT_CHUNK_SIZE,
  parseReplaceChunkOverlap,
  parseReplaceChunkSize,
} from "@/lib/form-defaults";
import { PATH } from "@/lib/routes";
import {
  formatFileSize,
  getDisplayProcessingTask,
  getLatestProcessingTask,
  isDocumentProcessing,
} from "@/lib/utils";
import { ArrowLeftIcon, FileIcon, TrashIcon } from "@/components/icons";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Toast } from "@/components/Toast";

/** 状态映射表 */
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "等待处理", color: "text-yellow-600 bg-yellow-50" },
  processing: { label: "处理中", color: "text-blue-600 bg-blue-50" },
  completed: { label: "已完成", color: "text-green-600 bg-green-50" },
  failed: { label: "失败", color: "text-red-600 bg-red-50" },
};

/**
 * 状态标签组件
 */
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

/**
 * 信息项组件
 */
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

/**
 * 详情行组件
 */
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

// ==================== 主组件 ====================

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const kbId = params.id as string;
  const docId = params.docId as string;

  // ==================== 状态定义 ====================

  const [doc, setDoc] = useState<DocumentItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replaceChunkSizeInput, setReplaceChunkSizeInput] = useState("");
  const [replaceChunkOverlapInput, setReplaceChunkOverlapInput] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState({
    msg: "",
    type: "success" as "success" | "error" | "info",
    show: false,
  });

  const showToastMsg = useCallback(
    (msg: string, type: "success" | "error" | "info" = "error") => {
      setToast({ msg, type, show: true });
    },
    [],
  );

  // ==================== 数据获取 ====================

  const fetchDocument = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent;
    try {
      if (!silent) setError("");
      const data = await knowledgeBaseApi.getDocument(Number(kbId), Number(docId));
      setDoc(data);
    } catch (err) {
      if (!silent) {
        setError(err instanceof ApiError ? err.message : "获取文档详情失败");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [kbId, docId]);

  useEffect(() => {
    fetchDocument();
  }, [fetchDocument]);

  /** 直接打开详情 URL 时若仍在处理，轮询直至完成或失败 */
  useEffect(() => {
    if (!doc || !isDocumentProcessing(doc)) return;
    const t = setInterval(() => {
      fetchDocument({ silent: true });
    }, 3000);
    return () => clearInterval(t);
  }, [doc, fetchDocument]);

  const handleReplaceFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !doc) return;

      const incoming = file.name.replace(/^.*[/\\]/, "");
      if (incoming !== doc.file_name) {
        showToastMsg(
          `文件名须与当前文档一致（当前：${doc.file_name}，所选：${incoming}）`,
          "error",
        );
        return;
      }

      const chunkSize = parseReplaceChunkSize(replaceChunkSizeInput);
      const chunkOverlap = parseReplaceChunkOverlap(
        replaceChunkOverlapInput,
        chunkSize,
      );

      setReplacing(true);
      try {
        await knowledgeBaseApi.replaceDocument(
          Number(kbId),
          Number(docId),
          file,
          { chunk_size: chunkSize, chunk_overlap: chunkOverlap },
        );
        showToastMsg("文档已更新并重新向量化", "success");
        await fetchDocument({ silent: true });
      } catch (err) {
        showToastMsg(
          err instanceof ApiError ? err.message : "替换失败",
          "error",
        );
      } finally {
        setReplacing(false);
      }
    },
    [
      doc,
      kbId,
      docId,
      fetchDocument,
      showToastMsg,
      replaceChunkSizeInput,
      replaceChunkOverlapInput,
    ],
  );

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await knowledgeBaseApi.deleteDocument(Number(kbId), Number(docId));
      showToastMsg("文档已删除", "success");
      setTimeout(() => router.replace(PATH.knowledgeBaseDetail(kbId)), 400);
    } catch (err) {
      showToastMsg(err instanceof ApiError ? err.message : "删除失败", "error");
      setDeleting(false);
    }
  }, [kbId, docId, router, showToastMsg]);

  // ==================== 渲染 ====================

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
          href={PATH.knowledgeBaseDetail(kbId)}
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

  const lastTask = getLatestProcessingTask(doc);
  const displayTask = getDisplayProcessingTask(doc);

  if (isDocumentProcessing(doc)) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Link
          href={PATH.knowledgeBaseDetail(kbId)}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors inline-flex items-center gap-1"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          返回知识库
        </Link>

        <div className="bg-white rounded-lg border border-amber-200 p-8 text-center shadow-sm">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 mb-4">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          </div>
          <h1 className="text-lg font-semibold text-gray-800">文档处理中</h1>
          <p className="text-sm text-gray-600 mt-2 truncate max-w-md mx-auto">
            {doc.file_name}
          </p>
          <div className="mt-4 flex justify-center">
            {lastTask ? <StatusBadge status={lastTask.status} /> : null}
          </div>
          <p className="text-sm text-gray-500 mt-4 leading-relaxed">
            处理完成后将自动显示完整详情；您也可返回知识库稍后查看。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* ========== 返回链接 ========== */}
      <Link
        href={PATH.knowledgeBaseDetail(kbId)}
        className="text-sm text-gray-500 hover:text-gray-700 transition-colors inline-flex items-center gap-1"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        返回知识库
      </Link>

      {/* ========== 文档信息 ========== */}
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
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
            {displayTask && <StatusBadge status={displayTask.status} />}
            <input
              ref={replaceInputRef}
              type="file"
              className="sr-only"
              aria-hidden
              onChange={handleReplaceFileChange}
            />
            <button
              type="button"
              onClick={() => replaceInputRef.current?.click()}
              disabled={replacing || deleting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors disabled:opacity-50"
            >
              <FileIcon className="w-4 h-4" />
              {replacing ? "更新中..." : "替换文件"}
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting || replacing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition-colors disabled:opacity-50"
            >
              <TrashIcon className="w-4 h-4" />
              {deleting ? "删除中..." : "删除"}
            </button>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-5 mt-5">
          <h3 className="text-sm font-medium text-gray-800 mb-1">
            替换文件时的分块参数
          </h3>
          <p className="text-xs text-gray-500 mb-3 leading-relaxed">
            点击「替换文件」并选择同名文件时生效。留空则使用默认：每块{" "}
            {DEFAULT_CHUNK_SIZE} 字符、重叠 {DEFAULT_CHUNK_OVERLAP} 字符。
          </p>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                每块最大字符数
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={replaceChunkSizeInput}
                onChange={(e) =>
                  setReplaceChunkSizeInput(e.target.value.replace(/\D/g, ""))
                }
                placeholder={`默认 ${DEFAULT_CHUNK_SIZE}`}
                disabled={replacing || deleting}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                块之间重叠字符数
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={replaceChunkOverlapInput}
                onChange={(e) =>
                  setReplaceChunkOverlapInput(e.target.value.replace(/\D/g, ""))
                }
                placeholder={`默认 ${DEFAULT_CHUNK_OVERLAP}`}
                disabled={replacing || deleting}
                className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 border-t border-gray-100 pt-5 mt-5">
          <InfoItem label="文件大小" value={formatFileSize(doc.file_size)} />
          <InfoItem label="文件类型" value={doc.content_type} />
          <InfoItem
            label="分块个数"
            value={doc.chunk_count != null ? String(doc.chunk_count) : "-"}
          />
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

      {/* ========== 文件详情 ========== */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">文件信息</h2>
        <div className="space-y-3">
          <DetailRow label="文件路径" value={doc.file_path} mono />
          <DetailRow label="文件哈希 (SHA-256)" value={doc.file_hash} mono />
          <DetailRow label="所属知识库 ID" value={String(doc.knowledge_base_id)} />
        </div>
      </div>

      {/* ========== 处理任务记录 ========== */}
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

      <ConfirmDialog
        open={showDeleteConfirm}
        title="删除文档"
        description={`确定要删除文档「${doc.file_name}」吗？此操作不可恢复，向量索引和文件将被清除。`}
        confirmText="删除"
        variant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
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
