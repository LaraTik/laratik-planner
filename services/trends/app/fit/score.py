"""Per-workspace Fit score (5-tuple weighted average).

The Fit score is the rank the planner sees most prominently. It's a
weighted sum of 5 components:

  - vertical     (0.30 default) — BART-MNLI zero-shot
  - audience     (0.25)         — Jaccard over topic sets
  - voice        (0.20)         — cosine over voice-rule embeddings
  - platform     (0.15)         — membership indicator
  - competitive  (0.10)         — sigmoid over post-count gap

Per-workspace weights are stored in `app.config` (v1) or in a dedicated
column on the workspace (v2). v1 ships the global defaults; the
Bayesian update from `trend_feedback` is applied in-place by
`update_workspace_weights`.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Iterable, Optional

from app.models import TrendSignal
from app.observability import get_logger

logger = get_logger("fit")

# ─── Default weights (from the plan §1.2 / §4.4) ────────────────────────────
DEFAULT_WEIGHTS: dict[str, float] = {
    "vertical": 0.30,
    "audience": 0.25,
    "voice": 0.20,
    "platform": 0.15,
    "competitive": 0.10,
}
assert abs(sum(DEFAULT_WEIGHTS.values()) - 1.0) < 1e-6  # sanity check on the defaults


@dataclass(slots=True)
class WorkspaceProfile:
    """The inputs to `compute_fit`.

    `voice_embedding` is a 384-dim list[float]. `vertical` is the
    workspace's primary vertical label (e.g. "luxury"). `audience_topics`
    is the topic tag set for the workspace's target audience.
    `platforms` is the set of platform keys the workspace posts to.
    """

    workspace_id: str
    vertical: str
    audience_topics: list[str] = field(default_factory=list)
    voice_embedding: Optional[list[float]] = None
    platforms: list[str] = field(default_factory=list)
    competitor_posted_count: int = 0
    workspace_posted_count: int = 0


@dataclass(slots=True)
class FitComponents:
    vertical: float
    audience: float
    voice: float
    platform: float
    competitive: float

    def as_dict(self) -> dict[str, float]:
        return {
            "vertical": self.vertical,
            "audience": self.audience,
            "voice": self.voice,
            "platform": self.platform,
            "competitive": self.competitive,
        }


@dataclass(slots=True)
class FitResult:
    fit: float
    components: FitComponents


# ─── Component primitives ───────────────────────────────────────────────────
def _cosine(a: Optional[list[float]], b: Optional[list[float]]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (na ** 0.5 * nb ** 0.5)


def _jaccard(a: Iterable[str], b: Iterable[str]) -> float:
    sa, sb = set(a), set(b)
    if not sa and not sb:
        return 0.0
    inter = len(sa & sb)
    union = len(sa | sb)
    return inter / union if union else 0.0


def _platform_membership(signal: TrendSignal, platforms: Iterable[str]) -> float:
    return 1.0 if signal.platform in set(platforms) else 0.0


def _competitive_position(
    *,
    competitor_posted_count: int,
    workspace_posted_count: int,
) -> float:
    """Sigmoid of (workspace - competitor). 1.0 = workspace is ahead, 0.0 = behind."""
    diff = workspace_posted_count - competitor_posted_count
    return 1.0 / (1.0 + math.exp(-diff))


def _vertical_match(signal: TrendSignal, workspace_vertical: str) -> float:
    """Score the signal's vertical(s) against the workspace's primary vertical.

    `signal.vertical` is a list of (label, score) from BART-MNLI. We pick
    the highest score whose label matches the workspace's vertical
    (case-insensitive). 0.0 if there is no match.
    """
    if not signal.vertical:
        return 0.0
    target = workspace_vertical.strip().lower()
    best = 0.0
    for entry in signal.vertical:
        if isinstance(entry, dict):
            label = str(entry.get("label", "")).lower()
            score = float(entry.get("score", 0.0))
        elif isinstance(entry, (list, tuple)) and len(entry) == 2:
            label, score = str(entry[0]).lower(), float(entry[1])
        else:
            continue
        if label == target and score > best:
            best = score
    return best


# ─── Public API ─────────────────────────────────────────────────────────────
def compute_fit(
    signal: TrendSignal,
    workspace: WorkspaceProfile,
    *,
    weights: Optional[dict[str, float]] = None,
) -> FitResult:
    """Compute the Fit score for a single signal against a workspace.

    Returns a `FitResult` with the 0-100 fit number and the per-component
    breakdown (also 0-100). Component scores are 0-1 in their native unit
    and scaled to 0-100 here for the UI.
    """
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    total_w = sum(w.values()) or 1.0

    v_vertical = _vertical_match(signal, workspace.vertical) * 100.0
    v_audience = _jaccard(
        workspace.audience_topics,
        (signal.raw_payload or {}).get("audience_topics", []) or [],
    ) * 100.0
    v_voice = _cosine(workspace.voice_embedding, signal.embedding) * 100.0
    v_platform = _platform_membership(signal, workspace.platforms) * 100.0
    v_competitive = _competitive_position(
        competitor_posted_count=workspace.competitor_posted_count,
        workspace_posted_count=workspace.workspace_posted_count,
    ) * 100.0

    components = FitComponents(
        vertical=v_vertical,
        audience=v_audience,
        voice=v_voice,
        platform=v_platform,
        competitive=v_competitive,
    )

    weighted = (
        w["vertical"] * v_vertical
        + w["audience"] * v_audience
        + w["voice"] * v_voice
        + w["platform"] * v_platform
        + w["competitive"] * v_competitive
    ) / total_w

    return FitResult(fit=round(weighted, 2), components=components)


def update_workspace_weights(
    workspace_id: str,
    feedback: Iterable[dict],
    *,
    prior: Optional[dict[str, float]] = None,
    learning_rate: float = 0.05,
) -> dict[str, float]:
    """Bayesian update of per-workspace weights from feedback events.

    `feedback` is an iterable of dicts with at least `kind` and
    `component` keys. `kind` is one of:
      - "positive_save" / "would_ride_again"  → boost that component
      - "negative_dismiss" / "would_not_ride"  → decrement that component

    The update is a small additive step (`learning_rate`) on the matching
    component, followed by a re-normalisation so the weights still sum to
    1.0. Components that have no feedback event are unchanged.

    Returns the new weights dict.
    """
    weights = {**DEFAULT_WEIGHTS, **(prior or {})}
    n_pos = 0
    n_neg = 0
    for event in feedback:
        kind = event.get("kind")
        comp = event.get("component")
        if not comp or comp not in weights:
            continue
        if kind in ("positive_save", "would_ride_again"):
            weights[comp] += learning_rate
            n_pos += 1
        elif kind in ("negative_dismiss", "would_not_ride"):
            weights[comp] -= learning_rate
            n_neg += 1

    # Clamp to a floor while preserving the floor after normalisation. A
    # plain divide-after-clamp can shrink a clamped value below 0.01 again
    # when another component has received a large positive update.
    floor = 0.01
    keys = list(weights)
    floor_total = floor * len(keys)
    if not keys or floor_total >= 1.0:
        weights = {k: round(1.0 / len(keys), 4) for k in keys} if keys else {}
    else:
        adjustable = {k: max(value - floor, 0.0) for k, value in weights.items()}
        adjustable_total = sum(adjustable.values())
        remaining = 1.0 - floor_total
        if adjustable_total:
            weights = {
                k: floor + remaining * (adjustable[k] / adjustable_total)
                for k in keys
            }
        else:
            weights = {k: 1.0 / len(keys) for k in keys}

        # Keep the serialized values summing to exactly one without taking a
        # floored component back below its minimum.
        weights = {k: round(value, 4) for k, value in weights.items()}
        correction = round(1.0 - sum(weights.values()), 4)
        if correction:
            target = max(keys, key=lambda key: weights[key])
            weights[target] = round(weights[target] + correction, 4)

    logger.info(
        "fit.weights.updated",
        workspace_id=workspace_id,
        n_pos=n_pos,
        n_neg=n_neg,
        new_weights=weights,
    )
    return weights
