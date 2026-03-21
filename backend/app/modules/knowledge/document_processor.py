"""
文档处理服务（核心）
==================
负责文档的解析、分块、向量化和入库。

流程：
1. upload_document：上传到 MinIO（内部用）
2. preview_document：从 MinIO 拉取文件，解析并分块，返回预览
3. process_document_background：后台任务，解析→分块→向量化→写入向量库和 MySQL

注意：解析/向量化等为同步阻塞调用，必须通过 asyncio.to_thread 放到线程池执行，
否则会占满事件循环导致整站 API 无响应。
"""

import asyncio
import logging
import os
import hashlib
import tempfile
import traceback
from datetime import datetime
from app.db.session import SessionLocal
from io import BytesIO
from typing import Optional, List, Dict, Set
from fastapi import UploadFile
from langchain_community.document_loaders import (
    PyPDFLoader,
    Docx2txtLoader,
    UnstructuredMarkdownLoader,
    TextLoader,
)
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_core.documents import Document as LangchainDocument
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.minio import get_minio_client
from app.models.knowledge import ProcessingTask, Document, DocumentChunk, KnowledgeBase
from app.shared.chunk_record import ChunkRecord
from minio.error import MinioException
from minio import Minio
from minio.commonconfig import CopySource
from app.shared.vector_store import VectorStoreFactory
from app.shared.embedding.embedding_factory import EmbeddingsFactory
from app.shared.ai_runtime_loader import AiRuntimeNotConfigured, load_ai_runtime_for_user
from app.shared.ai_runtime_context import reset_ai_runtime_token, set_ai_runtime_token
from app.shared.ai_runtime_scope import ai_runtime_scope


class UploadResult(BaseModel):
    """上传结果"""

    file_path: str
    file_name: str
    file_size: int
    content_type: str
    file_hash: str


class TextChunk(BaseModel):
    """文本分块"""

    content: str
    metadata: Optional[Dict] = None


class PreviewResult(BaseModel):
    """分块预览结果"""

    chunks: List[TextChunk]
    total_chunks: int


async def process_document(
    file_path: str,
    file_name: str,
    kb_id: int,
    document_id: int,
    user_id: int,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> None:
    """
    处理文档并存储到向量数据库，支持增量更新。

    流程：
    1. 预览文档并分块
    2. 计算每块哈希，与现有块对比
    3. 仅插入新增/变更的块，删除已移除的块
    4. 更新向量存储和 ChunkRecord
    """
    logger = logging.getLogger(__name__)

    db = SessionLocal()
    try:
        rt = load_ai_runtime_for_user(db, user_id)
    except AiRuntimeNotConfigured as e:
        db.close()
        raise RuntimeError(e.detail) from e
    tok = set_ai_runtime_token(rt)
    try:
        preview_result = await preview_document(file_path, chunk_size, chunk_overlap)

        # 初始化 embeddings
        logger.info("初始化 embeddings模型...")
        embeddings = EmbeddingsFactory.create()

        logger.info(f"使用集合初始化向量存储：kb_{kb_id}")
        vector_store = VectorStoreFactory.create(
            collection_name=f"kb_{kb_id}",
            embedding_function=embeddings,
        )

        # 初始化块记录管理器
        chunk_manager = ChunkRecord(kb_id)

        # 获取该文件的现有块哈希值
        existing_hashes = chunk_manager.list_chunks(file_name)

        # 准备新的块
        new_chunks = []
        current_hashes = set()
        documents_to_update = []

        for chunk in preview_result.chunks:
            # 与 _process_document_background_sync 一致：先算 chunk_id、再写 metadata、再算 hash
            chunk_id = hashlib.sha256(
                f"{kb_id}:{file_name}:{chunk.content}".encode()
            ).hexdigest()
            meta = dict(chunk.metadata) if chunk.metadata else {}
            meta["source"] = file_name
            meta["kb_id"] = kb_id
            meta["document_id"] = document_id
            meta["chunk_id"] = chunk_id
            chunk_hash = hashlib.sha256(
                (chunk.content + str(meta)).encode()
            ).hexdigest()
            current_hashes.add(chunk_hash)

            if chunk_hash in existing_hashes:
                continue

            # chunk_metadata 与全量入库一致：page_content + 扩充后的 metadata
            chunk_metadata = {"page_content": chunk.content, **meta}

            new_chunks.append(
                {
                    "id": chunk_id,
                    "kb_id": kb_id,
                    "document_id": document_id,
                    "file_name": file_name,
                    "metadata": chunk_metadata,
                    "hash": chunk_hash,
                }
            )

            doc = LangchainDocument(page_content=chunk.content, metadata=meta)
            documents_to_update.append(doc)

        # 向数据库和矢量存储添加新块（向量点 id 与 document_chunks.id 一致，便于删除文档时按 id 清理）
        if new_chunks:
            logger.info(f"添加{len(new_chunks)}个新的/更新的块")
            chunk_manager.add_chunks(new_chunks)
            vector_store.add_documents(
                documents_to_update,
                ids=[c["id"] for c in new_chunks],
            )

        # 删除移动的数据块
        chunks_to_delete = chunk_manager.get_deleted_chunks(current_hashes, file_name)
        if chunks_to_delete:
            logger.info(f"删除{len(chunks_to_delete)}个移动的块")
            chunk_manager.delete_chunks(chunks_to_delete)
            vector_store.delete(chunks_to_delete)

        logger.info("文档处理成功完成")

    except Exception as e:
        logger.error(f"处理错误的文件: {str(e)}")
        raise
    finally:
        reset_ai_runtime_token(tok)
        db.close()


async def upload_document(file: UploadFile, kb_id: int) -> UploadResult:
    """
    将文档上传到 MinIO 对象存储。

    文件路径格式：kb_{kb_id}/{清理后的文件名}
    返回文件路径、大小、哈希等元数据，用于后续处理流程。
    """
    content = await file.read()
    file_size = len(content)

    file_hash = hashlib.sha256(content).hexdigest()

    # 清理和规范化文件名
    file_name = "".join(c for c in file.filename if c.isalnum() or c in ("-", "_", ".")).strip()  # type: ignore
    object_path = f"kb_{kb_id}/{file_name}"

    content_types = {
        ".pdf": "application/pdf",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ".md": "text/markdown",
        ".txt": "text/plain",
    }

    _, ext = os.path.splitext(file_name)  # 文件扩展名
    content_type = content_types.get(ext.lower(), "application/octet-stream")

    # 上传到MinIO
    minio_client = get_minio_client()
    try:
        minio_client.put_object(
            bucket_name=settings.MINIO_BUCKET_NAME,
            object_name=object_path,
            data=BytesIO(content),  # 内存文件流
            length=file_size,
            content_type=content_type,
        )
    except Exception as e:
        logging.error(f"无法将文件上载到MinIO: {str(e)}")
        raise

    return UploadResult(
        file_path=object_path,
        file_name=file_name,
        file_size=file_size,
        content_type=content_type,
        file_hash=file_hash,
    )


async def preview_document(
    file_path: str, chunk_size: int = 1000, chunk_overlap: int = 200
) -> PreviewResult:
    """
    从 MinIO 下载文件，解析并分块，返回预览结果。

    支持格式：PDF、DOCX、Markdown、TXT。
    使用 RecursiveCharacterTextSplitter 进行递归分块。
    """
    # 从MinIO获取文件
    minio_client = get_minio_client()
    _, ext = os.path.splitext(file_path)
    ext = ext.lower()

    # 下载到临时文件
    # 先生成唯一临时路径再关闭，避免 Windows 上文件锁冲突
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    temp_path = temp_file.name
    temp_file.close()

    minio_client.fget_object(
        bucket_name=settings.MINIO_BUCKET_NAME,
        object_name=file_path,
        file_path=temp_path,
    )

    try:
        # 选择适当的加载程序
        if ext == ".pdf":
            loader = PyPDFLoader(temp_path)
        elif ext == ".docx":
            loader = Docx2txtLoader(temp_path)
        elif ext == ".md":
            loader = UnstructuredMarkdownLoader(temp_path)
        else:  # 默认为文本加载器
            loader = TextLoader(temp_path, encoding="utf-8")

        # 加载和拆分文档 递归分块
        documents = loader.load()
        text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size, chunk_overlap=chunk_overlap
        )
        chunks = text_splitter.split_documents(documents)

        # 转换为预览格式
        preview_chunks = [
            TextChunk(content=chunk.page_content, metadata=chunk.metadata)
            for chunk in chunks
        ]

        return PreviewResult(chunks=preview_chunks, total_chunks=len(chunks))
    finally:
        # 手动删除临时文件
        os.unlink(temp_path)


def _process_document_background_sync(
    temp_path: str,
    file_name: str,
    kb_id: int,
    task_id: int,
    db: Session = None,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
    user_id: Optional[int] = None,
) -> None:
    """
    后台文档处理主流程（同步实现，在线程池中运行）。

    流程：
    1. 从 MinIO 临时目录下载文件
    2. 解析文档并分块
    3. 向量化并写入向量存储
    4. 将文件移至永久目录，创建 Document 和 DocumentChunk 记录
    5. 更新 ProcessingTask 和 DocumentUpload 状态
    """
    logger = logging.getLogger(__name__)
    logger.info(f"正在启动任务{task_id}的后台处理, 文件名: {file_name}")

    # 如果不传入db，则创建一个新数据库会话
    if db is None:
        db = SessionLocal()
        should_close_db = True
    else:
        should_close_db = False

    task = db.query(ProcessingTask).get(task_id)
    if not task:
        logger.error(f"找不到任务{task_id}")
        return

    uid = user_id
    if uid is None:
        kb_row = db.query(KnowledgeBase).filter(KnowledgeBase.id == kb_id).first()
        uid = kb_row.user_id if kb_row else None

    try:
        logger.info(f"任务 {task_id}：设置状态为processing")
        task.status = "processing"  # type: ignore
        db.commit()

        # 1. 从临时目录下载文件
        minio_client = get_minio_client()
        try:
            # 使用跨平台临时目录（Windows 下 /tmp 可能不存在）
            local_temp_path = os.path.join(
                tempfile.gettempdir(), f"temp_{task_id}_{file_name}"
            )
            logger.info(
                f"任务{task_id}：将文件从MinIO下载到{local_temp_path}：{temp_path}"
            )
            minio_client.fget_object(
                bucket_name=settings.MINIO_BUCKET_NAME,
                object_name=temp_path,
                file_path=local_temp_path,
            )
            logger.info(f"任务{task_id}：文件下载成功")
        except MinioException as e:
            error_msg = f"无法下载临时文件: {str(e)}"
            logger.error(f"任务{task_id}：{error_msg}")
            raise Exception(error_msg)

        try:
            # 2. 加载和分块文档
            _, ext = os.path.splitext(file_name)
            ext = ext.lower()

            logger.info(f"任务{task_id}：加载扩展名为{ext}的文档")
            # 选择合适的加载器
            if ext == ".pdf":
                loader = PyPDFLoader(local_temp_path)
            elif ext == ".docx":
                loader = Docx2txtLoader(local_temp_path)
            elif ext == ".md":
                loader = UnstructuredMarkdownLoader(local_temp_path)
            else:  # 默认使用文本加载器
                loader = TextLoader(local_temp_path, encoding="utf-8")

            logger.info(f"任务 {task_id}：加载文档内容")
            documents = loader.load()
            logger.info(f"任务{task_id}：文档加载成功")

            logger.info(f"任务{task_id}：将文档拆分为块")
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=chunk_size, chunk_overlap=chunk_overlap
            )
            chunks = text_splitter.split_documents(documents)
            logger.info(f"任务{task_id}：文档拆分为{len(chunks)}个块")

            if uid is None:
                raise Exception("无法确定知识库所属用户，无法加载嵌入配置")

            try:
                rt = load_ai_runtime_for_user(db, uid)
            except AiRuntimeNotConfigured as e:
                raise Exception(e.detail) from e
            tok = set_ai_runtime_token(rt)
            try:
                # 3. 创建向量存储
                logger.info(f"任务 {task_id}：初始化vector store")
                embeddings = EmbeddingsFactory.create()

                vector_store = VectorStoreFactory.create(
                    collection_name=f"kb_{kb_id}",
                    embedding_function=embeddings,
                )

                # 4. 将临时文件移动到永久目录
                permanent_path = f"kb_{kb_id}/{file_name}"
                try:
                    logger.info(f"任务{task_id}：将文件移动到永久存储")
                    # 复制到永久目录
                    source = CopySource(settings.MINIO_BUCKET_NAME, temp_path)
                    minio_client.copy_object(
                        bucket_name=settings.MINIO_BUCKET_NAME,
                        object_name=permanent_path,
                        source=source,
                    )
                    logger.info(f"任务{task_id}：文件已移动到永久存储")
                    # MinIO 临时对象在处理链全部成功后再删除（见下方 commit 之后），
                    # 避免处理中途临时路径仍被依赖时与「清理」或重试逻辑冲突。
                except MinioException as e:
                    error_msg = f"无法将文件移动到永久存储：{str(e)}"
                    logger.error(f"任务{task_id}：{error_msg}")
                    raise Exception(error_msg)

                # 5. 创建文档记录
                logger.info(f"任务{task_id}：创建文档记录")
                document = Document(
                    file_name=file_name,
                    file_path=permanent_path,
                    file_hash=task.document_upload.file_hash,
                    file_size=task.document_upload.file_size,
                    content_type=task.document_upload.content_type,
                    knowledge_base_id=kb_id,
                )
                db.add(document)
                db.commit()
                db.refresh(document)
                logger.info(f"任务{task_id}：使用ID {document.id}创建的文档记录")

                # 立即关联任务与文档（此前仅在 completed 时写入 document_id，导致
                # Document.processing_tasks 在处理阶段为空，知识库详情无法展示「处理中」）
                task.document_id = document.id  # type: ignore
                db.commit()

                # 6. 存储文档块
                logger.info(f"任务 {task_id}：存储文档块")
                vector_chunk_ids: List[str] = []
                for i, chunk in enumerate(chunks):
                    # 为每个 chunk 生成唯一的 ID
                    chunk_id = hashlib.sha256(
                        f"{kb_id}:{file_name}:{chunk.page_content}".encode()
                    ).hexdigest()
                    vector_chunk_ids.append(chunk_id)

                    chunk.metadata["source"] = file_name
                    chunk.metadata["kb_id"] = kb_id
                    chunk.metadata["document_id"] = document.id
                    chunk.metadata["chunk_id"] = chunk_id

                    doc_chunk = DocumentChunk(
                        id=chunk_id,  # 添加 ID 字段
                        document_id=document.id,
                        kb_id=kb_id,
                        file_name=file_name,
                        chunk_metadata={
                            "page_content": chunk.page_content,
                            **chunk.metadata,
                        },
                        hash=hashlib.sha256(
                            (chunk.page_content + str(chunk.metadata)).encode()
                        ).hexdigest(),
                    )
                    db.add(doc_chunk)
                    if i > 0 and i % 100 == 0:
                        logger.info(f"任务 {task_id}：存储{i}块")
                        db.commit()  # 每 100 条提交一次，避免事务太大

                # 7. 添加到向量存储（点 id 与 document_chunks.id 一致，删除文档时 _delete_document_core 才能删掉向量）
                logger.info(f"任务{task_id}：将块添加到向量存储")
                vector_store.add_documents(chunks, ids=vector_chunk_ids)
                # 移除 persist() 调用，因为新版本不需要
                logger.info(f"任务{task_id}：已将块添加到向量存储")
            finally:
                reset_ai_runtime_token(tok)

            # 8. 更新任务状态
            logger.info(f"任务{task_id}：正在将任务状态更新为completed")
            task.status = "completed"  # type: ignore

            # 9. 更新上传记录状态
            upload = task.document_upload  # 直接通过关系获取
            if upload:
                logger.info(f"任务{task_id}：将上传记录状态更新为completed")
                upload.status = "completed"

            db.commit()
            logger.info(f"任务{task_id}：处理成功完成")

            try:
                logger.info(f"任务{task_id}：从 MinIO 删除临时对象（处理已完成）")
                minio_client.remove_object(
                    bucket_name=settings.MINIO_BUCKET_NAME, object_name=temp_path
                )
                logger.info(f"任务{task_id}：已删除 MinIO 临时对象")
            except Exception as e:
                logger.warning(
                    f"任务{task_id}：删除 MinIO 临时对象失败（可稍后手动清理）：{e}"
                )

        finally:
            # 清理本地临时文件
            try:
                if os.path.exists(local_temp_path):
                    logger.info(f"任务{task_id}：清理本地临时文件")
                    os.remove(local_temp_path)
                    logger.info(f"任务{task_id}：已清理本地临时文件")
            except Exception as e:
                logger.warning(f"任务{task_id}：无法清理本地临时文件：{str(e)}")

    except Exception as e:
        logger.error(f"任务{task_id}：错误处理文档：{str(e)}")
        logger.error(f"任务{task_id}：堆栈跟踪：{traceback.format_exc()}")
        task.status = "failed"  # type: ignore
        task.error_message = str(e)  # type: ignore
        db.commit()

        # 清理临时文件
        try:
            logger.info(f"任务 {task_id}：错误后清理临时文件")
            minio_client.remove_object(
                bucket_name=settings.MINIO_BUCKET_NAME, object_name=temp_path
            )
            logger.info(f"任务{task_id}：出错后清理临时文件")
        except Exception as e:
            logger.warning(f"任务{task_id}：出错后无法清理临时文件：{e}")
    finally:
        # 如果创建了db会话，则关闭
        if should_close_db and db:
            db.close()


async def process_document_background(
    temp_path: str,
    file_name: str,
    kb_id: int,
    task_id: int,
    db: Session = None,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
    user_id: Optional[int] = None,
) -> None:
    """在线程池中执行重 CPU/IO 的同步处理，避免阻塞 asyncio 事件循环。"""
    await asyncio.to_thread(
        _process_document_background_sync,
        temp_path,
        file_name,
        kb_id,
        task_id,
        db,
        chunk_size,
        chunk_overlap,
        user_id,
    )
