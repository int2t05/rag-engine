/**
 * @fileoverview 分块引用详情（从对话「参考来源」跳转）
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { knowledgeBaseApi, ApiError, type ChunkDetail } from "@/lib/api";
import { PATH } from "@/lib/routes";

export default function ChunkDetailPage() {
  const params = useParams();
  const kbIdRaw = params.id;
  const chunkIdRaw = params.chunkId;
  const kbId =
    typeof kbIdRaw === "string"
      ? parseInt(kbIdRaw, 10)
      : Array.isArray(kbIdRaw)
        ? parseInt(kbIdRaw[0], 10)
        : NaN;
  const chunkId =
    typeof chunkIdRaw === "string"
      ? decodeURIComponent(chunkIdRaw)
      : Array.isArray(chunkIdRaw)
        ? decodeURIComponent(chunkIdRaw[0])
        : "";

  const [data, setData] = useState<ChunkDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!Number.isFinite(kbId) || kbId < 1 || !chunkId) {
      setError("无效的链接");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const row = await knowledgeBaseApi.getChunk(kbId, chunkId);
      setData(row);
    } catch (e) {
      setData(null);
      setError(e instanceof ApiError ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [kbId, chunkId]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageContent =
    data?.chunk_metadata && typeof data.chunk_metadata.page_content === "string"
      ? data.chunk_metadata.page_content
      : "";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {Number.isFinite(kbId) && kbId >= 1 ? (
        <Link
          href={PATH.knowledgeBaseDetail(kbId)}
          className="mb-4 inline-block text-sm text-blue-600 hover:underline"
        >
          ← 返回知识库
        </Link>
      ) : null}
      <h1 className="mb-2 text-lg font-semibold text-gray-900">引用片段详情</h1>
      {loading && <p className="text-sm text-gray-500">加载中…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && data && (
        <div className="mt-4 space-y-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">
            <div>知识库 ID: {data.kb_id}</div>
            <div className="mt-1 truncate font-mono text-[11px]" title={data.id}>
              分块 ID: {data.id}
            </div>
            <div className="mt-1">文档 ID: {data.document_id}</div>
            <div className="mt-1 truncate" title={data.file_name}>
              文件: {data.file_name}
            </div>
            {data.document_file_path && (
              <div className="mt-1 truncate text-gray-400" title={data.document_file_path}>
                存储路径: {data.document_file_path}
              </div>
            )}
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-gray-500">片段全文</div>
            <pre className="max-h-[min(70vh,32rem)] overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm text-gray-800">
              {pageContent || "（无正文）"}
            </pre>
          </div>
          {data.document_id ? (
            <Link
              href={PATH.documentDetail(data.kb_id, data.document_id)}
              className="inline-block text-sm text-blue-600 hover:underline"
            >
              查看所属文档 →
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
