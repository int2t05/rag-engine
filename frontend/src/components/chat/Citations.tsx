/**
 * @fileoverview 引用来源展示组件
 * @description 展示 RAG 对话中的参考文档片段
 */

import { Citation } from "@/lib/api";

interface CitationsProps {
  /** 引用列表 */
  citations: Citation[];
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
        {citations.map((citation) => (
          <div
            key={citation.index}
            className="text-xs bg-gray-50 rounded p-2 border border-gray-100"
          >
            <div className="flex items-start gap-2">
              <span className="inline-flex items-center justify-center w-4 h-4 bg-blue-100 text-blue-600 rounded text-[10px] font-medium flex-shrink-0">
                {citation.index}
              </span>
              <span className="text-gray-600 line-clamp-2">
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
                <div className="text-gray-400 mt-1 text-[10px] truncate" title={String(src)}>
                  来源: {String(src)}
                </div>
              ) : null;
            })()}
          </div>
        ))}
      </div>
    </div>
  );
}
