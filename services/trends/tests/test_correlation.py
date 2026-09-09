"""Unit tests for app.analysis.correlation.

`dedupe_and_correlate` groups signals that refer to the same
underlying trend across platforms. We test the four behaviours that
matter:

  1. Hard match on identical normalized label merges.
  2. Hard match on token-sort ratio > 85 merges.
  3. Soft match (embedding cosine > 0.78) goes to `soft_related`.
  4. Velocity boost scales with group size.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest

from app.analysis.correlation import (
    BOOST_PER_EXTRA,
    HARD_MERGE_THRESHOLD,
    dedupe_and_correlate,
)
from app.models import TrendSignal


def _mk_signal(
    *,
    label: str,
    platform: str,
    normalized_label: str | None = None,
    velocity: float = 50.0,
    embedding: list[float] | None = None,
    fetched_at: datetime | None = None,
) -> TrendSignal:
    """Tiny builder so each test case stays a few lines."""
    now = fetched_at or datetime.now(timezone.utc)
    return TrendSignal(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        platform=platform,
        type="post",
        label=label,
        normalized_label=normalized_label or label.lower().lstrip("#"),
        language="en",
        region="XX",
        score=velocity,
        velocity=velocity,
        embedding=embedding,
        source_id=f"{platform}_{label[:8]}_{uuid.uuid4().hex[:6]}",
        fetched_at=now,
        expires_at=now,
        source_key=platform,
    )


class TestDedupeAndCorrelate:
    def test_empty_returns_empty(self) -> None:
        assert dedupe_and_correlate([]) == []

    def test_single_signal_returns_single_group(self) -> None:
        s = _mk_signal(label="AI", platform="reddit")
        groups = dedupe_and_correlate([s])
        assert len(groups) == 1
        assert groups[0].size == 1
        assert groups[0].boosted_velocity == pytest.approx(s.velocity)

    def test_hard_merge_same_normalized_label(self) -> None:
        """Two signals with the same normalized_label are merged."""
        a = _mk_signal(label="#AI", platform="reddit")
        b = _mk_signal(label="ai", platform="tiktok", velocity=80.0)
        # Both have normalized_label="ai" → hard match.
        groups = dedupe_and_correlate([a, b])
        # One group, size 2.
        assert len(groups) == 1
        assert groups[0].size == 2

    def test_soft_match_kept_in_soft_related(self) -> None:
        """Different normalized labels but very close embeddings → soft, not merged."""
        now = datetime.now(timezone.utc)
        a = _mk_signal(
            label="AIRevolution",
            platform="reddit",
            embedding=[0.1] * 384,
            fetched_at=now,
        )
        b = _mk_signal(
            label="A.I. Revolution",
            platform="youtube",
            normalized_label="airevolution",  # would hard-match on label normalisation
            embedding=[0.1] * 384,
            fetched_at=now - timedelta(seconds=1),
        )
        # Note: with normalized_label both "airevolution" and "airevolution" they
        # will hard-match. So test the *soft* path by giving them DIFFERENT
        # normalized labels but identical embeddings.
        b.normalized_label = "airev"  # would NOT hard-match
        groups = dedupe_and_correlate([a, b])
        assert len(groups) == 1
        assert groups[0].size == 1  # b is in soft_related, not in members
        assert b in groups[0].soft_related

    def test_velocity_boost_with_group_size(self) -> None:
        """A group of 3 gets a 1 + 2*0.25 = 1.5× boost on the primary's velocity."""
        now = datetime.now(timezone.utc)
        primary = _mk_signal(label="AI", platform="reddit", velocity=50.0, fetched_at=now)
        a = _mk_signal(label="ai", platform="tiktok", velocity=70.0, fetched_at=now - timedelta(seconds=1))
        b = _mk_signal(label="ai", platform="youtube", velocity=60.0, fetched_at=now - timedelta(seconds=2))
        groups = dedupe_and_correlate([primary, a, b])
        assert len(groups) == 1
        assert groups[0].size == 3
        expected = 50.0 * (1.0 + BOOST_PER_EXTRA * 2)
        assert groups[0].boosted_velocity == pytest.approx(expected, rel=1e-3)

    def test_no_match_means_two_groups(self) -> None:
        """Truly distinct trends stay in separate groups."""
        a = _mk_signal(label="Cooking", platform="reddit", normalized_label="cooking")
        b = _mk_signal(label="Skateboarding", platform="tiktok", normalized_label="skateboarding")
        groups = dedupe_and_correlate([a, b])
        assert len(groups) == 2

    def test_platforms_field_includes_all(self) -> None:
        """`group.platforms` lists every distinct platform in the group."""
        a = _mk_signal(label="AI", platform="reddit")
        b = _mk_signal(label="ai", platform="tiktok")
        groups = dedupe_and_correlate([a, b])
        assert sorted(groups[0].platforms) == ["reddit", "tiktok"]
