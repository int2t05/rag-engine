"""
知识库 OpenAPI
=============
对外提供知识库检索接口，使用 X-API-Key 认证。
"""

from typing import Any
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.services.vector_store import VectorStoreFactory

from app import models
from app.db.session import get_db
from app.core.security import get_api_key_user
from app.core.config import settings
from app.services.embedding.embedding_factory import EmbeddingsFactory
from app.services.rag_dedupe import dedupe_scored_pairs
from app.services.ai_runtime_scope import ai_runtime_scope
from app.api.deps import require_active_ai_runtime_openapi
from app.schemas.ai_runtime import AiRuntimeSettings

router = APIRouter()


@router.get("/{knowledge_base_id}/query")
def query_knowledge_base(
    *,
    db: Session = Depends(get_db),
    knowledge_base_id: int,
    query: str,
    top_k: int = 3,
    current_user: models.User = Depends(get_api_key_user),
    _rt: AiRuntimeSettings = Depends(require_active_ai_runtime_openapi),
) -> Any:
    """
    使用API密钥身份验证查询特定知识库
    """
    try:
        kb = (
            db.query(models.KnowledgeBase)
            .filter(
                models.KnowledgeBase.id == knowledge_base_id,
                models.KnowledgeBase.user_id == current_user.id,
            )
            .first()
        )

        if not kb:
            raise HTTPException(
                status_code=404,
                detail=f"未找到知识库{knowledge_base_id}",
            )

        with ai_runtime_scope(db, current_user.id):
            embeddings = EmbeddingsFactory.create()

            vector_store = VectorStoreFactory.create(
                store_type=settings.VECTOR_STORE_TYPE,
                collection_name=f"kb_{knowledge_base_id}",
                embedding_function=embeddings,
            )

            results = vector_store.similarity_search_with_score(query, k=top_k)
            results = dedupe_scored_pairs(results)

            response = []
            for doc, score in results:
                response.append(
                    {
                        "content": doc.page_content,  # type: ignore
                        "metadata": doc.metadata,  # type: ignore
                        "score": float(score),
                    }
                )

            return {"results": response}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
