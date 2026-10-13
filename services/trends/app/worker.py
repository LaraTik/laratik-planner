"""Crash-recoverable Trend Radar worker loop."""

from __future__ import annotations

import asyncio
import os
import uuid
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.jobs import claim_next_job, complete_job, fail_job
from app.observability import get_logger
from app.models import TrendSource
from app.scheduler import trigger_now
from sqlalchemy import select

logger = get_logger("trend_worker")
_worker_task: Optional[asyncio.Task[None]] = None
_stop_event: Optional[asyncio.Event] = None


async def _run_claimed(factory: async_sessionmaker[AsyncSession], worker_id: str) -> bool:
    async with factory() as session:
        job = await claim_next_job(session, worker_id=worker_id)
        await session.commit()
    if job is None:
        return False
    try:
        if job.source_key:
            await trigger_now(job.source_key, agency_id=job.agency_id, job_id=job.id)
        else:
            async with factory() as source_session:
                keys = list((await source_session.execute(select(TrendSource.source_key).where(TrendSource.agency_id == job.agency_id, TrendSource.enabled.is_(True)))).scalars().all())
            for key in keys:
                await trigger_now(key, agency_id=job.agency_id, job_id=job.id)
    except Exception as exc:  # noqa: BLE001 — persisted below and retried/fenced
        async with factory() as session:
            await fail_job(session, job_id=job.id, worker_id=worker_id, lease_token=job.lease_token, error_code=exc.__class__.__name__, error_message=str(exc))  # type: ignore[arg-type]
            await session.commit()
        logger.warning("job.failed", job_id=str(job.id), error=str(exc))
    else:
        async with factory() as session:
            if not await complete_job(session, job_id=job.id, worker_id=worker_id, lease_token=job.lease_token):  # type: ignore[arg-type]
                logger.warning("job.fence_rejected", job_id=str(job.id))
            await session.commit()
    return True


async def _worker_loop(factory: async_sessionmaker[AsyncSession], worker_id: str, stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        did_work = await _run_claimed(factory, worker_id)
        if not did_work:
            try:
                await asyncio.wait_for(stop_event.wait(), timeout=2)
            except asyncio.TimeoutError:
                pass


async def start_worker(factory: async_sessionmaker[AsyncSession]) -> None:
    global _worker_task, _stop_event
    if _worker_task is not None and not _worker_task.done():
        return
    _stop_event = asyncio.Event()
    worker_id = f"trends-{os.getpid()}-{uuid.uuid4().hex[:12]}"
    _worker_task = asyncio.create_task(_worker_loop(factory, worker_id, _stop_event), name="trend-radar-worker")


async def stop_worker() -> None:
    global _worker_task, _stop_event
    if _stop_event is not None:
        _stop_event.set()
    if _worker_task is not None:
        await _worker_task
    _worker_task = None
    _stop_event = None
