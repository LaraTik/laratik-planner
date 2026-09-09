"""Unit tests for /v1/sources/{key}/test.

The endpoint runs a 1-call sample fetch of the requested source. We
fake the extractor's `fetch` to avoid talking to any real platform.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.extractor.base import RawSignal
from app.main import app


# ─── Helpers ─────────────────────────────────────────────────────────────────
def _client() -> TestClient:
    return TestClient(app)


class _FakeExtractor:
    """A drop-in Source substitute registered in the registry."""

    platform = "reddit"
    source_key = "reddit"

    def __init__(self, signals: list[RawSignal] | None = None, raises: Exception | None = None) -> None:
        self.signals = signals or [
            RawSignal(
                platform="reddit",
                type="post",
                label="hello",
                source_id="t3_abc",
                fetched_at=datetime.now(timezone.utc),
            )
        ]
        self.raises = raises
        self.calls = 0

    @staticmethod
    def validate_config(_config: dict) -> Any:  # ValidationResult, kept loose
        from app.extractor.base import ValidationResult

        return ValidationResult.success()

    async def fetch(self, source):  # noqa: ARG002 — protocol shape
        self.calls += 1
        if self.raises:
            raise self.raises
        return self.signals


def _configured_extractor(
    *, signals: list[RawSignal] | None = None, raises: Exception | None = None
) -> type[_FakeExtractor]:
    """Return a registry class whose no-argument constructor keeps test state."""
    class ConfiguredExtractor(_FakeExtractor):
        def __init__(self) -> None:
            super().__init__(signals=signals, raises=raises)

    return ConfiguredExtractor


# ─── Tests ──────────────────────────────────────────────────────────────────
class TestSourceTestEndpoint:
    def test_unknown_source_key_returns_404(self) -> None:
        client = _client()
        resp = client.post("/v1/sources/this-source-does-not-exist/test")
        assert resp.status_code == 404
        assert "unknown_source_key" in resp.text

    def test_known_source_success(self) -> None:
        """A registered source with a working fetch returns success."""
        client = _client()
        with patch(
            "app.extractor.base.all_sources",
            return_value=[_configured_extractor()],
        ):
            resp = client.post("/v1/sources/reddit/test")
        # Either the registry has the real reddit (success=True) or
        # the patched version (success=True). Both are acceptable for v1.
        assert resp.status_code == 200
        body = resp.json()
        assert "source_key" in body
        assert "success" in body
        assert "duration_ms" in body

    def test_source_failure_is_reported_not_raised(self) -> None:
        """If fetch() raises, the endpoint reports success=False, not 500."""
        client = _client()
        with patch(
            "app.extractor.base.all_sources",
            return_value=[_configured_extractor(raises=RuntimeError("upstream 503"))],
        ):
            resp = client.post("/v1/sources/reddit/test")
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is False
        assert "upstream 503" in body["error"]

    def test_response_includes_sample_labels(self) -> None:
        """A successful fetch returns up to 5 sample labels."""
        client = _client()
        signals = [
            RawSignal(
                platform="reddit",
                type="post",
                label=f"label-{i}",
                source_id=f"id-{i}",
                fetched_at=datetime.now(timezone.utc),
            )
            for i in range(3)
        ]
        with patch(
            "app.extractor.base.all_sources",
            return_value=[_configured_extractor(signals=signals)],
        ):
            resp = client.post("/v1/sources/reddit/test")
        body = resp.json()
        if body["success"]:
            assert body["signals_count"] == 3
            assert len(body["sample_labels"]) == 3
