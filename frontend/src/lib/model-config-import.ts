/**
 * 模型配置 JSON 导入（与后端 AiRuntimeSettings 对齐）
 */

import type { AiRuntimeSettings } from "@/lib/api/types";

/** 可导入的字段（与表单一致） */
export const AI_RUNTIME_SETTING_KEYS: (keyof AiRuntimeSettings)[] = [
  "embeddings_provider",
  "chat_provider",
  "openai_api_base",
  "openai_api_key",
  "openai_model",
  "openai_embeddings_model",
  "openai_embeddings_api_base",
  "openai_embeddings_api_key",
  "ollama_api_base",
  "ollama_embeddings_api_base",
  "ollama_model",
  "ollama_embeddings_model",
];

export function defaultAiRuntimeSettings(): AiRuntimeSettings {
  return {
    embeddings_provider: "openai",
    chat_provider: "openai",
    openai_api_base: "https://api.openai.com/v1",
    openai_api_key: "",
    openai_model: "gpt-4",
    openai_embeddings_model: "text-embedding-ada-002",
    openai_embeddings_api_base: "",
    openai_embeddings_api_key: "",
    ollama_api_base: "http://localhost:11434",
    ollama_embeddings_api_base: "",
    ollama_model: "deepseek-r1:7b",
    ollama_embeddings_model: "nomic-embed-text",
  };
}

/**
 * 供界面展示与下载的示例 JSON（可直接保存为 .json 后修改再导入）
 */
export const MODEL_CONFIG_JSON_EXAMPLE = `{
  "name": "我的 OpenAI 配置",
  "config": {
    "embeddings_provider": "openai",
    "chat_provider": "openai",
    "openai_api_base": "https://api.openai.com/v1",
    "openai_api_key": "sk-...",
    "openai_model": "gpt-4o-mini",
    "openai_embeddings_model": "text-embedding-3-small",
    "openai_embeddings_api_base": "",
    "openai_embeddings_api_key": "",
    "ollama_api_base": "http://localhost:11434",
    "ollama_embeddings_api_base": "",
    "ollama_model": "deepseek-r1:7b",
    "ollama_embeddings_model": "nomic-embed-text"
  }
}`;

function mergeRuntimeConfig(partial: Record<string, unknown>): AiRuntimeSettings {
  const base = defaultAiRuntimeSettings();
  const out = base as unknown as Record<string, string>;
  for (const key of AI_RUNTIME_SETTING_KEYS) {
    if (
      key in partial &&
      partial[key] !== undefined &&
      partial[key] !== null
    ) {
      const v = partial[key];
      out[key] = typeof v === "string" ? v : String(v);
    }
  }
  return base;
}

/**
 * 解析用户选择的 JSON 文件内容。
 * 支持两种根结构：
 * - `{ "name": "...", "config": { ...字段 } }`（推荐）
 * - 或直接为 `config` 对象（仅更新表单字段，不填名称）
 */
export function importModelConfigFromJson(text: string): {
  name?: string;
  config: AiRuntimeSettings;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("文件内容不是合法的 JSON");
  }
  if (parsed === null || typeof parsed !== "object") {
    throw new Error("JSON 根节点须为对象");
  }
  const root = parsed as Record<string, unknown>;

  let name: string | undefined;
  if (typeof root.name === "string" && root.name.trim()) {
    name = root.name.trim();
  }

  let configSource: Record<string, unknown>;
  if (root.config && typeof root.config === "object" && root.config !== null) {
    configSource = root.config as Record<string, unknown>;
  } else {
    configSource = root;
  }

  const config = mergeRuntimeConfig(configSource);

  const prov = (k: string) => k === "openai" || k === "ollama";
  if (!prov(config.chat_provider)) {
    throw new Error(`chat_provider 须为 openai 或 ollama，当前：${config.chat_provider}`);
  }
  if (!prov(config.embeddings_provider)) {
    throw new Error(
      `embeddings_provider 须为 openai 或 ollama，当前：${config.embeddings_provider}`,
    );
  }

  return { name, config };
}
