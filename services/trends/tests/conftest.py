"""Pytest fixtures for the Trend Radar sidecar.

`conftest.py` is auto-discovered by pytest. Everything defined here is
available to every test file under `services/trends/tests/` without an
explicit import.

We use `pytest-asyncio` (mode = "auto" in pyproject.toml) so async
fixtures just work. The DB session is a `Mock` so tests can run
without a real Postgres connection; the same pattern is used for
httpx and Redis because the sidecar talks to both during a normal
fetch.

Privacy reminder: fixtures here MUST NOT contain real user data or
real API keys. All examples are synthetic.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, AsyncIterator, Iterator
from unittest.mock import AsyncMock, MagicMock

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    TrendSignal,
    TrendSource,
)
from app.extractor.base import RawSignal


# ─── Environment defaults ────────────────────────────────────────────────────
@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Set sane defaults for any env var the sidecar reads at import time.

    pytest's collection phase imports the modules so any `get_settings()`
    call would crash on a missing DATABASE_URL. We set just enough to let
    `Settings()` build.
    """
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://test:test@localhost:5432/test")
    monkeypatch.setenv("LOG_LEVEL", "warning")
    monkeypatch.setenv("MODEL_CACHE_DIR", "/tmp/laratik-trends-test-models")
    # Per-source keys left unset (the sidecar boots without them).


# ─── Database ───────────────────────────────────────────────────────────────
@pytest_asyncio.fixture
async def mock_session() -> AsyncMock:
    """A mock AsyncSession suitable for unit tests that don't need a real DB.

    `execute()` is an `AsyncMock` that returns a result whose `.scalars().all()`
    is an empty list by default. Tests that need specific rows set
    `session.execute.return_value = ...` explicitly.
    """
    session = AsyncMock(spec=AsyncSession)
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    result.scalar_one_or_none.return_value = None
    result.one.return_value = MagicMock(success=0, total=0, avg_dur=0.0, cost=0)
    session.execute = AsyncMock(return_value=result)
    session.flush = AsyncMock()
    session.add = MagicMock()
    return session


# ─── HTTP / httpx ────────────────────────────────────────────────────────────
@pytest.fixture
def mock_httpx_response() -> MagicMock:
    """A factory for fake httpx.Response objects.

    Usage:
        resp = mock_httpx_response(json_data={"items": [...]}, status_code=200)
        monkeypatch.setattr(httpx.AsyncClient, "get", AsyncMock(return_value=resp))
    """
    builder = MagicMock()

    def _build(json_data: dict[str, Any] | list[Any] | None = None, status_code: int = 200, text: str = "") -> MagicMock:
        resp = MagicMock()
        resp.status_code = status_code
        resp.text = text
        resp.json = MagicMock(return_value=json_data if json_data is not None else {})
        resp.raise_for_status = MagicMock()
        return resp

    builder.side_effect = _build
    builder.return_value = _build()
    return builder


# ─── Redis ───────────────────────────────────────────────────────────────────
@pytest.fixture
def mock_redis() -> MagicMock:
    """A mock Redis client (fakeredis-style)."""
    r = MagicMock()
    r.get = MagicMock(return_value=None)
    r.set = MagicMock(return_value=True)
    r.delete = MagicMock(return_value=1)
    r.exists = MagicMock(return_value=0)
    return r


# ─── Sample entities ─────────────────────────────────────────────────────────
@pytest.fixture
def sample_agency_id() -> uuid.UUID:
    """A stable agency (workspace) UUID for tests."""
    return uuid.UUID("11111111-1111-4111-8111-111111111111")


@pytest.fixture
def sample_workspace_id() -> uuid.UUID:
    """A stable workspace UUID for tests.

    In the sidecar the workspace is the agency, but tests that talk to
    the future Next.js app use a separate ID for forward-compat.
    """
    return uuid.UUID("22222222-2222-4222-8222-222222222222")


@pytest.fixture
def sample_source(sample_agency_id: uuid.UUID) -> TrendSource:
    """A free, clean-tier TrendSource row as it would come from the DB."""
    src = TrendSource(
        id=uuid.uuid4(),
        agency_id=sample_agency_id,
        source_key="reddit_json",
        display_name="Reddit (JSON endpoint)",
        enabled=True,
        tier="free",
        tos_class="clean",
        region="XX",
        config={},
        max_signals_per_cycle=200,
    )
    return src


@pytest.fixture
def sample_raw_signal() -> RawSignal:
    """A single RawSignal as it would come out of an extractor."""
    return RawSignal(
        platform="reddit",
        type="post",
        label="AIRevolution",
        source_id="t3_abc123",
        source_url="https://reddit.com/r/test/comments/abc123",
        raw_payload={"subreddit": "r/test", "score": 1200, "num_comments": 84},
        language="en",
        region="US",
        score=72.0,
        fetched_at=datetime.now(timezone.utc),
    )


@pytest.fixture
def sample_signal_list(sample_workspace_id: uuid.UUID) -> list[TrendSignal]:
    """A small batch of persisted TrendSignal rows (oldest first).

    Used by correlation, fit, and dedupe tests. Three platforms, two
    labels, deliberately mixed so the grouping + correlation tests
    have something to chew on.
    """
    now = datetime.now(timezone.utc)
    return [
        TrendSignal(
            id=uuid.uuid4(),
            workspace_id=sample_workspace_id,
            platform="reddit",
            type="post",
            label="AIRevolution",
            normalized_label="airevolution",
            language="en",
            region="US",
            score=72.0,
            velocity=68.0,
            lifecycle="peaking",
            embedding=[0.1] * 384,
            source_id="t3_abc1",
            source_url="https://reddit.com/r/tech/comments/abc1",
            fetched_at=now,
            expires_at=now + timedelta(hours=72),
            source_key="reddit",
        ),
        TrendSignal(
            id=uuid.uuid4(),
            workspace_id=sample_workspace_id,
            platform="tiktok",
            type="hashtag",
            label="#AIRevolution",
            normalized_label="airevolution",
            language="en",
            region="US",
            score=80.0,
            velocity=72.0,
            lifecycle="peaking",
            embedding=[0.1] * 384,
            source_id="tt_xyz1",
            source_url="https://tiktok.com/tag/airevolution",
            fetched_at=now - timedelta(hours=1),
            expires_at=now + timedelta(hours=71),
            source_key="tiktok_tamnd",
        ),
        TrendSignal(
            id=uuid.uuid4(),
            workspace_id=sample_workspace_id,
            platform="youtube",
            type="video",
            label="MENA Streetwear Drops",
            normalized_label="menastreetweardrops",
            language="en",
            region="XX",
            score=55.0,
            velocity=42.0,
            lifecycle="emerging",
            embedding=[0.4] * 384,
            source_id="yt_drop1",
            source_url="https://youtube.com/watch?v=drop1",
            fetched_at=now - timedelta(hours=2),
            expires_at=now + timedelta(hours=70),
            source_key="youtube",
        ),
    ]


# ─── Misc helpers ───────────────────────────────────────────────────────────
@pytest.fixture
def clock() -> Iterator[MagicMock]:
    """A frozen-clock mock that tests can advance.

    Returns a `MagicMock` that the test can `monkeypatch.setattr(..., clock)`
    over `datetime.now` or similar.
    """
    fixed = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    m = MagicMock(return_value=fixed)
    yield m
