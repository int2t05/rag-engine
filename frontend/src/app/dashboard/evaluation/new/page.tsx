/**
 * @fileoverview 新建 RAG 评估任务页面
 * @description 创建评估任务，配置知识库、测试用例等
 */

"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  evaluationApi,
  knowledgeBaseApi,
  llmConfigApi,
  ApiError,
  KnowledgeBase,
  EvaluationTestCaseCreate,
  EvaluationTypeInfo,
  type EvaluationJudgeConfig,
} from "@/lib/api";
import { PATH } from "@/lib/routes";
import {
  parseEvaluationQaJson,
  EVALUATION_QA_JSON_EXAMPLE,
} from "@/lib/evaluation-import";
import {
  DEFAULT_ALLOWED_METRICS,
  METRICS_BY_EVAL_TYPE,
  METRIC_LABELS,
} from "@/lib/evaluation-metrics";
import { DEFAULT_TOP_K, parseTopK } from "@/lib/form-defaults";

/** 新建任务固定为全流程（检索 + 生成），不再提供仅检索 / 仅生成类型 */
const PIPELINE_EVAL_TYPE = "full" as const;
import { ArrowLeftIcon, PlusIcon, TrashIcon } from "@/components/icons";

export default function NewEvaluationPage() {
  const router = useRouter();
  const [kbList, setKbList] = useState<KnowledgeBase[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<number | null>(null);
  /** 留空则提交时使用默认 Top-K（与后端 schema 默认一致） */
  const [topKInput, setTopKInput] = useState("");
  const evaluationType = PIPELINE_EVAL_TYPE;
  const [evalTypes, setEvalTypes] = useState<EvaluationTypeInfo[]>([]);
  /** 当前类型下要计算的指标（与后端类型约束一致） */
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [testCases, setTestCases] = useState<EvaluationTestCaseCreate[]>([
    { query: "", reference: "" },
  ]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [importJsonError, setImportJsonError] = useState("");
  const [replaceOnImport, setReplaceOnImport] = useState(true);
  const [showJsonHint, setShowJsonHint] = useState(false);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);

  /** RAGAS 评分模型：与「模型配置」中启用项合并；默认跟随全局 */
  const judgePrefilledRef = useRef(false);
  const [judgeMode, setJudgeMode] = useState<"global" | "custom">("global");
  const [judgeChatProvider, setJudgeChatProvider] = useState<"openai" | "ollama">("openai");
  const [judgeOpenaiBase, setJudgeOpenaiBase] = useState("");
  const [judgeOpenaiModel, setJudgeOpenaiModel] = useState("");
  const [judgeOllamaBase, setJudgeOllamaBase] = useState("");
  const [judgeOllamaModel, setJudgeOllamaModel] = useState("");
  const [judgeEmbedCustom, setJudgeEmbedCustom] = useState(false);
  const [judgeEmbProvider, setJudgeEmbProvider] = useState<"openai" | "ollama">("openai");
  const [judgeOpenaiEmbBase, setJudgeOpenaiEmbBase] = useState("");
  const [judgeOpenaiEmbModel, setJudgeOpenaiEmbModel] = useState("");
  const [judgeOllamaEmbBase, setJudgeOllamaEmbBase] = useState("");
  const [judgeOllamaEmbModel, setJudgeOllamaEmbModel] = useState("");
  /** 自定义评分端点专用 Key，不预填全局密钥 */
  const [judgeOpenaiKey, setJudgeOpenaiKey] = useState("");
  const [judgeOpenaiEmbKey, setJudgeOpenaiEmbKey] = useState("");

  useEffect(() => {
    if (judgeMode !== "custom") {
      judgePrefilledRef.current = false;
      return;
    }
    if (judgePrefilledRef.current) return;
    judgePrefilledRef.current = true;
    void (async () => {
      try {
        const res = await llmConfigApi.list();
        const cfg = res.items.find((x) => x.id === res.active_id)?.config;
        if (!cfg) return;
        setJudgeChatProvider(cfg.chat_provider === "ollama" ? "ollama" : "openai");
        setJudgeOpenaiBase(cfg.openai_api_base ?? "");
        setJudgeOpenaiModel(cfg.openai_model ?? "");
        setJudgeOllamaBase(cfg.ollama_api_base ?? "");
        setJudgeOllamaModel(cfg.ollama_model ?? "");
        setJudgeEmbProvider(cfg.embeddings_provider === "ollama" ? "ollama" : "openai");
        setJudgeOpenaiEmbBase(cfg.openai_embeddings_api_base || cfg.openai_api_base || "");
        setJudgeOpenaiEmbModel(cfg.openai_embeddings_model ?? "");
        setJudgeOllamaEmbBase(cfg.ollama_embeddings_api_base || cfg.ollama_api_base || "");
        setJudgeOllamaEmbModel(cfg.ollama_embeddings_model ?? "");
      } catch {
        /* 无模型配置时留空，由后端合并全局 */
      }
    })();
  }, [judgeMode]);

  useEffect(() => {
    (async () => {
      try {
        const [kbs, types] = await Promise.all([
          knowledgeBaseApi.list(),
          evaluationApi.listTypes(),
        ]);
        setKbList(kbs);
        setEvalTypes(types.filter((t) => t.type === PIPELINE_EVAL_TYPE));
      } catch {
        setKbList([]);
        setEvalTypes([
          {
            type: "full",
            label: "全流程检索与生成",
            description: "检索 + 生成；可从全部 RAGAS 指标中勾选",
            metrics: [],
            needs_retrieval: true,
            needs_generation: true,
          },
        ]);
      }
    })();
  }, []);

  const currentEvalType = evalTypes.find((t) => t.type === evaluationType);

  // 切换「评估类型」时，把多选预设同步为该类型的默认指标集
  useEffect(() => {
    const info = evalTypes.find((t) => t.type === evaluationType);
    const defaults =
      info?.metrics?.length
        ? [...info.metrics]
        : [...(METRICS_BY_EVAL_TYPE[evaluationType] ?? DEFAULT_ALLOWED_METRICS)];
    setSelectedMetrics(defaults);
  }, [evaluationType, evalTypes]);

  const allowedMetricIds: string[] = (() => {
    if (currentEvalType?.allowed_metrics?.length)
      return [...currentEvalType.allowed_metrics];
    if (currentEvalType?.metrics?.length) return [...currentEvalType.metrics];
    return [...(METRICS_BY_EVAL_TYPE[evaluationType] ?? DEFAULT_ALLOWED_METRICS)];
  })();

  const addTestCase = () => {
    setTestCases((prev) => [...prev, { query: "", reference: "" }]);
  };

  const removeTestCase = (idx: number) => {
    if (testCases.length <= 1) return;
    setTestCases((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateTestCase = (idx: number, field: "query" | "reference", value: string) => {
    setTestCases((prev) =>
      prev.map((tc, i) => (i === idx ? { ...tc, [field]: value } : tc)),
    );
  };

  const applyImportedCases = (parsed: EvaluationTestCaseCreate[]) => {
    setTestCases((prev) => {
      if (replaceOnImport) return parsed.length ? parsed : [{ query: "", reference: "" }];
      const merged = [...prev, ...parsed];
      return merged.length ? merged : [{ query: "", reference: "" }];
    });
    setImportJsonError("");
  };

  const buildJudgeConfigForSubmit = (): EvaluationJudgeConfig | undefined => {
    if (judgeMode !== "custom") return undefined;
    const cfg: EvaluationJudgeConfig = {};
    cfg.chat_provider = judgeChatProvider;
    if (judgeChatProvider === "openai") {
      if (judgeOpenaiBase.trim()) cfg.openai_api_base = judgeOpenaiBase.trim();
      if (judgeOpenaiModel.trim()) cfg.openai_model = judgeOpenaiModel.trim();
      if (judgeOpenaiKey.trim()) cfg.openai_api_key = judgeOpenaiKey.trim();
    } else {
      if (judgeOllamaBase.trim()) cfg.ollama_api_base = judgeOllamaBase.trim();
      if (judgeOllamaModel.trim()) cfg.ollama_model = judgeOllamaModel.trim();
    }
    if (judgeEmbedCustom) {
      cfg.embeddings_provider = judgeEmbProvider;
      if (judgeEmbProvider === "openai") {
        if (judgeOpenaiEmbBase.trim()) cfg.openai_embeddings_api_base = judgeOpenaiEmbBase.trim();
        if (judgeOpenaiEmbModel.trim()) cfg.openai_embeddings_model = judgeOpenaiEmbModel.trim();
        if (judgeOpenaiEmbKey.trim()) cfg.openai_embeddings_api_key = judgeOpenaiEmbKey.trim();
      } else {
        if (judgeOllamaEmbBase.trim()) cfg.ollama_embeddings_api_base = judgeOllamaEmbBase.trim();
        if (judgeOllamaEmbModel.trim()) cfg.ollama_embeddings_model = judgeOllamaEmbModel.trim();
      }
    }
    return cfg;
  };

  const handleJsonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportJsonError("");
    try {
      const text = await file.text();
      const parsed = parseEvaluationQaJson(text);
      applyImportedCases(parsed);
    } catch (err) {
      setImportJsonError(err instanceof Error ? err.message : "导入失败");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validCases = testCases.filter((tc) => tc.query.trim());
    if (validCases.length === 0) {
      setError("至少添加一个有效的测试用例（问题不能为空）");
      return;
    }
    if (selectedMetrics.length === 0) {
      setError("请至少选择一个评估指标");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const jc = buildJudgeConfigForSubmit();
      const task = await evaluationApi.create({
        name: name.trim(),
        description: description.trim() || null,
        knowledge_base_id: knowledgeBaseId || undefined,
        top_k: parseTopK(topKInput),
        evaluation_type: evaluationType,
        evaluation_metrics: [...selectedMetrics].sort(),
        ...(jc && Object.keys(jc).length > 0 ? { judge_config: jc } : {}),
        test_cases: validCases,
      });
      router.push(PATH.evaluationDetail(task.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "创建失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          href={PATH.evaluation}
          className="text-sm text-muted hover:text-ink transition-colors inline-flex items-center gap-1"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          返回列表
        </Link>
        <h1 className="text-2xl font-bold text-ink mt-2">新建 RAG 评估</h1>
        <p className="text-sm text-muted mt-1">
          配置知识库、评估类型与测试用例
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-surface rounded-xl border border-border p-6 space-y-6"
      >
        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">
            任务名称 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：知识库 A 首次评估"
            className="w-full border border-border rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">
            描述
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="留空则不保存描述"
            rows={2}
            className="w-full border border-border rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-ink mb-1.5">
            关联知识库
          </label>
          <select
            value={knowledgeBaseId ?? ""}
            onChange={(e) =>
              setKnowledgeBaseId(
                e.target.value ? Number(e.target.value) : null,
              )
            }
            className="w-full border border-border rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <option value="">
              不关联知识库（仅根据下方测试用例评估）
            </option>
            {kbList.map((kb) => (
              <option key={kb.id} value={kb.id}>
                {kb.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              Top-K（检索条数）
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={topKInput}
              onChange={(e) =>
                setTopKInput(e.target.value.replace(/\D/g, ""))
              }
              placeholder={`默认 ${DEFAULT_TOP_K}`}
              title={`留空则使用 ${DEFAULT_TOP_K}，与后端默认一致`}
              className="w-full border border-border rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <p className="text-[11px] text-muted mt-1.5">
              每条测试问题从向量库取前 K 个片段；不填则 {DEFAULT_TOP_K}（可填 1–50）。
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1.5">
              评估模式
            </label>
            <div className="rounded-lg border border-border bg-surface-muted px-3.5 py-2.5 text-sm text-ink">
              {currentEvalType?.label ?? "全流程检索与生成"}
              {currentEvalType?.description ? (
                <span className="block text-xs text-muted mt-1">
                  {currentEvalType.description}
                </span>
              ) : (
                <span className="block text-xs text-muted mt-1">
                  向量检索与答案生成一并评估，可在下方勾选具体指标。
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface-muted/80 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-ink">评分模型（RAGAS）</p>
            <p className="text-xs text-muted mt-0.5">
              默认与「模型配置」中当前启用项一致；可单独指定 OpenAI 兼容接口或 Ollama 作为判分模型。自定义端点下可填写专用
              API Key；留空则对话/嵌入密钥仍用全局「模型配置」。
            </p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="judgeMode"
                checked={judgeMode === "global"}
                onChange={() => setJudgeMode("global")}
                className="text-accent"
              />
              <span className="text-ink">跟随全局配置</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="judgeMode"
                checked={judgeMode === "custom"}
                onChange={() => setJudgeMode("custom")}
                className="text-accent"
              />
              <span className="text-ink">自定义评分端点</span>
            </label>
          </div>
          {judgeMode === "custom" && (
            <div className="space-y-3 pt-1 border-t border-border">
              <div>
                <p className="text-xs font-medium text-ink mb-2">评分对话模型</p>
                <div className="flex flex-wrap gap-3 mb-2">
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="judgeChat"
                      checked={judgeChatProvider === "openai"}
                      onChange={() => setJudgeChatProvider("openai")}
                    />
                    OpenAI 兼容
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="judgeChat"
                      checked={judgeChatProvider === "ollama"}
                      onChange={() => setJudgeChatProvider("ollama")}
                    />
                    Ollama
                  </label>
                </div>
                {judgeChatProvider === "openai" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={judgeOpenaiBase}
                      onChange={(e) => setJudgeOpenaiBase(e.target.value)}
                      placeholder="API Base（可空则沿用全局）"
                      autoComplete="off"
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      value={judgeOpenaiModel}
                      onChange={(e) => setJudgeOpenaiModel(e.target.value)}
                      placeholder="模型名（可空则沿用全局）"
                      autoComplete="off"
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                    />
                    <div className="sm:col-span-2">
                      <label className="block text-xs text-muted mb-1">
                        API Key（可选，用于智谱等独立网关；留空则用全局配置中的 Key）
                      </label>
                      <input
                        type="password"
                        value={judgeOpenaiKey}
                        onChange={(e) => setJudgeOpenaiKey(e.target.value)}
                        placeholder="sk-… 或智谱 API Key"
                        autoComplete="new-password"
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={judgeOllamaBase}
                      onChange={(e) => setJudgeOllamaBase(e.target.value)}
                      placeholder="Ollama 地址，如 http://localhost:11434"
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      value={judgeOllamaModel}
                      onChange={(e) => setJudgeOllamaModel(e.target.value)}
                      placeholder="模型名"
                      className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
              <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={judgeEmbedCustom}
                  onChange={(e) => setJudgeEmbedCustom(e.target.checked)}
                  className="rounded border-border"
                />
                单独指定评分用嵌入模型（答案相关性 / 答案正确性等指标需要；不勾选则沿用全局嵌入）
              </label>
              {judgeEmbedCustom && (
                <div className="pl-0 sm:pl-1 space-y-2">
                  <div className="flex flex-wrap gap-3">
                    <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="judgeEmb"
                        checked={judgeEmbProvider === "openai"}
                        onChange={() => setJudgeEmbProvider("openai")}
                      />
                      嵌入：OpenAI 兼容
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="radio"
                        name="judgeEmb"
                        checked={judgeEmbProvider === "ollama"}
                        onChange={() => setJudgeEmbProvider("ollama")}
                      />
                      嵌入：Ollama
                    </label>
                  </div>
                  {judgeEmbProvider === "openai" ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={judgeOpenaiEmbBase}
                        onChange={(e) => setJudgeOpenaiEmbBase(e.target.value)}
                        placeholder="嵌入 API Base"
                        autoComplete="off"
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={judgeOpenaiEmbModel}
                        onChange={(e) => setJudgeOpenaiEmbModel(e.target.value)}
                        placeholder="嵌入模型名"
                        autoComplete="off"
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                      />
                      <div className="sm:col-span-2">
                        <label className="block text-xs text-muted mb-1">
                          嵌入 API Key（可选；留空则优先用上方对话 Key，否则全局嵌入 Key）
                        </label>
                        <input
                          type="password"
                          value={judgeOpenaiEmbKey}
                          onChange={(e) => setJudgeOpenaiEmbKey(e.target.value)}
                          placeholder="与对话 Key 不同时填写"
                          autoComplete="new-password"
                          className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={judgeOllamaEmbBase}
                        onChange={(e) => setJudgeOllamaEmbBase(e.target.value)}
                        placeholder="Ollama 地址"
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={judgeOllamaEmbModel}
                        onChange={(e) => setJudgeOllamaEmbModel(e.target.value)}
                        placeholder="嵌入模型名"
                        className="w-full border border-border rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface-muted/80 p-4 space-y-3">
          <div>
            <p className="text-sm font-medium text-ink">评估指标</p>
            <p className="text-xs text-muted mt-0.5">
              全流程评估下可从下列六项 RAGAS 指标中勾选；默认与类型预设一致，可按需增减。
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                setSelectedMetrics(
                  currentEvalType?.metrics?.length
                    ? [...currentEvalType.metrics]
                    : [...allowedMetricIds],
                )
              }
              className="text-xs px-2.5 py-1 rounded-lg border border-border bg-surface text-ink hover:bg-surface-muted"
            >
              恢复类型默认
            </button>
            <button
              type="button"
              onClick={() => setSelectedMetrics([...allowedMetricIds])}
              className="text-xs px-2.5 py-1 rounded-lg border border-border bg-surface text-ink hover:bg-surface-muted"
            >
              全选（本类型允许范围内）
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {allowedMetricIds.map((id) => {
              const checked = selectedMetrics.includes(id);
              return (
                <label
                  key={id}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                    checked
                      ? "border-accent bg-accent-muted/80"
                      : "border-border bg-surface hover:border-border"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setSelectedMetrics((prev) =>
                        prev.includes(id)
                          ? prev.filter((x) => x !== id)
                          : [...prev, id],
                      )
                    }
                    className="rounded border-border text-accent focus:ring-accent"
                  />
                  <span className="text-ink">{METRIC_LABELS[id] ?? id}</span>
                  <span className="text-[10px] text-muted font-mono ml-auto truncate max-w-[40%]">
                    {id}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <label className="block text-sm font-medium text-ink">
              测试用例 <span className="text-red-500">*</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={jsonFileInputRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={handleJsonFile}
              />
              <button
                type="button"
                onClick={() => jsonFileInputRef.current?.click()}
                className="inline-flex items-center gap-1 text-sm text-ink hover:text-ink border border-border rounded-lg px-2.5 py-1.5 bg-surface"
              >
                从 JSON 导入
              </button>
              <button
                type="button"
                onClick={addTestCase}
                className="inline-flex items-center gap-1 text-sm text-accent hover:text-accent-hover"
              >
                <PlusIcon className="w-4 h-4" />
                添加
              </button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-muted mb-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={replaceOnImport}
              onChange={(e) => setReplaceOnImport(e.target.checked)}
              className="rounded border-border"
            />
            导入时替换当前列表（不勾选则追加到末尾）
          </label>
          <button
            type="button"
            onClick={() => setShowJsonHint((v) => !v)}
            className="text-xs text-accent hover:underline mb-2"
          >
            {showJsonHint ? "收起" : "查看"} JSON 格式说明
          </button>
          {showJsonHint && (
            <div className="mb-3 p-3 bg-surface-muted border border-border rounded-lg text-xs text-ink space-y-2">
              <p>
                支持顶层数组，或包含{" "}
                <code className="rounded bg-surface-muted px-1">test_cases</code> /{" "}
                <code className="rounded bg-surface-muted px-1">items</code> /{" "}
                <code className="rounded bg-surface-muted px-1">qa</code> /{" "}
                <code className="rounded bg-surface-muted px-1">examples</code>{" "}
                的对象。问题可用{" "}
                <code className="rounded bg-surface-muted px-1">query</code>、
                <code className="rounded bg-surface-muted px-1">question</code> 等字段；参考答案可用{" "}
                <code className="rounded bg-surface-muted px-1">reference</code>、
                <code className="rounded bg-surface-muted px-1">answer</code> 等。
              </p>
              <pre className="whitespace-pre-wrap overflow-x-auto p-2 bg-surface border border-border rounded text-[11px] leading-relaxed">
                {EVALUATION_QA_JSON_EXAMPLE}
              </pre>
            </div>
          )}
          {importJsonError && (
            <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {importJsonError}
            </div>
          )}
          <div className="space-y-3">
            {testCases.map((tc, idx) => (
              <div
                key={idx}
                className="border border-border rounded-lg p-4 space-y-2 bg-surface-muted/50"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted">用例 #{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeTestCase(idx)}
                    disabled={testCases.length <= 1}
                    className="text-muted hover:text-red-500 disabled:opacity-50"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
                <input
                  type="text"
                  value={tc.query}
                  onChange={(e) => updateTestCase(idx, "query", e.target.value)}
                  placeholder="问题（必填）"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <input
                  type="text"
                  value={tc.reference ?? ""}
                  onChange={(e) =>
                    updateTestCase(idx, "reference", e.target.value)
                  }
                  placeholder="参考答案（可选，留空则部分指标不参与）"
                  className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="bg-accent text-surface px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50 transition-colors"
          >
            {loading ? "创建中..." : "创建评估"}
          </button>
          <Link
            href={PATH.evaluation}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-muted hover:bg-surface-muted transition-colors"
          >
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}
