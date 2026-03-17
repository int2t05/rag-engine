"""
分块记录管理
============
管理 document_chunks 表，实现增量更新：
- 相同 hash 的块不重复插入
- 文档更新后，删除已不存在的旧块
"""

from typing import Optional, List, Dict, Set
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.knowledge import DocumentChunk
import json


class ChunkRecord:
    """分块记录管理器，支持按文件增量更新"""

    def __init__(self, kb_id: int):
        self.kb_id = kb_id
        self.engine = create_engine(
            settings.get_database_url
        )  # 创建独立的数据库连接引擎

    def list_chunks(self, file_name: Optional[str] = None) -> Set[str]:
        """列出给定文件的所有块散列"""
        with Session(self.engine) as session:
            # with 语句是 Python 专门用来管理需要手动释放的资源
            query = session.query(DocumentChunk.hash).filter(
                DocumentChunk.kb_id == self.kb_id
            )

            if file_name:
                query = query.filter(DocumentChunk.file_name == file_name)

            return {row[0] for row in query.all()}

    def add_chunks(self, chunks: List[Dict]):
        """向数据库添加新块"""
        if not chunks:
            return

        with Session(self.engine) as session:
            for chunk_data in chunks:
                chunk = DocumentChunk(
                    id=chunk_data["id"],
                    kb_id=chunk_data["kb_id"],
                    document_id=chunk_data["document_id"],
                    file_name=chunk_data["file_name"],
                    chunk_metadata=chunk_data["metadata"],
                    hash=chunk_data["hash"],
                )
                session.merge(chunk)  # 使用合并而不是添加来处理更新
            session.commit()

    def delete_chunks(self, chunk_ids: List[str]):
        """按id删除块"""
        if not chunk_ids:
            return

        with Session(self.engine) as session:
            session.query(DocumentChunk).filter(
                DocumentChunk.kb_id == self.kb_id, DocumentChunk.id.in_(chunk_ids)
            ).delete(
                synchronize_session=False
            )  # 直接删除 不加载到内存
            session.commit()

    def get_deleted_chunks(
        self, current_hashes: Set[str], file_name: Optional[str] = None
    ) -> List[str]:
        """获取当前版本中不再存在的块的ID"""
        with Session(self.engine) as session:
            query = session.query(DocumentChunk.id).filter(
                DocumentChunk.kb_id == self.kb_id
            )

            if file_name:
                query = query.filter(DocumentChunk.file_name == file_name)

            if current_hashes:
                query = query.filter(DocumentChunk.hash.notin_(current_hashes))

            return [row[0] for row in query.all()]  # 返回ids
