"""Runtime AI config override.

Allows changing AI_CHAT_PROVIDER dynamically without restart.
Override is in-memory only; falls back to env on restart.
"""

from app.config import settings

# Runtime override for ai_chat_provider (None = use settings)
_override_provider: str | None = None


def get_current_provider() -> str:
    """Return the effective provider (override or env)."""
    if _override_provider is not None:
        return _override_provider
    return settings.ai_chat_provider


def set_provider(provider: str) -> None:
    """Set runtime provider override."""
    global _override_provider
    valid = {"ollama", "openai", "anthropic", "gemini"}
    if provider.lower() in valid:
        _override_provider = provider.lower()


def clear_override() -> None:
    """Clear override, revert to env."""
    global _override_provider
    _override_provider = None
