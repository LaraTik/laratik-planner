"""SQLAlchemy 2.0 ORM models — mirrors of the 12 Drizzle trend tables.

The Drizzle schema in the Next.js app is the source of truth; this file
is a thin read/write layer for the Python sidecar. Column names match
the Drizzle column names 1:1 (snake_case). Python attribute names are
camelCase to match the surrounding SQLAlchemy 2.0 style.

Tables (in declaration order):
  1.  trend_source             — configured extractor + cadence per agency
  2.  trend_signal             — denormalised signal row (the core)
  3.  trend_board              — saved-collection of signals (per user)
  4.  trend_board_item         — m:n link row (board <-> signal) with feedback
  5.  trend_brief              — published content items that rode a signal
  6.  trend_fetch_job          — audit row for every sync attempt
  7.  trend_source_health      — per-source circuit-breaker state
  8.  trend_source_audit       — append-only audit of source config changes
  9.  trend_source_activity    — per-source event log (success / error / cooldown)
 10.  trend_feedback           — per-workspace, per-signal feedback events
 11.  saved_filter             — per-user feed filter presets
 12.  workspace_source_optout  — per-workspace per-source opt-out (kills sync)
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


# ─── 1. trend_source ─────────────────────────────────────────────────────────
class TrendSource(Base):
    """One configured source per agency.

    `source_key` is the stable identifier used in the URL
    (`/v1/sources/{sourceKey}/test`, `/v1/sources/health`) and matches a
    Python module name under `app/extractor/`. `enabled` is the master
    on/off; per-workspace opt-outs live in `workspace_source_optout`.
    """

    __tablename__ = "trend_source"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    agency_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    source_key: Mapped[str] = mapped_column(String(64), nullable=False)
    platform: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(128), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    default_on: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    cadence_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    config: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
        onupdate=datetime.utcnow,
    )

    __table_args__ = (
        UniqueConstraint("agency_id", "source_key", name="trend_source_agency_key_unique"),
        Index("trend_source_agency_enabled_idx", "agency_id", "enabled"),
    )


# ─── 2. trend_signal ─────────────────────────────────────────────────────────
class TrendSignal(Base):
    """The denormalised signal row — the heart of the sidecar.

    After extraction, every trend signal is a single row here. The columns
    include the raw upstream payload (so we can re-analyse later without
    re-fetching) plus the analysis pipeline's outputs (velocity, lifecycle,
    sentiment, toxicity, vertical, embedding).
    """

    __tablename__ = "trend_signal"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    platform: Mapped[str] = mapped_column(String(32), nullable=False)
    type: Mapped[str] = mapped_column(String(32), nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_label: Mapped[str] = mapped_column(String(256), nullable=False)
    language: Mapped[Optional[str]] = mapped_column(String(8), nullable=True, default="en")
    region: Mapped[Optional[str]] = mapped_column(String(4), nullable=True, default="XX")
    score: Mapped[float] = mapped_column(Float, nullable=False)
    raw_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    raw_payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    velocity: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=0)
    lifecycle: Mapped[Optional[str]] = mapped_column(String(16), nullable=True, default="stable")
    sentiment: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=0)
    toxicity: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=0)
    safe_to_amplify: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=True)
    vertical: Mapped[Optional[list[str]]] = mapped_column(JSONB, nullable=True)
    embedding: Mapped[Optional[list[float]]] = mapped_column(JSONB, nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_id: Mapped[str] = mapped_column(String(256), nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source_key: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    __table_args__ = (
        Index("trend_signal_workspace_platform_time_idx", "workspace_id", "platform", "fetched_at"),
        Index("trend_signal_workspace_label_idx", "workspace_id", "normalized_label", "platform"),
        Index("trend_signal_source_dedup_idx", "platform", "source_id"),
        Index("trend_signal_workspace_lifecycle_idx", "workspace_id", "lifecycle", "score"),
    )


# ─── 3. trend_board ──────────────────────────────────────────────────────────
class TrendBoard(Base):
    """A user-created collection of signals inside a workspace."""

    __tablename__ = "trend_board"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    items: Mapped[list["TrendBoardItem"]] = relationship(
        back_populates="board", cascade="all, delete-orphan"
    )


# ─── 4. trend_board_item ─────────────────────────────────────────────────────
class TrendBoardItem(Base):
    """m:n link row with per-signal feedback (dismiss / positive / negative)."""

    __tablename__ = "trend_board_item"

    board_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("trend_board.id", ondelete="cascade"),
        nullable=False,
    )
    signal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("trend_signal.id", ondelete="cascade"),
        nullable=False,
    )
    saved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    dismissed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    feedback: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)

    board: Mapped[TrendBoard] = relationship(back_populates="items")

    __table_args__ = (
        PrimaryKeyConstraint("board_id", "signal_id", name="trend_board_item_pk"),
    )


# ─── 5. trend_brief ──────────────────────────────────────────────────────────
class TrendBrief(Base):
    """A published content item that rode a trend.

    Connects a `content_item` (in the Next.js schema) to a `trend_signal`,
    storing the velocity at schedule + publish time so we can attribute
    reach back to the trend choice. `agency_feedback` is the
    'would_ride_again' / 'would_not_ride' toggle.
    """

    __tablename__ = "trend_brief"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    content_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    signal_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("trend_signal.id", ondelete="set null"),
        nullable=True,
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    velocity_at_schedule: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    velocity_at_publish: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    agency_feedback: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        Index("trend_brief_workspace_idx", "workspace_id"),
        Index("trend_brief_signal_idx", "signal_id"),
    )


# ─── 6. trend_fetch_job ──────────────────────────────────────────────────────
class TrendFetchJob(Base):
    """One row per sync attempt. The audit log for the sidecar."""

    __tablename__ = "trend_fetch_job"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    agency_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    workspace_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    source_key: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    trigger: Mapped[str] = mapped_column(String(16), nullable=False, default="cron")
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="queued")
    platforms: Mapped[list[str]] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    signals_added: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        Index("trend_fetch_job_agency_status_idx", "agency_id", "status"),
        Index("trend_fetch_job_source_idx", "source_key", "created_at"),
    )


# ─── 7. trend_source_health ──────────────────────────────────────────────────
class TrendSourceHealth(Base):
    """Per-source circuit-breaker state.

    One row per `(source_key, agency_id)` (or per `source_key` for the
    global default). The `circuit_state` is one of `closed`, `open`,
    `half_open`. The circuit breaker module reads/writes this row.
    """

    __tablename__ = "trend_source_health"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    source_key: Mapped[str] = mapped_column(String(64), nullable=False)
    agency_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    circuit_state: Mapped[str] = mapped_column(
        String(16), nullable=False, default="closed"
    )
    consecutive_errors: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0
    )
    last_error_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_success_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    opened_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cooldown_until: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
        onupdate=datetime.utcnow,
    )

    __table_args__ = (
        UniqueConstraint("source_key", "agency_id", name="trend_source_health_unique"),
    )


# ─── 8. trend_source_audit ───────────────────────────────────────────────────
class TrendSourceAudit(Base):
    """Append-only audit of source config + state changes.

    Every edit to a `trend_source` row, every circuit-breaker state flip,
    every rate-limit hit — written here by the service layer.
    """

    __tablename__ = "trend_source_audit"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    source_key: Mapped[str] = mapped_column(String(64), nullable=False)
    agency_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    actor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    before: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    after: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        Index("trend_source_audit_source_idx", "source_key", "created_at"),
    )


# ─── 9. trend_source_activity ────────────────────────────────────────────────
class TrendSourceActivity(Base):
    """Per-source event log — every fetch outcome, success or failure.

    Heavier than `trend_source_audit` (this is per fetch, not per config
    change) and the main input to the per-source health endpoint.
    """

    __tablename__ = "trend_source_activity"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    source_key: Mapped[str] = mapped_column(String(64), nullable=False)
    agency_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    outcome: Mapped[str] = mapped_column(String(16), nullable=False)
    signals_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_class: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cost_cents: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        Index("trend_source_activity_source_time_idx", "source_key", "created_at"),
    )


# ─── 10. trend_feedback ──────────────────────────────────────────────────────
class TrendFeedback(Base):
    """One row per planner feedback event. Powers the Fit-score Bayesian update.

    `kind` is one of: `dismiss`, `positive_save`, `negative_dismiss`,
    `would_ride_again`, `would_not_ride`. `component` is optional and
    stores the Fit-score component the feedback is targeting
    (`vertical` / `audience` / `voice` / `platform` / `competitive`).
    """

    __tablename__ = "trend_feedback"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    signal_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("trend_signal.id", ondelete="set null"),
        nullable=True,
    )
    board_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("trend_board.id", ondelete="set null"),
        nullable=True,
    )
    kind: Mapped[str] = mapped_column(String(32), nullable=False)
    component: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    weight_delta: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        Index("trend_feedback_workspace_kind_idx", "workspace_id", "kind"),
        Index("trend_feedback_signal_idx", "signal_id"),
    )


# ─── 11. saved_filter ────────────────────────────────────────────────────────
class SavedFilter(Base):
    """Per-user feed filter preset (e.g. 'MENA-arabic-vertical-fashion')."""

    __tablename__ = "saved_filter"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    # Filters are stored as opaque JSON so the UI can evolve without
    # schema migrations: { platform?, region?, type?, lifecycle?, sortBy?, sortDir?, ... }
    definition: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
        onupdate=datetime.utcnow,
    )

    __table_args__ = (
        Index("saved_filter_workspace_user_idx", "workspace_id", "user_id"),
    )


# ─── 12. workspace_source_optout ─────────────────────────────────────────────
class WorkspaceSourceOptout(Base):
    """Per-workspace per-source opt-out. Kills sync for that combo even if
    the source is otherwise enabled for the agency.
    """

    __tablename__ = "workspace_source_optout"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )
    source_key: Mapped[str] = mapped_column(String(64), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=text("now()")
    )

    __table_args__ = (
        UniqueConstraint(
            "workspace_id", "source_key", name="workspace_source_optout_pk"
        ),
    )
