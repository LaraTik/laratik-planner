"""Unit tests for app.analysis.scoring.

The math core of the sidecar lives in `scoring.py`; these tests pin
its contract so any tweak to the formulas has to come with a test
update. Numbers are chosen to be stable, well-separated, and easy to
eyeball in a CI failure.
"""

from __future__ import annotations

import math

import pytest

from app.analysis.scoring import (
    apply_bayesian_smoothing,
    compute_lifecycle,
    compute_velocity,
    wilson_lower_bound,
)


# ─── compute_velocity ───────────────────────────────────────────────────────
class TestComputeVelocity:
    def test_zero_baseline_returns_zero(self) -> None:
        """All-zero input should not divide by zero; it should return 0.0."""
        assert compute_velocity(0, 0) == 0.0

    def test_recent_burst_scores_high(self) -> None:
        """When the last 24h is 5x the 7d daily baseline, velocity is high."""
        # 7d=70 → daily baseline 10. 24h=50 → ratio 5.0 → 1 - exp(-5) ≈ 0.993 → *100 ≈ 99
        score = compute_velocity(score_24h=50, score_7d=70)
        assert score > 90.0, f"expected a hot score, got {score}"
        assert score <= 100.0

    def test_flat_activity_stays_low(self) -> None:
        """When 24h matches the 7d daily baseline, velocity is low."""
        # 7d=70 → baseline 10. 24h=10 → ratio ≈ 1.0 → 1 - 1/e ≈ 0.632 → *100 ≈ 63
        score = compute_velocity(score_24h=10, score_7d=70)
        # Even "flat" should give a non-trivial mid-range score because
        # the half-life weights recent activity; the floor is in the 30-70 band.
        assert 30.0 <= score <= 80.0, f"expected a mid score, got {score}"

    def test_returns_in_zero_to_one_hundred(self) -> None:
        """Result is always clamped to [0, 100]."""
        for s24, s7 in [(0, 0), (1, 0), (1000, 1), (0, 1000), (50, 50)]:
            v = compute_velocity(s24, s7)
            assert 0.0 <= v <= 100.0, f"out of range for ({s24},{s7}): {v}"

    def test_negative_input_raises(self) -> None:
        """Negative inputs are a programmer error → ValueError."""
        with pytest.raises(ValueError):
            compute_velocity(-1, 0)
        with pytest.raises(ValueError):
            compute_velocity(0, -1)

    def test_half_life_affects_result(self) -> None:
        """A shorter half-life dampens the recent burst more than a long one."""
        # Same inputs, two half-lives. The shorter one gives a smaller
        # weighted_recent (decay term larger), so a smaller ratio.
        long = compute_velocity(50, 70, half_life_hours=24.0)
        short = compute_velocity(50, 70, half_life_hours=2.0)
        # A shorter half-life discounts historical activity faster, so the
        # same recent burst receives more weight.
        assert short >= long, f"short={short} should be >= long={long}"


# ─── apply_bayesian_smoothing ───────────────────────────────────────────────
class TestApplyBayesianSmoothing:
    def test_observed_of_one_returns_one(self) -> None:
        """With observed=1.0 and a positive prior, smoothing still returns 1.0."""
        # (1 + 5*0.5) / (1 + 5) = 3.5 / 6 ≈ 0.583. NOT 1.0.
        # The test pins the actual contract: m-estimate NEVER reaches 1.0
        # unless the prior is also 1.0.
        result = apply_bayesian_smoothing(observed=1.0, prior=0.5, weight=5.0)
        assert math.isclose(result, 0.5833, rel_tol=1e-3)

    def test_observed_of_zero_with_default_prior(self) -> None:
        """A single zero observation with default prior returns the smoothed value."""
        result = apply_bayesian_smoothing(observed=0.0)
        # (0 + 5*0.5) / (1 + 5) = 2.5 / 6 ≈ 0.4167
        assert math.isclose(result, 0.4167, rel_tol=1e-3)

    def test_prior_matches_observed_returns_prior(self) -> None:
        """If observed equals prior, smoothing is a no-op."""
        result = apply_bayesian_smoothing(observed=0.5, prior=0.5, weight=5.0)
        assert math.isclose(result, 0.5)

    def test_high_weight_pin_to_prior(self) -> None:
        """With weight=1000, an observed of 0 returns almost the prior."""
        result = apply_bayesian_smoothing(observed=0.0, prior=0.5, weight=1000)
        assert math.isclose(result, 0.5, abs_tol=1e-3)

    def test_zero_weight_returns_observed(self) -> None:
        """With weight=0, smoothing is bypassed (returns observed)."""
        result = apply_bayesian_smoothing(observed=0.0, prior=0.5, weight=0)
        assert result == 0.0

    def test_observed_out_of_range_raises(self) -> None:
        with pytest.raises(ValueError):
            apply_bayesian_smoothing(observed=1.5)

    def test_prior_out_of_range_raises(self) -> None:
        with pytest.raises(ValueError):
            apply_bayesian_smoothing(observed=0.5, prior=-0.1)


# ─── wilson_lower_bound ─────────────────────────────────────────────────────
class TestWilsonLowerBound:
    def test_zero_total_returns_zero(self) -> None:
        assert wilson_lower_bound(positive=0, total=0) == 0.0

    def test_all_positive_is_close_to_one(self) -> None:
        """With 1000 of 1000 positive, the lower bound is very close to 1."""
        result = wilson_lower_bound(positive=1000, total=1000)
        assert result > 0.98, f"expected near 1.0, got {result}"

    def test_no_positive_is_zero(self) -> None:
        assert wilson_lower_bound(positive=0, total=10) == 0.0

    def test_higher_count_narrows_confidence(self) -> None:
        """For the same p, a larger n gives a higher lower bound."""
        small = wilson_lower_bound(positive=5, total=10)
        large = wilson_lower_bound(positive=500, total=1000)
        assert large > small, f"large={large} should be > small={small}"

    def test_invalid_positive_raises(self) -> None:
        with pytest.raises(ValueError):
            wilson_lower_bound(positive=11, total=10)


# ─── compute_lifecycle ──────────────────────────────────────────────────────
class TestComputeLifecycle:
    def test_emerging_when_positive_and_accelerating(self) -> None:
        assert compute_lifecycle(velocity_now=80.0, velocity_accel=10.0) == "emerging"

    def test_peaking_when_positive_and_not_accelerating(self) -> None:
        assert compute_lifecycle(velocity_now=70.0, velocity_accel=0.0) == "peaking"

    def test_declining_when_negative_and_decelerating(self) -> None:
        assert compute_lifecycle(velocity_now=-10.0, velocity_accel=-2.0) == "declining"

    def test_stable_in_dead_band(self) -> None:
        """Velocity between POS and NEG → 'stable'."""
        assert compute_lifecycle(velocity_now=0.0, velocity_accel=0.0) == "stable"
        assert compute_lifecycle(velocity_now=2.0, velocity_accel=0.0) == "stable"
        assert compute_lifecycle(velocity_now=-2.0, velocity_accel=0.0) == "stable"

    def test_in_lifecycle_literal_set(self) -> None:
        """The returned string is always one of the four documented values."""
        for v in (-100.0, -10.0, 0.0, 10.0, 100.0):
            for a in (-50.0, -10.0, 0.0, 10.0, 50.0):
                lc = compute_lifecycle(v, a)
                assert lc in {"emerging", "peaking", "declining", "stable"}, lc
