"""
RAG 评估 API
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.db.session import get_db
from app.models.user import User
from app.core.security import get_current_user
from app.models.evaluation import EvaluationTask, EvaluationTestCase, EvaluationResult
from app.models.knowledge import KnowledgeBase

router = APIRouter()


# ============ Schemas ============

class TestCaseCreate(BaseModel):
    query: str
    reference: Optional[str] = ""


class EvaluationTaskCreate(BaseModel):
    name: str
    description: Optional[str] = None
    knowledge_base_id: Optional[int] = None
    top_k: int = 5
    evaluation_type: str = "full"
    test_cases: Optional[List[TestCaseCreate]] = []


class EvaluationTaskResponse(BaseModel):
    id: int
    name: str
    status: str
    knowledge_base_id: Optional[int]
    top_k: int
    evaluation_type: str
    summary: Optional[dict]
    test_case_count: int

    class Config:
        from_attributes = True


class EvaluationResultResponse(BaseModel):
    query: str
    reference: Optional[str]
    retrieved_contexts: Optional[List[str]]
    generated_answer: Optional[str]
    context_relevance: Optional[float]
    faithfulness: Optional[float]
    answer_relevance: Optional[float]
    ragas_score: Optional[float]
    passed: Optional[int]
    judge_details: Optional[dict]


# ============ Routes ============

@router.post("/", response_model=EvaluationTaskResponse)
async def create_evaluation_task(
    task_in: EvaluationTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """创建评估任务"""
    # 验证知识库归属
    if task_in.knowledge_base_id:
        kb = db.query(KnowledgeBase).filter(
            KnowledgeBase.id == task_in.knowledge_base_id,
            KnowledgeBase.user_id == current_user.id,
        ).first()
        if not kb:
            raise HTTPException(status_code=404, detail="知识库不存在")

    task = EvaluationTask(
        name=task_in.name,
        description=task_in.description,
        knowledge_base_id=task_in.knowledge_base_id,
        top_k=task_in.top_k,
        evaluation_type=task_in.evaluation_type,
        status="pending",
        created_by=current_user.id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    # 添加测试用例
    if task_in.test_cases:
        cases = [
            EvaluationTestCase(
                task_id=task.id,
                query=tc.query,
                reference=tc.reference or "",
            )
            for tc in task_in.test_cases
        ]
        db.add_all(cases)
        db.commit()

    return EvaluationTaskResponse(
        id=task.id,
        name=task.name,
        status=task.status,
        knowledge_base_id=task.knowledge_base_id,
        top_k=task.top_k,
        evaluation_type=task.evaluation_type,
        summary=task.summary,
        test_case_count=len(task_in.test_cases) if task_in.test_cases else 0,
    )


@router.post("/{task_id}/run")
async def run_evaluation(
    task_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """触发评估执行（后台）"""
    task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="评估任务不存在")
    if task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权限")
    if task.status == "running":
        raise HTTPException(status_code=400, detail="任务正在执行中")

    async def _run():
        from app.services.evaluation.evaluation_service import run_evaluation_task
        run_evaluation_task(task_id)

    background_tasks.add_task(_run)

    return {"message": "评估任务已启动", "task_id": task_id}


@router.get("/", response_model=List[EvaluationTaskResponse])
async def list_evaluation_tasks(
    kb_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """列出评估任务"""
    query = db.query(EvaluationTask).filter(EvaluationTask.created_by == current_user.id)
    if kb_id:
        query = query.filter(EvaluationTask.knowledge_base_id == kb_id)

    tasks = query.order_by(EvaluationTask.created_at.desc()).offset(skip).limit(limit).all()

    result = []
    for t in tasks:
        count = db.query(EvaluationTestCase).filter(EvaluationTestCase.task_id == t.id).count()
        result.append(EvaluationTaskResponse(
            id=t.id, name=t.name, status=t.status,
            knowledge_base_id=t.knowledge_base_id, top_k=t.top_k,
            evaluation_type=t.evaluation_type, summary=t.summary,
            test_case_count=count,
        ))
    return result


@router.get("/{task_id}/results", response_model=List[EvaluationResultResponse])
async def get_evaluation_results(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取评估结果"""
    task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="评估任务不存在")
    if task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权限")

    results = db.query(EvaluationResult).filter(
        EvaluationResult.task_id == task_id
    ).all()

    test_cases = {
        tc.id: tc for tc in db.query(EvaluationTestCase).filter(
            EvaluationTestCase.task_id == task_id
        ).all()
    }

    return [
        EvaluationResultResponse(
            query=test_cases.get(r.test_case_id).query if r.test_case_id else "",
            reference=test_cases.get(r.test_case_id).reference if r.test_case_id else None,
            retrieved_contexts=r.retrieved_contexts,
            generated_answer=r.generated_answer,
            context_relevance=r.context_relevance,
            faithfulness=r.faithfulness,
            answer_relevance=r.answer_relevance,
            ragas_score=r.ragas_score,
            passed=r.passed,
            judge_details=r.judge_details,
        )
        for r in results
    ]


@router.get("/{task_id}", response_model=EvaluationTaskResponse)
async def get_evaluation_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取评估任务详情"""
    task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="评估任务不存在")
    if task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权限")

    count = db.query(EvaluationTestCase).filter(EvaluationTestCase.task_id == task_id).count()
    return EvaluationTaskResponse(
        id=task.id, name=task.name, status=task.status,
        knowledge_base_id=task.knowledge_base_id, top_k=task.top_k,
        evaluation_type=task.evaluation_type, summary=task.summary,
        test_case_count=count,
    )


@router.delete("/{task_id}")
async def delete_evaluation_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除评估任务"""
    task = db.query(EvaluationTask).filter(EvaluationTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="评估任务不存在")
    if task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权限")

    db.delete(task)
    db.commit()
    return {"status": "success"}
