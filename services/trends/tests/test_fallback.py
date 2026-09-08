"""Unit tests for app.fallback.

`run_with_fallback` is the primary → fallback 1 → fallback 2 → cache
chain. We mock the session's `execute()` to return whatever TrendSignal
rows we want, and we patch `register_fallback` indirectly by mutating
the module's `_FALLBACK_CHAIN` dict.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.extractor.base import RawSignal
from app.fallback import (
    _FALLBACK_CHAIN,
    register_fallback,
    run_with_fallback,
)


# ─── Helpers ─────────────────────────────────────────────────────────────────
@pytest.fixture(autouse=True)
def _clear_fallback_chain():
    """Ensure each test starts with an empty fallback registry."""
    _FALLBACK_CHAIN.clear()
    yield
    _FALLBACK_CHAIN.clear()


def _session_returning(rows: list[Any]) -> AsyncMock:
    """Build a session whose `execute()` yields `rows` for the cache lookup."""
    session = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = rows
    session.execute = AsyncMock(return_value=result)
    return session


# ─── Tests ──────────────────────────────────────────────────────────────────
class TestRunWithFallback:
    @pytest.mark.asyncio
    async def test_primary_success_returns_immediately(self) -> None:
        """No fallbacks tried if the primary succeeds."""
        calls: list[str] = []

        async def primary() -> list[RawSignal]:
            calls.append("primary")
            return [RawSignal(platform="tiktok", type="video", label="hello", source_id="p1")]

        session = _session_returning([])
        signals, attempts = await run_with_fallback(
            session,
            platform="tiktok",
            primary_source_key="tiktok_tamnd",
            primary_fn=primary,
            primary_args={},
        )

        assert len(signals) == 1
        assert calls == ["primary"]
        # Only the primary is recorded in the attempt log.
        assert len(attempts) == 1
        assert attempts[0]["outcome"] == "success"
        assert attempts[0]["source_key"] == "tiktok_tamnd"

    @pytest.mark.asyncio
    async def test_primary_failure_runs_first_fallback(self) -> None:
        """When the primary raises, the registered fallback is tried next."""
        calls: list[str] = []

        async def primary() -> list[RawSignal]:
            calls.append("primary")
            raise RuntimeError("upstream 503")

        async def fb1() -> list[RawSignal]:
            calls.append("fb1")
            return [RawSignal(platform="tiktok", type="video", label="fb1", source_id="f1")]

        register_fallback("tiktok", "fb1", after_source_key="tiktok_tamnd", fn=fb1)
        session = _session_returning([])

        signals, attempts = await run_with_fallback(
            session,
            platform="tiktok",
            primary_source_key="tiktok_tamnd",
            primary_fn=primary,
            primary_args={},
        )

        assert calls == ["primary", "fb1"]
        assert len(signals) == 1
        # Two attempts: primary errored, fb1 succeeded.
        assert len(attempts) == 2
        assert attempts[0]["outcome"] == "error"
        assert attempts[1]["outcome"] == "success"

    @pytest.mark.asyncio
    async def test_full_chain_falls_through_to_cache(self) -> None:
        """When every extractor fails, return cached signals if any."""
        calls: list[str] = []

        async def primary() -> list[RawSignal]:
            calls.append("primary")
            raise RuntimeError("down")

        async def fb1() -> list[RawSignal]:
            calls.append("fb1")
            raise RuntimeError("down")

        async def fb2() -> list[RawSignal]:
            calls.append("fb2")
            raise RuntimeError("down")

        register_fallback("tiktok", "fb1", after_source_key="tiktok_tamnd", fn=fb1)
        register_fallback("tiktok", "fb2", after_source_key="tiktok_tamnd", fn=fb2)

        # Build a single "cached" TrendSignal-like row.
        from app.models import TrendSignal

        cached_row = TrendSignal(
            id=uuid.uuid4(),
            workspace_id=uuid.uuid4(),
            platform="tiktok",
            type="video",
            label="cached",
            normalized_label="cached",
            source_id="cache_1",
            fetched_at=datetime.now(timezone.utc),
            expires_at=datetime.now(timezone.utc),
        )
        session = _session_returning([cached_row])

        signals, attempts = await run_with_fallback(
            session,
            platform="tiktok",
            primary_source_key="tiktok_tamnd",
            primary_fn=primary,
            primary_args={},
        )

        assert calls == ["primary", "fb1", "fb2"]
        assert len(signals) == 1  # cache hit
        assert signals[0].label == "cached"
        # The final attempt is the cache success.
        assert attempts[-1]["source_key"] == "cache:last_good"

    @pytest.mark.asyncio
    async def test_all_fail_no_cache_returns_empty(self) -> None:
        """No success, no cache → empty signals, attempts ends in skipped."""
        async def primary() -> list[RawSignal]:
            raise RuntimeError("down")

        register_fallback(
            "tiktok",
            "fb1",
            after_source_key="tiktok_tamnd",
            fn=primary,
        )

        session = _session_returning([])  # no cached signals

        signals, attempts = await run_with_fallback(
            session,
            platform="tiktok",
            primary_source_key="tiktok_tamnd",
            primary_fn=primary,
            primary_args={},
        )

        assert signals == []
        # 2 errors + cache skipped = 3 attempts.
        assert len(attempts) == 3
        assert attempts[-1]["source_key"] == "cache:last_good"
        assert attempts[-1]["outcome"] == "skipped"
