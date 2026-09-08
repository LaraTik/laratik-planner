"""Pydantic v2 settings — all runtime config is loaded from environment variables.

The Next.js app supplies the same `DATABASE_URL` to this sidecar so they
share a single Postgres cluster. Any other env var the extractors need
(API keys, OAuth tokens) is declared here so a missing key fails fast at
startup rather than mid-fetch.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Strongly-typed environment configuration.

    `DATABASE_URL` is the only required value — without it the sidecar
    cannot read or write trend state. API keys for paid/optional sources
    are all `Optional[...] = None` so a fresh checkout can boot the
    service in "free sources only" mode.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ─── Database ──────────────────────────────────────────────────────────
    DATABASE_URL: str = Field(
        ...,
        description=(
            "Postgres DSN. Both `postgresql://` and `postgresql+asyncpg://` "
            "are accepted; db.py normalises the scheme on startup."
        ),
    )

    # ─── Sync cadence ──────────────────────────────────────────────────────
    SYNC_DEFAULT_CADENCE_MINUTES: int = Field(
        360,
        ge=1,
        description="Default per-source sync cadence in minutes (6h).",
    )

    TRENDS_RADAR_ENABLED: bool = Field(
        True,
        description="Master switch for the sidecar scheduler and trend writes.",
    )

    # ─── Circuit breaker ───────────────────────────────────────────────────
    CIRCUIT_BREAKER_THRESHOLD: int = Field(
        5,
        ge=1,
        description="Number of errors inside the window that flips the breaker OPEN.",
    )
    CIRCUIT_BREAKER_WINDOW_MINUTES: int = Field(
        10,
        ge=1,
        description="Sliding window over which errors are counted.",
    )
    CIRCUIT_BREAKER_COOLDOWN_MINUTES: int = Field(
        15,
        ge=1,
        description="How long the breaker stays OPEN before half-opening.",
    )

    # ─── Observability ─────────────────────────────────────────────────────
    SENTRY_DSN: Optional[str] = Field(
        default=None,
        description="Sentry DSN. When set, exceptions are reported; the trend label, "
        "source URL, and raw payload are never included (privacy).",
    )
    LOG_LEVEL: str = Field(
        "info",
        description="structlog level: debug, info, warning, error.",
    )

    # ─── ML model cache ────────────────────────────────────────────────────
    MODEL_CACHE_DIR: str = Field(
        "/app/data/models",
        description="Where sentence-transformers / detoxify / BART-MNLI cache to.",
    )

    # ─── Per-source API keys (all optional; the sidecar boots without them) ─
    SERPAPI_KEY: Optional[str] = None
    YOUTUBE_API_KEY: Optional[str] = None
    REDDIT_CLIENT_ID: Optional[str] = None
    REDDIT_CLIENT_SECRET: Optional[str] = None
    META_ACCESS_TOKEN: Optional[str] = None
    THREADS_USER_ID: Optional[str] = None
    THREADS_ACCESS_TOKEN: Optional[str] = None
    SPOTIFY_CLIENT_ID: Optional[str] = None
    SPOTIFY_CLIENT_SECRET: Optional[str] = None
    X_BEARER_TOKEN: Optional[str] = None
    TIKTOK_TAMND_PATH: str = Field(
        "/usr/local/bin/tt",
        description="Absolute path to the tamnd/tiktok-cli binary on this image.",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Process-wide singleton.

    Cached so the BaseSettings read of env vars happens exactly once.
    Tests that need a fresh config should call `get_settings.cache_clear()`
    after mutating the environment.
    """
    return Settings()  # type: ignore[call-arg]
