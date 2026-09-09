"""Unit tests for app.circuit_breaker.

We don't talk to a real DB. The breaker is constructed against an
AsyncMock session, and we drive the state machine by hand to pin
each of the four documented transitions:

  CLOSED  → OPEN        (after threshold errors)
  OPEN    → HALF_OPEN   (after cooldown elapses)
  HALF_OPEN → CLOSED    (on first success)
  HALF_OPEN → OPEN      (on first failure)

We also test the helper functions `force_open` and `force_close`.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.circuit_breaker import (
    CircuitBreaker,
    CircuitOpen,
    CircuitState,
)


# ─── Helpers ─────────────────────────────────────────────────────────────────
def _settings_with_threshold(threshold: int, cooldown: int = 15) -> MagicMock:
    """Build a fake `Settings` with the given circuit-breaker knobs."""
    s = MagicMock()
    s.CIRCUIT_BREAKER_THRESHOLD = threshold
    s.CIRCUIT_BREAKER_COOLDOWN_MINUTES = cooldown
    return s


def _patch_settings(monkeypatch, threshold: int, cooldown: int = 15) -> None:
    """Patch the settings factory with a callable, matching production use."""
    settings = _settings_with_threshold(threshold, cooldown)
    monkeypatch.setattr("app.circuit_breaker.get_settings", lambda: settings)


class _StubHealth:
    """A stub for `TrendSourceHealth` rows the breaker can mutate."""

    def __init__(
        self,
        source_key: str,
        agency_id: Optional[uuid.UUID],
        state: str = CircuitState.CLOSED.value,
        consecutive_errors: int = 0,
        cooldown_until: Optional[datetime] = None,
    ) -> None:
        self.source_key = source_key
        self.agency_id = agency_id
        self.status = "healthy"
        self.circuit_state = state
        self.last_error = {"consecutiveErrors": consecutive_errors} if consecutive_errors else None
        if cooldown_until is not None:
            self.last_error = {**(self.last_error or {}), "cooldownUntil": cooldown_until.isoformat()}
        self.circuit_opened_at = None
        self.last_success_at = None
        self.checked_at = None

    @property
    def consecutive_errors(self):
        return int((self.last_error or {}).get("consecutiveErrors", 0))

    @consecutive_errors.setter
    def consecutive_errors(self, value):
        self.last_error = {**(self.last_error or {}), "consecutiveErrors": value}

    @property
    def cooldown_until(self):
        raw = (self.last_error or {}).get("cooldownUntil")
        return datetime.fromisoformat(raw) if raw else None

    @cooldown_until.setter
    def cooldown_until(self, value):
        self.last_error = {**(self.last_error or {}), "cooldownUntil": value.isoformat()} if value else self.last_error

    @property
    def opened_at(self):
        return self.circuit_opened_at

    @opened_at.setter
    def opened_at(self, value):
        self.circuit_opened_at = value


def _session_with(health: Optional[_StubHealth]) -> AsyncMock:
    """A session whose `execute().scalar_one_or_none()` returns `health`."""
    session = AsyncMock()
    result = MagicMock()
    result.scalar_one_or_none.return_value = health
    session.execute = AsyncMock(return_value=result)
    session.flush = AsyncMock()
    session.add = MagicMock()
    return session


# ─── Tests ──────────────────────────────────────────────────────────────────
class TestCircuitBreakerTransitions:
    @pytest.mark.asyncio
    async def test_initial_state_is_closed_when_no_row(self, monkeypatch):
        from app import circuit_breaker as mod

        _patch_settings(monkeypatch, 3)
        session = _session_with(None)
        breaker = CircuitBreaker(session, "reddit", agency_id=uuid.uuid4())
        state = await breaker.state()
        assert state is CircuitState.CLOSED

    @pytest.mark.asyncio
    async def test_closed_to_open_after_threshold_errors(self, monkeypatch):
        from app import circuit_breaker as mod

        _patch_settings(monkeypatch, 3)
        health = _StubHealth("reddit", uuid.uuid4(), consecutive_errors=0)
        session = _session_with(health)
        breaker = CircuitBreaker(session, "reddit", agency_id=uuid.uuid4())

        async def boom():
            raise RuntimeError("upstream 500")

        # 1st error
        with pytest.raises(RuntimeError):
            await breaker.call(boom)
        # 2nd
        with pytest.raises(RuntimeError):
            await breaker.call(boom)
        # 3rd — should trip
        with pytest.raises(RuntimeError):
            await breaker.call(boom)

        assert health.circuit_state == CircuitState.OPEN.value
        assert health.cooldown_until is not None
        assert health.consecutive_errors == 3

    @pytest.mark.asyncio
    async def test_open_raises_circuit_open_until_cooldown(self, monkeypatch):
        from app import circuit_breaker as mod

        _patch_settings(monkeypatch, 1)
        # Breaker is OPEN with a cooldown 1h in the future.
        future = datetime.now(timezone.utc) + timedelta(hours=1)
        health = _StubHealth(
            "reddit",
            uuid.uuid4(),
            state=CircuitState.OPEN.value,
            consecutive_errors=5,
            cooldown_until=future,
        )
        session = _session_with(health)
        breaker = CircuitBreaker(session, "reddit", agency_id=uuid.uuid4())

        with pytest.raises(CircuitOpen) as excinfo:
            await breaker.call(lambda: "ok")
        assert excinfo.value.source_key == "reddit"

    @pytest.mark.asyncio
    async def test_open_to_half_open_after_cooldown(self, monkeypatch):
        from app import circuit_breaker as mod

        _patch_settings(monkeypatch, 1)
        # Cooldown 1s in the past → should advance to HALF_OPEN.
        past = datetime.now(timezone.utc) - timedelta(seconds=1)
        health = _StubHealth(
            "reddit",
            uuid.uuid4(),
            state=CircuitState.OPEN.value,
            cooldown_until=past,
        )
        session = _session_with(health)
        breaker = CircuitBreaker(session, "reddit", agency_id=uuid.uuid4())

        state = await breaker.state()
        assert state is CircuitState.HALF_OPEN

    @pytest.mark.asyncio
    async def test_half_open_success_returns_to_closed(self, monkeypatch):
        from app import circuit_breaker as mod

        _patch_settings(monkeypatch, 3)
        health = _StubHealth(
            "reddit",
            uuid.uuid4(),
            state=CircuitState.HALF_OPEN.value,
            consecutive_errors=3,
        )
        session = _session_with(health)
        breaker = CircuitBreaker(session, "reddit", agency_id=uuid.uuid4())

        result = await breaker.call(lambda: "ok")
        assert result == "ok"
        assert health.circuit_state == CircuitState.CLOSED.value
        assert health.consecutive_errors == 0

    @pytest.mark.asyncio
    async def test_half_open_failure_returns_to_open(self, monkeypatch):
        from app import circuit_breaker as mod

        _patch_settings(monkeypatch, 3)
        health = _StubHealth(
            "reddit",
            uuid.uuid4(),
            state=CircuitState.HALF_OPEN.value,
            consecutive_errors=3,
        )
        session = _session_with(health)
        breaker = CircuitBreaker(session, "reddit", agency_id=uuid.uuid4())

        async def boom():
            raise RuntimeError("still down")

        with pytest.raises(RuntimeError):
            await breaker.call(boom)
        # State should be back to OPEN with a fresh cooldown.
        assert health.circuit_state == CircuitState.OPEN.value
        assert health.cooldown_until is not None

    @pytest.mark.asyncio
    async def test_success_resets_error_count(self, monkeypatch):
        from app import circuit_breaker as mod

        _patch_settings(monkeypatch, 5)
        health = _StubHealth(
            "reddit",
            uuid.uuid4(),
            state=CircuitState.CLOSED.value,
            consecutive_errors=3,
        )
        session = _session_with(health)
        breaker = CircuitBreaker(session, "reddit", agency_id=uuid.uuid4())

        await breaker.call(lambda: "ok")
        assert health.consecutive_errors == 0


class TestCircuitBreakerHelpers:
    @pytest.mark.asyncio
    async def test_force_open_sets_state(self, monkeypatch):
        from app import circuit_breaker as mod

        _patch_settings(monkeypatch, 5, cooldown=10)
        health = _StubHealth("reddit", uuid.uuid4(), state=CircuitState.CLOSED.value)
        session = _session_with(health)
        row = await mod.force_open(session, "reddit", agency_id=health.agency_id)
        assert row.circuit_state == CircuitState.OPEN.value
        assert row.cooldown_until is not None

    @pytest.mark.asyncio
    async def test_force_close_resets_state(self, monkeypatch):
        from app import circuit_breaker as mod

        _patch_settings(monkeypatch, 5)
        health = _StubHealth(
            "reddit",
            uuid.uuid4(),
            state=CircuitState.OPEN.value,
            consecutive_errors=10,
        )
        session = _session_with(health)
        row = await mod.force_close(session, "reddit", agency_id=health.agency_id)
        assert row.circuit_state == CircuitState.CLOSED.value
        assert row.consecutive_errors == 0
        assert row.cooldown_until is None
