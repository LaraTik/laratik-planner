"""Unit tests for app.dedupe.

We test both the async DB-backed `should_keep` and the pure-Python
`should_keep_sync`. The async one is exercised against a mock session;
the sync one is tested with hand-rolled TrendSignal lists.

Contract:
  - (platform, source_id) hit in the last 24h → drop.
  - (platform, normalized_label) hit in the last 24h → drop.
  - Otherwise → keep.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.dedupe import (
    normalize_label,
    should_keep,
    should_keep_sync,
)
from app.models import TrendSignal


# ─── Helpers ─────────────────────────────────────────────────────────────────
def _mk_signal(
    *,
    platform: str = "reddit",
    source_id: str = "t3_abc",
    label: str = "AIRevolution",
    normalized_label: str | None = None,
    fetched_at: datetime | None = None,
) -> TrendSignal:
    return TrendSignal(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        platform=platform,
        type="post",
        label=label,
        normalized_label=normalized_label or label.lower().lstrip("#"),
        source_id=source_id,
        fetched_at=fetched_at or datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=72),
    )


# ─── normalize_label ────────────────────────────────────────────────────────
class TestNormalizeLabel:
    def test_lowercases(self) -> None:
        assert normalize_label("HELLO") == "hello"

    def test_strips_leading_hash(self) -> None:
        assert normalize_label("#AIRevolution") == "airevolution"

    def test_drops_non_alphanumerics(self) -> None:
        assert normalize_label("  MENA-style!! ") == "menastyle"

    def test_empty(self) -> None:
        assert normalize_label("") == ""


# ─── should_keep_sync ────────────────────────────────────────────────────────
class TestShouldKeepSync:
    def test_no_existing_signals_keeps(self) -> None:
        sig = _mk_signal()
        assert should_keep_sync(sig, []) is True

    def test_same_source_id_drops(self) -> None:
        sig = _mk_signal(source_id="t3_abc")
        existing = [_mk_signal(source_id="t3_abc")]
        assert should_keep_sync(sig, existing) is False

    def test_same_normalized_label_drops(self) -> None:
        """Different source_id but same normalized_label → soft drop."""
        sig = _mk_signal(source_id="x1", normalized_label="airevolution")
        existing = [_mk_signal(source_id="x2", normalized_label="airevolution")]
        assert should_keep_sync(sig, existing) is False

    def test_different_platform_keeps(self) -> None:
        """Same label on a different platform is not a dedup hit."""
        sig = _mk_signal(platform="tiktok", normalized_label="airevolution")
        existing = [_mk_signal(platform="reddit", normalized_label="airevolution")]
        assert should_keep_sync(sig, existing) is True

    def test_different_label_keeps(self) -> None:
        sig = _mk_signal(normalized_label="airevolution")
        existing = [_mk_signal(normalized_label="skateboarding")]
        assert should_keep_sync(sig, existing) is True


# ─── should_keep (async) ────────────────────────────────────────────────────
class TestShouldKeepAsync:
    @pytest.mark.asyncio
    async def test_keeps_when_no_existing_signals(self) -> None:
        sig = _mk_signal()
        session = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = []
        session.execute = AsyncMock(return_value=result)

        assert await should_keep(session, sig) is True

    @pytest.mark.asyncio
    async def test_drops_on_hard_match(self) -> None:
        sig = _mk_signal(source_id="t3_abc")
        session = AsyncMock()
        result = MagicMock()
        result.scalars.return_value.all.return_value = [_mk_signal(source_id="t3_abc")]
        session.execute = AsyncMock(return_value=result)

        assert await should_keep(session, sig) is False
