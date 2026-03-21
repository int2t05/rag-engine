"""
知识库领域服务
============
CRUD、文档生命周期、共用向量检索等用例入口。
"""

from app.modules.knowledge.document_service import (
    BATCH_DELETE_DOCS_MAX,
    add_processing_tasks_to_queue,
    batch_delete_documents,
    cleanup_temp_files,
    delete_document_core,
    delete_one_document,
    get_document_detail,
    get_processing_tasks_status,
    preview_kb_documents,
    replace_kb_document,
    submit_document_processing,
    upload_kb_documents,
)
from app.modules.knowledge.knowledge_base_service import (
    create_knowledge_base,
    delete_knowledge_base,
    get_knowledge_base_detail,
    list_knowledge_bases,
    update_knowledge_base,
)
from app.modules.knowledge.retrieval_service import kb_similarity_search

__all__ = [
    "BATCH_DELETE_DOCS_MAX",
    "add_processing_tasks_to_queue",
    "batch_delete_documents",
    "cleanup_temp_files",
    "create_knowledge_base",
    "delete_document_core",
    "delete_knowledge_base",
    "delete_one_document",
    "get_document_detail",
    "get_knowledge_base_detail",
    "get_processing_tasks_status",
    "kb_similarity_search",
    "list_knowledge_bases",
    "preview_kb_documents",
    "replace_kb_document",
    "submit_document_processing",
    "update_knowledge_base",
    "upload_kb_documents",
]
