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

    # JWT
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # Anthropic (Claude)
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"

    # Google Gemini
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    # AI Chat assistant
    ai_chat_provider: str = "ollama"  # "ollama", "openai", "anthropic", "gemini"
    ai_chat_max_context_transactions: int = 50
    ai_chat_system_language: str = "fr"

    # Embeddings (local classification)
    embedding_model_name: str = "paraphrase-multilingual-MiniLM-L12-v2"
    embedding_dimensions: int = 384
    embedding_similarity_high: float = 0.85
    embedding_similarity_medium: float = 0.70
    embedding_similarity_low: float = 0.55
    embedding_category_threshold: float = 0.40
    # When best category similarity >= this, prefer category semantics over k-NN (0 = disabled)
    embedding_category_prefer_threshold: float = 0.62
    embedding_min_cluster_size: int = 3
    # Clustering: lower = more selective (stricter similarity), higher = more grouping
    embedding_cluster_distance_threshold: float = 0.5
    # Comma-separated keywords to reinforce in embeddings (e.g. "LECLERC,AMAZON")
    embedding_boost_keywords: str = ""
    embedding_boost_repeat: int = 2

    # Local LLM via Ollama
    llm_enabled: bool = False  # True = appel auto au LLM pour les clusters sans k-NN
    llm_ui_enabled: bool = False  # True = afficher le bouton « Interpréter (LLM) » dans l’UX ; False = masquer (app fonctionne sans Ollama)
    llm_base_url: str = "http://localhost:11434"
    llm_model: str = "mistral"
    llm_timeout: float = 60.0  # seconds per request

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    # Upload
    max_upload_size_mb: int = 10

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "extra": "ignore",  # ignore POSTGRES_* etc. (used by Docker, not by the app)
    }


settings = Settings()
