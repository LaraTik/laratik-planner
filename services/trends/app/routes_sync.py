"""POST /v1/sync and GET /v1/sync/{jobId}.

Job lifecycle (per the plan §6.2):
  queued → running → success | error
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session, get_session_factory
from app.models import TrendFetchJob, TrendSource
from app.observability import FEED_QUERIES_TOTAL, get_logger
from app.scheduler import trigger_now

logger = get_logger("routes_sync")

router = APIRouter(prefix="/v1/sync", tags=["sync"])


# ─── Request / response models ──────────────────────────────────────────────
class SyncRequest(BaseModel):
    agencyId: uuid.UUID
    sourceKey: Optional[str] = Field(
        default=None,
        description="When set, only this source is triggered. When None, all enabled sources for the agency run.",
    )
    fullSync: bool = Field(
        default=False,
        description="When True, bypasses the per-source dedup cache and re-persists everything.",
    )


class SyncQueuedResponse(BaseModel):
    jobId: uuid.UUID
    status: str = "queued"
    queuedAt: datetime


class SyncStatusResponse(BaseModel):
    jobId: uuid.UUID
    status: str
    sourceKey: Optional[str] = None
    signalsAdded: int = 0
    durationMs: Optional[int] = None
    errorMessage: Optional[str] = None
    startedAt: Optional[datetime] = None
    completedAt: Optional[datetime] = None
    createdAt: datetime


# ─── Routes ─────────────────────────────────────────────────────────────────
@router.post("", response_model=SyncQueuedResponse, status_code=status.HTTP_202_ACCEPTED)
async def queue_sync(
    body: SyncRequest,
    session: AsyncSession = Depends(get_session),
) -> SyncQueuedResponse:
    """Queue a manual sync. Returns the jobId immediately; the actual work
    runs in the scheduler. Poll `GET /v1/sync/{jobId}` for status.
    """
    job_id = uuid.uuid4()
    workspace_row = (
        await session.execute(
            text("SELECT id FROM workspace WHERE agency_id = :agency_id AND archived_at IS NULL LIMIT 1"),
            {"agency_id": body.agencyId},
        )
    ).first()
    if workspace_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="agency_has_no_workspace")
    job = TrendFetchJob(
        id=job_id,
        workspace_id=workspace_row[0],
        source_key=body.sourceKey or "__all__",
        status="queued",
    )
    session.add(job)
    await session.flush()
    logger.info(
        "sync.queued",
        job_id=str(job_id),
        agency_id=str(body.agencyId),
        source_key=body.sourceKey,
        full_sync=body.fullSync,
    )
    # Fire-and-forget the actual sync. The scheduler writes back the
    # status / signalsAdded / error fields when the job finishes.
    import asyncio
    asyncio.create_task(_run_job(job_id, body.agencyId, body.sourceKey))
    return SyncQueuedResponse(jobId=job_id, queuedAt=job.created_at or datetime.utcnow())


async def _run_job(job_id: uuid.UUID, agency_id: uuid.UUID, source_key: Optional[str]) -> None:
    """Background task — call the scheduler and let it write the outcome."""
    try:
        if source_key:
            await trigger_now(source_key, agency_id=agency_id, job_id=job_id)
        else:
            async with get_session_factory()() as session:
                keys = list((await session.execute(select(TrendSource.source_key).where(TrendSource.agency_id == agency_id, TrendSource.enabled.is_(True)))).scalars().all())
            for key in keys:
                await trigger_now(key, agency_id=agency_id, job_id=job_id)
    except Exception as exc:  # noqa: BLE001 — recorded by the scheduler
        logger.warning("sync.background.error", job_id=str(job_id), error=str(exc))


@router.get("/{job_id}", response_model=SyncStatusResponse)
async def get_sync_status(
    job_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> SyncStatusResponse:
    stmt = select(TrendFetchJob).where(TrendFetchJob.id == job_id)
    job = (await session.execute(stmt)).scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job_not_found")
    FEED_QUERIES_TOTAL.labels(sort_by="sync_status").inc()
    return SyncStatusResponse(
        jobId=job.id,
        status=job.status,
        sourceKey=job.source_key,
        signalsAdded=job.signals_added,
        durationMs=job.duration_ms,
        errorMessage=job.error_message,
        startedAt=job.started_at,
        completedAt=job.completed_at,
        createdAt=job.created_at,
    )
