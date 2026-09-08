"""Unit tests for /v1/sources/health.

We hit the FastAPI app via the TestClient and patch the session +
DB calls so the test doesn't need a real Postgres. The endpoint
returns a `SourceHealthResponse` per source.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app


# ─── Helpers ─────────────────────────────────────────────────────────────────
def _client() -> TestClient:
    return TestClient(app)


def _health_row(source_key: str = "reddit", state: str = "closed") -> Any:
    """A fake TrendSourceHealth row."""
    row = MagicMock()
    row.source_key = source_key
    row.agency_id = uuid.uuid4()
    row.circuit_state = state
    row.consecutive_errors = 0
    row.last_success_at = datetime.now(timezone.utc)
    row.last_error_at = None
    row.cooldown_until = None
    return row


def _patch_db_health(rows: list[Any]) -> Any:
    """Build a session.execute() that returns `rows` for the health query
    and the 24h rollup query (in that order)."""
    session = AsyncMock()
    result_health = MagicMock()
    result_health.scalars.return_value.all.return_value = rows
    result_activity = MagicMock()
    result_activity.one.return_value = MagicMock(success=0, total=0, avg_dur=0.0, cost=0)

    session.execute = AsyncMock(side_effect=[result_health, result_activity])
    return session


# ─── Tests ──────────────────────────────────────────────────────────────────
class TestSourceHealthEndpoint:
    def test_returns_200_with_empty_list(self) -> None:
        client = _client()
        with patch("app.routes_sources.get_session", _patch_db_health([])):
            resp = client.get("/v1/sources/health")
        assert resp.status_code == 200
        body = resp.json()
        assert "sources" in body
        assert body["sources"] == []

    def test_returns_one_card_per_source(self) -> None:
        client = _client()
        rows = [_health_row("reddit"), _health_row("tiktok_tamnd")]
        with patch("app.routes_sources.get_session", _patch_db_health(rows)):
            resp = client.get("/v1/sources/health")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["sources"]) == 2
        keys = {s["source_key"] for s in body["sources"]}
        assert keys == {"reddit", "tiktok_tamnd"}

    def test_card_includes_circuit_state(self) -> None:
        client = _client()
        rows = [_health_row("reddit", state="open")]
        with patch("app.routes_sources.get_session", _patch_db_health(rows)):
            resp = client.get("/v1/sources/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["sources"][0]["circuit_state"] == "open"

    def test_card_contains_24h_fields(self) -> None:
        """The 24h rollup fields are always present in the card."""
        client = _client()
        rows = [_health_row("reddit")]
        with patch("app.routes_sources.get_session", _patch_db_health(rows)):
            resp = client.get("/v1/sources/health")
        body = resp.json()
        s = body["sources"][0]
        for key in (
            "success_rate_24h",
            "avg_duration_ms_24h",
            "cost_cents_24h",
            "consecutive_errors",
        ):
            assert key in s, f"missing {key} in response"

    def test_agency_id_filter_accepted(self) -> None:
        """`?agencyId=...` is forwarded to the DB query (smoke test)."""
        client = _client()
        agency_id = str(uuid.uuid4())
        with patch("app.routes_sources.get_session", _patch_db_health([])):
            resp = client.get(f"/v1/sources/health?agencyId={agency_id}")
        assert resp.status_code == 200
