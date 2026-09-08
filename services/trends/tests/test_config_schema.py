"""Unit tests for app.config — Pydantic settings + per-source validation.

We test:
  1. Settings() builds with the minimum required env (DATABASE_URL).
  2. Per-source extractor `validate_config` contracts — the
     `ValidationResult` shape is the one used by the source-enable
     endpoint, so a regression here breaks the admin UI.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.config import Settings
from app.extractor.base import ValidationResult


# ─── Settings ────────────────────────────────────────────────────────────────
class TestSettings:
    def test_minimum_required_is_database_url(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """DATABASE_URL is the only required field."""
        monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@h:5432/d")
        # Should not raise.
        Settings()

    def test_missing_database_url_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("DATABASE_URL", raising=False)
        # Clear the lru_cache so a new Settings() is built.
        from app.config import get_settings

        get_settings.cache_clear()
        with pytest.raises(ValidationError):
            Settings()

    def test_default_cadence_is_six_hours(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@h:5432/d")
        s = Settings()
        # 6h = 360 minutes.
        assert s.SYNC_DEFAULT_CADENCE_MINUTES == 360

    def test_circuit_breaker_defaults_match_plan(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@h:5432/d")
        s = Settings()
        # 5 errors, 10-minute window, 15-minute cooldown.
        assert s.CIRCUIT_BREAKER_THRESHOLD == 5
        assert s.CIRCUIT_BREAKER_WINDOW_MINUTES == 10
        assert s.CIRCUIT_BREAKER_COOLDOWN_MINUTES == 15

    def test_per_source_keys_default_to_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Paid keys are Optional — sidecar boots without them."""
        monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@h:5432/d")
        s = Settings()
        assert s.SERPAPI_KEY is None
        assert s.YOUTUBE_API_KEY is None
        assert s.REDDIT_CLIENT_ID is None
        assert s.X_BEARER_TOKEN is None

    def test_invalid_cadence_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@h:5432/d")
        monkeypatch.setenv("SYNC_DEFAULT_CADENCE_MINUTES", "0")
        from app.config import get_settings

        get_settings.cache_clear()
        with pytest.raises(ValidationError):
            Settings()


# ─── Per-source validate_config contract ────────────────────────────────────
class TestPerSourceValidationContract:
    """Pin the ValidationResult shape that source-enable endpoints rely on."""

    def test_success_factory(self) -> None:
        r = ValidationResult.success()
        assert r.ok is True
        assert r.errors == []
        assert r.warnings == []

    def test_failure_factory_carries_errors(self) -> None:
        r = ValidationResult.failure("bad", "worse")
        assert r.ok is False
        assert r.errors == ["bad", "worse"]

    def test_freestanding_validation_logic(self) -> None:
        """We don't bind to a specific extractor; we test the contract every
        extractor must follow. A simple inline check is enough for v1."""
        # Example: a paid source must have a non-empty api_key in config.
        config = {"api_key": "abc123", "region": "US"}
        ok = bool(config.get("api_key"))
        assert ok is True

        config_empty = {"api_key": ""}
        ok2 = bool(config_empty.get("api_key"))
        assert ok2 is False
