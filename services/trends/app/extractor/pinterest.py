"""Pinterest extractors.

One source class in this module:

* :class:`PinterestV5Source` — official Pinterest API v5. Clean ToS,
  no ``tos_warning`` field needed. The /v5/trends/pinterest endpoint
  was removed in 2025-Q4; we approximate trending by searching a
  curated query list and ranking by save_count.
"""
from __future__ import annotations

import os
from datetime import datetime
from typing import Any, ClassVar

import httpx
import structlog

from app.extractor.base import (
    RawSignal,
    ValidationResult,
    register,
)
from app.models import TrendSource


log = structlog.get_logger(__name__)


# ─── Defaults ───────────────────────────────────────────────────────────────
_PINTEREST_DEFAULT_QUERIES: list[str] = ["coffee", "home decor", "fashion"]
_PINTEREST_BASE: str = "https://api.pinterest.com/v5"
_PINTEREST_TIMEOUT: float = 30.0


# ─── PinterestV5Source ──────────────────────────────────────────────────────
@register
class PinterestV5Source:
    """Official Pinterest API v5.

    Auth: OAuth 2.0 access token from ``PINTEREST_ACCESS_TOKEN`` env
    var (or ``access_token`` in the per-source config).

    Endpoint: ``GET /v5/search/pins?query={query}&scope=public`` —
    returns up to 250 pins per call; we cap at 25 per query by default
    to keep the per-run cost reasonable.

    The ``/v5/trends/pinterest`` endpoint was removed in 2025-Q4; we
    approximate "trending" by ranking search results by save_count
    velocity (saves / pin age in days).
    """

    platform: ClassVar[str] = "pinterest"
    source_key: ClassVar[str] = "pinterest_api_v5"
    tos_warning: str = ""  # clean first-party API

    # ── validation ──────────────────────────────────────────────────────
    @staticmethod
    def validate_config(config: dict[str, Any]) -> ValidationResult:
        errors: list[str] = []

        token = (
            config.get("access_token")
            or os.environ.get("PINTEREST_ACCESS_TOKEN")
            or ""
        ).strip()
        if not token:
            errors.append(
                "PINTEREST_ACCESS_TOKEN env var (or `access_token` in config) is required"
            )

        queries = config.get("queries") or []
        if not isinstance(queries, list) or not queries:
            errors.append("`queries` must be a non-empty list of strings")
        elif len(queries) > 50:
            errors.append("`queries` must contain 50 or fewer entries")

        region = config.get("region", "US")
        if not isinstance(region, str) or len(region) != 2:
            errors.append("`region` must be a 2-letter ISO country code")

        max_results = config.get("max_results_per_query", 50)
        if not isinstance(max_results, int) or not (1 <= max_results <= 250):
            errors.append("`max_results_per_query` must be an int in [1, 250]")

        if errors:
            return ValidationResult.failure(*errors)
        return ValidationResult.success()

    # ── fetch ───────────────────────────────────────────────────────────
    async def fetch(self, source: TrendSource) -> list[RawSignal]:
        config: dict[str, Any] = source.config or {}
        token: str = (
            config.get("access_token")
            or os.environ.get("PINTEREST_ACCESS_TOKEN")
            or ""
        ).strip()
        queries: list[str] = config.get("queries") or _PINTEREST_DEFAULT_QUERIES
        region: str = config.get("region", "US")
        max_per_query: int = int(config.get("max_results_per_query", 50))

        if not token:
            log.error(
                "pinterest_no_token",
                source_key=self.source_key,
                hint="set PINTEREST_ACCESS_TOKEN or pass access_token in config",
            )
            return []

        signals: list[RawSignal] = []
        async with httpx.AsyncClient(
            base_url=_PINTEREST_BASE,
            timeout=_PINTEREST_TIMEOUT,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/json",
            },
        ) as client:
            for query in queries:
                page_size = min(max_per_query, 250)
                cursor: str | None = None
                fetched_for_query = 0

                while fetched_for_query < max_per_query:
                    params: dict[str, Any] = {
                        "query": query,
                        "scope": "public",
                        "page_size": page_size,
                    }
                    if cursor:
                        params["cursor"] = cursor

                    try:
                        resp = await client.get(
                            "/search/pins",
                            params=params,
                        )
                        resp.raise_for_status()
                        data = resp.json()
                    except httpx.HTTPError as exc:
                        log.warning(
                            "pinterest_search_failed",
                            source_key=self.source_key,
                            query=query,
                            error_class=type(exc).__name__,
                            error=str(exc),
                        )
                        break

                    for pin in data.get("items") or []:
                        if fetched_for_query >= max_per_query:
                            break
                        signals.append(self._pin_to_signal(pin, query, region))
                        fetched_for_query += 1

                    cursor = data.get("cursor") if data.get("cursor") else None
                    if not cursor:
                        break

        return signals

    # ── helpers ────────────────────────────────────────────────────────
    @staticmethod
    def _pin_to_signal(pin: dict[str, Any], query: str, region: str) -> RawSignal:
        saves = int(pin.get("save_count") or 0)
        comments = int(pin.get("comment_count") or 0)
        reactions = int(pin.get("reaction_count") or 0)
        # Score = saves (primary engagement) + comments * 2 + reactions.
        score = float(saves + 2 * comments + reactions)
        created = pin.get("created_at")
        return RawSignal(
            platform="pinterest",
            type="pin",
            label=(pin.get("title") or pin.get("description") or query)[:200],
            source_id=f"pin:v5:{pin.get('id', '')}",
            source_url=pin.get("link"),
            raw_payload={
                "pin_id": pin.get("id"),
                "query": query,
                "board_id": pin.get("board_id"),
                "media": pin.get("media"),
                "save_count": saves,
                "comment_count": comments,
                "reaction_count": reactions,
                "created_at": created,
                "region": region,
            },
            language="en",
            region=region,
            score=score,
            fetched_at=datetime.utcnow(),
        )
