"""FastAPI app — entry point for the Trend Radar sidecar.

Lifespan responsibilities (in order):
  1. Configure logging (structlog → JSON to stdout).
  2. Initialise Sentry (when DSN is set).
  3. Open the async SQLAlchemy engine. Schema changes are applied by the
     Next.js Drizzle migrator before this service starts.
  4. Warm the embedding model (all-MiniLM-L6-v2) so /v1/embed is fast.
  5. Start the APScheduler and register the default-on sources.

Routes:
  - /healthz      — health probe
  - /metrics      — Prometheus exposition
  - /v1/feed      — paginated feed + single-signal "why" payload
  - /v1/sync      — manual sync queue + status poll
  - /v1/sources   — per-source health + 1-call test
  - /v1/embed     — embedding service (testing)

Run locally with:
    uvicorn app.main:app --reload --port 8010
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest

from app.config import get_settings
from app.db import dispose_engine, init_engine
from app.observability import (
    configure_logging,
    get_logger,
    init_sentry,
)
from app.routes import router as api_router
from app.scheduler import get_scheduler, start_scheduler, stop_scheduler


logger = get_logger("main")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application startup / shutdown.

    Idempotent enough to survive the test client's ASGI transport re-firing
    the lifespan; the underlying helpers guard against double-init.
    """
    settings = get_settings()
    configure_logging()
    init_sentry()

    # Database. Schema ownership stays with the Next.js Drizzle migrator;
    # the sidecar must never create or mutate production tables on startup.
    init_engine()

    # Embedding model warmup (5s; cheaper than the first /v1/embed hit).
    try:
        from app.analysis.embeddings import warmup as warmup_embeddings

        await run_in_threadpool(warmup_embeddings)
    except Exception as exc:  # noqa: BLE001
        logger.warning("embeddings.warmup.failed", error=str(exc))

    # Scheduler
    from app.db import get_session_factory

    if settings.TRENDS_RADAR_ENABLED:
        try:
            await start_scheduler(get_session_factory())
        except Exception as exc:  # noqa: BLE001
            logger.error("scheduler.start.failed", error=str(exc))
    else:
        logger.info("scheduler.disabled_by_config")

    app.state.model_loaded = True
    logger.info(
        "sidecar.startup.complete",
        database_url_scheme=settings.DATABASE_URL.split("://", 1)[0],
        log_level=settings.LOG_LEVEL,
    )
    try:
        yield
    finally:
        await stop_scheduler()
        await dispose_engine()
        logger.info("sidecar.shutdown.complete")


async def run_in_threadpool(func, *args, **kwargs):
    """Run a sync callable in the default thread pool.

    Used for ML model loads — the heavy lifting is in C/extension code
    and benefits from running off the event loop thread.
    """
    import asyncio

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, lambda: func(*args, **kwargs))


# ─── App factory ────────────────────────────────────────────────────────────
app = FastAPI(
    title="laratik-trends",
    version="0.1.0",
    description="Trend Radar sidecar — extract, normalise, score, and serve cross-platform social trends.",
    lifespan=lifespan,
)

# CORS — allow the Next.js dev server. In production the sidecar is
# reached through the Next.js server, not the browser directly, so this
# is mainly for the dev loop.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(api_router)


# ─── Health + metrics (mounted at the root, NOT under /v1) ──────────────────
@app.get("/healthz", tags=["health"])
async def healthz() -> dict[str, object]:
    """Liveness probe. Always 200 unless the process is wedged.

    The Kubernetes/Docker healthcheck calls this every 30s. We report
    `model_loaded: True` once the lifespan has finished.
    """
    return {
        "status": "ok",
        "model_loaded": bool(getattr(app.state, "model_loaded", False)),
        "scheduler_running": bool(
            getattr(app.state, "model_loaded", False) and get_scheduler().running
        ),
    }


@app.get("/metrics", tags=["health"])
async def metrics() -> tuple[bytes, str]:
    """Prometheus exposition. Plain text format, content-type per the spec."""
    return generate_latest(), CONTENT_TYPE_LATEST
