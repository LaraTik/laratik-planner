from __future__ import annotations

import time
import uuid
import hashlib

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.config import get_settings
from app.service_auth import require_service_context, sign_service_request


def _request(method: str, path: str, headers: dict[str, str], body: bytes = b"") -> Request:
    raw = [(key.lower().encode(), value.encode()) for key, value in headers.items()]
    async def receive() -> dict[str, object]:
        return {"type": "http.request", "body": body, "more_body": False}

    return Request({"type": "http", "method": method, "path": path, "headers": raw}, receive)


@pytest.mark.asyncio
async def test_signed_scope_is_accepted(monkeypatch: pytest.MonkeyPatch) -> None:
    secret = "test-service-secret"
    agency_id = uuid.uuid4()
    workspace_id = uuid.uuid4()
    actor_id = uuid.uuid4()
    timestamp = str(int(time.time()))
    nonce = str(uuid.uuid4())
    body = b"{}"
    headers = {
        "x-laratik-service-timestamp": timestamp,
        "x-laratik-service-nonce": nonce,
        "x-laratik-service-identity": "planner-api",
        "x-laratik-service-key-id": "active",
        "x-laratik-service-body-sha256": hashlib.sha256(body).hexdigest(),
        "x-laratik-agency-id": str(agency_id),
        "x-laratik-workspace-id": str(workspace_id),
        "x-laratik-actor-id": str(actor_id),
    }
    headers["x-laratik-service-signature"] = sign_service_request(secret=secret, method="GET", path="/v1/feed", timestamp=timestamp, nonce=nonce, agency_id=agency_id, workspace_id=workspace_id, actor_id=actor_id, body=body)
    monkeypatch.setenv("TRENDS_SERVICE_SECRET", secret)
    monkeypatch.setenv("TRENDS_SERVICE_AUTH_REQUIRED", "true")
    get_settings.cache_clear()
    scope = await require_service_context(_request("GET", "/v1/feed", headers, body))
    assert scope.agency_id == agency_id
    assert scope.workspace_id == workspace_id
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_invalid_signature_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TRENDS_SERVICE_SECRET", "test-service-secret")
    monkeypatch.setenv("TRENDS_SERVICE_AUTH_REQUIRED", "true")
    get_settings.cache_clear()
    body = b""
    with pytest.raises(HTTPException) as error:
        await require_service_context(_request("GET", "/v1/feed", {"x-laratik-service-timestamp": str(int(time.time())), "x-laratik-service-nonce": str(uuid.uuid4()), "x-laratik-service-identity": "planner-api", "x-laratik-service-key-id": "active", "x-laratik-service-body-sha256": hashlib.sha256(body).hexdigest(), "x-laratik-agency-id": str(uuid.uuid4()), "x-laratik-service-signature": "wrong"}, body))
    assert error.value.status_code == 401
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_replayed_nonce_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    secret = "test-service-secret"
    agency_id = uuid.uuid4()
    timestamp = str(int(time.time()))
    nonce = str(uuid.uuid4())
    actor_id = uuid.uuid4()
    body = b"payload"
    headers = {"x-laratik-service-timestamp": timestamp, "x-laratik-service-nonce": nonce, "x-laratik-service-identity": "planner-api", "x-laratik-service-key-id": "active", "x-laratik-service-body-sha256": hashlib.sha256(body).hexdigest(), "x-laratik-agency-id": str(agency_id), "x-laratik-actor-id": str(actor_id)}
    headers["x-laratik-service-signature"] = sign_service_request(secret=secret, method="POST", path="/v1/sync", timestamp=timestamp, nonce=nonce, agency_id=agency_id, actor_id=actor_id, body=body)
    monkeypatch.setenv("TRENDS_SERVICE_SECRET", secret)
    monkeypatch.setenv("TRENDS_SERVICE_AUTH_REQUIRED", "true")
    get_settings.cache_clear()
    await require_service_context(_request("POST", "/v1/sync", headers, body))
    with pytest.raises(HTTPException, match="replayed_service_request"):
        await require_service_context(_request("POST", "/v1/sync", headers, body))
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_missing_actor_scope_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    secret = "test-service-secret"
    agency_id = uuid.uuid4()
    timestamp = str(int(time.time()))
    nonce = str(uuid.uuid4())
    body = b""
    headers = {
        "x-laratik-service-timestamp": timestamp,
        "x-laratik-service-nonce": nonce,
        "x-laratik-service-identity": "planner-api",
        "x-laratik-service-key-id": "active",
        "x-laratik-service-body-sha256": hashlib.sha256(body).hexdigest(),
        "x-laratik-agency-id": str(agency_id),
    }
    headers["x-laratik-service-signature"] = sign_service_request(
        secret=secret,
        method="GET",
        path="/v1/sources/health",
        timestamp=timestamp,
        nonce=nonce,
        agency_id=agency_id,
        body=body,
    )
    monkeypatch.setenv("TRENDS_SERVICE_SECRET", secret)
    monkeypatch.setenv("TRENDS_SERVICE_AUTH_REQUIRED", "true")
    get_settings.cache_clear()
    with pytest.raises(HTTPException, match="actor_scope_required"):
        await require_service_context(_request("GET", "/v1/sources/health", headers, body))
    get_settings.cache_clear()
