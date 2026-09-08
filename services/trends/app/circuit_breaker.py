"""3-state circuit breaker — CLOSED → OPEN → HALF_OPEN → CLOSED.

State is persisted to `trend_source_health` so the breaker survives
process restarts and so the admin UI can read it directly.

The breaker gates `extractor.fetch()` calls. When OPEN, the call is
short-circuited with `CircuitOpen`. After `cooldown`, the next call
is allowed once (HALF_OPEN) — if it succeeds, the breaker closes; if
it fails, the breaker re-opens for another cooldown.

Thresholds (per source) come from `app.config.Settings`:
  CIRCUIT_BREAKER_THRESHOLD       default 5
  CIRCUIT_BREAKER_WINDOW_MINUTES  default 10
  CIRCUIT_BREAKER_COOLDOWN_MINUTES default 15
"""

from __future__ import annotations

import enum
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable, Optional
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import TrendSourceHealth
from app.observability import CIRCUIT_BREAKER_STATE_CHANGES, get_logger

logger = get_logger("circuit_breaker")


class CircuitState(str, enum.Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


class CircuitOpen(Exception):
    """Raised by `CircuitBreaker.call` when the breaker is OPEN and the
    cooldown hasn't elapsed yet.
    """

    def __init__(self, source_key: str, cooldown_until: datetime) -> None:
        super().__init__(f"circuit open for {source_key}; retry after {cooldown_until.isoformat()}")
        self.source_key = source_key
        self.cooldown_until = cooldown_until


class CircuitBreaker:
    """Per-source circuit breaker backed by the `trend_source_health` table.

    One instance per `(source_key, agency_id)` pair. The scheduler constructs
    a fresh instance per sync job; the breaker re-reads its state from the
    DB at construction time.
    """

    def __init__(
        self,
        session: AsyncSession,
        source_key: str,
        agency_id: Optional[UUID] = None,
    ) -> None:
        self._session = session
        self.source_key = source_key
        self.agency_id = agency_id
        self._settings = get_settings()

    # ─── state load/save ─────────────────────────────────────────────────
    async def _load_health(self) -> Optional[TrendSourceHealth]:
        stmt = select(TrendSourceHealth).where(
            TrendSourceHealth.source_key == self.source_key,
            TrendSourceHealth.agency_id == self.agency_id,
        )
        return (await self._session.execute(stmt)).scalar_one_or_none()

    async def _ensure_health_row(self) -> TrendSourceHealth:
        row = await self._load_health()
        if row is not None:
            return row
        row = TrendSourceHealth(
            source_key=self.source_key,
            agency_id=self.agency_id,
            circuit_state=CircuitState.CLOSED.value,
            consecutive_errors=0,
        )
        self._session.add(row)
        await self._session.flush()
        return row

    async def _set_state(
        self,
        row: TrendSourceHealth,
        new_state: CircuitState,
        *,
        opened_at: Optional[datetime] = None,
        cooldown_until: Optional[datetime] = None,
    ) -> None:
        old_state = row.circuit_state
        row.circuit_state = new_state.value
        if opened_at is not None:
            row.opened_at = opened_at
        if cooldown_until is not None:
            row.cooldown_until = cooldown_until
        row.updated_at = datetime.now(timezone.utc)
        await self._session.flush()
        if old_state != new_state.value:
            CIRCUIT_BREAKER_STATE_CHANGES.labels(
                source_key=self.source_key,
                from_state=old_state,
                to_state=new_state.value,
            ).inc()
            logger.info(
                "circuit_breaker.transition",
                source_key=self.source_key,
                from_state=old_state,
                to_state=new_state.value,
            )

    # ─── public API ──────────────────────────────────────────────────────
    async def state(self) -> CircuitState:
        """Return the current state, advancing OPEN → HALF_OPEN if the
        cooldown has elapsed.
        """
        row = await self._load_health()
        if row is None:
            return CircuitState.CLOSED
        current = CircuitState(row.circuit_state)
        if current is CircuitState.OPEN and row.cooldown_until is not None:
            if datetime.now(timezone.utc) >= row.cooldown_until:
                await self._set_state(row, CircuitState.HALF_OPEN)
                return CircuitState.HALF_OPEN
        return current

    async def call(
        self,
        func: Callable[..., Awaitable[Any]],
        *args: Any,
        **kwargs: Any,
    ) -> Any:
        """Run `func` under the breaker.

        Behaviour:
          - CLOSED:    call directly. On success → record success.
                       On error → record error, maybe flip to OPEN.
          - HALF_OPEN: call once. On success → flip to CLOSED.
                       On error → flip back to OPEN.
          - OPEN:      raise CircuitOpen (caller should skip and log).

        `func` may be sync or async; awaited accordingly.
        """
        state = await self.state()
        if state is CircuitState.OPEN:
            row = await self._load_health()
            assert row is not None  # state() ensures it
            raise CircuitOpen(self.source_key, row.cooldown_until or datetime.now(timezone.utc))

        try:
            result = func(*args, **kwargs)
            if hasattr(result, "__await__"):
                result = await result
        except Exception as exc:
            await self._record_error(exc)
            raise

        await self._record_success()
        return result

    # ─── internal transitions ───────────────────────────────────────────
    async def _record_success(self) -> None:
        row = await self._ensure_health_row()
        row.consecutive_errors = 0
        row.last_success_at = datetime.now(timezone.utc)
        if row.circuit_state != CircuitState.CLOSED.value:
            await self._set_state(row, CircuitState.CLOSED)
        else:
            row.updated_at = datetime.now(timezone.utc)
            await self._session.flush()

    async def _record_error(self, exc: BaseException) -> None:
        row = await self._ensure_health_row()
        now = datetime.now(timezone.utc)
        row.consecutive_errors += 1
        row.last_error_at = now
        row.updated_at = now

        threshold = self._settings.CIRCUIT_BREAKER_THRESHOLD
        if row.consecutive_errors >= threshold and row.circuit_state != CircuitState.OPEN.value:
            cooldown_until = now + timedelta(minutes=self._settings.CIRCUIT_BREAKER_COOLDOWN_MINUTES)
            await self._set_state(
                row,
                CircuitState.OPEN,
                opened_at=now,
                cooldown_until=cooldown_until,
            )
        else:
            await self._session.flush()


async def force_open(
    session: AsyncSession,
    source_key: str,
    agency_id: Optional[UUID] = None,
    cooldown_minutes: Optional[int] = None,
) -> TrendSourceHealth:
    """Admin helper: manually trip a breaker. Used by `/v1/sources/health`
    endpoints and by tests.
    """
    settings = get_settings()
    cooldown = cooldown_minutes or settings.CIRCUIT_BREAKER_COOLDOWN_MINUTES
    now = datetime.now(timezone.utc)
    breaker = CircuitBreaker(session, source_key, agency_id=agency_id)
    row = await breaker._ensure_health_row()
    await breaker._set_state(
        row,
        CircuitState.OPEN,
        opened_at=now,
        cooldown_until=now + timedelta(minutes=cooldown),
    )
    return row


async def force_close(
    session: AsyncSession,
    source_key: str,
    agency_id: Optional[UUID] = None,
) -> TrendSourceHealth:
    """Admin helper: reset a breaker to CLOSED. Used by tests and the
    'retry now' button on the source-health UI.
    """
    breaker = CircuitBreaker(session, source_key, agency_id=agency_id)
    row = await breaker._ensure_health_row()
    row.consecutive_errors = 0
    row.cooldown_until = None
    row.opened_at = None
    await breaker._set_state(row, CircuitState.CLOSED)
    return row
