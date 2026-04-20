/**
 * @fileoverview 聊天组件模块导出
 * @description 统一导出聊天相关的 React 组件和类型
 */

export type { EnrichedMessage, RagPipelineStep } from "./types";

// 组件
export { ChatList } from "./ChatList";
export { Citations } from "./Citations";
export { MessageBubble } from "./MessageBubble";
export { LoadingDots } from "./LoadingDots";
export { RagProgressPanel } from "./RagProgressPanel";
export { RagPipelineDialog, filterRagPipelineStepsByOptions } from "./RagPipelineDialog";
export { NewChatModal } from "./NewChatModal";
export { RagOptionsBar } from "./RagOptionsBar";

// 类型定义（集中放置以避免模块解析问题）
export interface KbOption {
  id: number;
  name: string;
}

