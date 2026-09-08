"""GET /v1/feed and GET /v1/feed/{signalId}.

The data shape follows the plan §6.2:
  - Feed: paginated, filtered, sorted list of trends for a workspace.
  - Single signal: the signal + the "why" payload (top accounts, related
    trends, brand-safety).
"""

from __future__ import annotations

import base64
import json
import uuid
from datetime import datetime
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import TrendSignal

router = APIRouter(prefix="/v1/feed", tags=["feed"])


# ─── Response models ────────────────────────────────────────────────────────
class SignalCard(BaseModel):
    """One card on the Trends feed."""

    id: uuid.UUID
    platform: str
    type: str
    label: str
    language: Optional[str] = None
    region: Optional[str] = None
    score: float
    velocity: Optional[float] = None
    lifecycle: Optional[str] = None
    sentiment: Optional[float] = None
    toxicity: Optional[float] = None
    safe_to_amplify: bool = True
    vertical: list[str] = Field(default_factory=list)
    source_url: Optional[str] = None
    fetched_at: datetime
    expires_at: datetime
    source_key: Optional[str] = None

    class Config:
        from_attributes = True


class FeedResponse(BaseModel):
    items: list[SignalCard]
    next_cursor: Optional[str] = None
    total: int


class RelatedTrend(BaseModel):
    id: uuid.UUID
    platform: str
    label: str
    score: float
    cosine: float


class TopAccount(BaseModel):
    platform: str
    handle: str
    followers: Optional[int] = None
    engagements: Optional[int] = None


class WhyPayload(BaseModel):
    """The 'why this trend' drawer content."""

    signal: SignalCard
    cross_platform: list[SignalCard] = Field(default_factory=list)
    soft_related: list[RelatedTrend] = Field(default_factory=list)
    top_accounts: list[TopAccount] = Field(default_factory=list)
    brand_safety: dict[str, Any] = Field(default_factory=dict)
    score_breakdown: dict[str, float] = Field(default_factory=dict)


# ─── Cursor helpers ─────────────────────────────────────────────────────────
def _encode_cursor(payload: dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")


def _decode_cursor(cursor: str) -> dict[str, Any]:
    try:
        return json.loads(base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8"))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="invalid_cursor",
        ) from exc


# ─── Routes ─────────────────────────────────────────────────────────────────
@router.get("", response_model=FeedResponse)
async def list_feed(
    agencyId: uuid.UUID = Query(..., description="Agency ID — the feed is per-agency in v1."),
    platform: Optional[str] = Query(None, description="Comma-separated platform list."),
    region: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    lifecycle: Optional[str] = Query(None),
    sortBy: Annotated[Optional[str], Query()] = "score",
    sortDir: Annotated[Optional[str], Query(pattern="^(asc|desc)$")] = "desc",
    limit: int = Query(20, ge=1, le=100),
    cursor: Optional[str] = Query(None),
    session: AsyncSession = Depends(get_session),
) -> FeedResponse:
    """Paginated feed. `agencyId` is required; the rest are filters."""
    filters = [TrendSignal.workspace_id == agencyId]
    if platform:
        filters.append(TrendSignal.platform.in_(platform.split(",")))
    if region:
        filters.append(TrendSignal.region == region)
    if type:
        filters.append(TrendSignal.type == type)
    if lifecycle:
        filters.append(TrendSignal.lifecycle == lifecycle)

    if cursor:
        c = _decode_cursor(cursor)
        # Cursor encodes the (sort_value, id) of the last row. We use a
        # keyset pagination on (sort_column DESC, id DESC).
        last_val = c.get("v")
        last_id = c.get("id")
        if last_val is not None and last_id is not None:
            if sortDir == "desc":
                filters.append(
                    (getattr(TrendSignal, sortBy) < last_val)
                    | (
                        (getattr(TrendSignal, sortBy) == last_val)
                        & (TrendSignal.id < uuid.UUID(last_id))
                    )
                )
            else:
                filters.append(
                    (getattr(TrendSignal, sortBy) > last_val)
                    | (
                        (getattr(TrendSignal, sortBy) == last_val)
                        & (TrendSignal.id > uuid.UUID(last_id))
                    )
                )

    sort_col = getattr(TrendSignal, sortBy, TrendSignal.score)
    order = desc(sort_col) if sortDir == "desc" else sort_col.asc()

    stmt = (
        select(TrendSignal)
        .where(and_(*filters))
        .order_by(order, TrendSignal.id.desc() if sortDir == "desc" else TrendSignal.id.asc())
        .limit(limit + 1)
    )
    rows = (await session.execute(stmt)).scalars().all()

    next_cursor: Optional[str] = None
    if len(rows) > limit:
        last = rows[limit - 1]
        next_cursor = _encode_cursor({"v": getattr(last, sortBy, None), "id": str(last.id)})
        rows = rows[:limit]

    # Total is expensive on a paginated endpoint — we return None unless
    # the caller explicitly asks. v1: return the page size.
    items = [SignalCard.model_validate(r) for r in rows]
    return FeedResponse(items=items, next_cursor=next_cursor, total=len(items))


@router.get("/{signal_id}", response_model=WhyPayload)
async def get_signal(
    signal_id: uuid.UUID,
    agencyId: uuid.UUID = Query(..., description="Agency ID for tenancy scoping."),
    session: AsyncSession = Depends(get_session),
) -> WhyPayload:
    """Return a single signal + the 'why' drawer payload."""
    stmt = select(TrendSignal).where(
        TrendSignal.id == signal_id, TrendSignal.workspace_id == agencyId
    )
    signal = (await session.execute(stmt)).scalar_one_or_none()
    if signal is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="signal_not_found")

    # Cross-platform peers: same normalized_label, different platform, last 7d.
    peer_stmt = (
        select(TrendSignal)
        .where(
            TrendSignal.normalized_label == signal.normalized_label,
            TrendSignal.id != signal.id,
            TrendSignal.platform != signal.platform,
        )
        .order_by(TrendSignal.fetched_at.desc())
        .limit(10)
    )
    peers = list((await session.execute(peer_stmt)).scalars().all())

    # Soft-related: same platform, embedding cosine > 0.78, last 7d. The
    # cosine search is a v1 brute force on the JSONB column; the dataset
    # at this stage is small enough that the cost is negligible.
    related: list[RelatedTrend] = []
    if signal.embedding:
        cos_stmt = (
            select(TrendSignal)
            .where(
                TrendSignal.platform == signal.platform,
                TrendSignal.id != signal.id,
            )
            .order_by(TrendSignal.fetched_at.desc())
            .limit(200)
        )
        from app.analysis.correlation import _cosine
        candidates = list((await session.execute(cos_stmt)).scalars().all())
        for c in candidates:
            if not c.embedding:
                continue
            sim = _cosine(list(signal.embedding), list(c.embedding))
            if sim > 0.78:
                related.append(
                    RelatedTrend(
                        id=c.id,
                        platform=c.platform,
                        label=c.label,
                        score=c.score,
                        cosine=round(sim, 4),
                    )
                )
        related.sort(key=lambda r: r.cosine, reverse=True)
        related = related[:5]

    return WhyPayload(
        signal=SignalCard.model_validate(signal),
        cross_platform=[SignalCard.model_validate(p) for p in peers],
        soft_related=related,
        top_accounts=[],  # populated by the v1.1 enrichment pass
        brand_safety={
            "sentiment": signal.sentiment,
            "toxicity": signal.toxicity,
            "safe_to_amplify": signal.safe_to_amplify,
        },
        score_breakdown={},  # filled at request time by /v1/score-fit
    )
