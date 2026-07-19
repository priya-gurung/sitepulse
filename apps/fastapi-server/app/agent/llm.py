from langchain_core.language_models.chat_models import BaseChatModel

from ..config import Settings


def build_chat_model(settings: Settings) -> BaseChatModel:
    if settings.AI_PROVIDER == "anthropic":
        if not settings.ANTHROPIC_API_KEY:
            raise RuntimeError("ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic")
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=settings.AI_MODEL,
            temperature=settings.AI_TEMPERATURE,
            api_key=settings.ANTHROPIC_API_KEY,
            max_tokens=1024,
        )

    if settings.AI_PROVIDER == "openai":
        if not settings.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY is required when AI_PROVIDER=openai")
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=settings.AI_MODEL,
            temperature=settings.AI_TEMPERATURE,
            api_key=settings.OPENAI_API_KEY,
        )

    raise RuntimeError(f"Unknown AI_PROVIDER: {settings.AI_PROVIDER}")
