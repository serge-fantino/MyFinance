"""LLM provider abstraction for AI chat.

Supports Ollama (local), OpenAI, Anthropic (Claude), and Google Gemini
with a unified interface. The provider receives a system prompt + message
history and returns the assistant's text response.
"""

from abc import ABC, abstractmethod

import httpx
import structlog

from app.config import settings
from app.services.ai_config import get_current_provider

logger = structlog.get_logger()


class LLMProviderBase(ABC):
    """Abstract base for LLM chat providers."""

    @abstractmethod
    async def chat(
        self,
        system_prompt: str,
        messages: list[dict],
        temperature: float = 0.3,
    ) -> str:
        """Send a chat request and return the assistant's text response.

        Args:
            system_prompt: System-level instructions.
            messages: List of {"role": "user"|"assistant", "content": "..."}.
            temperature: Sampling temperature.

        Returns:
            The assistant's response text.
        """

    @abstractmethod
    async def is_available(self) -> bool:
        """Check if the provider is reachable."""

    def get_model_name(self) -> str:
        """Return the configured model name for this provider."""
        return getattr(self, "model", "?")


class OllamaChatProvider(LLMProviderBase):
    """Ollama-based provider using the /api/chat endpoint."""

    def __init__(self) -> None:
        self.base_url = settings.llm_base_url.rstrip("/")
        self.model = settings.llm_model

    async def is_available(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url}/api/tags")
                if resp.status_code != 200:
                    return False
                data = resp.json()
                model_names = [m.get("name", "") for m in data.get("models", [])]
                return any(
                    n == self.model or n.startswith(f"{self.model}:")
                    for n in model_names
                )
        except (httpx.ConnectError, httpx.TimeoutException):
            return False

    async def chat(
        self,
        system_prompt: str,
        messages: list[dict],
        temperature: float = 0.3,
    ) -> str:
        ollama_messages = [{"role": "system", "content": system_prompt}]
        for msg in messages:
            ollama_messages.append({
                "role": msg["role"],
                "content": msg["content"],
            })

        try:
            async with httpx.AsyncClient(
                timeout=httpx.Timeout(
                    connect=5.0,
                    read=settings.llm_timeout,
                    write=5.0,
                    pool=5.0,
                )
            ) as client:
                resp = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.model,
                        "messages": ollama_messages,
                        "stream": False,
                        "options": {
                            "temperature": temperature,
                            "num_predict": 1500,
                        },
                    },
                )
                if resp.status_code != 200:
                    logger.warning("ollama_chat_error", status=resp.status_code)
                    return "Désolé, le modèle local n'est pas disponible pour le moment."
                data = resp.json()
                return data.get("message", {}).get("content", "")
        except httpx.TimeoutException:
            logger.warning("ollama_chat_timeout")
            return "Désolé, le modèle local a mis trop de temps à répondre."
        except httpx.ConnectError:
            logger.warning("ollama_chat_unreachable")
            return "Désolé, le service Ollama n'est pas accessible."


class OpenAIChatProvider(LLMProviderBase):
    """OpenAI-based provider using the chat completions API."""

    def __init__(self) -> None:
        self.api_key = settings.openai_api_key
        self.model = settings.openai_model

    async def is_available(self) -> bool:
        return bool(self.api_key)

    async def chat(
        self,
        system_prompt: str,
        messages: list[dict],
        temperature: float = 0.3,
    ) -> str:
        if not self.api_key:
            return "Erreur : clé API OpenAI non configurée."

        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=self.api_key)

        openai_messages = [{"role": "system", "content": system_prompt}]
        for msg in messages:
            openai_messages.append({
                "role": msg["role"],
                "content": msg["content"],
            })

        try:
            response = await client.chat.completions.create(
                model=self.model,
                messages=openai_messages,
                temperature=temperature,
                max_tokens=2000,
            )
            return response.choices[0].message.content or ""
        except Exception as e:
            logger.error("openai_chat_error", error=str(e))
            return f"Erreur lors de l'appel à OpenAI : {e}"


class AnthropicChatProvider(LLMProviderBase):
    """Anthropic Claude provider using the messages API.

    Key difference: system prompt is a top-level parameter, not a message.
    """

    def __init__(self) -> None:
        self.api_key = settings.anthropic_api_key
        self.model = settings.anthropic_model

    async def is_available(self) -> bool:
        return bool(self.api_key)

    async def chat(
        self,
        system_prompt: str,
        messages: list[dict],
        temperature: float = 0.3,
    ) -> str:
        if not self.api_key:
            return "Erreur : clé API Anthropic non configurée."

        from anthropic import AsyncAnthropic

        client = AsyncAnthropic(api_key=self.api_key)

        # Anthropic expects messages with role "user" or "assistant" only
        anthropic_messages = [
            {"role": msg["role"], "content": msg["content"]}
            for msg in messages
            if msg["role"] in ("user", "assistant")
        ]

        try:
            response = await client.messages.create(
                model=self.model,
                system=system_prompt,
                messages=anthropic_messages,
                temperature=temperature,
                max_tokens=2000,
            )
            return response.content[0].text if response.content else ""
        except Exception as e:
            logger.error("anthropic_chat_error", error=str(e))
            return f"Erreur lors de l'appel à Anthropic : {e}"


class GeminiChatProvider(LLMProviderBase):
    """Google Gemini provider using the google-genai SDK.

    Key differences:
    - role "assistant" → "model"
    - system instruction is a separate parameter
    """

    def __init__(self) -> None:
        self.api_key = settings.gemini_api_key
        self.model = settings.gemini_model

    async def is_available(self) -> bool:
        return bool(self.api_key)

    async def chat(
        self,
        system_prompt: str,
        messages: list[dict],
        temperature: float = 0.3,
    ) -> str:
        if not self.api_key:
            return "Erreur : clé API Gemini non configurée."

        from google import genai
        from google.genai import types

        client = genai.Client(api_key=self.api_key)

        # Gemini uses "model" instead of "assistant"
        gemini_messages = []
        for msg in messages:
            role = "model" if msg["role"] == "assistant" else "user"
            gemini_messages.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg["content"])],
                )
            )

        try:
            response = await client.aio.models.generate_content(
                model=self.model,
                contents=gemini_messages,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=temperature,
                    max_output_tokens=2000,
                ),
            )
            return response.text or ""
        except Exception as e:
            logger.error("gemini_chat_error", error=str(e))
            return f"Erreur lors de l'appel à Gemini : {e}"


def get_llm_provider() -> LLMProviderBase:
    """Factory: return the configured LLM provider."""
    provider = get_current_provider()
    if provider == "openai":
        return OpenAIChatProvider()
    if provider == "anthropic":
        return AnthropicChatProvider()
    if provider == "gemini":
        return GeminiChatProvider()
    return OllamaChatProvider()
