"""
知识库相关 Pydantic 模型
=======================
"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel


class KnowledgeBaseBase(BaseModel):
    """知识库基础字段"""
    name: str
    description: Optional[str] = None


class KnowledgeBaseCreate(KnowledgeBaseBase):
    """创建知识库的请求体"""
    pass


class KnowledgeBaseUpdate(KnowledgeBaseBase):
    """更新知识库的请求体"""
    pass


class DocumentBase(BaseModel):
    """文档基础字段"""
    file_name: str
    file_path: str
    file_hash: str
    file_size: int
    content_type: str


class DocumentCreate(DocumentBase):
    """创建文档的请求体"""
    knowledge_base_id: int


class DocumentUploadBase(BaseModel):
    """上传记录的字段"""
    file_name: str
    file_hash: str
    file_size: int
    content_type: str
    temp_path: str
    status: str = "pending"
    error_message: Optional[str] = None


class DocumentUploadCreate(DocumentUploadBase):
    """创建上传记录的请求体"""
    knowledge_base_id: int


class DocumentUploadResponse(DocumentUploadBase):
    """上传记录的响应"""
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ProcessingTaskBase(BaseModel):
    """处理任务基础字段"""
    status: str
    error_message: Optional[str] = None


class ProcessingTaskCreate(ProcessingTaskBase):
    """创建处理任务的请求体"""
    document_id: int
    knowledge_base_id: int


class ProcessingTask(ProcessingTaskBase):
    """处理任务的响应"""
    id: int
    document_id: int
    knowledge_base_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DocumentResponse(DocumentBase):
    """文档的 API 响应，包含处理任务列表"""
    id: int
    knowledge_base_id: int
    created_at: datetime
    updated_at: datetime
    processing_tasks: List[ProcessingTask] = []

    class Config:
        from_attributes = True


class KnowledgeBaseResponse(KnowledgeBaseBase):
    """知识库的 API 响应，包含文档列表"""
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    documents: List[DocumentResponse] = []

    class Config:
        from_attributes = True


class PreviewRequest(BaseModel):
    """文档分块预览的请求体"""
    document_ids: List[int]  # 要预览的文档（或上传记录）ID
    chunk_size: int = 1000   # 每个块的最大字符数
    chunk_overlap: int = 200  # 块之间的重叠字符数，保持上下文连贯
