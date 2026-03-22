/**
 * @fileoverview 知识库文档：上传 → 预览 → 提交处理 → 轮询任务状态
 * @description 对应接口：
 * - POST /api/knowledge-base/{kbId}/documents/upload
 * - POST /api/knowledge-base/{kbId}/documents/preview
 * - POST /api/knowledge-base/{kbId}/documents/process
 * - GET  /api/knowledge-base/{kbId}/documents/tasks?task_ids=
 * 已入库文档同名替换在文档详情页调用 knowledgeBaseApi.replaceDocument（含分块 Query），不在本 hook 内。
 * 轮询间隔 3s，全部 completed/failed 后清空 uploadResults 并 toast。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  knowledgeBaseApi,
  ApiError,
  type DocumentIngestChunkParams,
  type PreviewResult,
  type TaskStatus,
  type UploadResult,
} from "@/lib/api";
import {
  parseChunkOverlap,
  parseChunkSize,
  parseParentChunkSizeForIngest,
  parseParentChunkOverlapForIngest,
  parseChildChunkSizeForIngest,
  parseChildChunkOverlapForIngest,
} from "@/lib/form-defaults";

export function useDocumentPipeline(
  kbId: number,
  options: {
    /** 刷新知识库详情（轮询与处理完成后调用） */
    fetchKb: () => Promise<void>;
    showToast: (msg: string, type?: "success" | "error" | "info") => void;
    /** 详情接口返回的队列任务 id，进入页面后自动轮询 */
    pendingUploadTaskIds: number[];
    /** 知识库启用父子分块入库时，分别填写父块/子块大小与重叠 */
    parentChildChunking?: boolean;
  },
) {
  const {
    fetchKb,
    showToast,
    pendingUploadTaskIds,
    parentChildChunking = false,
  } = options;

  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [processing, setProcessing] = useState(false);
  const [pollingTaskIds, setPollingTaskIds] = useState<number[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [chunkSizeInput, setChunkSizeInput] = useState("");
  const [chunkOverlapInput, setChunkOverlapInput] = useState("");
  const [parentChunkSizeInput, setParentChunkSizeInput] = useState("");
  const [parentChunkOverlapInput, setParentChunkOverlapInput] = useState("");
  const [childChunkSizeInput, setChildChunkSizeInput] = useState("");
  const [childChunkOverlapInput, setChildChunkOverlapInput] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [previewData, setPreviewData] = useState<Record<number, PreviewResult>>({});
  const [previewError, setPreviewError] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!pendingUploadTaskIds.length) return;
    setPollingTaskIds((prev) => {
      const next = [...prev];
      for (const tid of pendingUploadTaskIds) {
        if (!next.includes(tid)) next.push(tid);
      }
      return next;
    });
  }, [pendingUploadTaskIds]);

  const handleUpload = useCallback(
    async (files: FileList | File[]) => {
      if (!files.length) return;
      setUploading(true);
      try {
        const formData = new FormData();
        Array.from(files).forEach((f) => formData.append("files", f));
        const results = await knowledgeBaseApi.uploadDocuments(kbId, formData);
        setUploadResults(results);
        const skipped = results.filter((r) => r.skip_processing).length;
        const todo = results.filter((r) => !r.skip_processing).length;
        let msg = `已收到 ${results.length} 个文件`;
        if (skipped && todo) {
          msg += `：${todo} 个待处理，${skipped} 个与库内已有文档内容完全相同已跳过`;
        } else if (skipped) {
          msg += `：均为与库内已有文档内容完全相同，已跳过重复处理`;
        } else if (todo) {
          msg += `，请预览或提交处理`;
        }
        showToast(msg, "success");
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : "上传失败", "error");
      } finally {
        setUploading(false);
      }
    },
    [kbId, showToast],
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) handleUpload(e.target.files);
      e.target.value = "";
    },
    [handleUpload],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files) handleUpload(e.dataTransfer.files);
    },
    [handleUpload],
  );

  const getIngestChunkParams = useCallback((): DocumentIngestChunkParams => {
    const cs = parseChunkSize(chunkSizeInput);
    const co = parseChunkOverlap(chunkOverlapInput, cs);
    if (!parentChildChunking) {
      return { chunk_size: cs, chunk_overlap: co };
    }
    const ps = parseParentChunkSizeForIngest(parentChunkSizeInput);
    const po = parseParentChunkOverlapForIngest(parentChunkOverlapInput, ps);
    const csz = parseChildChunkSizeForIngest(childChunkSizeInput);
    const coz = parseChildChunkOverlapForIngest(childChunkOverlapInput, csz);
    return {
      chunk_size: cs,
      chunk_overlap: co,
      parent_chunk_size: ps,
      parent_chunk_overlap: po,
      child_chunk_size: csz,
      child_chunk_overlap: coz,
    };
  }, [
    parentChildChunking,
    chunkSizeInput,
    chunkOverlapInput,
    parentChunkSizeInput,
    parentChunkOverlapInput,
    childChunkSizeInput,
    childChunkOverlapInput,
  ]);

  const handlePreview = useCallback(async () => {
    const docIds = uploadResults
      .filter((r) => !r.skip_processing)
      .map((r) => r.upload_id ?? r.document_id)
      .filter((id): id is number => id !== undefined);

    if (!docIds.length) return;

    setPreviewing(true);
    setPreviewError("");
    setPreviewData({});
    const chunk = getIngestChunkParams();
    try {
      const data = await knowledgeBaseApi.previewDocuments(kbId, {
        document_ids: docIds,
        ...chunk,
      });
      setPreviewData(data);
      setShowPreview(true);
    } catch (err) {
      setPreviewError(err instanceof ApiError ? err.message : "预览失败");
    } finally {
      setPreviewing(false);
    }
  }, [kbId, uploadResults, getIngestChunkParams]);

  const handleProcess = useCallback(async () => {
    const toProcess = uploadResults.filter((r) => !r.skip_processing);
    if (!toProcess.length) return;

    setProcessing(true);
    try {
      const chunk = getIngestChunkParams();
      const res = await knowledgeBaseApi.processDocuments(kbId, {
        upload_results: uploadResults,
        ...chunk,
      });
      const tasks = res.tasks;
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
  }, [kbId, uploadResults, fetchKb, showToast, getIngestChunkParams]);

  useEffect(() => {
    if (pollingTaskIds.length === 0) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }

    const poll = async () => {
      try {
        const data = await knowledgeBaseApi.getProcessingTasks(kbId, pollingTaskIds);
        const mapped: Record<number, TaskStatus> = {};
        for (const [k, v] of Object.entries(data)) {
          mapped[Number(k)] = v as TaskStatus;
        }

        await fetchKb();

        const statuses = pollingTaskIds.map((tid) => mapped[tid]);
        const allDone =
          statuses.length === pollingTaskIds.length &&
          statuses.every((t) => t && (t.status === "completed" || t.status === "failed"));
        if (allDone) {
          setPollingTaskIds([]);
          setUploadResults([]);
          showToast("文档处理完成", "success");
        }
      } catch {
        /* 单次轮询失败忽略 */
      }
    };

    void poll();
    pollingRef.current = setInterval(() => void poll(), 3000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [pollingTaskIds, kbId, fetchKb, showToast]);

  const toggleChunkExpand = useCallback((key: string) => {
    setExpandedChunks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return {
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
    parentChunkSizeInput,
    setParentChunkSizeInput,
    parentChunkOverlapInput,
    setParentChunkOverlapInput,
    childChunkSizeInput,
    setChildChunkSizeInput,
    childChunkOverlapInput,
    setChildChunkOverlapInput,
    previewing,
    previewData,
    previewError,
    showPreview,
    setShowPreview,
    expandedChunks,
    handleUpload,
    onFileChange,
    onDrop,
    handlePreview,
    handleProcess,
    toggleChunkExpand,
    setUploadResults,
  };
}
