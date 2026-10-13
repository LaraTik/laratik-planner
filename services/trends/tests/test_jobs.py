from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.jobs import _safe_payload, claim_next_job, complete_job, enqueue_job, fail_job, renew_lease
from app.models import TrendJobExecution


def test_job_payload_rejects_credential_material() -> None:
    with pytest.raises(ValueError, match="credentials"):
        _safe_payload({"full_sync": True, "nested": {"access_token": "secret"}})


@pytest.mark.asyncio
async def test_claim_assigns_lease_and_fencing_token() -> None:
    job = TrendJobExecution(id=uuid.uuid4(), agency_id=uuid.uuid4(), workspace_id=uuid.uuid4(), source_key="reddit_json", payload={}, dedupe_key="dedupe", status="queued", attempt_count=0, max_attempts=5, available_at=datetime.now(UTC) - timedelta(seconds=1))
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
async def test_claim_replaces_expired_lease_with_new_fencing_token() -> None:
    old_token = uuid.uuid4()
    job = TrendJobExecution(id=uuid.uuid4(), agency_id=uuid.uuid4(), workspace_id=uuid.uuid4(), source_key="reddit_json", payload={}, dedupe_key="dedupe-expired", status="running", attempt_count=1, max_attempts=5, lease_owner="dead-worker", lease_token=old_token, lease_expires_at=datetime.now(UTC) - timedelta(seconds=1), available_at=datetime.now(UTC) - timedelta(seconds=1))
    result = MagicMock()
    result.scalar_one_or_none.return_value = job
    session = AsyncMock()
    session.execute.return_value = result
    claimed = await claim_next_job(session, worker_id="worker-restarted")
    assert claimed is job
    assert job.lease_owner == "worker-restarted"
    assert job.lease_token is not None
    assert job.lease_token != old_token
    assert job.attempt_count == 2


@pytest.mark.asyncio
async def test_expired_worker_cannot_renew_lease() -> None:
    session = AsyncMock()
    session.execute.return_value = MagicMock(rowcount=0)
    assert not await renew_lease(
        session,
        job_id=uuid.uuid4(),
        worker_id="stale-worker",
        lease_token=uuid.uuid4(),
        now=datetime.now(UTC),
    )


@pytest.mark.asyncio
async def test_active_enqueue_is_idempotent_by_dedupe_key() -> None:
    existing = TrendJobExecution(id=uuid.uuid4(), agency_id=uuid.uuid4(), workspace_id=uuid.uuid4(), source_key="reddit_json", payload={}, dedupe_key="same-work", status="running", attempt_count=1, max_attempts=5, available_at=datetime.now(UTC))
    result = MagicMock()
    result.scalar_one_or_none.return_value = existing
    session = AsyncMock()
    session.execute.return_value = result
    job_id = await enqueue_job(
        session,
        agency_id=existing.agency_id,
        workspace_id=existing.workspace_id,
        source_key=existing.source_key,
        dedupe_key=existing.dedupe_key,
        payload={"full_sync": True},
    )
    assert job_id == existing.id
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_completion_is_fenced_by_worker_and_token() -> None:
    session = AsyncMock()
    result = MagicMock(rowcount=0)
    session.execute.return_value = result
    assert not await complete_job(session, job_id=uuid.uuid4(), worker_id="stale-worker", lease_token=uuid.uuid4())


@pytest.mark.asyncio
async def test_failure_requeues_with_backoff_then_dead_letters() -> None:
    token = uuid.uuid4()
    job = TrendJobExecution(id=uuid.uuid4(), agency_id=uuid.uuid4(), workspace_id=uuid.uuid4(), source_key="reddit_json", payload={}, dedupe_key="dedupe-retry", status="running", attempt_count=1, max_attempts=2, lease_owner="worker-a", lease_token=token, available_at=datetime.now(UTC))
    result = MagicMock()
    result.scalar_one_or_none.return_value = job
    log = MagicMock()
    session = AsyncMock()
    session.execute.return_value = result
    session.get.return_value = log
    now = datetime.now(UTC)
    assert await fail_job(session, job_id=job.id, worker_id="worker-a", lease_token=token, error_code="timeout", error_message="temporary", now=now)
    assert job.status == "queued"
    assert job.available_at > now
    assert job.last_error_code == "timeout"

    job.status = "running"
    job.attempt_count = 2
    assert await fail_job(session, job_id=job.id, worker_id="worker-a", lease_token=token, error_code="timeout", error_message="terminal", now=now)
    assert job.status == "dead_letter"
    assert log.status == "error"
    assert job.lease_owner is None
    assert job.lease_token is None
