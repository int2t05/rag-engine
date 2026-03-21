"""验证 pydantic-settings 能加载配置（供 CI / 本地快速自检）。"""

from app.core.config import settings


def test_settings_database_url_is_string():
    url = settings.get_database_url
    assert isinstance(url, str)
    assert "mysql" in url


def test_chroma_host_port_configured():
    assert settings.CHROMA_DB_HOST
    assert isinstance(settings.CHROMA_DB_PORT, int)
