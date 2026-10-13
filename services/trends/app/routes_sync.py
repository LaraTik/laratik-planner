"""POST /v1/sync and GET /v1/sync/{jobId}.

Job lifecycle (per the plan §6.2):
  queued → running → success | error
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.jobs import enqueue_job
from app.models import TrendFetchJob
from app.observability import FEED_QUERIES_TOTAL, get_logger
from app.service_auth import get_service_scope

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
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> SyncQueuedResponse:
    """Queue a manual sync. Returns the jobId immediately; the actual work
    runs in the scheduler. Poll `GET /v1/sync/{jobId}` for status.
    """
    scope = get_service_scope(request)
    if scope.agency_id is not None and scope.agency_id != body.agencyId:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="agency_scope_mismatch")
    workspace_row = (
        await session.execute(
            text("SELECT id FROM workspace WHERE agency_id = :agency_id AND archived_at IS NULL LIMIT 1"),
            {"agency_id": body.agencyId},
        )
    ).first()
    if workspace_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="agency_has_no_workspace")
    workspace_id = workspace_row[0]
    if scope.workspace_id is not None and scope.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="workspace_scope_mismatch")
    dedupe_key = f"trend_sync:{body.agencyId}:{workspace_id}:{body.sourceKey or '__all__'}"
    try:
        job_id = await enqueue_job(
            session,
            agency_id=body.agencyId,
            workspace_id=workspace_id,
            source_key=body.sourceKey,
            dedupe_key=dedupe_key,
            payload={"full_sync": body.fullSync},
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    logger.info(
        "sync.queued",
        job_id=str(job_id),
        agency_id=str(body.agencyId),
        source_key=body.sourceKey,
        full_sync=body.fullSync,
    )
    return SyncQueuedResponse(jobId=job_id, queuedAt=datetime.now().astimezone())


@router.get("/{job_id}", response_model=SyncStatusResponse)
async def get_sync_status(
    job_id: uuid.UUID,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> SyncStatusResponse:
    stmt = select(TrendFetchJob).where(TrendFetchJob.id == job_id)
    job = (await session.execute(stmt)).scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="job_not_found")
    scope = get_service_scope(request)
    if scope.workspace_id is not None and scope.workspace_id != job.workspace_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="workspace_scope_mismatch")
    if scope.agency_id is not None:
        owner = (await session.execute(text("SELECT agency_id FROM workspace WHERE id = :workspace_id"), {"workspace_id": job.workspace_id})).scalar_one_or_none()
        if owner != scope.agency_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="agency_scope_mismatch")
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
