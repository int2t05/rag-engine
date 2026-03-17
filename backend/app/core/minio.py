"""
MinIO 对象存储模块
==================
MinIO 是一个兼容 Amazon S3 的开源对象存储服务。
在本项目中，MinIO 用于存储用户上传的原始文档文件（PDF、Word、Markdown、TXT 等）。

对象存储 vs 文件系统：
- 对象存储按"桶(bucket)/键(key)"组织文件，天然支持分布式
- 文件名即路径，例如 "kb_1/document.pdf" 表示知识库 1 下的 document.pdf
- 适合存储大量非结构化文件，比直接存数据库或文件系统更灵活
"""

import logging
from minio import Minio
from app.core.config import settings

logger = logging.getLogger(__name__)


def get_minio_client() -> Minio:
    """
    创建并返回一个 MinIO 客户端实例

    每次调用都会创建新的客户端实例（MinIO 客户端是轻量级的）
    secure=False 表示使用 HTTP 而非 HTTPS，开发环境通常这样配置
    """
    logger.info("创建MinIO客户端实例")
    return Minio(
        settings.MINIO_ENDPOINT,      # MinIO 服务地址，如 "minio:9000"
        access_key=settings.MINIO_ACCESS_KEY,  # 访问密钥（类似用户名）
        secret_key=settings.MINIO_SECRET_KEY,  # 秘密密钥（类似密码）
        secure=False  # 生产环境建议设为 True 使用 HTTPS
    )


def init_minio():
    """
    初始化 MinIO：检查文档存储桶是否存在，不存在则创建

    在应用启动时调用（main.py 的 startup_event），确保存储桶可用
    桶名由配置中的 MINIO_BUCKET_NAME 决定，默认为 "documents"
    """
    client = get_minio_client()
    logger.info(f"Checking if bucket {settings.MINIO_BUCKET_NAME} exists.")
    if not client.bucket_exists(settings.MINIO_BUCKET_NAME):
        logger.info(f"Bucket {settings.MINIO_BUCKET_NAME} does not exist. Creating bucket.")
        client.make_bucket(settings.MINIO_BUCKET_NAME)
    else:
        logger.info(f"Bucket {settings.MINIO_BUCKET_NAME} already exists.")
