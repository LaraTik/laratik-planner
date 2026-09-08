"""Per-source signal dedup.

Two layers:
  1. Hard dedup: (source_key, source_id) — same upstream item, never twice.
  2. Soft dedup: (platform, normalized_label) within 24h — the same trend
     reappearing on a fresh fetch.

Returns `False` from `should_keep` when the signal should be discarded.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TrendSignal


def normalize_label(label: str) -> str:
    """Lower-case, strip leading `#`, drop non-alphanumerics.

    Examples:
        '#AIRevolution'   -> 'airevolution'
        '  MENA-style!! ' -> 'menastyle'
    """
    if not label:
        return ""
    cleaned = label.strip().lower().lstrip("#")
    cleaned = re.sub(r"[^a-z0-9]+", "", cleaned)
    return cleaned


async def _existing_in_window(
    session: AsyncSession,
    *,
    platform: str,
    source_id: Optional[str] = None,
    normalized_label: Optional[str] = None,
    window_hours: int = 24,
) -> list[TrendSignal]:
    """Helper: select signals that match the dedup key inside the window."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=window_hours)

    filters = [
        TrendSignal.platform == platform,
        TrendSignal.fetched_at >= cutoff,
    ]
    if source_id is not None:
        filters.append(TrendSignal.source_id == source_id)
    if normalized_label is not None:
        filters.append(TrendSignal.normalized_label == normalized_label)

    stmt = select(TrendSignal).where(and_(*filters))
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def should_keep(
    session: AsyncSession,
    signal: TrendSignal,
    *,
    window_hours: int = 24,
) -> bool:
    """Decide whether `signal` should be persisted.

    Rules (evaluated in order, first match wins):
      1. If the (platform, source_id) is already in the window → drop (hard).
      2. If the (platform, normalized_label) is already in the window → drop (soft).
      3. Otherwise → keep.

    The caller is responsible for actually inserting the row on `True`.
    This function performs only the SELECT.
    """
    # 1. Hard dedup
    if signal.source_id:
        existing_hard = await _existing_in_window(
            session,
            platform=signal.platform,
            source_id=signal.source_id,
            window_hours=window_hours,
        )
        if existing_hard:
            return False

    # 2. Soft dedup
    if signal.normalized_label:
        existing_soft = await _existing_in_window(
            session,
            platform=signal.platform,
            normalized_label=signal.normalized_label,
            window_hours=window_hours,
        )
        if existing_soft:
            return False

    return True


def should_keep_sync(
    candidate: TrendSignal,
    existing_signals_in_24h: Iterable[TrendSignal],
) -> bool:
    """Pure-Python dedup, useful for the bulk-load path where a session
    roundtrip per signal is too expensive.

    Mirrors the rules in `should_keep` exactly:
      1. (platform, source_id) in window → drop
      2. (platform, normalized_label) in window → drop
      3. otherwise → keep
    """
    existing_list = list(existing_signals_in_24h)
    if candidate.source_id:
        for row in existing_list:
            if row.platform == candidate.platform and row.source_id == candidate.source_id:
                return False
    if candidate.normalized_label:
        for row in existing_list:
            if (
                row.platform == candidate.platform
                and row.normalized_label == candidate.normalized_label
            ):
                return False
    return True
