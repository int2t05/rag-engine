"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  llmConfigApi,
  AiRuntimeSettings,
  LlmEmbeddingConfigItem,
  ApiError,
} from "@/lib/api";
import {
  defaultAiRuntimeSettings,
  importModelConfigFromJson,
  MODEL_CONFIG_JSON_EXAMPLE,
} from "@/lib/model-config-import";
import { Toast } from "@/components/Toast";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PlusIcon, TrashIcon, EditIcon } from "@/components/icons";

export default function ModelConfigPage() {
  const [items, setItems] = useState<LlmEmbeddingConfigItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<LlmEmbeddingConfigItem | "new" | null>(null);
  const [formName, setFormName] = useState("");
  const [formConfig, setFormConfig] = useState<AiRuntimeSettings>(() =>
    defaultAiRuntimeSettings(),
  );
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({
    msg: "",
    type: "success" as "success" | "error" | "info",
    visible: false,
  });
  const [confirmDel, setConfirmDel] = useState<LlmEmbeddingConfigItem | null>(null);
  const jsonFileRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type, visible: true });
  }, []);

  const load = useCallback(async () => {
    try {
      setError("");
      const res = await llmConfigApi.list();
      setItems(res.items);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const startNew = () => {
    setEditing("new");
    setFormName("新配置");
    setFormConfig(defaultAiRuntimeSettings());
  };

  const startEdit = (row: LlmEmbeddingConfigItem) => {
    setEditing(row);
    setFormName(row.name);
    setFormConfig({ ...row.config });
  };

  const save = async () => {
    if (!formName.trim()) {
      showToast("请填写配置名称", "error");
      return;
    }
    setSaving(true);
    try {
      if (editing === "new") {
        await llmConfigApi.create({ name: formName.trim(), config: formConfig });
        showToast("已创建并设为当前启用");
      } else if (editing) {
        const updated = await llmConfigApi.update(editing.id, {
          name: formName.trim(),
          config: formConfig,
        });
        setItems((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
        showToast("已保存");
      }
      setEditing(null);
      await load();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "保存失败", "error");
    } finally {
      setSaving(false);
    }
  };

  const activate = async (id: number) => {
    try {
      await llmConfigApi.activate(id);
      showToast("已切换当前配置");
      await load();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "切换失败", "error");
    }
  };

  const pickJsonFile = () => jsonFileRef.current?.click();

  const onJsonFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const { name, config } = importModelConfigFromJson(text);
      setFormConfig(config);
      if (name) setFormName(name);
      showToast("已从 JSON 填入配置", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "导入失败", "error");
    }
  };

  const downloadExampleJson = () => {
    const blob = new Blob([MODEL_CONFIG_JSON_EXAMPLE], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "model-config.example.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyExampleJson = async () => {
    try {
      await navigator.clipboard.writeText(MODEL_CONFIG_JSON_EXAMPLE);
      showToast("已复制示例到剪贴板", "success");
    } catch {
      showToast("复制失败", "error");
    }
  };

  const remove = async () => {
    if (!confirmDel) return;
    try {
      await llmConfigApi.delete(confirmDel.id);
      setItems((prev) => prev.filter((x) => x.id !== confirmDel.id));
      setConfirmDel(null);
      if (editing !== "new" && editing && editing.id === confirmDel.id) setEditing(null);
      showToast("已删除");
      await load();
    } catch (e) {
      showToast(e instanceof ApiError ? e.message : "删除失败", "error");
    }
  };

  const field = (
    label: string,
    key: keyof AiRuntimeSettings,
    password = false,
  ) => (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      <input
        type={password ? "password" : "text"}
        className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink"
        value={String(formConfig[key] ?? "")}
        onChange={(e) =>
          setFormConfig((c) => ({ ...c, [key]: e.target.value }))
        }
      />
    </label>
  );

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">
        加载中…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-xl font-semibold text-ink">模型配置</h1>
        <p className="mt-1 text-sm text-muted">
          LLM 与嵌入 API 保存在服务端数据库，不再从本地 .env 读取。对话、入库与评估均使用下方「当前启用」的配置。
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={startNew}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          <PlusIcon className="h-4 w-4" />
          新建配置
        </button>
      </div>

      <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
        {items.length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-muted">暂无配置，请先新建</li>
        )}
        {items.map((row) => (
          <li
            key={row.id}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <span className="font-medium text-ink">{row.name}</span>
              {row.is_active && (
                <span className="ml-2 rounded bg-accent-muted px-2 py-0.5 text-xs text-accent">
                  当前启用
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {!row.is_active && (
                <button
                  type="button"
                  onClick={() => activate(row.id)}
                  className="rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-muted"
                >
                  设为启用
                </button>
              )}
              <button
                type="button"
                onClick={() => startEdit(row)}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs hover:bg-surface-muted"
              >
                <EditIcon className="h-3.5 w-3.5" />
                编辑
              </button>
              <button
                type="button"
                onClick={() => setConfirmDel(row)}
                className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
              >
                <TrashIcon className="h-3.5 w-3.5" />
                删除
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing !== null && (
        <div className="rounded-lg border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-4 font-medium text-ink">
            {editing === "new" ? "新建配置" : "编辑配置"}
          </h2>

          <div className="mb-4 space-y-2 rounded-lg border border-dashed border-border bg-surface-muted/40 p-3">
            <p className="text-xs leading-relaxed text-muted">
              支持一键导入 JSON：推荐结构为{" "}
              <code className="rounded bg-surface px-1 py-0.5 font-mono text-[11px] text-ink">
                {`{ "name": "...", "config": { ... } }`}
              </code>
              ；也可只写 <code className="font-mono text-[11px]">config</code>{" "}
              内字段，缺省项会与默认值合并。
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                ref={jsonFileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={onJsonFileChange}
              />
              <button
                type="button"
                onClick={pickJsonFile}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-muted"
              >
                从 JSON 导入
              </button>
              <button
                type="button"
                onClick={downloadExampleJson}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-muted"
              >
                下载示例 JSON
              </button>
              <button
                type="button"
                onClick={() => void copyExampleJson()}
                className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-muted"
              >
                复制示例
              </button>
            </div>
            <details className="group text-xs">
              <summary className="cursor-pointer select-none text-muted hover:text-ink">
                展开查看示例 JSON 全文
              </summary>
              <pre className="mt-2 max-h-56 overflow-auto rounded-md border border-border bg-surface p-2 font-mono text-[11px] leading-relaxed text-ink">
                {MODEL_CONFIG_JSON_EXAMPLE}
              </pre>
            </details>
          </div>

          <div className="space-y-3">
            <label className="block text-sm">
              <span className="text-muted">配置名称</span>
              <input
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="text-muted">对话 provider</span>
                <select
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  value={formConfig.chat_provider}
                  onChange={(e) =>
                    setFormConfig((c) => ({ ...c, chat_provider: e.target.value }))
                  }
                >
                  <option value="openai">openai</option>
                  <option value="ollama">ollama</option>
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-muted">嵌入 provider</span>
                <select
                  className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                  value={formConfig.embeddings_provider}
                  onChange={(e) =>
                    setFormConfig((c) => ({ ...c, embeddings_provider: e.target.value }))
                  }
                >
                  <option value="openai">openai</option>
                  <option value="ollama">ollama</option>
                </select>
              </label>
            </div>

            <p className="text-xs font-medium text-ink">OpenAI 兼容</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {field("API Base", "openai_api_base")}
              {field("API Key", "openai_api_key", true)}
              {field("对话模型", "openai_model")}
              {field("嵌入模型", "openai_embeddings_model")}
              {field("嵌入专用 Base（可空）", "openai_embeddings_api_base")}
              {field("嵌入专用 Key（可空）", "openai_embeddings_api_key", true)}
            </div>

            <p className="text-xs font-medium text-ink">Ollama</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {field("Ollama Base", "ollama_api_base")}
              {field("对话模型", "ollama_model")}
              {field("嵌入专用 Base（可空）", "ollama_embeddings_api_base")}
              {field("嵌入模型", "ollama_embeddings_model")}
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={save}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "保存中…" : "保存"}
              </button>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast
        message={toast.msg}
        type={toast.type}
        visible={toast.visible}
        onClose={() => setToast((t) => ({ ...t, visible: false }))}
      />

      <ConfirmDialog
        open={!!confirmDel}
        title="删除配置"
        description={`确定删除「${confirmDel?.name}」？此操作不可恢复。`}
        confirmText="删除"
        variant="danger"
        onConfirm={remove}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
