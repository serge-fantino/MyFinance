"""Application configuration using pydantic-settings."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # App
    app_env: str = "development"
    app_debug: bool = True
    app_secret_key: str = "change-me"

    # Database
    database_url: str = "postgresql+asyncpg://myfinance:myfinance@localhost:5432/myfinance"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # Cognito (OIDC)
    cognito_region: str = "eu-west-3"
    cognito_user_pool_id: str = ""
    cognito_client_id: str = ""

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    # Upload
    max_upload_size_mb: int = 10

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @property
    def cognito_issuer_url(self) -> str:
        return f"https://cognito-idp.{self.cognito_region}.amazonaws.com/{self.cognito_user_pool_id}"

    @property
    def cognito_jwks_url(self) -> str:
        return f"{self.cognito_issuer_url}/.well-known/jwks.json"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
