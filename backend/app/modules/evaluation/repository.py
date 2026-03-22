"""
评估任务数据访问
==============
封装 EvaluationTask 的可访问性条件与常用查询（含与 KnowledgeBase 的 outerjoin）。
"""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from app.models.evaluation import EvaluationResult, EvaluationTask, EvaluationTestCase
from app.models.knowledge import KnowledgeBase


def evaluation_task_accessible(user_id: int) -> Any:
    """
    当前用户可访问的评估任务 SQL 条件：
    - created_by 为当前用户；或
    - 历史数据 created_by 为空且关联知识库属于当前用户。
    """
    return or_(
        EvaluationTask.created_by == user_id,
        and_(
            EvaluationTask.created_by.is_(None),
            EvaluationTask.knowledge_base_id.isnot(None),
            KnowledgeBase.id == EvaluationTask.knowledge_base_id,
            KnowledgeBase.user_id == user_id,
        ),
    )


class EvaluationRepository:
    """评估任务仓储。"""

    def __init__(self, db: Session) -> None:
        self.db = db

    def _base_task_query(self, user_id: int):
        """
        获取当前用户可访问的评估任务。
        """
        return (
            self.db.query(EvaluationTask)
            .outerjoin(
                KnowledgeBase,
                KnowledgeBase.id == EvaluationTask.knowledge_base_id,
            )
            .filter(evaluation_task_accessible(user_id))
        )

    def get_owned_kb(self, kb_id: int, user_id: int) -> Optional[KnowledgeBase]:
        """创建任务时校验知识库归属。"""
        return (
            self.db.query(KnowledgeBase)
            .filter(
                KnowledgeBase.id == kb_id,
                KnowledgeBase.user_id == user_id,
            )
            .first()
        )

    def add_task(self, task: EvaluationTask) -> None:
        """
        添加任务。
        """
        self.db.add(task)

    def add_test_case(self, tc: EvaluationTestCase) -> None:
        """
        添加测试用例。
        """
        self.db.add(tc)

    def list_tasks(
        self, user_id: int, skip: int = 0, limit: int = 100
    ) -> list[EvaluationTask]:
        """
        获取任务列表。
        """
        return (
            self._base_task_query(user_id)
            .order_by(EvaluationTask.id.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_task_for_user(
        self, task_id: int, user_id: int, *, with_test_cases: bool = False
    ) -> Optional[EvaluationTask]:
        """
        获取任务详情。
        """
        q = self._base_task_query(user_id).filter(EvaluationTask.id == task_id)
        if with_test_cases:
            q = q.options(joinedload(EvaluationTask.test_cases))
        return q.first()

    def delete_task(self, task: EvaluationTask) -> None:
        """
        删除任务
        """
        self.db.delete(task)

    def list_results_for_task_ordered(self, task_id: int) -> list[EvaluationResult]:
        """
        获取任务结果列表。
        """
        return (
            self.db.query(EvaluationResult)
            .filter(EvaluationResult.task_id == task_id)
            .order_by(EvaluationResult.id)
            .all()
        )
