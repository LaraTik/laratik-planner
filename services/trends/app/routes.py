"""Top-level route aggregator.

The FastAPI app (`app.main`) imports `router` and includes it once. The
real implementation is split into the `routes_*` modules for readability.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.routes_embed import router as embed_router
from app.routes_feed import router as feed_router
from app.routes_sources import router as sources_router
from app.routes_sync import router as sync_router

router = APIRouter()
router.include_router(feed_router)
router.include_router(sync_router)
router.include_router(sources_router)
router.include_router(embed_router)
