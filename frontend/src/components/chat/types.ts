/**
 * @fileoverview 对话消息扩展类型（与 useChatSession、MessageBubble 共用）
 */

import type { ChatMessage } from "@/lib/api";

export interface RagPipelineStep {
  id: string;
  label: string;
  done?: boolean;
}

export interface EnrichedMessage extends ChatMessage {
  citations?: Array<{
    index: number;
    page_content: string;
    metadata: Record<string, unknown>;
  }>;
  _clientId?: string;
  /** 流式生成过程中展示的 RAG 步骤，落库前会丢弃 */
  ragPipeline?: RagPipelineStep[];
}
