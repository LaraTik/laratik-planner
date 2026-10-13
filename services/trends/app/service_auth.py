"""Authenticated service-to-service context for the internal Trend Radar API."""

from __future__ import annotations

import hashlib
import hmac
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.models import TrendServiceRequestNonce

AUTH_MAX_SKEW_SECONDS = 60
_nonce_lock = threading.Lock()
_seen_nonces: dict[tuple[str, str], float] = {}


@dataclass(frozen=True)
class ServiceScope:
    agency_id: uuid.UUID | None
    workspace_id: uuid.UUID | None
    identity: str | None = None
    key_id: str | None = None
    actor_id: uuid.UUID | None = None


def _body_digest(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def sign_service_request(
    *,
    secret: str,
    method: str,
    path: str,
    timestamp: str,
    nonce: str,
    agency_id: uuid.UUID | None = None,
    workspace_id: uuid.UUID | None = None,
    actor_id: uuid.UUID | None = None,
    identity: str = "planner-api",
    key_id: str = "active",
    body: bytes = b"",
) -> str:
    """Create the canonical signature used by trusted server callers and tests."""
    agency = str(agency_id) if agency_id else ""
    workspace = str(workspace_id) if workspace_id else ""
    actor = str(actor_id) if actor_id else ""
    payload = "\n".join(
        (
            key_id,
            identity,
            timestamp,
            nonce,
            method.upper(),
            path,
            _body_digest(body),
            agency,
            workspace,
            actor,
        )
    ).encode()
    return hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()


def _secret_for_key(key_id: str) -> str | None:
    settings = get_settings()
    if key_id == settings.TRENDS_SERVICE_KEY_ID:
        return settings.TRENDS_SERVICE_SECRET
    if key_id == settings.TRENDS_SERVICE_PREVIOUS_KEY_ID:
        return settings.TRENDS_SERVICE_SECRET_PREVIOUS
    return None


def _trusted_identity(identity: str) -> bool:
    trusted = {value.strip() for value in get_settings().TRENDS_TRUSTED_SERVICE_IDENTITIES.split(",") if value.strip()}
    return identity in trusted


def _remember_nonce(key_id: str, nonce: str, now: float) -> bool:
    with _nonce_lock:
        cutoff = now - (AUTH_MAX_SKEW_SECONDS * 2)
        for cache_key, seen_at in list(_seen_nonces.items()):
            if seen_at < cutoff:
                del _seen_nonces[cache_key]
        cache_key = (key_id, nonce)
        if cache_key in _seen_nonces:
            return False
        _seen_nonces[cache_key] = now
        return True


async def _claim_nonce(session: AsyncSession, *, key_id: str, nonce: str, now: float) -> bool:
    """Atomically claim a nonce and commit it before the route can run.

    Committing here is deliberate: a later route failure must not roll back
    the replay claim and make the signed request reusable. The unique primary
    key is the cross-process fence; the in-memory cache only avoids a database
    round trip for replays handled by this process.
    """
    seen_at = datetime.fromtimestamp(now, tz=timezone.utc)
    expires_at = seen_at + timedelta(seconds=AUTH_MAX_SKEW_SECONDS * 2)
    await session.execute(delete(TrendServiceRequestNonce).where(TrendServiceRequestNonce.expires_at < seen_at))
    result = await session.execute(
        pg_insert(TrendServiceRequestNonce)
        .values(key_id=key_id, nonce=nonce, seen_at=seen_at, expires_at=expires_at)
        .on_conflict_do_nothing(index_elements=[TrendServiceRequestNonce.key_id, TrendServiceRequestNonce.nonce])
    )
    await session.commit()
    return result.rowcount == 1


async def require_service_context(request: Request, session: AsyncSession | None = None) -> ServiceScope:
    settings = get_settings()
    if not settings.TRENDS_SERVICE_AUTH_REQUIRED:
        return ServiceScope(agency_id=None, workspace_id=None)
    timestamp = request.headers.get("x-laratik-service-timestamp", "")
    nonce = request.headers.get("x-laratik-service-nonce", "")
    signature = request.headers.get("x-laratik-service-signature", "")
    identity = request.headers.get("x-laratik-service-identity", "")
    key_id = request.headers.get("x-laratik-service-key-id", "")
    body_digest = request.headers.get("x-laratik-service-body-sha256", "")
    agency_raw = request.headers.get("x-laratik-agency-id", "")
    workspace_raw = request.headers.get("x-laratik-workspace-id", "")
    actor_raw = request.headers.get("x-laratik-actor-id", "")
    secret = _secret_for_key(key_id)
    if not nonce or not secret or not identity or not _trusted_identity(identity):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_service_credentials")
    try:
        now = time.time()
        if abs(now - int(timestamp)) > AUTH_MAX_SKEW_SECONDS:
            raise ValueError("expired")
        agency_id = uuid.UUID(agency_raw) if agency_raw else None
        workspace_id = uuid.UUID(workspace_raw) if workspace_raw else None
        actor_id = uuid.UUID(actor_raw) if actor_raw else None
    except (ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_service_scope") from None
    body = await request.body()
    if not body_digest or not hmac.compare_digest(body_digest, _body_digest(body)):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_service_body_digest")
    expected = sign_service_request(
        secret=secret,
        method=request.method,
        path=request.url.path,
        timestamp=timestamp,
        nonce=nonce,
        agency_id=agency_id,
        workspace_id=workspace_id,
        actor_id=actor_id,
        identity=identity,
        key_id=key_id,
        body=body,
    )
    if not signature or not hmac.compare_digest(signature, expected):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_service_credentials")
    if not _remember_nonce(key_id, nonce, now):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="replayed_service_request")
    if session is not None:
        try:
            if not await _claim_nonce(session, key_id=key_id, nonce=nonce, now=now):
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="replayed_service_request")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="service_replay_protection_unavailable") from None
    if agency_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="agency_scope_required")
    if actor_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="actor_scope_required")
    scope = ServiceScope(agency_id=agency_id, workspace_id=workspace_id, identity=identity, key_id=key_id, actor_id=actor_id)
    request.state.service_scope = scope
    return scope


async def require_service_context_dependency(
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> ServiceScope:
    """FastAPI adapter that supplies the shared nonce ledger session."""
    return await require_service_context(request, session=session)


def get_service_scope(request: Request) -> ServiceScope:
    return getattr(request.state, "service_scope", ServiceScope(agency_id=None, workspace_id=None))


async def require_actor_scope(
    session: AsyncSession,
    scope: ServiceScope,
    *,
    agency_id: uuid.UUID,
    workspace_id: uuid.UUID | None = None,
) -> None:
    """Prove that the signed actor is an active member of the requested scope.

    Signed tenant identifiers establish request integrity, not user authority.
    This check deliberately remains in the sidecar next to the data query so a
    caller cannot turn a valid HMAC into cross-tenant access by changing only
    the actor header or query parameters.
    """
    if scope.identity is None:
        return
    if scope.actor_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="actor_authorization_required")
    agency_membership = await session.execute(
        text(
            """
            SELECT 1
            FROM agency_membership
            WHERE agency_id = :agency_id
              AND user_id = :actor_id
              AND status = 'active'
            """
        ),
        {"agency_id": agency_id, "actor_id": scope.actor_id},
    )
    if agency_membership.first() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="actor_not_agency_member")
    if workspace_id is None:
        return
    workspace_membership = await session.execute(
        text(
            """
            SELECT 1
            FROM workspace_membership
            WHERE workspace_id = :workspace_id
              AND user_id = :actor_id
              AND status = 'active'
            """
        ),
        {"workspace_id": workspace_id, "actor_id": scope.actor_id},
    )
    if workspace_membership.first() is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="actor_not_workspace_member")
