"""Authenticated service-to-service context for the internal Trend Radar API."""

from __future__ import annotations

import hashlib
import hmac
import time
import uuid
from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from app.config import get_settings

AUTH_MAX_SKEW_SECONDS = 60


@dataclass(frozen=True)
class ServiceScope:
    agency_id: uuid.UUID | None
    workspace_id: uuid.UUID | None


def sign_service_request(*, secret: str, method: str, path: str, timestamp: str, nonce: str, agency_id: uuid.UUID | None = None, workspace_id: uuid.UUID | None = None) -> str:
    agency = str(agency_id) if agency_id else ""
    workspace = str(workspace_id) if workspace_id else ""
    payload = "\n".join((timestamp, nonce, method.upper(), path, agency, workspace)).encode()
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


async def require_service_context(request: Request) -> ServiceScope:
    settings = get_settings()
    if not settings.TRENDS_SERVICE_AUTH_REQUIRED:
        return ServiceScope(agency_id=None, workspace_id=None)
    secret = settings.TRENDS_SERVICE_SECRET
    if not secret:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="service_auth_not_configured")
    timestamp = request.headers.get("x-laratik-service-timestamp", "")
    nonce = request.headers.get("x-laratik-service-nonce", "")
    signature = request.headers.get("x-laratik-service-signature", "")
    agency_raw = request.headers.get("x-laratik-agency-id", "")
    workspace_raw = request.headers.get("x-laratik-workspace-id", "")
    try:
        if abs(time.time() - int(timestamp)) > AUTH_MAX_SKEW_SECONDS:
            raise ValueError("expired")
        agency_id = uuid.UUID(agency_raw) if agency_raw else None
        workspace_id = uuid.UUID(workspace_raw) if workspace_raw else None
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_service_scope") from None
    expected = sign_service_request(secret=secret, method=request.method, path=request.url.path, timestamp=timestamp, nonce=nonce, agency_id=agency_id, workspace_id=workspace_id)
    if not signature or not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_service_credentials")
    if agency_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="agency_scope_required")
    scope = ServiceScope(agency_id=agency_id, workspace_id=workspace_id)
    request.state.service_scope = scope
    return scope


def get_service_scope(request: Request) -> ServiceScope:
    return getattr(request.state, "service_scope", ServiceScope(agency_id=None, workspace_id=None))
