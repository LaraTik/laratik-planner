"""Cross-platform correlation: hard merge (rapidfuzz) + soft merge (embeddings).

A "group" is a set of signals that refer to the same underlying trend
across one or more platforms. Hard-merge is a token-sort ratio > 85
(cheap, deterministic). Soft-merge is a sentence-transformer cosine > 0.78
(handles "AIRevolution" vs "AI revolution" without normalisation tricks).

When a group has more than one signal, we boost each member's velocity by
1 + 0.25 × (group_size - 1) — the cross-platform signal. The boost is
applied in-place to a copy of the signal so the caller never mutates the
DB row.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from typing import Optional

from rapidfuzz import fuzz

from app.models import TrendSignal

# Hard-merge threshold (rapidfuzz token_sort_ratio). 85 was the v1 chosen
# value; tune via planner "dismiss" feedback in v2.
HARD_MERGE_THRESHOLD = 85.0

# Soft-merge threshold (cosine similarity of all-MiniLM-L6-v2 embeddings).
# 0.78 follows the plan §3.3.
SOFT_MERGE_COSINE_THRESHOLD = 0.78

# Cross-platform velocity boost per extra member of the group.
BOOST_PER_EXTRA = 0.25


@dataclass(slots=True)
class TrendSignalGroup:
    """A correlated set of signals (one trend, multiple platforms/aliases).

    `boosted_velocity` is the score we should display in the UI; it is
    the primary signal's velocity scaled by (1 + 0.25 × (size - 1)).
    """

    primary: TrendSignal
    members: list[TrendSignal] = field(default_factory=list)
    soft_related: list[TrendSignal] = field(default_factory=list)
    boosted_velocity: float = 0.0

    @property
    def size(self) -> int:
        return 1 + len(self.members)

    @property
    def platforms(self) -> list[str]:
        seen: list[str] = []
        for s in [self.primary, *self.members, *self.soft_related]:
            if s.platform not in seen:
                seen.append(s.platform)
        return seen

    @property
    def group_id(self) -> uuid.UUID:
        return self.primary.id


def _norm(s: str) -> str:
    return (s or "").strip().lower().lstrip("#")


def _hard_match(a: TrendSignal, b: TrendSignal) -> bool:
    """Token-sort-ratio > threshold OR exact normalized-label match."""
    if a.normalized_label and a.normalized_label == b.normalized_label:
        return True
    score = fuzz.token_sort_ratio(_norm(a.label), _norm(b.label))
    return score > HARD_MERGE_THRESHOLD


def _cosine(a: list[float], b: list[float]) -> float:
    """Pure-Python cosine similarity (no numpy dep needed for 384-dim)."""
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


def _soft_match(a: TrendSignal, b: TrendSignal) -> bool:
    """Cosine similarity of the all-MiniLM-L6-v2 embeddings > threshold."""
    if a.embedding is None or b.embedding is None:
        return False
    return _cosine(list(a.embedding), list(b.embedding)) > SOFT_MERGE_COSINE_THRESHOLD


def _boost(velocity: Optional[float], group_size: int) -> float:
    base = float(velocity or 0.0)
    return base * (1.0 + BOOST_PER_EXTRA * (group_size - 1))


def dedupe_and_correlate(
    signals: list[TrendSignal],
) -> list[TrendSignalGroup]:
    """Group signals by cross-platform correlation.

    Algorithm:
      1. Sort by `fetched_at` DESC so the most-recent signal is the primary.
      2. For each ungrouped signal, walk the remaining list and add it to
         the group if it hard-matches the primary. Soft matches are kept
         in `soft_related` (not in `members`).
      3. Apply the cross-platform velocity boost to the primary's velocity
         and store it in `boosted_velocity`.

    Returns a list of `TrendSignalGroup`. Order matches the input order
    of the chosen primaries.
    """
    if not signals:
        return []

    sorted_signals = sorted(signals, key=lambda s: s.fetched_at, reverse=True)
    used: set[uuid.UUID] = set()
    groups: list[TrendSignalGroup] = []

    for primary in sorted_signals:
        if primary.id in used:
            continue
        used.add(primary.id)
        members: list[TrendSignal] = []
        soft: list[TrendSignal] = []
        for other in sorted_signals:
            if other.id == primary.id or other.id in used:
                continue
            if _hard_match(primary, other):
                members.append(other)
                used.add(other.id)
            elif _soft_match(primary, other):
                soft.append(other)
                # Note: soft matches stay ungrouped; they appear in the
                # "related trends" rail but are not merged.
        boosted = _boost(primary.velocity, 1 + len(members))
        groups.append(
            TrendSignalGroup(
                primary=primary,
                members=members,
                soft_related=soft,
                boosted_velocity=boosted,
            )
        )

    return groups
