"""
知识库文档与检索辅助 API
======================
文档上传/预览/处理、任务轮询、删除、临时清理、检索测试。
与 knowledge_base.py 共用前缀 /knowledge-base，由 api.py 依次注册。
"""

import logging
from typing import Any, Dict, List

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    UploadFile,
)
from sqlalchemy.orm import Session

from app.api.deps import require_active_ai_runtime
from app.core.exceptions import BadRequestError, ResourceNotFoundError
from app.core.security import get_current_user
from app.db.session import get_db
from app.models.user import User
from app.schemas.ai_runtime import AiRuntimeSettings
from app.schemas.knowledge import (
    BatchDeleteDocumentsRequest,
    DocumentResponse,
    PreviewRequest,
    TestRetrievalRequest,
)
from app.modules.knowledge.document_processor import PreviewResult
from app.modules.knowledge import (
    batch_delete_documents,
    cleanup_temp_files,
    delete_one_document,
    get_document_detail,
    get_processing_tasks_status,
    kb_similarity_search,
    preview_kb_documents,
    replace_kb_document,
    submit_document_processing,
    upload_kb_documents,
)

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/{kb_id}/documents/upload")
async def upload_kb_documents_endpoint(
    kb_id: int,
    files: List[UploadFile],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rt: AiRuntimeSettings = Depends(require_active_ai_runtime),
):
    """多文件上传到 MinIO 临时区并写入 DocumentUpload。"""
    try:
        return await upload_kb_documents(
            db, current_user.id, kb_id, files, _rt
        )
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e


@router.post("/{kb_id}/documents/preview")
async def preview_kb_documents_endpoint(
    kb_id: int,
    preview_request: PreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> Dict[int, PreviewResult]:
    """按文档或上传 ID 预览分块结果。"""
    try:
        return await preview_kb_documents(
            db, current_user.id, kb_id, preview_request
        )
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e


@router.post("/{kb_id}/documents/process")
async def process_kb_documents_endpoint(
    kb_id: int,
    upload_results: List[dict],
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rt: AiRuntimeSettings = Depends(require_active_ai_runtime),
):
    """
    提交文档处理任务：创建 ProcessingTask 并由后台队列解析与向量化。
    立即返回 task_id 列表供轮询。
    """
    try:
        return submit_document_processing(
            db,
            current_user.id,
            kb_id,
            upload_results,
            background_tasks,
            _rt,
        )
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e


@router.post("/cleanup")
async def cleanup_temp_files_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """清理超时临时上传与孤立任务（全局，不限单个知识库）。"""
    return cleanup_temp_files(db)


@router.get("/{kb_id}/documents/tasks")
async def get_processing_tasks_endpoint(
    kb_id: int,
    task_ids: str = Query(..., description="要检查其状态的任务ID的逗号分隔列表"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """批量查询处理任务状态。"""
    try:
        return get_processing_tasks_status(
            db, current_user.id, kb_id, task_ids
        )
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e


@router.post("/{kb_id}/documents/{doc_id}/replace")
async def replace_document_endpoint(
    kb_id: int,
    doc_id: int,
    file: UploadFile,
    chunk_size: int = Query(
        1000,
        ge=1,
        le=500_000,
        description="分块最大字符数",
    ),
    chunk_overlap: int = Query(
        200,
        ge=0,
        le=500_000,
        description="分块重叠字符数",
    ),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rt: AiRuntimeSettings = Depends(require_active_ai_runtime),
):
    """同名重新上传已入库文档，覆盖 MinIO 并增量更新向量（process_document）。"""
    del _rt  # 依赖用于保证已配置模型；process_document 内再加载运行时
    try:
        return await replace_kb_document(
            db,
            current_user.id,
            kb_id,
            doc_id,
            file,
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
        )
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e
    except BadRequestError as e:
        raise HTTPException(status_code=400, detail=e.detail) from e


@router.get("/{kb_id}/documents/{doc_id}", response_model=DocumentResponse)
async def get_document_endpoint(
    *,
    db: Session = Depends(get_db),
    kb_id: int,
    doc_id: int,
    current_user: User = Depends(get_current_user),
) -> Any:
    """文档详情（含分块数）。"""
    try:
        return get_document_detail(db, current_user.id, kb_id, doc_id)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e


@router.delete("/{kb_id}/documents/{doc_id}")
async def delete_document_endpoint(
    *,
    db: Session = Depends(get_db),
    kb_id: int,
    doc_id: int,
    current_user: User = Depends(get_current_user),
    _rt: AiRuntimeSettings = Depends(require_active_ai_runtime),
) -> Any:
    """删除单篇文档（向量、对象存储、数据库）。"""
    try:
        return delete_one_document(db, current_user.id, kb_id, doc_id, _rt)
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除文档失败: {str(e)}") from e


@router.post("/{kb_id}/documents/batch-delete")
async def batch_delete_documents_endpoint(
    kb_id: int,
    body: BatchDeleteDocumentsRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rt: AiRuntimeSettings = Depends(require_active_ai_runtime),
) -> Any:
    """批量删除文档；逐项执行，互不影响。"""
    try:
        return batch_delete_documents(
            db, current_user.id, kb_id, body.document_ids, _rt
        )
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e
    except BadRequestError as e:
        raise HTTPException(status_code=400, detail=e.detail) from e


@router.post("/test-retrieval")
async def test_retrieval_endpoint(
    request: TestRetrievalRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rt: AiRuntimeSettings = Depends(require_active_ai_runtime),
) -> Any:
    """控制台检索测试：返回带分数的片段列表。"""
    try:
        return kb_similarity_search(
            db,
            current_user.id,
            request.kb_id,
            request.query,
            request.top_k,
            not_found_detail=f"未找到知识库{request.kb_id}",
        )
    except ResourceNotFoundError as e:
        raise HTTPException(status_code=404, detail=e.detail) from e
    except HTTPException:
        raise
    except Exception as e:
        logger.error("test-retrieval 错误: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e)) from e
