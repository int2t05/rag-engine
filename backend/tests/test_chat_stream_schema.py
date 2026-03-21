"""流式消息请求体与异常映射的轻量单测。"""

import pytest
from fastapi import HTTPException

from app.api.errors import http_exception_from_service
from app.core.exceptions import (
    BadRequestError,
    ForbiddenError,
    ResourceNotFoundError,
    UnauthorizedError,
)
from app.schemas.chat import StreamMessagesRequest


def test_stream_messages_request_accepts_use_chat_shape():
    raw = {
        "messages": [
            {"role": "user", "content": "hi"},
            {"role": "assistant", "content": "hello"},
        ]
    }
    m = StreamMessagesRequest.model_validate(raw)
    assert m.messages[-1].role == "assistant"
    assert m.messages[0].content == "hi"


def test_http_exception_from_service_maps_not_found():
    exc = http_exception_from_service(ResourceNotFoundError("gone"))
    assert isinstance(exc, HTTPException)
    assert exc.status_code == 404
    assert exc.detail == "gone"


def test_http_exception_from_service_maps_bad_request():
    exc = http_exception_from_service(BadRequestError("bad"))
    assert exc.status_code == 400
    assert exc.detail == "bad"


def test_http_exception_from_service_maps_unauthorized():
    exc = http_exception_from_service(UnauthorizedError("nope"))
    assert exc.status_code == 401
    assert exc.detail == "nope"
    assert exc.headers.get("WWW-Authenticate") == "Bearer"


def test_http_exception_from_service_maps_forbidden():
    exc = http_exception_from_service(ForbiddenError("denied"))
    assert exc.status_code == 403
    assert exc.detail == "denied"
