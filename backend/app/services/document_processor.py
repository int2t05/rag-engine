"""
文档处理服务（核心）
==================
负责文档的解析、分块、向量化和入库。

流程：
1. upload_document：上传到 MinIO（内部用）
2. preview_document：从 MinIO 拉取文件，解析并分块，返回预览
3. process_document_background：后台任务，解析→分块→向量化→写入向量库和 MySQL
"""

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
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_core.documents import Document as LangchainDocument
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.minio import get_minio_client
from app.models.knowledge import ProcessingTask, Document, DocumentChunk
from app.services.chunk_record import ChunkRecord
import uuid
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import UnstructuredFileLoader
from minio.error import MinioException
from minio import Minio
from minio.commonconfig import CopySource
from app.services.vector_store import VectorStoreFactory
from app.services.embedding.embedding_factory import EmbeddingsFactory


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
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> None:
    """
    处理文档并存储在矢量数据库中，并进行增量更新
    """
    logger = logging.getLogger(__name__)

    try:
        preview_result = await preview_document(file_path, chunk_size, chunk_overlap)

        # 初始化 embeddings
        logger.info("初始化 OpenAI embeddings...")
        embeddings = EmbeddingsFactory.create()

        logger.info(f"使用集合初始化向量存储：kb_{kb_id}")
        vector_store = VectorStoreFactory.create(
            store_type=settings.VECTOR_STORE_TYPE,
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
            # 计算块哈希值
            chunk_hash = hashlib.sha256(
                (chunk.content + str(chunk.metadata)).encode()
            ).hexdigest()
            current_hashes.add(chunk_hash)

            # 如果块未更改，则跳过
            if chunk_hash in existing_hashes:
                continue

            # 为块创建唯一的ID
            chunk_id = hashlib.sha256(
                f"{kb_id}:{file_name}:{chunk_hash}".encode()
            ).hexdigest()

            # 准备块记录
            # 准备元数据
            metadata = {
                **chunk.metadata,  # 字典解包运算符**
                "chunk_id": chunk_id,
                "file_name": file_name,
                "kb_id": kb_id,
                "document_id": document_id,
            }

            new_chunks.append(
                {
                    "id": chunk_id,
                    "kb_id": kb_id,
                    "document_id": document_id,
                    "file_name": file_name,
                    "metadata": metadata,
                    "hash": chunk_hash,
                }
            )

            # 为向量存储准备文档
            doc = LangchainDocument(page_content=chunk.content, metadata=metadata)
            documents_to_update.append(doc)

        # 向数据库和矢量存储添加新块
        if new_chunks:
            logger.info(f"添加{len(new_chunks)}个新的/更新的块")
            chunk_manager.add_chunks(new_chunks)
            vector_store.add_documents(documents_to_update)

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


async def upload_document(file: UploadFile, kb_id: int) -> UploadResult:
    """Step 1: 将文档上传到MinIO"""
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
        logging.error(f"Failed to upload file to MinIO: {str(e)}")
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
    """Step 2: 生成预览块"""
    # 从MinIO获取文件
    minio_client = get_minio_client()
    _, ext = os.path.splitext(file_path)
    ext = ext.lower()

    # 下载到临时文件
    # tempfile 模块用于创建临时文件 / 目录 使用 with 上下文管理器
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as temp_file:
        minio_client.fget_object(
            bucket_name=settings.MINIO_BUCKET_NAME,
            object_name=file_path,
            file_path=temp_file.name,
        )
        temp_path = temp_file.name

    try:
        # 选择适当的加载程序
        if ext == ".pdf":
            loader = PyPDFLoader(temp_path)
        elif ext == ".docx":
            loader = Docx2txtLoader(temp_path)
        elif ext == ".md":
            loader = UnstructuredMarkdownLoader(temp_path)
        else:  # 默认为文本加载器
            loader = TextLoader(temp_path)

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


async def process_document_background(
    temp_path: str,
    file_name: str,
    kb_id: int,
    task_id: int,
    db: Session = None,
    chunk_size: int = 1000,
    chunk_overlap: int = 200,
) -> None:
    """在后台处理文档"""
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

    try:
        logger.info(f"任务 {task_id}：设置状态为processing")
        task.status = "processing"  # type: ignore
        db.commit()

        # 1. 从临时目录下载文件
        minio_client = get_minio_client()
        try:
            local_temp_path = f"/tmp/temp_{task_id}_{file_name}"  # 使用系统临时目录
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
                loader = TextLoader(local_temp_path)

            logger.info(f"任务 {task_id}：加载文档内容")
            documents = loader.load()
            logger.info(f"任务{task_id}：文档加载成功")

            logger.info(f"任务{task_id}：将文档拆分为块")
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=chunk_size, chunk_overlap=chunk_overlap
            )
            chunks = text_splitter.split_documents(documents)
            logger.info(f"任务{task_id}：文档拆分为{len(chunks)}个块")

            # 3. 创建向量存储
            logger.info(f"任务 {task_id}：初始化vector store")
            embeddings = EmbeddingsFactory.create()

            vector_store = VectorStoreFactory.create(
                store_type=settings.VECTOR_STORE_TYPE,
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

                # 删除临时文件
                logger.info(f"任务{task_id}：从MinIO中删除临时文件")
                minio_client.remove_object(
                    bucket_name=settings.MINIO_BUCKET_NAME, object_name=temp_path
                )
                logger.info(f"任务{task_id}：已删除临时文件")
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

            # 6. 存储文档块
            logger.info(f"任务 {task_id}：存储文档块")
            for i, chunk in enumerate(chunks):
                # 为每个 chunk 生成唯一的 ID
                chunk_id = hashlib.sha256(
                    f"{kb_id}:{file_name}:{chunk.page_content}".encode()
                ).hexdigest()

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

            # 7. 添加到向量存储
            logger.info(f"任务{task_id}：将块添加到向量存储")
            vector_store.add_documents(chunks)
            # 移除 persist() 调用，因为新版本不需要
            logger.info(f"任务{task_id}：已将块添加到向量存储")

            # 8. 更新任务状态
            logger.info(f"任务{task_id}：正在将任务状态更新为completed")
            task.status = "completed"  # type: ignore
            task.document_id = document.id  # 更新为新创建的文档ID

            # 9. 更新上传记录状态
            upload = task.document_upload  # 直接通过关系获取
            if upload:
                logger.info(f"任务{task_id}：将上传记录状态更新为completed")
                upload.status = "completed"

            db.commit()
            logger.info(f"任务{task_id}：处理成功完成")

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
        except:
            logger.warning(f"任务{task_id}：出错后无法清理临时文件")
    finally:
        # 如果创建了db会话，则关闭
        if should_close_db and db:
            db.close()
