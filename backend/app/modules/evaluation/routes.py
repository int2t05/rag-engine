"""
RAG 评估 API
============
评估任务的 CRUD、创建任务、触发执行、查询状态与结果。
根据《RAG评估业务流程最佳实践》实现。
"""

from typing import Any, List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import require_active_ai_runtime
from app.core.exceptions import BadRequestError, ResourceNotFoundError
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.ai_runtime import AiRuntimeSettings
from app.schemas.evaluation import (
    EvaluationResolveResponse,
    EvaluationResultResponse,
    EvaluationTaskCreate,
    EvaluationTaskResponse,
    TestCaseBatchImport,
    TestCaseBatchImportResult,
)
from app.modules.evaluation.evaluation_config import get_evaluation_types_config
from app.modules.evaluation.task_api_service import (
    create_task,
    delete_task,
    get_task_detail,
    import_test_cases,
    list_results,
    list_tasks,
    resolve_task,
    schedule_run,
)

router = APIRouter()


@router.get("/types", response_model=List[dict])
def get_evaluation_types(
    current_user: User = Depends(get_current_user),
) -> Any:
    """评估类型与指标说明（创建任务时下拉用）。"""
    return get_evaluation_types_config()


@router.post("", response_model=EvaluationTaskResponse)
def create_evaluation_task(
    *,
    db: Session = Depends(get_db),
    task_in: EvaluationTaskCreate,
    current_user: User = Depends(get_current_user),
    _rt: AiRuntimeSettings = Depends(require_active_ai_runtime),
) -> Any:
    """创建评估任务及初始测试用例。"""
    try:
        return create_task(db, current_user.id, task_in)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e


@router.get("", response_model=List[EvaluationTaskResponse])
def list_evaluation_tasks(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 100,
) -> Any:
    """当前用户可见的评估任务列表。"""
    return list_tasks(db, current_user.id, skip=skip, limit=limit)


@router.post("/{task_id}/test-cases/import", response_model=TestCaseBatchImportResult)
def import_evaluation_test_cases(
    task_id: int,
    body: TestCaseBatchImport,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rt: AiRuntimeSettings = Depends(require_active_ai_runtime),
) -> Any:
    """向已有任务批量追加测试用例。"""
    try:
        return import_test_cases(db, current_user.id, task_id, body)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e
    except BadRequestError as e:
        raise HTTPException(status_code=400, detail=e.detail) from e


@router.get("/resolve/{task_id}", response_model=EvaluationResolveResponse)
def resolve_evaluation_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """详情轮询：不存在时 ok=false 仍 200。"""
    return resolve_task(db, current_user.id, task_id)


@router.get("/{task_id}", response_model=EvaluationTaskResponse)
def get_evaluation_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """单任务详情（含测试用例）。"""
    try:
        return get_task_detail(db, current_user.id, task_id)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e


@router.delete("/{task_id}")
def delete_evaluation_task(
    task_id: int,
    force: bool = Query(
        False,
        description="为 true 时允许删除执行中的任务（后台进程可能仍会短暂写入，请谨慎使用）",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """删除任务（级联结果与用例）。"""
    try:
        return delete_task(db, current_user.id, task_id, force)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e
    except BadRequestError as e:
        raise HTTPException(status_code=400, detail=e.detail) from e


@router.post("/{task_id}/run")
def run_evaluation(
    task_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rt: AiRuntimeSettings = Depends(require_active_ai_runtime),
) -> Any:
    """后台触发 RAGAS 评估流水线。"""
    try:
        return schedule_run(db, current_user.id, task_id, background_tasks)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e
    except BadRequestError as e:
        raise HTTPException(status_code=400, detail=e.detail) from e


@router.get("/{task_id}/results", response_model=List[EvaluationResultResponse])
def get_evaluation_results(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Any:
    """任务评估结果明细。"""
    try:
        return list_results(db, current_user.id, task_id)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e
