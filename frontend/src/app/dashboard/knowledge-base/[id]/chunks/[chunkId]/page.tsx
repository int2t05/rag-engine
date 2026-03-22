/**
 * @fileoverview 分块引用详情（从对话「参考来源」跳转）
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { knowledgeBaseApi, ApiError, type ChunkDetail } from "@/lib/api";
import { PATH } from "@/lib/routes";

export default function ChunkDetailPage() {
  const searchParams = useSearchParams();
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

  const chatParam = searchParams.get("chat");
  const returnChatHref =
    chatParam && /^\d+$/.test(chatParam)
      ? `${PATH.chat}?chat=${encodeURIComponent(chatParam)}`
      : null;

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
      {returnChatHref ? (
        <div className="mb-4">
          <Link
            href={returnChatHref}
            className="inline-block text-sm font-medium text-accent hover:underline"
          >
            ← 返回对话
          </Link>
        </div>
      ) : null}
      <h1 className="mb-2 text-lg font-semibold text-ink">引用片段详情</h1>
      {loading && <p className="text-sm text-muted">加载中…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && data && (
        <div className="mt-4 space-y-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div className="text-xs text-muted">
            <div>知识库 ID: {data.kb_id}</div>
            <div className="mt-1 truncate font-mono text-[11px]" title={data.id}>
              分块 ID: {data.id}
            </div>
            <div className="mt-1">文档 ID: {data.document_id}</div>
            <div className="mt-1 truncate" title={data.file_name}>
              文件: {data.file_name}
            </div>
            {data.document_file_path && (
              <div className="mt-1 truncate text-muted" title={data.document_file_path}>
                存储路径: {data.document_file_path}
              </div>
            )}
          </div>
          <div>
            <div className="mb-1 text-xs font-medium text-muted">片段全文</div>
            <pre className="max-h-[min(70vh,32rem)] overflow-auto whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-sm text-ink">
              {pageContent || "（无正文）"}
            </pre>
          </div>
          {data.document_id ? (
            <Link
              href={PATH.documentDetail(data.kb_id, data.document_id)}
              className="inline-block text-sm text-accent hover:underline"
            >
              查看所属文档 →
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
