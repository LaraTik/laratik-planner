from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.jobs import _safe_payload, claim_next_job, complete_job, fail_job
from app.models import TrendJobExecution


def test_job_payload_rejects_credential_material() -> None:
    with pytest.raises(ValueError, match="credentials"):
        _safe_payload({"full_sync": True, "nested": {"access_token": "secret"}})


@pytest.mark.asyncio
async def test_claim_assigns_lease_and_fencing_token() -> None:
    job = TrendJobExecution(id=uuid.uuid4(), agency_id=uuid.uuid4(), workspace_id=uuid.uuid4(), source_key="reddit_json", payload={}, dedupe_key="dedupe", status="queued", attempt_count=0, max_attempts=5, available_at=datetime.now(timezone.utc) - timedelta(seconds=1))
    result = MagicMock()
    result.scalar_one_or_none.return_value = job
    session = AsyncMock()
    session.execute.return_value = result
    claimed = await claim_next_job(session, worker_id="worker-a")
    assert claimed is job
    assert job.status == "running"
    assert job.lease_owner == "worker-a"
    assert job.lease_token is not None
    assert job.attempt_count == 1


@pytest.mark.asyncio
async def test_completion_is_fenced_by_worker_and_token() -> None:
    session = AsyncMock()
    result = MagicMock(rowcount=0)
    session.execute.return_value = result
    assert not await complete_job(session, job_id=uuid.uuid4(), worker_id="stale-worker", lease_token=uuid.uuid4())


@pytest.mark.asyncio
async def test_failure_requeues_with_backoff_then_dead_letters() -> None:
    token = uuid.uuid4()
    job = TrendJobExecution(id=uuid.uuid4(), agency_id=uuid.uuid4(), workspace_id=uuid.uuid4(), source_key="reddit_json", payload={}, dedupe_key="dedupe-retry", status="running", attempt_count=1, max_attempts=2, lease_owner="worker-a", lease_token=token, available_at=datetime.now(timezone.utc))
    result = MagicMock()
    result.scalar_one_or_none.return_value = job
    log = MagicMock()
    session = AsyncMock()
    session.execute.return_value = result
    session.get.return_value = log
    now = datetime.now(timezone.utc)
    assert await fail_job(session, job_id=job.id, worker_id="worker-a", lease_token=token, error_code="timeout", error_message="temporary", now=now)
    assert job.status == "queued"
    assert job.available_at > now
    assert job.last_error_code == "timeout"

    job.status = "running"
    job.attempt_count = 2
    assert await fail_job(session, job_id=job.id, worker_id="worker-a", lease_token=token, error_code="timeout", error_message="terminal", now=now)
    assert job.status == "dead_letter"
    assert log.status == "error"
