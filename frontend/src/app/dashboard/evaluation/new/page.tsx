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
  ApiError,
  KnowledgeBase,
  EvaluationTestCaseCreate,
  EvaluationTypeInfo,
} from "@/lib/api";
import { PATH } from "@/lib/routes";
import {
  parseEvaluationQaJson,
  EVALUATION_QA_JSON_EXAMPLE,
} from "@/lib/evaluation-import";
import {
  DEFAULT_ALLOWED_METRICS,
  METRIC_LABELS,
} from "@/lib/evaluation-metrics";
import { DEFAULT_TOP_K, parseTopK } from "@/lib/form-defaults";
import { ArrowLeftIcon, PlusIcon, TrashIcon } from "@/components/icons";

export default function NewEvaluationPage() {
  const router = useRouter();
  const [kbList, setKbList] = useState<KnowledgeBase[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<number | null>(null);
  /** 留空则提交时使用默认 Top-K（与后端 schema 默认一致） */
  const [topKInput, setTopKInput] = useState("");
  const [evaluationType, setEvaluationType] = useState("full");
  const [evalTypes, setEvalTypes] = useState<EvaluationTypeInfo[]>([]);
  /** 自定义指标时为 true，请求体带 evaluation_metrics */
  const [customizeMetrics, setCustomizeMetrics] = useState(false);
  /** 多选中的指标 id（合法子集） */
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [testCases, setTestCases] = useState<EvaluationTestCaseCreate[]>([
    { query: "", reference: "" },
  ]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [importJsonError, setImportJsonError] = useState("");
  const [replaceOnImport, setReplaceOnImport] = useState(false);
  const [showJsonHint, setShowJsonHint] = useState(false);
  const jsonFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const [kbs, types] = await Promise.all([
          knowledgeBaseApi.list(),
          evaluationApi.listTypes(),
        ]);
        setKbList(kbs);
        setEvalTypes(types);
        if (types.length > 0) {
          setEvaluationType((prev) =>
            types.some((t) => t.type === prev) ? prev : types[0].type,
          );
        }
      } catch {
        setKbList([]);
        setEvalTypes([
          {
            type: "full",
            label: "完整评估",
            description: "检索 + 生成 + 全指标评分",
            metrics: [],
            needs_retrieval: true,
            needs_generation: true,
          },
          {
            type: "retrieval",
            label: "检索评估",
            description: "仅检索 + 检索指标",
            metrics: [],
            needs_retrieval: true,
            needs_generation: false,
          },
          {
            type: "generation",
            label: "生成评估",
            description: "仅生成 + 生成指标",
            metrics: [],
            needs_retrieval: true,
            needs_generation: true,
          },
        ]);
      }
    })();
  }, []);

  // 切换「评估类型」时，把多选预设同步为该类型的默认指标集
  useEffect(() => {
    const info = evalTypes.find((t) => t.type === evaluationType);
    if (info?.metrics?.length) {
      setSelectedMetrics([...info.metrics]);
    }
  }, [evaluationType, evalTypes]);

  const allowedMetricIds =
    evalTypes[0]?.allowed_metrics?.length
      ? evalTypes[0].allowed_metrics
      : [...DEFAULT_ALLOWED_METRICS];

  const currentEvalType = evalTypes.find((t) => t.type === evaluationType);

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
    if (customizeMetrics && selectedMetrics.length === 0) {
      setError("请至少选择一个评估指标，或关闭「自定义指标」使用类型默认");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const task = await evaluationApi.create({
        name: name.trim(),
        description: description.trim() || null,
        knowledge_base_id: knowledgeBaseId || undefined,
        top_k: parseTopK(topKInput),
        evaluation_type: evaluationType,
        ...(customizeMetrics && selectedMetrics.length > 0
          ? { evaluation_metrics: [...selectedMetrics].sort() }
          : {}),
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
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors inline-flex items-center gap-1"
        >
          <ArrowLeftIcon className="w-4 h-4" />
          返回列表
        </Link>
        <h1 className="text-2xl font-bold text-gray-800 mt-2">新建 RAG 评估</h1>
        <p className="text-sm text-gray-500 mt-1">
          配置知识库、评估类型与测试用例
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl border border-gray-200 p-6 space-y-6"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            任务名称 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：知识库 A 首次评估"
            className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            描述
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="留空则不保存描述"
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            关联知识库
          </label>
          <select
            value={knowledgeBaseId ?? ""}
            onChange={(e) =>
              setKnowledgeBaseId(
                e.target.value ? Number(e.target.value) : null,
              )
            }
            className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
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
              className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-gray-500 mt-1.5">
              每条测试问题从向量库取前 K 个片段；不填则 {DEFAULT_TOP_K}（可填 1–50）。
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              评估类型
            </label>
            <select
              value={evaluationType}
              onChange={(e) => setEvaluationType(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {(evalTypes.length > 0
                ? evalTypes
                : [
                    { type: "full", label: "完整评估", description: "" },
                    { type: "retrieval", label: "检索评估", description: "" },
                    { type: "generation", label: "生成评估", description: "" },
                  ]
              ).map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                  {t.description ? ` — ${t.description}` : ""}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium text-gray-800">评估指标</p>
              <p className="text-xs text-gray-500 mt-0.5">
                默认跟随上方「评估类型」；开启自定义后可勾选一项或多项
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={customizeMetrics}
                onChange={(e) => setCustomizeMetrics(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              自定义指标
            </label>
          </div>

          {!customizeMetrics && (
            <div className="flex flex-wrap gap-2">
              {currentEvalType?.metrics?.length ? (
                currentEvalType.metrics.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-gray-200 text-gray-700"
                  >
                    {METRIC_LABELS[id] ?? id}
                  </span>
                ))
              ) : (
                <span className="text-xs text-gray-500">加载类型配置中…</span>
              )}
            </div>
          )}

          {customizeMetrics && (
            <>
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
                  className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                >
                  使用当前类型默认
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMetrics([...allowedMetricIds])}
                  className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                >
                  全选
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedMetrics([])}
                  className="text-xs px-2.5 py-1 rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                >
                  清空
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
                          ? "border-blue-400 bg-blue-50/60"
                          : "border-gray-200 bg-white hover:border-gray-300"
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
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-gray-800">{METRIC_LABELS[id] ?? id}</span>
                      <span className="text-[10px] text-gray-400 font-mono ml-auto truncate max-w-[40%]">
                        {id}
                      </span>
                    </label>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <label className="block text-sm font-medium text-gray-700">
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
                className="inline-flex items-center gap-1 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white"
              >
                从 JSON 导入
              </button>
              <button
                type="button"
                onClick={addTestCase}
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
              >
                <PlusIcon className="w-4 h-4" />
                添加
              </button>
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 mb-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={replaceOnImport}
              onChange={(e) => setReplaceOnImport(e.target.checked)}
              className="rounded border-gray-300"
            />
            导入时替换当前列表（不勾选则追加到末尾）
          </label>
          <button
            type="button"
            onClick={() => setShowJsonHint((v) => !v)}
            className="text-xs text-blue-600 hover:underline mb-2"
          >
            {showJsonHint ? "收起" : "查看"} JSON 格式说明
          </button>
          {showJsonHint && (
            <div className="mb-3 p-3 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 space-y-2">
              <p>
                支持顶层数组，或包含{" "}
                <code className="bg-gray-200 px-1 rounded">test_cases</code> /{" "}
                <code className="bg-gray-200 px-1 rounded">items</code> /{" "}
                <code className="bg-gray-200 px-1 rounded">qa</code> /{" "}
                <code className="bg-gray-200 px-1 rounded">examples</code>{" "}
                的对象。问题可用{" "}
                <code className="bg-gray-200 px-1 rounded">query</code>、
                <code className="bg-gray-200 px-1 rounded">question</code> 等字段；参考答案可用{" "}
                <code className="bg-gray-200 px-1 rounded">reference</code>、
                <code className="bg-gray-200 px-1 rounded">answer</code> 等。
              </p>
              <pre className="whitespace-pre-wrap overflow-x-auto p-2 bg-white border border-gray-200 rounded text-[11px] leading-relaxed">
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
                className="border border-gray-200 rounded-lg p-4 space-y-2 bg-gray-50/50"
              >
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">用例 #{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() => removeTestCase(idx)}
                    disabled={testCases.length <= 1}
                    className="text-gray-400 hover:text-red-500 disabled:opacity-50"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
                <input
                  type="text"
                  value={tc.query}
                  onChange={(e) => updateTestCase(idx, "query", e.target.value)}
                  placeholder="问题（必填）"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  type="text"
                  value={tc.reference ?? ""}
                  onChange={(e) =>
                    updateTestCase(idx, "reference", e.target.value)
                  }
                  placeholder="参考答案（可选，留空则部分指标不参与）"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? "创建中..." : "创建评估"}
          </button>
          <Link
            href={PATH.evaluation}
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}
