"""
RAG 评估 API
============
评估任务的 CRUD、创建任务、触发执行、查询状态与结果。
根据《RAG评估业务流程最佳实践》实现。
"""

from typing import Any, List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.core.security import get_current_user
from app.db.session import get_db
from app.models.evaluation import (
    EvaluationResult,
    EvaluationTask,
    EvaluationTestCase,
)
from app.models.knowledge import KnowledgeBase
from app.models.user import User
from app.services.evaluation import run_evaluation_task
from app.services.evaluation.evaluation_config import get_evaluation_types_config
from app.schemas.evaluation import (
    EvaluationTaskCreate,
    EvaluationTaskResponse,
    EvaluationResultResponse,
    TestCaseBatchImport,
    TestCaseBatchImportResult,
)

router = APIRouter()


@router.get("/types", response_model=List[dict])
def get_evaluation_types(
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    获取评估类型配置列表。
    返回各类型的说明、适用指标，供创建任务时选择。
    """
    return get_evaluation_types_config()


@router.post("", response_model=EvaluationTaskResponse)
def create_evaluation_task(
    *,
    db: Session = Depends(get_db),
    task_in: EvaluationTaskCreate,
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    创建评估任务（含测试用例）。
    若指定 knowledge_base_id，需校验该知识库属于当前用户。
    """
    if task_in.knowledge_base_id:
        kb = (
            db.query(KnowledgeBase)
            .filter(
                KnowledgeBase.id == task_in.knowledge_base_id,
                KnowledgeBase.user_id == current_user.id,
            )
            .first()
        )
        if not kb:
            raise HTTPException(status_code=404, detail="知识库不存在或无权访问")

    task = EvaluationTask(
        name=task_in.name,
        description=task_in.description,
        knowledge_base_id=task_in.knowledge_base_id,
        top_k=task_in.top_k,
        evaluation_type=task_in.evaluation_type,
        evaluation_metrics=task_in.evaluation_metrics,
        status="pending",
        created_by=current_user.id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    for tc_in in task_in.test_cases:
        tc = EvaluationTestCase(
            task_id=task.id,
            query=tc_in.query,
            reference=tc_in.reference,
            source="manual",
        )
        db.add(tc)
    db.commit()
    db.refresh(task)
    return task


@router.get("", response_model=List[EvaluationTaskResponse])
def list_evaluation_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """获取当前用户的评估任务列表"""
    tasks = (
        db.query(EvaluationTask)
        .filter(EvaluationTask.created_by == current_user.id)
        .order_by(EvaluationTask.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return tasks


@router.post("/{task_id}/test-cases/import", response_model=TestCaseBatchImportResult)
def import_evaluation_test_cases(
    task_id: int,
    body: TestCaseBatchImport,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """
    向已有评估任务批量追加测试用例（JSON 与创建任务时 test_cases 字段结构相同）。
    执行中任务不可导入；问题为空的条目会跳过并计入 skipped。
    """
    task = (
        db.query(EvaluationTask)
        .filter(
            EvaluationTask.id == task_id,
            EvaluationTask.created_by == current_user.id,
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="评估任务不存在")
    if task.status == "running":
        raise HTTPException(status_code=400, detail="任务执行中，无法导入测试用例")

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
        db.add(tc)
        imported += 1
    db.commit()
    return TestCaseBatchImportResult(
        task_id=task.id,
        imported=imported,
        skipped=skipped,
    )


@router.get("/{task_id}", response_model=EvaluationTaskResponse)
def get_evaluation_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """获取单个评估任务详情（含测试用例）"""
    task = (
        db.query(EvaluationTask)
        .options(joinedload(EvaluationTask.test_cases))
        .filter(
            EvaluationTask.id == task_id,
            EvaluationTask.created_by == current_user.id,
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="评估任务不存在")
    return task


@router.delete("/{task_id}")
def delete_evaluation_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """删除评估任务（级联删除测试用例与结果）"""
    task = (
        db.query(EvaluationTask)
        .filter(
            EvaluationTask.id == task_id,
            EvaluationTask.created_by == current_user.id,
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="评估任务不存在")
    if task.status == "running":
        raise HTTPException(status_code=400, detail="任务正在执行中，无法删除")

    db.delete(task)
    db.commit()
    return {"message": "删除成功", "task_id": task_id}


@router.post("/{task_id}/run")
def run_evaluation(
    task_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """触发评估任务后台执行"""
    task = (
        db.query(EvaluationTask)
        .filter(
            EvaluationTask.id == task_id,
            EvaluationTask.created_by == current_user.id,
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="评估任务不存在")
    if task.status == "running":
        raise HTTPException(status_code=400, detail="任务正在执行中")

    background_tasks.add_task(run_evaluation_task, task_id)
    return {"message": "评估已开始执行", "task_id": task_id}


@router.get("/{task_id}/results", response_model=List[EvaluationResultResponse])
def get_evaluation_results(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """获取评估任务详细结果"""
    task = (
        db.query(EvaluationTask)
        .filter(
            EvaluationTask.id == task_id,
            EvaluationTask.created_by == current_user.id,
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="评估任务不存在")

    results = (
        db.query(EvaluationResult)
        .filter(EvaluationResult.task_id == task_id)
        .order_by(EvaluationResult.id)
        .all()
    )
    return results
