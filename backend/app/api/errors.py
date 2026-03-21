"""
将服务层异常映射为 HTTP 响应
==========================
路由中可继续手动捕获；亦可依赖 `app.main` 中注册的 `AppServiceError` 全局处理器，
统一返回与 `HTTPException` 一致的 JSON 结构。
"""

from fastapi import HTTPException

from app.core.exceptions import (
    AppServiceError,
    BadRequestError,
    ForbiddenError,
    ResourceNotFoundError,
    UnauthorizedError,
)


def http_exception_from_service(exc: AppServiceError) -> HTTPException:
    """把服务层异常转为合适的 HTTPException（默认 400）。"""
    if isinstance(exc, ResourceNotFoundError):
        return HTTPException(status_code=404, detail=exc.detail)
    if isinstance(exc, BadRequestError):
        return HTTPException(status_code=400, detail=exc.detail)
    if isinstance(exc, UnauthorizedError):
        return HTTPException(
            status_code=401,
            detail=exc.detail,
            headers={"WWW-Authenticate": "Bearer"},
        )
    if isinstance(exc, ForbiddenError):
        return HTTPException(status_code=403, detail=exc.detail)
    return HTTPException(status_code=400, detail=exc.detail)
