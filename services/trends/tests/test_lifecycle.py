"""Unit tests for app.analysis.lifecycle.

`classify_lifecycle` is the S-curve / Bass-diffusion wrapper that turns
a list of recent scores into a single lifecycle state. The contract is
small (one input, one output) but the cutoff logic is fiddly, so we
test each bucket explicitly.
"""

from __future__ import annotations

import pytest

from app.analysis.lifecycle import (
    bass_diffusion_estimate,
    classify_lifecycle,
)


class TestClassifyLifecycle:
    def test_empty_returns_stable(self) -> None:
        assert classify_lifecycle([]) == "stable"

    def test_short_series_returns_stable(self) -> None:
        """< 3 points → degrade to 'stable' (not enough signal)."""
        assert classify_lifecycle([1.0]) == "stable"
        assert classify_lifecycle([1.0, 2.0]) == "stable"

    def test_three_points_steady_rise_is_stable_or_emerging(self) -> None:
        """A 3-point series of growing scores should not be 'declining'."""
        lc = classify_lifecycle([10.0, 20.0, 30.0])
        assert lc in {"emerging", "peaking", "stable"}

    def test_seven_points_rapid_growth_is_emerging(self) -> None:
        """A 7-point series with strong growth should be 'emerging'."""
        # Daily scores over 7 days, last day much higher than baseline.
        series = [10, 12, 14, 16, 18, 20, 80]
        assert classify_lifecycle(series) == "emerging"

    def test_seven_points_sharp_drop_is_declining(self) -> None:
        """A 7-point series with a sharp recent drop is 'declining'."""
        series = [80, 75, 70, 60, 40, 20, 5]
        assert classify_lifecycle(series) == "declining"

    def test_flat_series_is_stable(self) -> None:
        """A flat series should be 'stable' regardless of magnitude."""
        series = [50, 50, 50, 50, 50, 50, 50]
        assert classify_lifecycle(series) == "stable"

    def test_sustained_high_with_recent_plateau_is_peaking(self) -> None:
        """High recent activity but no acceleration → 'peaking'."""
        # Sustained ~80, recent day equal, prior day slightly lower.
        series = [30, 50, 70, 80, 80, 80, 80]
        lc = classify_lifecycle(series)
        assert lc in {"peaking", "stable"}, f"got {lc!r}"

    def test_result_is_one_of_four(self) -> None:
        """Returned lifecycle is always a documented value."""
        series = [10, 20, 30, 40, 50, 60, 70]
        lc = classify_lifecycle(series)
        assert lc in {"emerging", "peaking", "declining", "stable"}


class TestBassDiffusionEstimate:
    def test_zero_length_returns_zero(self) -> None:
        assert bass_diffusion_estimate([]) == 0.0

    def test_increases_monotonically(self) -> None:
        """Longer series always ≥ shorter series (adoption can't go back)."""
        v1 = bass_diffusion_estimate([1, 1, 1])
        v2 = bass_diffusion_estimate([1, 1, 1, 1, 1])
        assert v2 >= v1

    def test_returns_in_zero_to_one(self) -> None:
        """Bass F(t) is a probability — must be in [0, 1]."""
        for n in [1, 5, 10, 50, 100, 1000]:
            v = bass_diffusion_estimate([1.0] * n)
            assert 0.0 <= v <= 1.0, f"n={n} → {v}"

    def test_long_series_approaches_one(self) -> None:
        """A very long series should saturate near 1.0."""
        v = bass_diffusion_estimate([1.0] * 10000)
        assert v > 0.99, f"expected near 1.0, got {v}"
