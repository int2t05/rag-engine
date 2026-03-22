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
}

function chunkDetailHref(meta: Record<string, unknown>): string | null {
  const kb = meta.kb_id;
  const cid = meta.chunk_id;
  if (typeof kb !== "number" && typeof kb !== "string") return null;
  const kbNum = typeof kb === "number" ? kb : parseInt(String(kb), 10);
  if (!Number.isFinite(kbNum)) return null;
  if (cid === undefined || cid === null || cid === "") return null;
  return PATH.chunkDetail(kbNum, String(cid));
}

/**
 * 引用来源组件
 * @description 展示检索到的参考文档片段
 */
export function Citations({ citations }: CitationsProps) {
  if (!citations || citations.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 pt-3 border-t border-gray-200">
      <div className="text-xs text-gray-500 mb-2 font-medium">参考来源</div>
      <div className="space-y-2">
        {citations.map((citation) => {
          const href = chunkDetailHref(citation.metadata);
          return (
            <div
              key={citation.index}
              className="text-xs rounded border border-gray-100 bg-gray-50 p-2"
            >
              <div className="flex items-start gap-2">
                <span className="inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-blue-100 text-[10px] font-medium text-blue-600">
                  {citation.index}
                </span>
                <span className="line-clamp-2 text-gray-600">
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
                  <div className="mt-1 truncate text-[10px] text-gray-400" title={String(src)}>
                    来源: {String(src)}
                  </div>
                ) : null;
              })()}
              {href ? (
                <div className="mt-1.5">
                  <Link
                    href={href}
                    className="text-[10px] font-medium text-blue-600 hover:underline"
                    target="_blank"
                    rel="noopener noreferrer"
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
