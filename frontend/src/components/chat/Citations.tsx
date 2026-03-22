/**
 * @fileoverview 引用来源展示组件
 * @description 展示 RAG 对话中的参考文档片段；可跳转分块详情页
 */

import Link from "next/link";
import { Citation } from "@/lib/api";
import { PATH } from "@/lib/routes";

interface CitationsProps {
  /** 引用列表 */
  citations: Citation[];
  /** 传入时，引用详情链接带 ?chat=，便于返回对话 */
  chatId?: number;
}

function chunkDetailHref(meta: Record<string, unknown>, chatId?: number): string | null {
  const kb = meta.kb_id;
  const cid = meta.chunk_id;
  if (typeof kb !== "number" && typeof kb !== "string") return null;
  const kbNum = typeof kb === "number" ? kb : parseInt(String(kb), 10);
  if (!Number.isFinite(kbNum)) return null;
  if (cid === undefined || cid === null || cid === "") return null;
  const base = PATH.chunkDetail(kbNum, String(cid));
  const q: string[] = [];
  if (chatId != null && Number.isFinite(chatId)) {
    q.push(`chat=${chatId}`);
  }
  // 仅当该条引用在对话里已做父子展开时带 pc=1，分块详情页才展示父块
  if (meta.expanded_from_child === true) {
    q.push("pc=1");
  }
  return q.length ? `${base}?${q.join("&")}` : base;
}

/**
 * 引用来源组件
 * @description 展示检索到的参考文档片段
 */
export function Citations({ citations, chatId }: CitationsProps) {
  if (!citations || citations.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="mb-2 text-xs font-medium text-muted">参考来源</div>
      <div className="space-y-2">
        {citations.map((citation) => {
          const href = chunkDetailHref(citation.metadata, chatId);
          return (
            <div
              key={citation.index}
              className="text-xs rounded border border-border bg-surface-muted p-2"
            >
              <div className="flex items-start gap-2">
                <span className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-accent-muted text-[10px] font-medium text-accent">
                  {citation.index}
                </span>
                <span className="line-clamp-2 text-muted">
                  {citation.page_content.substring(0, 150)}
                  {citation.page_content.length > 150 ? "..." : ""}
                </span>
              </div>
              {(() => {
                const src =
                  citation.metadata?.source ??
                  citation.metadata?.file_name ??
                  citation.metadata?.filename;
                return src ? (
                  <div className="mt-1 truncate text-[10px] text-muted/80" title={String(src)}>
                    来源: {String(src)}
                  </div>
                ) : null;
              })()}
              {href ? (
                <div className="mt-1.5">
                  <Link
                    href={href}
                    className="text-[10px] font-medium text-accent hover:underline"
                  >
                    查看引用详情
                  </Link>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
