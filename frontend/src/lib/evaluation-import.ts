/**
 * 从 JSON 文本解析 QA 评估用例，供新建任务或展示格式说明使用。
 * 支持顶层数组，或含 test_cases / items / qa / examples 的对象。
 * 问题字段：query | question | q | input；参考答案：reference | answer | ref | output | expected_answer
 */

import type { EvaluationTestCaseCreate } from "@/lib/api";

function pickStr(
  row: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const k of keys) {
    const v = row[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

/**
 * @param raw - JSON 字符串
 * @returns 非空 query 的用例列表
 * @throws 解析失败或结构不符合时抛出 Error
 */
export function parseEvaluationQaJson(raw: string): EvaluationTestCaseCreate[] {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("JSON 格式无效，请检查括号与引号");
  }

  let list: unknown[];
  if (Array.isArray(data)) {
    list = data;
  } else if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    if (Array.isArray(o.test_cases)) list = o.test_cases;
    else if (Array.isArray(o.items)) list = o.items;
    else if (Array.isArray(o.qa)) list = o.qa;
    else if (Array.isArray(o.examples)) list = o.examples;
    else {
      throw new Error(
        "需要为数组，或包含 test_cases / items / qa / examples 字段的对象",
      );
    }
  } else {
    throw new Error("无效的 JSON 结构");
  }

  const out: EvaluationTestCaseCreate[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const query = pickStr(row, ["query", "question", "q", "input"]);
    if (!query) continue;
    const refRaw = pickStr(row, [
      "reference",
      "answer",
      "ref",
      "output",
      "expected_answer",
    ]);
    out.push({
      query,
      reference: refRaw ?? "",
    });
  }

  if (out.length === 0) {
    throw new Error("未解析到任何有效用例（至少需要非空的问题字段）");
  }
  return out;
}

export const EVALUATION_QA_JSON_EXAMPLE = `[
  {
    "query": "你们公司的退款政策是什么？",
    "reference": "自签收日起 7 天内可申请无理由退款。"
  },
  {
    "question": "支持哪些支付方式？",
    "answer": "支持微信、支付宝与银联。"
  }
]`;
