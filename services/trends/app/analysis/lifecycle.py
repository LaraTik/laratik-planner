"""S-curve + Bass diffusion — the lifecycle classifier.

`classify_lifecycle(time_series)` takes a list of recent scores (oldest
first) and returns one of the four lifecycle states. The implementation
is intentionally simple: compute the velocity and acceleration of the
series, then delegate to `scoring.compute_lifecycle`.

A future iteration can swap in a real Bass-diffusion fit; for v1 the
plan specifies the velocity + accel heuristic as sufficient.
"""

from __future__ import annotations

from typing import Literal

from app.analysis.scoring import compute_lifecycle, compute_velocity

Lifecycle = Literal["emerging", "peaking", "declining", "stable"]


def classify_lifecycle(
    time_series: list[float],
    *,
    half_life_hours: float = 12.0,
) -> Lifecycle:
    """Classify the lifecycle of a trend from its recent score series.

    Args:
      time_series: A list of recent aggregate scores, oldest first. Should
        contain at least 3 points to be meaningful (e.g. 24h buckets over
        the last 7 days). Shorter series degrade gracefully to 'stable'.
      half_life_hours: passed through to `compute_velocity`.

    Returns:
      One of 'emerging' | 'peaking' | 'declining' | 'stable'.
    """
    if not time_series:
        return "stable"
    if len(time_series) < 3:
        # Not enough data for a meaningful classification.
        return "stable"

    last_24h = time_series[-1]
    last_7d = sum(time_series[-7:])  # up to 7 points; shorter series are summed wholly

    velocity_now = compute_velocity(last_24h, last_7d, half_life_hours=half_life_hours)

    # Acceleration = velocity_now - velocity_prev. If we have < 2 velocity
    # samples, acceleration is undefined → treat as 0.
    if len(time_series) >= 4:
        prev_24h = time_series[-2]
        prev_7d = sum(time_series[-8:-1]) if len(time_series) >= 8 else last_7d
        velocity_prev = compute_velocity(prev_24h, prev_7d, half_life_hours=half_life_hours)
        velocity_accel = velocity_now - velocity_prev
    else:
        velocity_accel = 0.0

    return compute_lifecycle(velocity_now, velocity_accel)


def bass_diffusion_estimate(
    time_series: list[float],
    *,
    p: float = 0.03,
    q: float = 0.38,
) -> float:
    """Estimate the cumulative market-potential fraction adopted so far.

    The Bass diffusion model: F(t) = (1 - exp(-(p+q)*t)) / (1 + (q/p)*exp(-(p+q)*t))

    We treat the series as a unit-time grid; the returned value is a
    0-1 fraction of the eventual market captured so far. Useful for
    deciding whether a trend is "early" (< 0.2) or "late" (> 0.8).

    Defaults from Bass's 1969 paper (consumer durables). For social
    trends you'd typically want higher `p` (faster coefficient of
    innovation) and `q` (imitation).
    """
    import math

    if not time_series:
        return 0.0
    t = float(len(time_series))
    exponent = -(p + q) * t
    try:
        return (1.0 - math.exp(exponent)) / (1.0 + (q / p) * math.exp(exponent))
    except (OverflowError, ZeroDivisionError):
        return 0.0
