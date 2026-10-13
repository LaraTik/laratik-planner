from __future__ import annotations

import time
import uuid

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.config import get_settings
from app.service_auth import require_service_context, sign_service_request


def _request(method: str, path: str, headers: dict[str, str]) -> Request:
    raw = [(key.lower().encode(), value.encode()) for key, value in headers.items()]
    return Request({"type": "http", "method": method, "path": path, "headers": raw})


@pytest.mark.asyncio
async def test_signed_scope_is_accepted(monkeypatch: pytest.MonkeyPatch) -> None:
    secret = "test-service-secret"
    agency_id = uuid.uuid4()
    workspace_id = uuid.uuid4()
    timestamp = str(int(time.time()))
    headers = {
        "x-laratik-service-timestamp": timestamp,
        "x-laratik-service-nonce": "nonce-1",
        "x-laratik-agency-id": str(agency_id),
        "x-laratik-workspace-id": str(workspace_id),
    }
    headers["x-laratik-service-signature"] = sign_service_request(secret=secret, method="GET", path="/v1/feed", timestamp=timestamp, nonce="nonce-1", agency_id=agency_id, workspace_id=workspace_id)
    monkeypatch.setenv("TRENDS_SERVICE_SECRET", secret)
    monkeypatch.setenv("TRENDS_SERVICE_AUTH_REQUIRED", "true")
    get_settings.cache_clear()
    scope = await require_service_context(_request("GET", "/v1/feed", headers))
    assert scope.agency_id == agency_id
    assert scope.workspace_id == workspace_id
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_invalid_signature_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRENDS_SERVICE_SECRET", "test-service-secret")
    monkeypatch.setenv("TRENDS_SERVICE_AUTH_REQUIRED", "true")
    get_settings.cache_clear()
    with pytest.raises(HTTPException) as error:
        await require_service_context(_request("GET", "/v1/feed", {"x-laratik-service-timestamp": str(int(time.time())), "x-laratik-service-nonce": "nonce", "x-laratik-agency-id": str(uuid.uuid4()), "x-laratik-service-signature": "wrong"}))
    assert error.value.status_code == 401
    get_settings.cache_clear()
