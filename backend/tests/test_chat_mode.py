"""The assistant defaults to AgentOps; the direct providers are break-glass.

Runs inside the backend container (app.config needs the service's environment).
"""

import pytest

from app.chat import service
from app.config import settings


@pytest.fixture
def cfg(monkeypatch):
    def set_(**kw):
        for k, v in kw.items():
            monkeypatch.setattr(settings, k, v)
    return set_


def test_defaults_are_agentops_with_direct_mode_off():
    assert settings.model_fields["chat_provider"].default == "agentops"
    assert settings.model_fields["chat_direct_enabled"].default is False


def test_agentops_is_configured_from_the_application_key_alone(cfg):
    cfg(chat_provider="agentops", anthropic_api_key=None,
        agentops_base_url="http://agentops-bff:8080", agentops_client_id="ak_x",
        agentops_client_secret="s", agentops_agent_id="a-1")
    assert service.is_configured() is True
    assert service.provider_label() == "via AgentOps"
    assert service.direct_mode_blocked() is None


def test_agentops_without_a_key_is_not_configured(cfg):
    cfg(chat_provider="agentops", agentops_base_url="http://agentops-bff:8080",
        agentops_client_id=None, agentops_client_secret=None, agentops_agent_id="a-1")
    assert service.is_configured() is False


@pytest.mark.parametrize("provider", ["anthropic", "openai"])
def test_direct_provider_is_refused_unless_break_glass_is_on(cfg, provider):
    cfg(chat_provider=provider, chat_direct_enabled=False, anthropic_api_key="sk-ant-x",
        chat_base_url="http://llm:8080/v1", chat_model="llama")
    assert service.is_configured() is False
    with pytest.raises(service.ChatUnavailable, match="CHAT_DIRECT_ENABLED"):
        service.build_provider()


def test_direct_provider_works_when_break_glass_is_on(cfg):
    cfg(chat_provider="openai", chat_direct_enabled=True,
        chat_base_url="http://llm:8080/v1", chat_model="llama", chat_api_key=None)
    assert service.is_configured() is True
    assert service.provider_label().startswith("direct (break-glass)")
    provider = service.build_provider()
    assert provider.name == "openai"


def test_startup_log_warns_in_direct_mode(cfg, caplog):
    cfg(chat_provider="anthropic", chat_direct_enabled=True, anthropic_api_key="sk-ant-x")
    with caplog.at_level("WARNING", logger="app.chat.service"):
        service.log_chat_mode()
    assert any("break-glass" in r.getMessage() for r in caplog.records)
