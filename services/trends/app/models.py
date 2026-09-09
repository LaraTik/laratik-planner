"""SQLAlchemy mirrors of the Trend Radar Drizzle schema.

The Next.js Drizzle schema is the database contract. Keep this module
deliberately boring: the sidecar uses the same columns and tenancy keys as
the application that owns migrations.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, PrimaryKeyConstraint, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class TrendSource(Base):
    __tablename__ = "trend_source"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    agency_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agency.id", ondelete="restrict"), nullable=False, index=True)
    source_key: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tier: Mapped[str] = mapped_column(Text, nullable=False)
    tos_class: Mapped[str] = mapped_column(Text, nullable=False)
    region: Mapped[str] = mapped_column(Text, nullable=False, default="XX")
    language_filter: Mapped[list[str]] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    cadence_override: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    max_signals_per_cycle: Mapped[int] = mapped_column(Integer, nullable=False, default=200)
    api_key_ref: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    config: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    tos_acknowledged_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="set null"), nullable=True)
    tos_acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    enabled_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="set null"), nullable=True)
    enabled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"), onupdate=datetime.utcnow)
    __table_args__ = (UniqueConstraint("agency_id", "source_key", name="trend_source_agency_source_unique"), Index("trend_source_agency_enabled_idx", "agency_id", "enabled"))


class TrendSignal(Base):
    __tablename__ = "trend_signal"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="cascade"), nullable=False)
    platform: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_label: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(Text, nullable=False, default="en")
    region: Mapped[str] = mapped_column(Text, nullable=False, default="XX")
    score: Mapped[float] = mapped_column(Float, nullable=False)
    raw_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    raw_payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, server_default=text("'{}'::jsonb"))
    velocity: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    lifecycle: Mapped[str] = mapped_column(Text, nullable=False, default="stable")
    sentiment: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    toxicity: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    safe_to_amplify: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    vertical: Mapped[list[str]] = mapped_column(JSONB, nullable=False, server_default=text("'[]'::jsonb"))
    embedding: Mapped[Optional[list[float]]] = mapped_column(JSONB, nullable=True)
    source_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_id: Mapped[str] = mapped_column(Text, nullable=False)
    source_key: Mapped[str] = mapped_column(Text, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    __table_args__ = (
        Index("trend_signal_workspace_platform_fetched_idx", "workspace_id", "platform", "fetched_at"),
        Index("trend_signal_workspace_label_platform_idx", "workspace_id", "normalized_label", "platform"),
        Index("trend_signal_source_dedup_idx", "source_key", "source_id"),
        Index("trend_signal_workspace_lifecycle_score_idx", "workspace_id", "lifecycle", "score"),
    )


class TrendBoard(Base):
    __tablename__ = "trend_board"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="cascade"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="cascade"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    share_scope: Mapped[str] = mapped_column(Text, nullable=False, default="me")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"), onupdate=datetime.utcnow)
    items: Mapped[list["TrendBoardItem"]] = relationship(back_populates="board", cascade="all, delete-orphan")
    __table_args__ = (Index("trend_board_workspace_user_idx", "workspace_id", "user_id"),)


class TrendBoardItem(Base):
    __tablename__ = "trend_board_item"
    board_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trend_board.id", ondelete="cascade"), nullable=False)
    signal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trend_signal.id", ondelete="cascade"), nullable=False)
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    dismissed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    board: Mapped[TrendBoard] = relationship(back_populates="items")
    __table_args__ = (PrimaryKeyConstraint("board_id", "signal_id", name="trend_board_item_pk"), Index("trend_board_item_signal_idx", "signal_id"))


class TrendBrief(Base):
    __tablename__ = "trend_brief"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    content_item_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("content_item.id", ondelete="cascade"), nullable=False)
    signal_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("trend_signal.id", ondelete="set null"), nullable=True)
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="cascade"), nullable=False)
    velocity_at_schedule: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    velocity_at_publish: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    reach_multiplier: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    agency_feedback: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    feedback_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    __table_args__ = (Index("trend_brief_workspace_created_idx", "workspace_id", "created_at"), Index("trend_brief_signal_idx", "signal_id"))


class TrendFetchJob(Base):
    __tablename__ = "trend_fetch_job"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="cascade"), nullable=False)
    source_key: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    signals_added: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    error_code: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fallback_used: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cached_fallback: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    __table_args__ = (Index("trend_fetch_job_workspace_source_created_idx", "workspace_id", "source_key", "created_at"), Index("trend_fetch_job_status_created_idx", "status", "created_at"))


class TrendSourceHealth(Base):
    __tablename__ = "trend_source_health"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    agency_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agency.id", ondelete="restrict"), nullable=False)
    source_key: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    last_success_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    success_rate_24h: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    signals_last_24h: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rate_limit_used: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rate_limit_quota: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rate_limit_resets_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    cost_cents_last_24h: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    circuit_state: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    circuit_opened_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    checked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    __table_args__ = (UniqueConstraint("agency_id", "source_key", name="trend_source_health_agency_source_unique"), Index("trend_source_health_agency_status_idx", "agency_id", "status"))


class TrendSourceAudit(Base):
    __tablename__ = "trend_source_audit"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    agency_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agency.id", ondelete="restrict"), nullable=False)
    source_key: Mapped[str] = mapped_column(Text, nullable=False)
    actor_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="set null"), nullable=True)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    before_state: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    after_state: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    result: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    __table_args__ = (Index("trend_source_audit_agency_source_created_idx", "agency_id", "source_key", "created_at"),)


class TrendSourceActivity(Base):
    __tablename__ = "trend_source_activity"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    agency_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("agency.id", ondelete="restrict"), nullable=False)
    source_key: Mapped[str] = mapped_column(Text, nullable=False)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    # `metadata` is reserved by SQLAlchemy's Declarative API. Keep the
    # database column name stable while exposing a safe Python attribute.
    metadata_: Mapped[Optional[dict[str, Any]]] = mapped_column("metadata", JSONB, nullable=True)
    duration_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    __table_args__ = (Index("trend_source_activity_agency_source_created_idx", "agency_id", "source_key", "created_at"),)


class TrendFeedback(Base):
    __tablename__ = "trend_feedback"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="cascade"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="cascade"), nullable=False)
    signal_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trend_signal.id", ondelete="cascade"), nullable=False)
    feedback_type: Mapped[str] = mapped_column(Text, nullable=False)
    weight_delta: Mapped[Optional[dict[str, float]]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    __table_args__ = (Index("trend_feedback_workspace_user_created_idx", "workspace_id", "user_id", "created_at"), Index("trend_feedback_signal_idx", "signal_id"))


class SavedFilter(Base):
    __tablename__ = "saved_filter"
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()"))
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="cascade"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="cascade"), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    filters: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    share_scope: Mapped[str] = mapped_column(Text, nullable=False, default="me")
    is_template: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    template_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"), onupdate=datetime.utcnow)
    __table_args__ = (Index("saved_filter_workspace_user_idx", "workspace_id", "user_id"), Index("saved_filter_share_scope_idx", "share_scope"))


class WorkspaceSourceOptout(Base):
    __tablename__ = "workspace_source_optout"
    workspace_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("workspace.id", ondelete="cascade"), nullable=False)
    source_key: Mapped[str] = mapped_column(Text, nullable=False)
    opted_out_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("user.id", ondelete="set null"), nullable=True)
    opted_out_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=text("now()"))
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    __table_args__ = (PrimaryKeyConstraint("workspace_id", "source_key"), Index("workspace_source_optout_source_idx", "source_key"))
