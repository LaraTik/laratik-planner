from __future__ import annotations

import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

from fastapi.testclient import TestClient

from app.db import get_session
from app.main import app
from app.models import TrendSignal


def _signal(workspace_id: uuid.UUID) -> TrendSignal:
    now = datetime.now(timezone.utc)
    return TrendSignal(
        id=uuid.uuid4(),
        workspace_id=workspace_id,
        platform="tiktok",
        type="video",
        label="Scoped signal",
        normalized_label="scoped signal",
        language="en",
        region="XX",
        score=80.0,
        safe_to_amplify=True,
        vertical=[],
        source_id="synthetic-1",
        source_key="tiktok_tamnd",
        fetched_at=now,
        expires_at=now,
    )


@contextmanager
def _override_session(session: AsyncMock):
    async def override():
        yield session

    app.dependency_overrides[get_session] = override
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_session, None)


def test_single_signal_endpoint_uses_workspace_scope() -> None:
    workspace_id = uuid.uuid4()
    signal = _signal(workspace_id)
    signal.expires_at = datetime.now(timezone.utc)

    result_signal = MagicMock()
    result_signal.scalar_one_or_none.return_value = signal
    result_peers = MagicMock()
    result_peers.scalars.return_value.all.return_value = []
    session = AsyncMock()
    session.execute = AsyncMock(side_effect=[result_signal, result_peers])

    with _override_session(session):
        response = TestClient(app).get(f"/v1/feed/{signal.id}?workspaceId={workspace_id}")

    assert response.status_code == 200
    assert response.json()["signal"]["id"] == str(signal.id)


def test_single_signal_endpoint_requires_a_scope() -> None:
    response = TestClient(app).get(f"/v1/feed/{uuid.uuid4()}")
    assert response.status_code == 400
    assert response.json()["detail"] == "workspace_id_required"
