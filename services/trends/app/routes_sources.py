"""GET /v1/sources/health and POST /v1/sources/{sourceKey}/test.

Health shape (per the plan §13.5):
  - circuit state (closed | open | half_open)
  - last_success_at / last_error_at
  - consecutive_errors
  - 24h success rate
  - avg duration_ms
  - total cost_cents
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import TrendSourceActivity, TrendSourceHealth
from app.observability import get_logger

logger = get_logger("routes_sources")

router = APIRouter(prefix="/v1/sources", tags=["sources"])


# ─── Response models ────────────────────────────────────────────────────────
class SourceHealthCard(BaseModel):
    source_key: str
    agency_id: Optional[uuid.UUID] = None
    circuit_state: str
    consecutive_errors: int
    last_success_at: Optional[datetime] = None
    last_error_at: Optional[datetime] = None
    cooldown_until: Optional[datetime] = None
    success_rate_24h: float
    avg_duration_ms_24h: float
    cost_cents_24h: int


class SourceHealthResponse(BaseModel):
    sources: list[SourceHealthCard]


class SourceTestResponse(BaseModel):
    success: bool
    source_key: str
    signals_count: int
    sample_labels: list[str]
    error: Optional[str] = None
    duration_ms: int


# ─── Routes ─────────────────────────────────────────────────────────────────
@router.get("/health", response_model=SourceHealthResponse)
async def list_source_health(
    agencyId: Optional[uuid.UUID] = None,
    session: AsyncSession = Depends(get_session),
) -> SourceHealthResponse:
    """Return the per-source health snapshot.

    Aggregates `trend_source_health` (circuit state) with the last-24h
    rollup from `trend_source_activity`.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)

    health_stmt = select(TrendSourceHealth)
    if agencyId is not None:
        health_stmt = health_stmt.where(TrendSourceHealth.agency_id == agencyId)
    health_rows = list((await session.execute(health_stmt)).scalars().all())

    cards: list[SourceHealthCard] = []
    for h in health_rows:
        # 24h rollup from the activity log.
        act_stmt = (
            select(
                func.count().filter(TrendSourceActivity.outcome == "success").label("success"),
                func.count().label("total"),
                func.coalesce(func.avg(TrendSourceActivity.duration_ms), 0).label("avg_dur"),
                func.coalesce(func.sum(TrendSourceActivity.cost_cents), 0).label("cost"),
            )
            .where(TrendSourceActivity.source_key == h.source_key)
            .where(TrendSourceActivity.created_at >= cutoff)
        )
        if h.agency_id is not None:
            act_stmt = act_stmt.where(TrendSourceActivity.agency_id == h.agency_id)
        row = (await session.execute(act_stmt)).one()
        success = int(row.success or 0)
        total = int(row.total or 0)
        rate = (success / total) if total else 0.0
        cards.append(
            SourceHealthCard(
                source_key=h.source_key,
                agency_id=h.agency_id,
                circuit_state=h.circuit_state,
                consecutive_errors=h.consecutive_errors,
                last_success_at=h.last_success_at,
                last_error_at=h.last_error_at,
                cooldown_until=h.cooldown_until,
                success_rate_24h=round(rate, 4),
                avg_duration_ms_24h=round(float(row.avg_dur or 0.0), 2),
                cost_cents_24h=int(row.cost or 0),
            )
        )
    return SourceHealthResponse(sources=cards)


@router.post("/{source_key}/test", response_model=SourceTestResponse)
async def test_source(
    source_key: str,
    agencyId: Optional[uuid.UUID] = None,
    session: AsyncSession = Depends(get_session),
) -> SourceTestResponse:
    """Run a 1-call sample fetch for `source_key`. The body is empty
    (source_key comes from the path); agency_id comes from the query string.
    """
    # Resolve the registered extractor for this source key. We scan the
    # full registry to find the (platform, source_key) pair.
    from app.extractor.base import all_sources

    extractor_cls = next(
        (cls for cls in all_sources() if cls.source_key == source_key), None
    )
    if extractor_cls is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"unknown_source_key:{source_key}",
        )

    started = datetime.now(timezone.utc)
    try:
        # Build a transient TrendSource-like object so the extractor
        # doesn't need a pre-existing DB row. In v1 the extractor just
        # reads `source.config`; we hand it an empty config.
        from types import SimpleNamespace
        fake_source = SimpleNamespace(
            id=uuid.uuid4(),
            agency_id=agencyId or uuid.uuid4(),
            source_key=source_key,
            platform=extractor_cls.platform,
            config={},
            enabled=True,
        )
        instance = extractor_cls()  # type: ignore[abstract]
        signals = await instance.fetch(fake_source)  # type: ignore[arg-type]
        duration = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
        return SourceTestResponse(
            success=True,
            source_key=source_key,
            signals_count=len(signals),
            sample_labels=[s.label for s in signals[:5]],
            duration_ms=duration,
        )
    except Exception as exc:  # noqa: BLE001
        duration = int((datetime.now(timezone.utc) - started).total_seconds() * 1000)
        return SourceTestResponse(
            success=False,
            source_key=source_key,
            signals_count=0,
            sample_labels=[],
            error=f"{exc.__class__.__name__}: {str(exc)[:300]}",
            duration_ms=duration,
        )
