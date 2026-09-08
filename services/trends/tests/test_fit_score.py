"""Unit tests for app.fit.score.

The Fit score is the planner-facing rank. We test the two
public functions:

  - compute_fit: returns a 0-100 number with 5 named components.
  - update_workspace_weights: Bayesian update that re-normalises.

We also test the math primitives `_cosine` and `_jaccard` indirectly
through compute_fit.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import pytest

from app.fit.score import (
    DEFAULT_WEIGHTS,
    WorkspaceProfile,
    compute_fit,
    update_workspace_weights,
)
from app.models import TrendSignal


# ─── Helpers ─────────────────────────────────────────────────────────────────
def _mk_signal(
    *,
    platform: str = "tiktok",
    vertical: list[tuple[str, float]] | None = None,
    embedding: list[float] | None = None,
    raw_payload: dict[str, Any] | None = None,
) -> TrendSignal:
    return TrendSignal(
        id=uuid.uuid4(),
        workspace_id=uuid.uuid4(),
        platform=platform,
        type="post",
        label="x",
        normalized_label="x",
        language="en",
        region="XX",
        score=0.0,
        vertical=vertical,
        embedding=embedding,
        raw_payload=raw_payload or {},
        source_id="sid",
        fetched_at=datetime.now(timezone.utc),
        expires_at=datetime.now(timezone.utc),
    )


# ─── compute_fit ────────────────────────────────────────────────────────────
class TestComputeFit:
    def test_default_weights_sum_to_one(self) -> None:
        """Sanity: DEFAULT_WEIGHTS is a proper probability distribution."""
        assert abs(sum(DEFAULT_WEIGHTS.values()) - 1.0) < 1e-6

    def test_workspace_in_signal_vertical_scores_high(self) -> None:
        """A signal whose vertical matches the workspace's primary vertical
        gets the vertical component cranked to the BART-MNLI score (×100)."""
        signal = _mk_signal(vertical=[("fashion", 0.92), ("beauty", 0.05)])
        ws = WorkspaceProfile(
            workspace_id="ws-1",
            vertical="fashion",
            audience_topics=[],
            voice_embedding=None,
            platforms=["tiktok"],
        )
        result = compute_fit(signal, ws)
        # vertical component should be ~92; total a weighted sum.
        assert result.components.vertical == pytest.approx(92.0, abs=0.5)
        assert 0.0 <= result.fit <= 100.0

    def test_no_match_yields_zero_vertical(self) -> None:
        signal = _mk_signal(vertical=[("gaming", 0.9)])
        ws = WorkspaceProfile(
            workspace_id="ws-1",
            vertical="luxury",
            audience_topics=[],
            voice_embedding=None,
            platforms=["tiktok"],
        )
        result = compute_fit(signal, ws)
        assert result.components.vertical == 0.0

    def test_platform_membership_is_binary(self) -> None:
        signal = _mk_signal(platform="tiktok")
        ws = WorkspaceProfile(
            workspace_id="ws-1",
            vertical="luxury",
            platforms=["tiktok"],
        )
        assert compute_fit(signal, ws).components.platform == 100.0

        ws_no_match = WorkspaceProfile(
            workspace_id="ws-1",
            vertical="luxury",
            platforms=["linkedin"],
        )
        assert compute_fit(signal, ws_no_match).components.platform == 0.0

    def test_voice_cosine_is_zero_when_embedding_missing(self) -> None:
        signal = _mk_signal(embedding=None)
        ws = WorkspaceProfile(
            workspace_id="ws-1",
            vertical="luxury",
            voice_embedding=[0.1] * 384,
        )
        assert compute_fit(signal, ws).components.voice == 0.0

    def test_voice_cosine_high_for_identical_embeddings(self) -> None:
        v = [0.3, 0.4, 0.1]
        signal = _mk_signal(embedding=v)
        ws = WorkspaceProfile(
            workspace_id="ws-1",
            vertical="luxury",
            voice_embedding=v,
        )
        # Cosine of identical non-zero vectors = 1.0 → 100.
        assert compute_fit(signal, ws).components.voice == pytest.approx(100.0)

    def test_audience_jaccard(self) -> None:
        signal = _mk_signal(raw_payload={"audience_topics": ["fashion", "streetwear"]})
        ws = WorkspaceProfile(
            workspace_id="ws-1",
            vertical="fashion",
            audience_topics=["fashion", "sneakers"],
        )
        # Jaccard of {fashion, streetwear} ∩ {fashion, sneakers} = 1/3.
        result = compute_fit(signal, ws)
        assert result.components.audience == pytest.approx(33.33, abs=0.5)

    def test_custom_weights_override_defaults(self) -> None:
        signal = _mk_signal(platform="tiktok", vertical=[("fashion", 1.0)])
        ws = WorkspaceProfile(
            workspace_id="ws-1",
            vertical="fashion",
            platforms=["tiktok"],
        )
        # Custom: 100% weight on platform.
        custom = {"vertical": 0.0, "audience": 0.0, "voice": 0.0, "platform": 1.0, "competitive": 0.0}
        result = compute_fit(signal, ws, weights=custom)
        assert result.fit == pytest.approx(100.0)


# ─── update_workspace_weights ───────────────────────────────────────────────
class TestUpdateWorkspaceWeights:
    def test_no_feedback_returns_prior(self) -> None:
        weights = update_workspace_weights("ws-1", feedback=[])
        # Default weights, untouched.
        assert weights == DEFAULT_WEIGHTS

    def test_positive_feedback_boosts_component(self) -> None:
        feedback = [{"kind": "positive_save", "component": "voice"}]
        weights = update_workspace_weights("ws-1", feedback=feedback, learning_rate=0.05)
        # voice weight should be > default 0.20, and the rest renorm'd.
        assert weights["voice"] > DEFAULT_WEIGHTS["voice"]
        assert abs(sum(weights.values()) - 1.0) < 1e-3

    def test_negative_feedback_reduces_component(self) -> None:
        feedback = [
            {"kind": "negative_dismiss", "component": "voice"},
            {"kind": "negative_dismiss", "component": "voice"},
        ]
        weights = update_workspace_weights("ws-1", feedback=feedback, learning_rate=0.05)
        assert weights["voice"] < DEFAULT_WEIGHTS["voice"]
        # Floor is 0.01.
        assert weights["voice"] >= 0.01

    def test_unknown_component_is_ignored(self) -> None:
        feedback = [{"kind": "positive_save", "component": "not_a_real_axis"}]
        weights = update_workspace_weights("ws-1", feedback=feedback)
        assert weights == DEFAULT_WEIGHTS

    def test_weights_remain_normalised(self) -> None:
        feedback = (
            [{"kind": "positive_save", "component": "voice"}] * 5
            + [{"kind": "negative_dismiss", "component": "audience"}] * 5
        )
        weights = update_workspace_weights("ws-1", feedback=feedback, learning_rate=0.1)
        assert abs(sum(weights.values()) - 1.0) < 1e-3
        for w in weights.values():
            assert w >= 0.01
