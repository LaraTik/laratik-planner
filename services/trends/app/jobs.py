"""Durable Trend Radar queue primitives: enqueue, lease, fence, retry, dead-letter."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy import and_, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TrendFetchJob, TrendJobExecution

LEASE_SECONDS = 120
MAX_ATTEMPTS = 5


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _safe_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Reject credential material at the queue boundary, including nested keys."""
    blocked = ("secret", "token", "password", "credential", "access_key", "private_key")
    def walk(value: Any) -> Any:
        if isinstance(value, dict):
            output: dict[str, Any] = {}
            for key, child in value.items():
                if any(word in key.lower() for word in blocked):
                    raise ValueError("job_payload_must_not_contain_credentials")
                output[key] = walk(child)
            return output
        if isinstance(value, list):
            return [walk(child) for child in value]
        return value
    return walk(payload)


async def enqueue_job(
    session: AsyncSession,
    *,
    agency_id: uuid.UUID,
    workspace_id: Optional[uuid.UUID],
    source_key: Optional[str],
    dedupe_key: str,
    payload: dict[str, Any],
    job_kind: str = "trend_sync",
) -> uuid.UUID:
    payload = _safe_payload(payload)
    existing = (await session.execute(select(TrendJobExecution).where(TrendJobExecution.dedupe_key == dedupe_key, TrendJobExecution.status.in_(("queued", "running"))))).scalar_one_or_none()
    if existing is not None:
        return existing.id
    if workspace_id is None:
        raise ValueError("trend_fetch_job_requires_workspace")
    job_id = uuid.uuid4()
    session.add(TrendFetchJob(id=job_id, workspace_id=workspace_id, source_key=source_key or "__all__", status="queued"))
    session.add(TrendJobExecution(id=job_id, job_kind=job_kind, agency_id=agency_id, workspace_id=workspace_id, source_key=source_key, payload=payload, dedupe_key=dedupe_key, status="queued", max_attempts=MAX_ATTEMPTS))
    await session.flush()
    return job_id


async def claim_next_job(session: AsyncSession, *, worker_id: str, now: Optional[datetime] = None, lease_seconds: int = LEASE_SECONDS) -> Optional[TrendJobExecution]:
    now = now or _now()
    stmt = (
        select(TrendJobExecution)
        .where(
            TrendJobExecution.available_at <= now,
            or_(TrendJobExecution.status == "queued", and_(TrendJobExecution.status == "running", TrendJobExecution.lease_expires_at < now)),
        )
        .order_by(TrendJobExecution.available_at.asc(), TrendJobExecution.created_at.asc())
        .with_for_update(skip_locked=True)
        .limit(1)
    )
    job = (await session.execute(stmt)).scalar_one_or_none()
    if job is None:
        return None
    job.status = "running"
    job.attempt_count += 1
    job.lease_owner = worker_id
    job.lease_token = uuid.uuid4()
    job.lease_expires_at = now + timedelta(seconds=lease_seconds)
    job.updated_at = now
    log = await session.get(TrendFetchJob, job.id)
    if log is not None:
        log.status = "running"
        log.started_at = now
    await session.flush()
    return job


async def renew_lease(session: AsyncSession, *, job_id: uuid.UUID, worker_id: str, lease_token: uuid.UUID, now: Optional[datetime] = None, lease_seconds: int = LEASE_SECONDS) -> bool:
    now = now or _now()
    result = await session.execute(update(TrendJobExecution).where(TrendJobExecution.id == job_id, TrendJobExecution.status == "running", TrendJobExecution.lease_owner == worker_id, TrendJobExecution.lease_token == lease_token).values(lease_expires_at=now + timedelta(seconds=lease_seconds), updated_at=now))
    if result.rowcount == 1:
        log = await session.get(TrendFetchJob, job_id)
        if log is not None:
            log.status = "success"
            log.completed_at = now
    return result.rowcount == 1


async def complete_job(session: AsyncSession, *, job_id: uuid.UUID, worker_id: str, lease_token: uuid.UUID, now: Optional[datetime] = None) -> bool:
    now = now or _now()
    result = await session.execute(update(TrendJobExecution).where(TrendJobExecution.id == job_id, TrendJobExecution.status == "running", TrendJobExecution.lease_owner == worker_id, TrendJobExecution.lease_token == lease_token).values(status="succeeded", completed_at=now, lease_expires_at=None, updated_at=now))
    return result.rowcount == 1


async def fail_job(session: AsyncSession, *, job_id: uuid.UUID, worker_id: str, lease_token: uuid.UUID, error_code: str, error_message: str, now: Optional[datetime] = None) -> bool:
    now = now or _now()
    job = (await session.execute(select(TrendJobExecution).where(TrendJobExecution.id == job_id, TrendJobExecution.status == "running", TrendJobExecution.lease_owner == worker_id, TrendJobExecution.lease_token == lease_token).with_for_update())).scalar_one_or_none()
    if job is None:
        return False
    terminal = job.attempt_count >= job.max_attempts
    job.status = "dead_letter" if terminal else "queued"
    job.available_at = now if terminal else now + timedelta(seconds=min(3600, 5 * (2 ** max(job.attempt_count - 1, 0))))
    job.last_error_code = error_code
    job.last_error_message = error_message[:1000]
    job.lease_expires_at = None
    job.updated_at = now
    if terminal:
        log = await session.get(TrendFetchJob, job_id)
        if log is not None:
            log.status = "error"
            log.error_code = error_code
            log.error_message = error_message[:1000]
            log.completed_at = now
    await session.flush()
    return True
