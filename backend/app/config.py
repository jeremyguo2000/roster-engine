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
    chat_provider: str = "anthropic"
    anthropic_api_key: str | None = None
    chat_model: str | None = None          # defaults per provider
    chat_base_url: str | None = None       # required when chat_provider="openai"
    chat_api_key: str | None = None        # often unset for in-cluster endpoints

    class Config:
        env_file = ".env"


settings = Settings()
