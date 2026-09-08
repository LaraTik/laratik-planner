"""Unit tests for app.analysis.vertical.

`classify_vertical` is the BART-MNLI zero-shot classifier. We mock
the transformers pipeline so the test doesn't need a 1.5GB model
download.

Contract:
  - Empty / whitespace text → empty list.
  - Empty candidate labels → empty list.
  - Returns top_k (label, score) pairs sorted by score desc.
  - Scores are floats in [0, 1].
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.analysis.vertical import (
    DEFAULT_VERTICAL_CANDIDATES,
    classify_vertical,
)


def _patch_pipeline(monkeypatch: pytest.MonkeyPatch, return_value):
    """Replace the lazy-loaded BART pipeline with a fake that returns `return_value`."""
    from app.analysis import vertical as mod

    fake = MagicMock()
    fake.return_value = return_value
    monkeypatch.setattr(mod, "_model", fake)
    monkeypatch.setattr(mod, "_model_name", "fake-model")
    monkeypatch.setattr(mod, "_get_model", lambda model_name=None: fake)


class TestClassifyVertical:
    def test_empty_text_returns_empty_list(self) -> None:
        assert classify_vertical("") == []
        assert classify_vertical("   ") == []

    def test_empty_candidates_returns_empty_list(self) -> None:
        assert classify_vertical("some text", candidates=[]) == []

    def test_returns_top_k_results(self, monkeypatch: pytest.MonkeyPatch) -> None:
        # Simulate the transformers pipeline returning a list of dicts.
        _patch_pipeline(
            monkeypatch,
            [
                {"label": "fashion", "score": 0.81},
                {"label": "luxury", "score": 0.12},
                {"label": "beauty", "score": 0.05},
            ],
        )
        result = classify_vertical("haute couture drop", top_k=2)
        assert len(result) == 2
        # Each item is (label, score).
        assert result[0] == ("fashion", pytest.approx(0.81))
        assert result[1] == ("luxury", pytest.approx(0.12))

    def test_scores_in_zero_to_one(self, monkeypatch: pytest.MonkeyPatch) -> None:
        _patch_pipeline(
            monkeypatch,
            [
                {"label": "technology", "score": 0.99},
                {"label": "gaming", "score": 0.01},
            ],
        )
        for label, score in classify_vertical("AI tooling"):
            assert 0.0 <= score <= 1.0
            assert isinstance(label, str)

    def test_default_candidates_is_a_list_of_strings(self) -> None:
        """The default candidate list is non-empty and contains strings only."""
        assert isinstance(DEFAULT_VERTICAL_CANDIDATES, list)
        assert len(DEFAULT_VERTICAL_CANDIDATES) > 5
        for c in DEFAULT_VERTICAL_CANDIDATES:
            assert isinstance(c, str)
            assert c.strip() == c

    def test_dict_or_list_result_handled(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Pipeline can return a single dict (top_k=1 path) instead of a list."""
        _patch_pipeline(monkeypatch, {"label": "food and beverage", "score": 0.74})
        result = classify_vertical("trendy matcha", top_k=1)
        assert len(result) == 1
        assert result[0][0] == "food and beverage"
