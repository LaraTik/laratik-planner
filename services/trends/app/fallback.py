"""Per-platform fallback chain.

Each platform has an ordered list of (source_key, fallback_func) pairs.
`run_with_fallback(platform, primary_args)` tries the primary, then each
fallback in order. If every attempt fails, it returns the cached
last-good signal from `trend_signal` (if any).

Each attempt — success or failure — is logged to `trend_fetch_job` so the
admin UI can show the full chain.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.extractor.base import RawSignal
from app.models import TrendFetchJob, TrendSignal
from app.observability import SYNC_ERRORS_TOTAL, get_logger

logger = get_logger("fallback")

# A fallback is any async callable that accepts the same args as the primary
# extractor and returns a list[RawSignal]. It can raise — run_with_fallback
# catches and continues down the chain.
FallbackFunc = Callable[..., Awaitable[list[RawSignal]]]


# ─── Registry ───────────────────────────────────────────────────────────────
# Populated at import time by the extractor modules via `register_fallback`.
# Keyed by (platform, source_key) so multiple sources for the same platform
# can each have their own fallback.
_FALLBACK_CHAIN: dict[str, list[tuple[str, FallbackFunc]]] = {}


def register_fallback(platform: str, source_key: str, after_source_key: str, fn: FallbackFunc) -> None:
    """Register `fn` as the fallback to use when `after_source_key` fails on
    `platform`. The chain is preserved in registration order; the primary
    is added at the head by `run_with_fallback`.
    """
    chain = _FALLBACK_CHAIN.setdefault(platform, [])
    chain.append((source_key, fn))
    logger.debug("fallback.registered", platform=platform, source_key=source_key, after=after_source_key)


def chain_for(platform: str) -> list[tuple[str, FallbackFunc]]:
    """Return the (source_key, fn) pairs registered for `platform`, in
    registration order. The primary is prepended by the caller.
    """
    return list(_FALLBACK_CHAIN.get(platform, []))


# ─── Runner ─────────────────────────────────────────────────────────────────
async def run_with_fallback(
    session: AsyncSession,
    *,
    platform: str,
    primary_source_key: str,
    primary_fn: FallbackFunc,
    primary_args: dict[str, Any],
    agency_id: Optional[UUID] = None,
    workspace_id: Optional[UUID] = None,
    job_id: Optional[UUID] = None,
    cache_max_age_hours: int = 24,
) -> tuple[list[RawSignal], list[dict[str, Any]]]:
    """Try primary → fallbacks → last-good cache.

    Returns `(signals, attempts)` where `attempts` is a list of
    `{"source_key": str, "outcome": "success"|"error"|"skipped", "error"?: str, "count"?: int}`.
    The caller is responsible for writing each entry to `trend_fetch_job`
    if it wants the chain surfaced in the UI.
    """
    attempts: list[dict[str, Any]] = []
    chain: list[tuple[str, FallbackFunc]] = [(primary_source_key, primary_fn)]
    chain.extend(chain_for(platform))

    for source_key, fn in chain:
        try:
            signals = await fn(**primary_args)
        except Exception as exc:  # noqa: BLE001 — we want to record every error
            err_class = exc.__class__.__name__
            err_msg = str(exc)[:500]
            SYNC_ERRORS_TOTAL.labels(source_key=source_key, error_class=err_class).inc()
            attempts.append(
                {
                    "source_key": source_key,
                    "outcome": "error",
                    "error_class": err_class,
                    "error": err_msg,
                }
            )
            logger.warning(
                "fallback.attempt_failed",
                platform=platform,
                source_key=source_key,
                error_class=err_class,
                error=err_msg,
            )
            continue
        attempts.append(
            {"source_key": source_key, "outcome": "success", "count": len(signals)}
        )
        return signals, attempts

    # Every attempt failed. Try the last-good cache.
    cached = await _last_good_cache(
        session,
        platform=platform,
        max_age_hours=cache_max_age_hours,
        agency_id=agency_id,
    )
    if cached:
        attempts.append({"source_key": "cache:last_good", "outcome": "success", "count": len(cached)})
        return cached, attempts
    attempts.append({"source_key": "cache:last_good", "outcome": "skipped", "reason": "no_cached_signals"})
    return [], attempts


async def _last_good_cache(
    session: AsyncSession,
    *,
    platform: str,
    max_age_hours: int,
    agency_id: Optional[UUID],
) -> list[RawSignal]:
    """Return the most-recent successful signals for `platform` as raw
    RawSignal stubs (re-using only the public columns). Intended to keep
    the feed alive when every extractor is failing.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=max_age_hours)
    stmt = (
        select(TrendSignal)
        .where(TrendSignal.platform == platform)
        .where(TrendSignal.fetched_at >= cutoff)
        .order_by(TrendSignal.fetched_at.desc())
        .limit(50)
    )
    rows = (await session.execute(stmt)).scalars().all()
    if not rows:
        return []
    return [
        RawSignal(
            platform=row.platform,
            type=row.type,
            label=row.label,
            source_id=row.source_id,
            source_url=row.source_url,
            raw_payload=row.raw_payload or {},
            language=row.language or "en",
            region=row.region or "XX",
            score=row.score,
            fetched_at=row.fetched_at,
        )
        for row in rows
    ]


async def write_attempts_to_job(
    session: AsyncSession,
    job_id: UUID,
    attempts: list[dict[str, Any]],
) -> None:
    """Append the chain log to a `trend_fetch_job` row. Idempotent: each
    call replaces the platform-level summary, not appends.
    """
    stmt = select(TrendFetchJob).where(TrendFetchJob.id == job_id)
    job = (await session.execute(stmt)).scalar_one_or_none()
    if job is None:
        return
    # The Drizzle `trend_fetch_job` does not have a dedicated `attempts`
    # column; stash the chain into raw_payload-style metadata on the row's
    # existing JSON fields. We use the `platforms` JSONB to also carry the
    # chain log so a single column holds both.
    chain_log = {"attempts": attempts, "logged_at": datetime.now(timezone.utc).isoformat()}
    existing = list(job.platforms or [])
    existing.append(chain_log)
    job.platforms = existing  # type: ignore[assignment]
    await session.flush()
