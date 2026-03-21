"""
RAG Engine 后端应用包
====================
- ``app.modules``：按业务域划分的路由、用例与仓库（auth / knowledge / chat / evaluation / llm_config）
- ``app.shared``：跨域基础设施（嵌入、LLM、向量库、运行时配置）
- ``app.models`` / ``app.schemas``：ORM 与 API 契约（集中管理，便于 Alembic 与 OpenAPI）
- ``app.core`` / ``app.db``：配置、安全、数据库会话
"""
