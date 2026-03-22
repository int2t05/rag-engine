"""
评估任务 HTTP 用例
================
创建、列表、导入用例、详情、删除、触发执行、结果列表；与 RAGAS 执行服务解耦。
"""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import List

from fastapi import BackgroundTasks
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestError, ResourceNotFoundError
from app.models.base import BEIJING_TZ
from app.models.evaluation import EvaluationTask, EvaluationTestCase
from app.modules.evaluation.evaluation_config import resolve_metrics
from app.modules.evaluation.repository import EvaluationRepository
from app.schemas.evaluation import (
    EvaluationResolveResponse,
    EvaluationTaskCreate,
    EvaluationTaskResponse,
    TestCaseBatchImport,
    TestCaseBatchImportResult,
)
from app.modules.evaluation import run_evaluation_task

# 超过该时间未更新任务行则认为「执行中」已僵死（依赖评估循环内的心跳更新 updated_at）
_STALE_RUNNING_MINUTES = 90


def _is_stale_running(
    task: EvaluationTask, minutes: int = _STALE_RUNNING_MINUTES
) -> bool:
    """
    判断任务是否已僵死（执行中且超过指定时间未更新）
    """

    if task.status != "running":
        return False
    u = task.updated_at
    if u is None:
        return True
    now = datetime.now(BEIJING_TZ)
    if u.tzinfo is None:
        u = u.replace(tzinfo=BEIJING_TZ)
    return now - u > timedelta(minutes=minutes)


def create_task(
    db: Session, user_id: int, task_in: EvaluationTaskCreate
) -> EvaluationTask:
    """
    创建评估任务（含测试用例）。
    若指定 knowledge_base_id，需校验该知识库属于当前用户。
    """
    repo = EvaluationRepository(db)
    if task_in.knowledge_base_id:
        if not repo.get_owned_kb(task_in.knowledge_base_id, user_id):
            raise ResourceNotFoundError("知识库不存在或无权访问")

    try:
        resolve_metrics(task_in.evaluation_type, task_in.evaluation_metrics)
    except ValueError as e:
        raise BadRequestError(str(e)) from e

    jc_dict = None
    if task_in.judge_config is not None:
        jc_dict = task_in.judge_config.model_dump(exclude_none=True)
        jc_dict = {k: v for k, v in jc_dict.items() if v != ""}
        if not jc_dict:
            jc_dict = None

    task = EvaluationTask(
        name=task_in.name,
        description=task_in.description,
        knowledge_base_id=task_in.knowledge_base_id,
        top_k=task_in.top_k,
        evaluation_type=task_in.evaluation_type,
        evaluation_metrics=task_in.evaluation_metrics,
        judge_config=jc_dict,
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
    """获取当前用户的评估任务列表，支持分页"""
    return EvaluationRepository(db).list_tasks(user_id, skip=skip, limit=limit)


def import_test_cases(
    db: Session, user_id: int, task_id: int, body: TestCaseBatchImport
) -> TestCaseBatchImportResult:
    """
    向已有评估任务批量追加测试用例（JSON 与创建任务时 test_cases 字段结构相同）。
    执行中任务不可导入；问题为空的条目会跳过并计入 skipped。
    """
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


def resolve_task(db: Session, user_id: int, task_id: int) -> EvaluationResolveResponse:
    """
    获取当前用户的评估任务详情。
    若任务不存在或无权访问，返回 ok=false。
    若任务存在，返回 ok=true，并返回任务详情。
    """
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
    """获取当前用户的评估任务详情（含测试用例）"""
    task = EvaluationRepository(db).get_task_for_user(
        task_id, user_id, with_test_cases=True
    )
    if not task:
        raise ResourceNotFoundError("评估任务不存在")
    return task


def delete_task(db: Session, user_id: int, task_id: int, force: bool) -> dict:
    """删除评估任务（级联删除测试用例与结果）"""
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
    force: bool = False,
) -> dict:
    """
    调度执行评估任务
    """
    repo = EvaluationRepository(db)
    task = repo.get_task_for_user(task_id, user_id, with_test_cases=False)
    if not task:
        raise ResourceNotFoundError("评估任务不存在")

    if task.status == "running":
        if force:
            task.status = "pending"  # type: ignore
            task.error_message = None  # type: ignore
            db.commit()
            db.refresh(task)
        elif _is_stale_running(task):
            task.status = "failed"  # type: ignore
            task.error_message = (  # type: ignore
                "上次执行可能因进程退出或超时中断，状态已自动结束，可再次执行"
            )
            db.commit()
            db.refresh(task)
        else:
            raise BadRequestError(
                "任务正在执行中。若服务已重启或长时间无进度，可使用查询参数 force=true 强制重新执行"
            )

    # 入队前写入 running，使 GET 详情/列表与 POST /run 返回后立刻一致；
    # 避免前端乐观更新后被 fetchTask 用仍为 pending 的数据覆盖。
    task.status = "running"  # type: ignore
    task.error_message = None  # type: ignore
    db.commit()
    db.refresh(task)

    background_tasks.add_task(run_evaluation_task, task_id)
    return {"message": "评估已开始执行", "task_id": task_id}


def list_results(db: Session, user_id: int, task_id: int):
    """获取当前用户的评估任务结果列表"""
    repo = EvaluationRepository(db)
    task = repo.get_task_for_user(task_id, user_id, with_test_cases=False)
    if not task:
        raise ResourceNotFoundError("评估任务不存在")
    return repo.list_results_for_task_ordered(task_id)
