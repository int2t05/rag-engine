"""
RAG 评估：任务调度、RAGAS 打分与结果落库。
"""

from app.modules.evaluation.evaluation_service import run_evaluation_task

__all__ = ["run_evaluation_task"]
