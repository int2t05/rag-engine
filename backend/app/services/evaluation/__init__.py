"""
RAG 评估服务
============
实现《RAG评估业务流程最佳实践》中定义的完整评估流程：
1. 检索阶段 - 使用向量存储检索相关文档
2. 生成阶段 - 基于上下文生成答案（仅依据上下文回答）
3. 评估阶段 - RAGAS 多指标评估
4. 结果保存 - 持久化到 EvaluationResult，更新任务 summary
"""

from .evaluation_service import run_evaluation_task

__all__ = ["run_evaluation_task"]
