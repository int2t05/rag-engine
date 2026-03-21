"""
知识库聚合的数据访问
==================
封装 KnowledgeBase / Document / DocumentChunk / DocumentUpload / ProcessingTask 的查询，
所有方法均显式体现「按 user_id 或 kb 归属」的约束，避免在路由层散落重复 SQL。
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional, Sequence

from sqlalchemy import delete, func
from sqlalchemy.orm import Session, joinedload, selectinload

from app.models.chat import chat_knowledge_bases
from app.models.evaluation import EvaluationTask
from app.models.knowledge import (
    Document,
    DocumentChunk,
    DocumentUpload,
    KnowledgeBase,
    ProcessingTask,
)


class KnowledgeRepository:
    """知识库域仓储：持有 Session，不负责业务级事务边界（由 service 决定 commit/rollback）。"""

    def __init__(self, db: Session) -> None:
        self.db = db

    def get_owned_kb(self, kb_id: int, user_id: int) -> Optional[KnowledgeBase]:
        """按主键与用户 ID 取知识库；无则 None。"""
        return (
            self.db.query(KnowledgeBase)
            .filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == user_id)
            .first()
        )

    def list_owned_kbs(
        self, user_id: int, skip: int = 0, limit: int = 100
    ) -> List[KnowledgeBase]:
        """当前用户的知识库列表（分页）。"""
        return (
            self.db.query(KnowledgeBase)
            .filter(KnowledgeBase.user_id == user_id)
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_kb_detail_loaded(self, kb_id: int, user_id: int) -> Optional[KnowledgeBase]:
        """详情页：预加载 documents 及其 processing_tasks。"""
        return (
            self.db.query(KnowledgeBase)
            .options(
                joinedload(KnowledgeBase.documents).joinedload(Document.processing_tasks)
            )
            .filter(KnowledgeBase.id == kb_id, KnowledgeBase.user_id == user_id)
            .first()
        )

    def list_pending_upload_tasks_for_kb(self, kb_id: int) -> List[ProcessingTask]:
        """某知识库下「待处理/处理中」且尚未绑定 Document 的上传任务（用于详情 pending 列表）。"""
        return (
            self.db.query(ProcessingTask)
            .options(joinedload(ProcessingTask.document_upload))
            .filter(
                ProcessingTask.knowledge_base_id == kb_id,
                ProcessingTask.document_id.is_(None),
                ProcessingTask.status.in_(["pending", "processing"]),
            )
            .all()
        )

    def find_document_by_name_and_hash(
        self, kb_id: int, file_name: str, file_hash: str
    ) -> Optional[Document]:
        """同库内按文件名与内容哈希查重（上传去重）。"""
        return (
            self.db.query(Document)
            .filter(
                Document.file_name == file_name,
                Document.file_hash == file_hash,
                Document.knowledge_base_id == kb_id,
            )
            .first()
        )

    def get_document_owned(
        self, kb_id: int, doc_id: int, user_id: int
    ) -> Optional[Document]:
        """文档归属：必须在指定知识库且知识库属于 user_id。"""
        return (
            self.db.query(Document)
            .join(KnowledgeBase)
            .filter(
                Document.id == doc_id,
                Document.knowledge_base_id == kb_id,
                KnowledgeBase.user_id == user_id,
            )
            .first()
        )

    def get_upload_owned(
        self, kb_id: int, upload_id: int, user_id: int
    ) -> Optional[DocumentUpload]:
        """上传记录归属校验（预览临时文件路径）。"""
        return (
            self.db.query(DocumentUpload)
            .join(KnowledgeBase)
            .filter(
                DocumentUpload.id == upload_id,
                DocumentUpload.knowledge_base_id == kb_id,
                KnowledgeBase.user_id == user_id,
            )
            .first()
        )

    def get_document_for_delete(
        self, kb_id: int, doc_id: int, user_id: int
    ) -> Optional[Document]:
        """删除文档前加载行（与 get_document_owned 相同语义，命名区分用途）。"""
        return self.get_document_owned(kb_id, doc_id, user_id)

    def list_chunk_id_strings(self, document_id: int) -> List[str]:
        """某文档下所有分块 ID（字符串），供向量库按 ID 删除。"""
        rows = (
            self.db.query(DocumentChunk.id)
            .filter(DocumentChunk.document_id == document_id)
            .all()
        )
        return [str(row[0]) for row in rows]

    def delete_processing_tasks_for_document(self, document_id: int) -> None:
        """删除某文档关联的处理任务记录（同步删除，不 commit）。"""
        self.db.query(ProcessingTask).filter(
            ProcessingTask.document_id == document_id,
        ).delete(synchronize_session=False)

    def count_chunks(self, document_id: int) -> int:
        """文档分块数量。"""
        return (
            self.db.query(func.count(DocumentChunk.id))
            .filter(DocumentChunk.document_id == document_id)
            .scalar()
            or 0
        )

    def get_uploads_by_ids(self, upload_ids: Sequence[int]) -> List[DocumentUpload]:
        """按主键批量取上传记录（不校验用户；调用方需保证 ID 来源可信）。"""
        if not upload_ids:
            return []
        return (
            self.db.query(DocumentUpload).filter(DocumentUpload.id.in_(upload_ids)).all()
        )

    def add_processing_tasks(self, tasks: List[ProcessingTask]) -> None:
        """批量加入会话（由上层 commit）。"""
        self.db.add_all(tasks)

    def list_running_upload_ids_subquery(self):
        """存在 pending/processing 任务的上传 ID 子查询（清理临时文件时排除）。"""
        return (
            self.db.query(ProcessingTask.document_upload_id)
            .filter(
                ProcessingTask.document_upload_id.isnot(None),
                ProcessingTask.status.in_(["pending", "processing"]),
            )
            .distinct()
        )

    def list_stale_uploads(
        self, cutoff: datetime, running_upload_ids_subq
    ) -> List[DocumentUpload]:
        """早于 cutoff 且不在运行任务中的上传记录。"""
        return (
            self.db.query(DocumentUpload)
            .filter(
                DocumentUpload.created_at < cutoff,
                ~DocumentUpload.id.in_(running_upload_ids_subq),
            )
            .all()
        )

    def delete_tasks_for_upload_ids(self, upload_ids: Sequence[int]) -> int:
        """删除指定上传 ID 关联的 ProcessingTask；返回删除行数（近似）。"""
        if not upload_ids:
            return 0
        return (
            self.db.query(ProcessingTask)
            .filter(ProcessingTask.document_upload_id.in_(upload_ids))
            .delete(synchronize_session=False)
        )

    def delete_orphan_processing_tasks(self) -> int:
        """document_upload_id 与 document_id 均为空的孤立任务。"""
        return (
            self.db.query(ProcessingTask)
            .filter(
                ProcessingTask.document_upload_id.is_(None),
                ProcessingTask.document_id.is_(None),
            )
            .delete(synchronize_session=False)
        )

    def delete_upload_row(self, upload: DocumentUpload) -> None:
        """从会话删除一条上传记录（随后 commit）。"""
        self.db.delete(upload)

    def get_processing_tasks_for_kb(
        self, kb_id: int, task_ids: Sequence[int]
    ) -> List[ProcessingTask]:
        """某知识库下指定任务 ID 列表（用于轮询状态）；需路由层已校验 kb 归属。"""
        if not task_ids:
            return []
        return (
            self.db.query(ProcessingTask)
            .options(selectinload(ProcessingTask.document_upload))
            .filter(
                ProcessingTask.id.in_(task_ids),
                ProcessingTask.knowledge_base_id == kb_id,
            )
            .all()
        )

    def unlink_kb_from_chats(self, kb_id: int) -> None:
        """删除知识库前：解除多对多关联，避免外键错误。"""
        self.db.execute(
            delete(chat_knowledge_bases).where(
                chat_knowledge_bases.c.knowledge_base_id == kb_id
            )
        )

    def nullify_evaluation_tasks_kb(self, kb_id: int) -> None:
        """删除知识库前：评估任务外键置空。"""
        self.db.query(EvaluationTask).filter(
            EvaluationTask.knowledge_base_id == kb_id
        ).update({EvaluationTask.knowledge_base_id: None}, synchronize_session=False)

    def delete_kb_row(self, kb: KnowledgeBase) -> None:
        """删除知识库 ORM 行（依赖 cascade 删子表；随后 commit）。"""
        self.db.delete(kb)
