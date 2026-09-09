"""Velocity + half-life + Bayesian + Wilson — the headline numbers.

These four primitives are the math core of the sidecar. Every other analysis
function is a thin wrapper. The numbers are designed to be cheap (<1ms each)
so the per-trend cost is dominated by the ML model calls, not the math.

References:
  - Velocity / half-life:    trend-analysis-methods.md §3.1
  - Bayesian smoothing:      trend-analysis-methods.md §3.2
  - Wilson lower bound:      Reddit's classic ranking (and our conf floor)
  - Lifecycle classifier:    trend-analysis-methods.md §3.4
"""

from __future__ import annotations

import math
from typing import Literal

Lifecycle = Literal["emerging", "peaking", "declining", "stable"]


# ─── Velocity with exponential half-life ─────────────────────────────────────
def compute_velocity(
    score_24h: float,
    score_7d: float,
    *,
    half_life_hours: float = 12.0,
) -> float:
    """Velocity = growth of recent activity with exponential decay.

    `score_7d` is the rolling 7-day total; `score_24h` is the last 24h. We
    divide 7d by 7 to get the daily baseline, then compare against the
    last-24h number. The half-life decays the historical contribution so a
    burst 3 days ago is worth less than a burst 3 hours ago.

    The result is in 0-100 (clamped).

    Args:
      score_24h:       volume/mentions in the last 24h.
      score_7d:        volume/mentions in the last 7d.
      half_life_hours: T (default 12h per the plan).

    Returns:
      A 0-100 float. >= 70 is "hot" per the spec's UI thresholds.
    """
    if score_7d < 0 or score_24h < 0:
        raise ValueError("scores must be non-negative")

    daily_baseline = max(score_7d / 7.0, 1.0)  # floor at 1 to avoid div/0
    # Weight: more recent activity counts more. With half_life=12h, the
    # weight of 7d-ago activity is 2^(-7*24/12) ≈ 0. That's the right
    # behaviour: we want velocity, not the long tail.
    decay = math.pow(0.5, 24.0 / half_life_hours)
    weighted_recent = score_24h * (1.0 - decay)
    ratio = weighted_recent / daily_baseline
    # Map ratio [0, 2+] → 0-100 with a soft cap.
    score = 100.0 * (1.0 - math.exp(-ratio))
    return max(0.0, min(100.0, score))


# ─── Bayesian smoothing ──────────────────────────────────────────────────────
def apply_bayesian_smoothing(
    observed: float,
    *,
    prior: float = 0.5,
    weight: float = 5.0,
) -> float:
    """Shrink an observed proportion toward a prior using m-estimate.

    `weight` is the strength of the prior: with weight=5, an observed of
    0.0 and a prior of 0.5 yields `(0 + 5*0.5) / (1 + 5) = 0.417`. That
    means a single observation can't crash the score to zero.

    Returns a 0-1 float.
    """
    if not 0.0 <= observed <= 1.0:
        raise ValueError("observed must be in [0, 1]")
    if not 0.0 <= prior <= 1.0:
        raise ValueError("prior must be in [0, 1]")
    if weight < 0:
        raise ValueError("weight must be non-negative")
    # The "1" in the denominator is the count of observations, assumed 1.
    return (observed + weight * prior) / (1.0 + weight)


# ─── Wilson lower bound ──────────────────────────────────────────────────────
def wilson_lower_bound(
    positive: int,
    total: int,
    *,
    z: float = 1.96,
) -> float:
    """95% confidence lower bound of a binomial proportion (Wilson interval).

    Used as the "minimum plausible score" floor so a single-upvote trend
    doesn't get ranked above a 100-upvote one. The default z=1.96 is the
    95% two-tailed z-score; pass z=1.645 for 90%, z=2.576 for 99%.
    """
    if total <= 0:
        return 0.0
    if positive < 0 or positive > total:
        raise ValueError("positive must satisfy 0 <= positive <= total")
    p_hat = positive / total
    denom = 1.0 + (z * z) / total
    centre = p_hat + (z * z) / (2.0 * total)
    margin = z * math.sqrt((p_hat * (1.0 - p_hat) / total) + (z * z) / (4.0 * total * total))
    return max(0.0, (centre - margin) / denom)


# ─── Lifecycle classifier ────────────────────────────────────────────────────
def compute_lifecycle(velocity_now: float, velocity_accel: float) -> Lifecycle:
    """Classify a trend's lifecycle from its velocity + acceleration.

    The thresholds follow the plan's S-curve heuristic:
      +vel, +accel  → 'emerging'   (last 24h growing AND accelerating)
      +vel, ~accel  → 'peaking'    (hot but not accelerating)
      ~vel, -accel  → 'declining'  (was hot, decaying)
      otherwise     → 'stable'

    The "positive" / "negative" cutoffs are deliberately loose (the
    velocity number is itself 0-100; we treat >5 as a movement).
    """
    POS = 5.0
    NEG = -5.0

    if velocity_now >= POS and velocity_accel > 0.0:
        return "emerging"
    if velocity_now >= POS and velocity_accel <= 0.0:
        return "peaking"
    if velocity_now <= NEG:
        return "declining"
    return "stable"
