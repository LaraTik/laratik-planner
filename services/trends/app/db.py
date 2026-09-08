"""SQLAlchemy 2.0 async engine + session factory.

The Drizzle schema in the Next.js app owns the truth for the trend tables;
this module gives the sidecar a thin async read/write path against the same
Postgres cluster. Column names here match the Drizzle migration column names
1:1 (snake_case singular table names like `trend_signal`, `trend_source`).

Notes:
- We convert `postgresql://` → `postgresql+asyncpg://` so the standard
  DATABASE_URL you already have in .env works without changes.
- The sidecar never runs `create_all()` on startup. The Next.js Drizzle
  migrator owns production schema changes; `create_all()` remains a local
  development helper only.
- A single `AsyncEngine` is process-wide; the `AsyncSessionLocal` factory
  is a `sessionmaker` not a session.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Optional

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

logger = logging.getLogger(__name__)


class Base(DeclarativeBase):
    """Declarative base for all ORM models in this sidecar."""


# Module-level singletons. Populated by `init_engine()` during the
# FastAPI lifespan; tests can call `reset_engine()` to force a re-init.
_engine: Optional[AsyncEngine] = None
_session_factory: Optional[async_sessionmaker[AsyncSession]] = None


def _normalise_dsn(dsn: str) -> str:
    """Translate a sync DSN into the asyncpg-prefixed variant.

    Accepts both `postgresql://` and `postgres://` schemes (the latter
    is what some hosted services hand out) and rewrites them to
    `postgresql+asyncpg://` so SQLAlchemy routes through asyncpg.
    """
    if dsn.startswith("postgresql+asyncpg://"):
        return dsn
    if dsn.startswith("postgresql://") or dsn.startswith("postgres://"):
        # Preserve any query string (sslmode, etc.).
        return "postgresql+asyncpg://" + dsn.split("://", 1)[1]
    return dsn


def init_engine() -> AsyncEngine:
    """Create the process-wide engine. Idempotent — re-uses the existing
    engine if one already exists (e.g. when lifespan re-fires under the
    test client's ASGI transport).
    """
    global _engine, _session_factory
    if _engine is not None:
        return _engine

    settings = get_settings()
    dsn = _normalise_dsn(settings.DATABASE_URL)

    _engine = create_async_engine(
        dsn,
        pool_size=5,
        max_overflow=10,
        pool_pre_ping=True,
        pool_recycle=1800,
        future=True,
    )
    _session_factory = async_sessionmaker(
        bind=_engine,
        expire_on_commit=False,
        autoflush=False,
        class_=AsyncSession,
    )
    logger.info("db.engine.init", extra={"dsn_scheme": dsn.split("://", 1)[0]})
    return _engine


def get_engine() -> AsyncEngine:
    if _engine is None:
        return init_engine()
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:
        init_engine()
    assert _session_factory is not None
    return _session_factory


async def dispose_engine() -> None:
    """Tear down the engine. Called from the FastAPI lifespan on shutdown."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None
    logger.info("db.engine.disposed")


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    """Async context manager that yields a session and commits/rolls back.

    Usage:
        async with get_session() as session:
            row = await session.get(TrendSignal, some_uuid)

    Commits on clean exit, rolls back on any exception that escapes the
    block. The session itself is always closed.
    """
    factory = get_session_factory()
    session = factory()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


async def create_all() -> None:
    """Create every table declared on `Base.metadata`.

    For development only — production must use Alembic. Calls the
    underlying sync `MetaData.create_all` via `run_sync` because the
    async variant does not exist in SQLAlchemy 2.0.
    """
    engine = get_engine()
    # Import models so they are registered on Base.metadata before create_all.
    # Imported here to avoid a circular import at module-load time.
    from app import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("db.create_all.complete")
