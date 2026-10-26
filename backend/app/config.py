from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    celery_broker_url: str
    celery_result_backend: str
 
    # Auth
    secret_key: str
    access_token_expire_minutes: int = 1440

    # Chat assistant. Optional throughout: an unconfigured assistant disables
    # /api/chat (503) rather than stopping the backend from booting — rostering
    # doesn't depend on it.
    #
    # "anthropic" calls the Claude API and needs egress to api.anthropic.com.
    # "openai" calls any OpenAI-shaped /v1/chat/completions endpoint, which is what
    # an on-prem deployment serves (vLLM, NVIDIA NIM, Ollama) — set chat_base_url
    # to the in-cluster address; nothing leaves the network.
    # "agentops" (the default) hands the whole assistant to the AgentOps
    # platform: this app holds an Application Key instead of a model key, and
    # the platform chooses the model, runs the roster tools (via this app's MCP
    # server), applies guardrails and records audit/trace/cost.
    #
    # The direct providers bypass all of that governance, so they are
    # break-glass: selecting one also requires chat_direct_enabled=true, and the
    # backend logs a warning while it is active. scripts/chat-provider.sh sets
    # both together.
    chat_provider: str = "agentops"
    chat_direct_enabled: bool = False
    anthropic_api_key: str | None = None   # break-glass only (chat_provider="anthropic")
    chat_model: str | None = None          # defaults per provider
    chat_base_url: str | None = None       # required when chat_provider="openai"
    chat_api_key: str | None = None        # often unset for in-cluster endpoints

    # chat_provider="agentops"
    agentops_base_url: str | None = None   # e.g. http://agentops-bff:8080
    agentops_client_id: str | None = None
    agentops_client_secret: str | None = None
    agentops_agent_id: str | None = None   # the Roster Planner agent on the platform
    agentops_model: str | None = None      # optional override; platform default otherwise
    agentops_timeout_seconds: float = 120.0

    class Config:
        env_file = ".env"


settings = Settings()
