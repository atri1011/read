from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://reader:reader@localhost:5432/reader"
    redis_url: str = "redis://localhost:6379/0"
    upload_dir: str = "/data/uploads"
    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o"
    llm_timeout_seconds: int = 120
    queue_name: str = "parse_jobs"
    concurrency: int = 1


settings = Settings()
