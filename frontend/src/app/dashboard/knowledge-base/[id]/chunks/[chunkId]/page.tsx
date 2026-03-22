/**
 * 分块引用详情（对话「参考来源」跳转）
 */

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { knowledgeBaseApi, ApiError, type ChunkDetail } from "@/lib/api";
import { PATH } from "@/lib/routes";

export default function ChunkDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const kbId = Number(Array.isArray(params.id) ? params.id[0] : params.id);
  const chunkId = decodeURIComponent(
    String(Array.isArray(params.chunkId) ? params.chunkId[0] : params.chunkId),
  );

  const [data, setData] = useState<ChunkDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const chat = searchParams.get("chat");
  const backHref =
    chat && /^\d+$/.test(chat)
      ? `${PATH.chat}?chat=${encodeURIComponent(chat)}`
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
      setData(await knowledgeBaseApi.getChunk(kbId, chunkId));
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

  const meta = data?.chunk_metadata;
  const childText =
    meta && typeof meta.page_content === "string" ? meta.page_content : "";
  const parentText = data?.parent_page_content?.trim() ?? "";
  const isChild = Boolean(data?.parent_chunk_id);
  /** 无 chat 参数视为非对话入口，可展示父块；从对话来须 ?pc=1（仅父子展开成功时引用链接会带） */
  const showParentSection =
    Boolean(parentText) &&
    (!chat || searchParams.get("pc") === "1");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {backHref ? (
        <Link
          href={backHref}
          className="mb-4 inline-block text-sm font-medium text-accent hover:underline"
        >
          ← 返回对话
        </Link>
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
            {data.document_file_path ? (
              <div
                className="mt-1 truncate text-muted"
                title={data.document_file_path}
              >
                存储路径: {data.document_file_path}
              </div>
            ) : null}
            {showParentSection && data.parent_chunk_id ? (
              <div
                className="mt-1 truncate font-mono text-[11px]"
                title={data.parent_chunk_id}
              >
                父块 ID: {data.parent_chunk_id}
              </div>
            ) : null}
          </div>
          {showParentSection ? (
            <div>
              <div className="mb-1 text-xs font-medium text-muted">父块全文</div>
              <pre className="max-h-[min(70vh,32rem)] overflow-auto whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-sm text-ink">
                {parentText}
              </pre>
            </div>
          ) : null}
          <div>
            <div className="mb-1 text-xs font-medium text-muted">
              {isChild ? "子块片段" : "片段全文"}
            </div>
            <pre className="max-h-[min(70vh,32rem)] overflow-auto whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-sm text-ink">
              {childText || "（无正文）"}
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
