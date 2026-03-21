# rag-engine/test_settings.py （注意：放在项目根目录！）
import sys
from pathlib import Path

# 把 backend 目录加入 Python 路径（让解释器能找到 app 模块）
BACKEND_DIR = Path(__file__).absolute().parent / "backend"
sys.path.append(str(BACKEND_DIR))

# 现在能正确导入 settings 了
from app.core.config import settings

def test_env_import():
    """极简测试：验证环境变量是否导入"""
    print("===== 环境变量导入测试 =====")
    # 1. 测试核心配置（MinIO + ChromaDB + OpenAI）
    print(f"1. MinIO Bucket 名称: {settings.MINIO_BUCKET_NAME}")
    print(f"2. ChromaDB 地址: {settings.CHROMA_DB_HOST}:{settings.CHROMA_DB_PORT}")
    print("3. LLM/嵌入：已迁至数据库「模型配置」，不再从 .env 读取")
    print(f"4. MySQL 连接串: {settings.get_database_url}")
    
    # 2. 验证 .env 文件是否加载
    env_file = Path(settings.model_config['env_file']) # type: ignore
    print(f"\n===== 配置文件验证 =====")
    print(f".env 文件路径: {env_file}")
    print(f".env 文件是否存在: {env_file.exists()}")

if __name__ == "__main__":
    test_env_import()