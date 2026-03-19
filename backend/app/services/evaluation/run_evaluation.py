#!/usr/bin/env python3
"""
RAG 评估独立运行脚本
====================
可直接运行此脚本测试 RAG 评估流程，无需启动 FastAPI 服务。

使用方法：
    cd backend
    python -m app.services.evaluation.run_evaluation

依赖：
    pip install ragas langchain-openai
"""

import os
import sys
import asyncio
import logging

# 添加项目根目录到 path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


async def main():
    """
    RAGAS 最小化评估示例（模拟数据）
    """
    from app.core.config import settings

    # RAGAS 标准字段名：question / answer / contexts / ground_truth
    test_samples = [
        {
            "question": "法国的首都是什么？",
            "answer": "法国的首都是巴黎。巴黎位于法国北部，是法国最大的城市。",
            "contexts": [
                "法国是欧洲西部的一个国家。巴黎是法国的首都，位于法国北部。",
                "法国的人口约6700万，首都是巴黎。",
                "法国的官方语言是法语，首都是巴黎。",
            ],
            "ground_truth": "法国的首都是巴黎。",
        },
        {
            "question": "水的沸点是多少？",
            "answer": "在标准大气压下，水的沸点是100°C。",
            "contexts": [
                "水在不同气压下的沸点不同。在标准大气压（1 atm）下，水的沸点是100°C（212°F）。",
                "海拔越高，大气压越低，水的沸点就越低。",
            ],
            "ground_truth": "标准大气压下水的沸点是100°C。",
        },
        {
            "question": "谁发明了相对论？",
            "answer": "阿尔伯特·爱因斯坦在1905年提出了狭义相对论，1915年提出了广义相对论。",
            "contexts": [
                "阿尔伯特·爱因斯坦（1879-1955）是二十世纪最重要的物理学家之一。",
                "爱因斯坦在1905年提出了狭义相对论，在1915年提出了广义相对论。",
                "相对论分为狭义相对论和广义相对论，是现代物理学的基石之一。",
            ],
            "ground_truth": "爱因斯坦发明了相对论。",
        },
        {
            "question": "Python 是谁发明的？",
            "answer": "Python 是由 Guido van Rossum 在1991年发明的。",
            "contexts": [
                "JavaScript 是由 Brendan Eich 在1995年发明的。",
                "Python 是由 Guido van Rossum 在1991年发明的。",
                "Guido van Rossum 是荷兰程序员，Python 以 Monty Python 命名。",
            ],
            "ground_truth": "Guido van Rossum 发明了 Python。",
        },
        {
            "question": "光速是多少？",
            "answer": "光在真空中的速度约为 299,792,458 米/秒，通常近似为 3×10^8 米/秒。",
            "contexts": [
                "光速在真空中的速度约为 299,792,458 米/秒。",
                "光速通常近似为 3×10^8 米/秒。",
                "根据爱因斯坦的相对论，没有任何物体可以超过光速。",
            ],
            "ground_truth": "光速约 3×10^8 米/秒。",
        },
    ]

    from app.services.evaluation.ragas_eval_service import (
        RagasEvaluator,
        EvaluationSample,
    )

    # 构建评估样本
    samples = [
        EvaluationSample(
            question=s["question"],
            answer=s["answer"],
            contexts=s["contexts"],
            ground_truth=s["ground_truth"],
        )
        for s in test_samples
    ]

    print("=" * 60)
    print("RAGAS RAG 评估演示（模拟数据）")
    print("=" * 60)
    print(f"模型  : {settings.OPENAI_MODEL}")
    print(f"样本数: {len(samples)}")
    print()

    evaluator = RagasEvaluator()
    logger.info("开始 RAGAS 评估...")
    report = await evaluator.evaluate_samples(samples)
    summary = report.to_dict()["summary"]

    print(f"总样本数  : {summary['total']}")
    print(f"通过数    : {summary['passed']}")
    print(f"失败数    : {summary['failed']}")
    print(f"通过率    : {summary['pass_rate']*100:.1f}%")
    print(f"耗时      : {summary['duration_seconds']:.2f}s")
    print()
    print("平均指标得分:")
    print(f"  上下文相关性 : {summary['avg_context_relevance']:.4f}")
    print(f"  答案忠实度   : {summary['avg_faithfulness']:.4f}")
    print(f"  答案相关性   : {summary['avg_answer_relevance']:.4f}")
    print(f"  RAGAS 综合分 : {summary['avg_ragas_score']:.4f}")

    print("\n" + "-" * 60)
    print("各样本详细结果:")
    print("-" * 60)

    for i, r in enumerate(report.results):
        print(f"\n[样本 {i+1}] {r.sample.question}")
        print(f"  回答: {r.sample.answer[:50]}...")
        print(f"  上下文相关性 : {r.context_relevance} ({r.judge_notes['context_relevance']})")
        print(f"  答案忠实度   : {r.faithfulness} ({r.judge_notes['faithfulness']})")
        print(f"  答案相关性   : {r.answer_relevance} ({r.judge_notes['answer_relevance']})")

    print("\n" + "=" * 60)
    print("评估完成")
    print("=" * 60)

    return report


if __name__ == "__main__":
    asyncio.run(main())
