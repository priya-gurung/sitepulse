from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Env var names deliberately mirror the Node services where the same
    concept applies (TINYBIRD_*, OTEL_*), so a single .env convention
    spans the whole platform.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # ---- Server ----
    PORT: int = 8000
    REQUEST_TIMEOUT_SECONDS: int = 40  # kept below the Node client's 45s abort
    AGENT_RECURSION_LIMIT: int = 12  # caps the ReAct tool-calling loop

    # ---- Service-to-service auth ----
    # Shared secret checked against the X-Internal-Api-Key header. The
    # dashboard server is the only expected caller — this is defense in
    # depth in case this service is ever reachable from anywhere else on
    # the network. Leave unset to disable (not recommended in production).
    INTERNAL_AI_API_KEY: str | None = None

    # ---- Tinybird (read-only — same boundary as the dashboard server) ----
    TINYBIRD_HOST: str = "https://api.ap-east-1.aws.tinybird.co"
    TINYBIRD_READ_TOKEN: str

    # ---- LLM provider ----
    AI_PROVIDER: Literal["openai", "anthropic"] = "anthropic"
    AI_MODEL: str = "claude-sonnet-4-5"
    OPENAI_API_KEY: str | None = None
    ANTHROPIC_API_KEY: str | None = None
    AI_TEMPERATURE: float = 0.2

    # ---- Observability ----
    OTEL_SERVICE_NAME: str = "ai-agent"
    OTEL_EXPORTER_OTLP_ENDPOINT: str | None = None
    HONEYCOMB_API_KEY: str | None = None
    OTEL_PROMETHEUS_PORT: int = 9467


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
