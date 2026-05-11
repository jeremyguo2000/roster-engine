from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    celery_broker_url: str
    celery_result_backend: str
 
    # Auth
    secret_key: str
    access_token_expire_minutes: int = 1440

    class Config:
        env_file = ".env"


settings = Settings()
