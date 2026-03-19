/**
 * @fileoverview 聊天组件模块导出
 * @description 统一导出聊天相关的 React 组件和类型
 */

import type { ChatMessage } from "@/lib/api";

// 组件
export { ChatList } from "./ChatList";
export { Citations } from "./Citations";
export { MessageBubble } from "./MessageBubble";
export { LoadingDots } from "./LoadingDots";
export { NewChatModal } from "./NewChatModal";

// 类型定义（集中放置以避免模块解析问题）
export interface KbOption {
  id: number;
  name: string;
}

export interface EnrichedMessage extends ChatMessage {
  citations?: Array<{ index: number; page_content: string; metadata: Record<string, unknown> }>;
  _clientId?: string;
}
