"""APScheduler 3.x — periodic sync jobs.

One AsyncIOScheduler instance, process-wide. On startup, every enabled
`trend_source` row gets a job registered at its configured cadence
(default: SYNC_DEFAULT_CADENCE_MINUTES = 360 = 6h). The job function:

  1. Reads the source from the DB (live, in case it changed).
  2. Calls the extractor's `fetch(source)` through the circuit breaker.
  3. Persists the returned signals to `trend_signal` (analysis pipeline
     is run inline; the heavy ML calls are deferred / batched).
  4. Writes a `trend_fetch_job` row (status = success | error).
  5. On exception: writes a `trend_fetch_job` row with status='error'
     and the exception class + message, but DOES NOT crash the scheduler
     (APScheduler swallows the exception in the next iteration).

The scheduler also exposes a `trigger_now(source_key, agency_id)` helper
used by `/v1/sync` and the source-test endpoint.
"""

from __future__ import annotations

import traceback
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID, uuid4

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy import select, text

from app.circuit_breaker import CircuitBreaker, CircuitOpen
from app.config import get_settings
from app.dedupe import normalize_label, should_keep
from app.extractor.base import RawSignal, get_source
from app.models import (
    TrendFetchJob,
    TrendSignal,
    TrendSource,
    TrendSourceActivity,
    WorkspaceSourceOptout,
)
from app.observability import (
    SYNC_DURATION_SECONDS,
    SYNC_ERRORS_TOTAL,
    SYNC_SIGNALS_TOTAL,
    SYNC_TOTAL,
    get_logger,
)

logger = get_logger("scheduler")

# ─── Scheduler singleton ────────────────────────────────────────────────────
_scheduler: Optional[AsyncIOScheduler] = None

JOB_ID_PREFIX = "trend_sync::"


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        _scheduler = AsyncIOScheduler()
    return _scheduler


def _job_id(source_key: str, agency_id: Optional[UUID]) -> str:
    """A stable, unique APScheduler job id per (source_key, agency_id) pair."""
    agency_part = str(agency_id) if agency_id is not None else "global"
    return f"{JOB_ID_PREFIX}{agency_part}::{source_key}"


# ─── Lifecycle ───────────────────────────────────────────────────────────────
async def start_scheduler(session_factory: Any) -> AsyncIOScheduler:
    """Initialise + start the scheduler. Idempotent under lifespan re-fire."""
    scheduler = get_scheduler()
    if scheduler.running:
        return scheduler

    scheduler.start()
    logger.info("scheduler.started")
    await _schedule_all_enabled(session_factory)
    return scheduler


async def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("scheduler.stopped")


async def _schedule_all_enabled(session_factory: Any) -> None:
    """Walk every enabled trend_source and register a job for it.

    Only agency rows explicitly enabled by an admin are scheduled.
    """
    scheduler = get_scheduler()
    async with session_factory() as session:
        stmt = select(TrendSource).where(TrendSource.enabled.is_(True))
        rows = (await session.execute(stmt)).scalars().all()

    settings = get_settings()
    for source in rows:
        cadence_map = {"1h": 60, "3h": 180, "6h": 360, "12h": 720, "24h": 1440}
        cadence = cadence_map.get(source.cadence_override or "", settings.SYNC_DEFAULT_CADENCE_MINUTES)
        _register_job(source.source_key, source.agency_id, cadence)
    logger.info("scheduler.scheduled_enabled", count=len(rows))


def _register_job(
    source_key: str,
    agency_id: Optional[UUID],
    cadence_minutes: int,
) -> None:
    """Add or replace the interval job for this source. Safe to call repeatedly."""
    scheduler = get_scheduler()
    job_id = _job_id(source_key, agency_id)
    if scheduler.get_job(job_id) is not None:
        scheduler.remove_job(job_id)
    scheduler.add_job(
        func=_run_sync_cycle,
        trigger=IntervalTrigger(minutes=cadence_minutes),
        args=[source_key, agency_id, None],
        id=job_id,
        replace_existing=True,
        coalesce=True,
        max_instances=1,
        next_run_time=datetime.now(timezone.utc),  # run once at startup
    )
    logger.info(
        "scheduler.job.registered",
        source_key=source_key,
        agency_id=str(agency_id) if agency_id else None,
        cadence_minutes=cadence_minutes,
    )


# ─── Job function ────────────────────────────────────────────────────────────
async def _run_sync_cycle(
    source_key: str,
    agency_id: Optional[UUID],
    job_id: Optional[UUID],
) -> None:
    """The unit of work scheduled by APScheduler.

    Catches every exception so APScheduler keeps firing on the next tick.
    All failure modes are persisted to `trend_fetch_job` / `trend_source_activity`.
    """
    from app.db import get_session_factory  # local import avoids cycle at import time

    started_at = datetime.now(timezone.utc)
    factory = get_session_factory()

    job_row_id = job_id or uuid4()
    created_job_row = job_id is None

    try:
        async with factory() as session:
            # Look up the source row.
            stmt = select(TrendSource).where(TrendSource.source_key == source_key, TrendSource.enabled.is_(True))
            if agency_id is not None:
                stmt = stmt.where(TrendSource.agency_id == agency_id)
            source = (await session.execute(stmt)).scalars().first()
            if source is None:
                if job_id is not None:
                    job = (await session.execute(select(TrendFetchJob).where(TrendFetchJob.id == job_id))).scalar_one_or_none()
                    if job is not None:
                        job.status = "error"
                        job.error_message = f"source_not_enabled: {source_key}"
                        job.completed_at = datetime.now(timezone.utc)
                logger.info("scheduler.job.skipped", source_key=source_key)
                return

            workspace_rows = await session.execute(
                text("SELECT id FROM workspace WHERE agency_id = :agency_id AND archived_at IS NULL"),
                {"agency_id": source.agency_id},
            )
            workspace_ids = list(workspace_rows.scalars().all())
            if workspace_ids:
                optout_rows = await session.execute(
                    select(WorkspaceSourceOptout.workspace_id).where(
                        WorkspaceSourceOptout.source_key == source_key,
                        WorkspaceSourceOptout.workspace_id.in_(workspace_ids),
                    )
                )
                opted_out = set(optout_rows.scalars().all())
                workspace_ids = [workspace_id for workspace_id in workspace_ids if workspace_id not in opted_out]
            if not workspace_ids:
                if job_id is not None:
                    job = (await session.execute(select(TrendFetchJob).where(TrendFetchJob.id == job_id))).scalar_one_or_none()
                    if job is not None:
                        job.status = "success"
                        job.signals_added = 0
                        job.completed_at = datetime.now(timezone.utc)
                logger.info("scheduler.job.skipped_no_workspaces", source_key=source_key, agency_id=str(source.agency_id))
                return

            job: TrendFetchJob | None = None
            if created_job_row:
                job = TrendFetchJob(
                    id=job_row_id,
                    workspace_id=workspace_ids[0],
                    source_key=source_key,
                    status="running",
                    started_at=started_at,
                )
                session.add(job)
                await session.flush()
            else:
                job = (await session.execute(select(TrendFetchJob).where(TrendFetchJob.id == job_id))).scalar_one_or_none()
                if job is not None:
                    job.status = "running"
                    job.started_at = started_at
                    job.error_message = None
                    await session.flush()

            # Run the extractor's fetch() under the circuit breaker.
            from app.extractor.base import all_sources
            extractor_cls = next((candidate for candidate in all_sources() if candidate.source_key == source.source_key), None)
            if extractor_cls is None:
                raise LookupError(f"no extractor registered for source_key={source.source_key!r}")
            breaker = CircuitBreaker(session, source_key, agency_id=source.agency_id)

            async def _do_fetch() -> list[RawSignal]:
                instance = extractor_cls()  # type: ignore[abstract]
                return await instance.fetch(source)

            try:
                raw_signals = await breaker.call(_do_fetch)
            except CircuitOpen as exc:
                if job is not None:
                    job.status = "degraded"
                    job.error_message = str(exc)
                    job.completed_at = datetime.now(timezone.utc)
                SYNC_TOTAL.labels(source_key=source_key, outcome="circuit_open").inc()
                return
            except Exception as exc:  # noqa: BLE001 — recorded, not raised
                err_class = exc.__class__.__name__
                err_msg = str(exc)[:500]
                SYNC_ERRORS_TOTAL.labels(source_key=source_key, error_class=err_class).inc()
                SYNC_TOTAL.labels(source_key=source_key, outcome="error").inc()
                if job is not None:
                    job.status = "error"
                    job.error_message = f"{err_class}: {err_msg}"
                    job.completed_at = datetime.now(timezone.utc)
                activity = TrendSourceActivity(
                    source_key=source_key,
                    agency_id=source.agency_id,
                    event_type="sync_failed",
                    message=err_msg,
                    metadata={"errorClass": err_class},
                    duration_ms=int((datetime.now(timezone.utc) - started_at).total_seconds() * 1000),
                )
                session.add(activity)
                logger.warning(
                    "scheduler.job.error",
                    source_key=source_key,
                    error_class=err_class,
                    error=err_msg,
                )
                return

            # Persist signals (with dedup). Heavy analysis (embedding, etc.)
            # is deferred to the analysis worker; here we just store the raw
            # signal so the feed is queryable.
            signals_added = 0
            for workspace_id in workspace_ids:
                for raw in raw_signals[: source.max_signals_per_cycle]:
                    normalized = normalize_label(raw.label)
                    fetched_at = raw.fetched_at.replace(tzinfo=timezone.utc) if raw.fetched_at.tzinfo is None else raw.fetched_at
                    signal_row = TrendSignal(
                        workspace_id=workspace_id,
                        platform=raw.platform,
                        type=raw.type,
                        label=raw.label,
                        normalized_label=normalized,
                        language=raw.language,
                        region=raw.region,
                        score=raw.score,
                        raw_score=raw.score,
                        raw_payload=raw.raw_payload or {},
                        source_id=raw.source_id,
                        source_url=raw.source_url,
                        source_key=source_key,
                        fetched_at=fetched_at,
                        expires_at=fetched_at + timedelta(days=7),
                    )
                    keep = await should_keep(session, signal_row)
                    if not keep:
                        continue
                    session.add(signal_row)
                    signals_added += 1
                    SYNC_SIGNALS_TOTAL.labels(source_key=source_key, platform=raw.platform).inc()

            if job is not None:
                job.status = "success"
                job.signals_added = (job.signals_added or 0) + signals_added if not created_job_row else signals_added
                job.completed_at = datetime.now(timezone.utc)
                job.duration_ms = int(
                    (datetime.now(timezone.utc) - started_at).total_seconds() * 1000
                )
            activity = TrendSourceActivity(
                source_key=source_key,
                agency_id=source.agency_id,
                event_type="sync_completed",
                message=f"Stored {signals_added} signals across {len(workspace_ids)} workspaces",
                metadata={"signalsCount": signals_added, "workspaceCount": len(workspace_ids)},
                duration_ms=int(
                    (datetime.now(timezone.utc) - started_at).total_seconds() * 1000
                ),
            )
            session.add(activity)
            SYNC_TOTAL.labels(source_key=source_key, outcome="success").inc()
            SYNC_DURATION_SECONDS.labels(source_key=source_key).observe(
                (datetime.now(timezone.utc) - started_at).total_seconds()
            )
            logger.info(
                "scheduler.job.success",
                source_key=source_key,
                signals_added=signals_added,
            )
    except Exception as exc:  # noqa: BLE001 — last-ditch safety net
        # The inner try/except already records most errors. This catches
        # only the unexpected (DB unavailable, scheduler bug, …) and
        # writes a minimal audit row.
        err_class = exc.__class__.__name__
        err_msg = str(exc)[:500]
        logger.error(
            "scheduler.job.unhandled",
            source_key=source_key,
            error_class=err_class,
            error=err_msg,
            traceback=traceback.format_exc(),
        )
        SYNC_TOTAL.labels(source_key=source_key, outcome="error").inc()
        SYNC_ERRORS_TOTAL.labels(source_key=source_key, error_class=err_class).inc()


# ─── Manual trigger ─────────────────────────────────────────────────────────
async def trigger_now(
    source_key: str,
    agency_id: Optional[UUID] = None,
    job_id: Optional[UUID] = None,
) -> UUID:
    """Run a sync cycle for `source_key` immediately and return the job id.

    Used by `/v1/sync` (manual admin trigger) and the per-source test
    endpoint. The job is awaited here so the HTTP response can include
    the job id and the caller can poll `/v1/sync/{jobId}`.
    """
    from app.db import get_session_factory

    factory = get_session_factory()
    job_id = job_id or uuid4()
    # Use the same path as the cron job, but with a pre-allocated job id
    # so we can return it synchronously.
    await _run_sync_cycle(source_key, agency_id, job_id)
    return job_id
