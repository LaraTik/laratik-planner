"""Unit tests for app.analysis.sentiment.

`analyze_sentiment` is the VADER + Detoxify pipeline. We mock the
underlying models so the test runs in <1s and doesn't need a 170MB
download.

Contract pinned here:
  - Empty input → neutral, safe.
  - VADER < -0.5 → dropped_reason="negative_sentiment".
  - Detoxify > 0.7 → dropped_reason="high_toxicity".
  - safe_to_amplify is True iff no drop.
"""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.analysis.sentiment import (
    DETOXIFY_DROP_THRESHOLD,
    VADER_DROP_THRESHOLD,
    analyze_sentiment,
)


# ─── Helpers ─────────────────────────────────────────────────────────────────
def _patch_vader(monkeypatch: pytest.MonkeyPatch, compound: float) -> None:
    """Replace the lazy-loaded VADER analyzer with a fake that returns `compound`."""
    from app.analysis import sentiment as mod

    fake = type("FakeVader", (), {})()
    fake.polarity_scores = lambda text: {"compound": compound}
    monkeypatch.setattr(mod, "_vader", fake)
    # Bypass the lock-protected lazy init.
    monkeypatch.setattr(mod, "_get_vader", lambda: fake)


def _patch_detoxify(monkeypatch: pytest.MonkeyPatch, toxicity: float) -> None:
    """Replace the lazy-loaded Detoxify model with a fake that returns `toxicity`."""
    from app.analysis import sentiment as mod

    class FakeDetoxify:
        def predict(self, texts):
            return {"toxicity": [toxicity] * len(texts)}

    monkeypatch.setattr(mod, "_detoxify_model", FakeDetoxify())
    monkeypatch.setattr(mod, "_get_detoxify", lambda: FakeDetoxify())


# ─── Tests ──────────────────────────────────────────────────────────────────
class TestAnalyzeSentiment:
    def test_empty_input_returns_neutral(self) -> None:
        result = analyze_sentiment([])
        assert result.sentiment == 0.0
        assert result.toxicity == 0.0
        assert result.safe_to_amplify is True
        assert result.dropped_reason is None
        assert result.sample_size == 0

    def test_positive_text_is_safe(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _patch_vader(monkeypatch, compound=0.6)
        _patch_detoxify(monkeypatch, toxicity=0.05)
        result = analyze_sentiment(["This is a wonderful day!"])
        assert result.sentiment > 0.0
        assert result.toxicity < 0.1
        assert result.safe_to_amplify is True
        assert result.dropped_reason is None

    def test_negative_text_drops(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _patch_vader(monkeypatch, compound=VADER_DROP_THRESHOLD - 0.1)
        _patch_detoxify(monkeypatch, toxicity=0.0)
        result = analyze_sentiment(["This is the worst, terrible, awful."])
        assert result.sentiment < VADER_DROP_THRESHOLD
        assert result.dropped_reason == "negative_sentiment"
        assert result.safe_to_amplify is False

    def test_toxic_text_drops(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """When VADER is fine but Detoxify trips, the drop reason is toxicity."""
        _patch_vader(monkeypatch, compound=0.0)
        _patch_detoxify(monkeypatch, toxicity=DETOXIFY_DROP_THRESHOLD + 0.1)
        result = analyze_sentiment(["some text"])
        assert result.dropped_reason == "high_toxicity"
        assert result.safe_to_amplify is False

    def test_detoxify_failure_degrades_gracefully(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """If Detoxify throws, sentiment-only path is used; safe defaults apply."""
        _patch_vader(monkeypatch, compound=0.0)

        def _broken():
            raise RuntimeError("detoxify unavailable")

        from app.analysis import sentiment as mod

        monkeypatch.setattr(mod, "_get_detoxify", _broken)
        result = analyze_sentiment(["hello world"])
        assert result.sentiment == 0.0
        assert result.toxicity == 0.0
        assert result.safe_to_amplify is True

    def test_sample_size_matches_input(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _patch_vader(monkeypatch, compound=0.0)
        _patch_detoxify(monkeypatch, toxicity=0.0)
        result = analyze_sentiment(["a", "b", "c"])
        assert result.sample_size == 3

    def test_threshold_constants_are_documented_values(self) -> None:
        """Pin the thresholds to the values in plan §4.5."""
        assert VADER_DROP_THRESHOLD == -0.5
        assert DETOXIFY_DROP_THRESHOLD == 0.7
