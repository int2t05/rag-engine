"""
领域 / 服务层可预期异常
====================
供 services 抛出，由路由或统一入口转换为 HTTPException，避免在业务层依赖 FastAPI。
"""


class AppServiceError(Exception):
    """服务层业务错误基类。"""

    def __init__(self, detail: str) -> None:
        self.detail = detail
        super().__init__(detail)


class ResourceNotFoundError(AppServiceError):
    """资源不存在或当前主体无权访问（对外统一 404 文案由路由决定）。"""


class BadRequestError(AppServiceError):
    """参数或状态不合法（对应 HTTP 400）。"""


class UnauthorizedError(AppServiceError):
    """未认证或凭证无效（对应 HTTP 401）。"""


class ForbiddenError(AppServiceError):
    """已认证但无权操作该资源（对应 HTTP 403）。"""
