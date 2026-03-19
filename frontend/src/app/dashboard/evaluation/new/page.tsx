/**
 * @fileoverview 新建 RAG 评估任务页面
 * @description 创建评估任务，配置知识库、测试用例等
 */

"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  evaluationApi,
  knowledgeBaseApi,
  ApiError,
  KnowledgeBase,
  EvaluationTestCaseCreate,
} from "@/lib/api";
import { ArrowLeftIcon, PlusIcon, TrashIcon } from "@/components/icons";

export default function NewEvaluationPage() {
  const router = useRouter();
  const [kbList, setKbList] = useState<KnowledgeBase[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [knowledgeBaseId, setKnowledgeBaseId] = useState<number | null>(null);
  const [topK, setTopK] = useState(5);
  const [evaluationType, setEvaluationType] = useState("full");
  const [testCases, setTestCases] = useState<EvaluationTestCaseCreate[]>([
    { query: "", reference: "" },
  ]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await knowledgeBaseApi.list();
        setKbList(data);
      } catch {
        setKbList([]);
      }
    })();
  }, []);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validCases = testCases.filter((tc) => tc.query.trim());
    if (validCases.length === 0) {
      setError("至少添加一个有效的测试用例（问题不能为空）");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const task = await evaluationApi.create({
        name: name.trim(),
        description: description.trim() || null,
        knowledge_base_id: knowledgeBaseId || undefined,
        top_k: topK,
        evaluation_type: evaluationType,
        test_cases: validCases,
      });
      router.push(`/dashboard/evaluation/${task.id}`);
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
          href="/dashboard/evaluation"
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
            placeholder="可选"
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
            <option value="">不关联（仅评估测试用例）</option>
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
              Top-K
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value) || 5)}
              className="w-full border border-gray-300 rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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
              <option value="full">完整 (Full)</option>
              <option value="retrieval">检索 (Retrieval)</option>
              <option value="generation">生成 (Generation)</option>
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              测试用例 <span className="text-red-500">*</span>
            </label>
            <button
              type="button"
              onClick={addTestCase}
              className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
            >
              <PlusIcon className="w-4 h-4" />
              添加
            </button>
          </div>
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
                  placeholder="参考答案（可选）"
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
            href="/dashboard/evaluation"
            className="px-5 py-2.5 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            取消
          </Link>
        </div>
      </form>
    </div>
  );
}
