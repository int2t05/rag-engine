"""
评估任务 HTTP 用例
================
创建、列表、导入用例、详情、删除、触发执行、结果列表；与 RAGAS 执行服务解耦。
"""

from __future__ import annotations

from typing import List

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ResourceNotFoundError
from app.models.evaluation import EvaluationTask, EvaluationTestCase
from app.modules.evaluation.repository import EvaluationRepository
from app.schemas.evaluation import (
    EvaluationResolveResponse,
    EvaluationTaskCreate,
    EvaluationTaskResponse,
    TestCaseBatchImport,
    TestCaseBatchImportResult,
)
from app.modules.evaluation import run_evaluation_task


def create_task(
    db: Session, user_id: int, task_in: EvaluationTaskCreate
) -> EvaluationTask:
    repo = EvaluationRepository(db)
    if task_in.knowledge_base_id:
        if not repo.get_owned_kb(task_in.knowledge_base_id, user_id):
            raise ResourceNotFoundError("知识库不存在或无权访问")

    task = EvaluationTask(
        name=task_in.name,
        description=task_in.description,
        knowledge_base_id=task_in.knowledge_base_id,
        top_k=task_in.top_k,
        evaluation_type=task_in.evaluation_type,
        evaluation_metrics=task_in.evaluation_metrics,
        status="pending",
        created_by=user_id,
    )
    repo.add_task(task)
    db.commit()
    db.refresh(task)

    for tc_in in task_in.test_cases:
        tc = EvaluationTestCase(
            task_id=task.id,
            query=tc_in.query,
            reference=tc_in.reference,
            source="manual",
        )
        repo.add_test_case(tc)
    db.commit()
    db.refresh(task)
    return task


def list_tasks(
    db: Session, user_id: int, skip: int = 0, limit: int = 100
) -> List[EvaluationTask]:
    return EvaluationRepository(db).list_tasks(user_id, skip=skip, limit=limit)


def import_test_cases(
    db: Session, user_id: int, task_id: int, body: TestCaseBatchImport
) -> TestCaseBatchImportResult:
    repo = EvaluationRepository(db)
    task = repo.get_task_for_user(task_id, user_id, with_test_cases=False)
    if not task:
        raise ResourceNotFoundError("评估任务不存在")
    if task.status == "running":
        raise BadRequestError("任务执行中，无法导入测试用例")

    imported = 0
    skipped = 0
    for tc_in in body.test_cases:
        q = (tc_in.query or "").strip()
        if not q:
            skipped += 1
            continue
        ref = tc_in.reference
        if ref is not None:
            ref = ref.strip() or None
        tc = EvaluationTestCase(
            task_id=task.id,
            query=q,
            reference=ref,
            source="manual",
        )
        repo.add_test_case(tc)
        imported += 1
    db.commit()
    return TestCaseBatchImportResult(
        task_id=task.id,
        imported=imported,
        skipped=skipped,
    )


def resolve_task(
    db: Session, user_id: int, task_id: int
) -> EvaluationResolveResponse:
    task = EvaluationRepository(db).get_task_for_user(
        task_id, user_id, with_test_cases=True
    )
    if not task:
        return EvaluationResolveResponse(ok=False, task_id=task_id)
    return EvaluationResolveResponse(
        ok=True,
        task_id=task_id,
        task=EvaluationTaskResponse.model_validate(task),
    )


def get_task_detail(db: Session, user_id: int, task_id: int) -> EvaluationTask:
    task = EvaluationRepository(db).get_task_for_user(
        task_id, user_id, with_test_cases=True
    )
    if not task:
        raise ResourceNotFoundError("评估任务不存在")
    return task


def delete_task(db: Session, user_id: int, task_id: int, force: bool) -> dict:
    repo = EvaluationRepository(db)
    task = repo.get_task_for_user(task_id, user_id, with_test_cases=False)
    if not task:
        raise ResourceNotFoundError("评估任务不存在")
    if task.status == "running" and not force:
        raise BadRequestError(
            "任务正在执行中，无法删除；若需终止并删除请使用强制删除（force=true）"
        )
    repo.delete_task(task)
    db.commit()
    return {"message": "删除成功", "task_id": task_id}


def schedule_run(
    db: Session,
    user_id: int,
    task_id: int,
    background_tasks: BackgroundTasks,
) -> dict:
    repo = EvaluationRepository(db)
    task = repo.get_task_for_user(task_id, user_id, with_test_cases=False)
    if not task:
        raise ResourceNotFoundError("评估任务不存在")
    if task.status == "running":
        raise BadRequestError("任务正在执行中")
    background_tasks.add_task(run_evaluation_task, task_id)
    return {"message": "评估已开始执行", "task_id": task_id}


def list_results(db: Session, user_id: int, task_id: int):
    repo = EvaluationRepository(db)
    task = repo.get_task_for_user(task_id, user_id, with_test_cases=False)
    if not task:
        raise ResourceNotFoundError("评估任务不存在")
    return repo.list_results_for_task_ordered(task_id)
