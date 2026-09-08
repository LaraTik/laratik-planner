"""Google Trends via SerpAPI extractor.

The official Google Trends API has never existed. SerpAPI is the most
reliable third-party source in 2026 ($50/mo for 5k searches; this
extractor costs ~1¢ per call so the per-agency cap is enforced by the
scheduler at the budget layer).

Endpoint
--------
``GET https://serpapi.com/search.json``

Query parameters
    engine         ``google_trends`` (fixed).
    q              search query; default ``"trending now"``.
    date           time range; default ``"now 1-H"`` (last hour).
    api_key        ``SERPAPI_KEY`` env var.
    geo            optional country code.

Response shape
--------------
SerpAPI returns a list of daily trending searches under
``trending_searches`` when the request is for the default "trending
now" feed. The extractor is defensive about the shape: anything that
doesn't have a ``query`` field is dropped silently.

Cost-control cache
------------------
Google Trends data refreshes hourly at best, so a 24h in-process
cache cuts the per-agency call volume by 24× without losing signal
freshness. The cache key is the query + geo + date tuple; entries
expire after ``_CACHE_TTL_S`` seconds.
"""
from __future__ import annotations

import os
import time
from typing import Any, ClassVar

import httpx

from app.extractor.base import RawSignal, Source, ValidationResult
from app.extractor.registry import register_source
from app.models import TrendSource
from app.observability import get_logger


logger = get_logger(__name__)


# ─── Defaults ─────────────────────────────────────────────────────────────────
_API_BASE: str = "https://serpapi.com/search.json"

_DEFAULT_QUERY: str = "trending now"
_DEFAULT_TIME_RANGE: str = "now 1-H"
_DEFAULT_GEO: str = ""  # empty = worldwide

_CACHE_TTL_S: float = 24 * 60 * 60  # 24h


# ─── In-process TTL cache ─────────────────────────────────────────────────────
# Per-process dict keyed by the cache key tuple, value = (timestamp, list[RawSignal]).
# The cache is intentionally in-memory: it lives in the worker process
# and is reset on restart. Across multiple processes (workers behind
# uvicorn) the dedup layer in the DB still keeps the cost under
# control; the cache is just to avoid hammering SerpAPI when several
# workspaces run the same source.
_CACHE: dict[tuple[str, str, str], tuple[float, list[RawSignal]]] = {}


def _cache_key(query: str, geo: str, date: str) -> tuple[str, str, str]:
    return (query.strip().lower(), geo.strip().lower(), date.strip().lower())


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _signal_from_trend(
    item: dict[str, Any], *, source_key: str
) -> RawSignal | None:
    if not isinstance(item, dict):
        return None
    query = item.get("query")
    if not isinstance(query, str) or not query.strip():
        return None
    query = query.strip()

    volume_raw = item.get("search_volume") or item.get("value") or 0
    try:
        score = float(volume_raw)
    except (TypeError, ValueError):
        score = 0.0

    return RawSignal(
        platform="google_trends",
        type="search",
        label=query,
        source_id=f"google_trends:{source_key}:{query}",
        source_url=item.get("link") or item.get("serpapi_link"),
        raw_payload=item,
        language="en",
        region="XX",
        score=score,
    )


# ─── Extractor ────────────────────────────────────────────────────────────────
@register_source
class SerpApiGoogleTrendsSource:
    """Google Trends via SerpAPI — paid, 1¢/call, 24h in-process cache."""

    platform: ClassVar[str] = "google_trends"
    source_key: ClassVar[str] = "google_trends_serpapi"

    # ------------------------------------------------------------------ config
    @staticmethod
    def validate_config(config: dict[str, Any]) -> ValidationResult:
        errors: list[str] = []
        if not os.environ.get("SERPAPI_KEY"):
            errors.append("SERPAPI_KEY env var is not set")
        queries = config.get("queries", [])
        if not isinstance(queries, list) or not queries:
            errors.append("queries must be a non-empty list")
        if errors:
            return ValidationResult.failure(*errors)
        return ValidationResult.success()

    # ------------------------------------------------------------------ fetch
    async def fetch(self, source: TrendSource) -> list[RawSignal]:
        cfg = source.config or {}
        queries: list[str] = cfg.get("queries", [])
        if not queries:
            # Fall back to the default "trending now" feed, which
            # SerpAPI's google_trends engine returns when ``q`` is empty.
            queries = [_DEFAULT_QUERY]
        geo: str = cfg.get("geo", _DEFAULT_GEO)
        time_range: str = cfg.get("time_range", _DEFAULT_TIME_RANGE)

        all_signals: list[RawSignal] = []
        for query in queries:
            signals = await self._fetch_one(query, geo=geo, time_range=time_range)
            all_signals.extend(signals)

        logger.info(
            "google_trends.fetch.ok",
            source_key=source.source_key,
            queries=len(queries),
            count=len(all_signals),
            cache_size=len(_CACHE),
        )
        return all_signals

    # ------------------------------------------------------------------ helpers
    async def _fetch_one(
        self, query: str, *, geo: str, time_range: str
    ) -> list[RawSignal]:
        cache_key = _cache_key(query, geo, time_range)
        now = time.monotonic()
        cached = _CACHE.get(cache_key)
        if cached is not None:
            ts, signals = cached
            if now - ts < _CACHE_TTL_S:
                logger.debug(
                    "google_trends.fetch.cache_hit",
                    query=query,
                    age_s=round(now - ts, 1),
                )
                return signals
            # Stale — drop and refetch.
            _CACHE.pop(cache_key, None)

        api_key = os.environ.get("SERPAPI_KEY")
        if not api_key:
            logger.warning(
                "google_trends.fetch.no_api_key",
                source_key=self.source_key,
            )
            return []

        params: dict[str, str] = {
            "engine": "google_trends",
            "q": query,
            "date": time_range,
            "api_key": api_key,
        }
        if geo:
            params["geo"] = geo

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(_API_BASE, params=params)
        except httpx.HTTPError as exc:
            logger.warning(
                "google_trends.fetch.network_error",
                error_class=exc.__class__.__name__,
                error=str(exc)[:300],
            )
            return []

        if resp.status_code == 401 or resp.status_code == 403:
            logger.warning(
                "google_trends.fetch.auth_error",
                status=resp.status_code,
            )
            return []

        if resp.status_code != 200:
            logger.warning(
                "google_trends.fetch.bad_status",
                status=resp.status_code,
                body=resp.text[:300],
            )
            return []

        try:
            payload = resp.json()
        except ValueError as exc:
            logger.warning(
                "google_trends.fetch.invalid_json",
                error=str(exc)[:200],
            )
            return []

        signals = self._extract_trending_searches(payload)
        _CACHE[cache_key] = (now, signals)
        return signals

    @staticmethod
    def _extract_trending_searches(payload: Any) -> list[RawSignal]:
        """Map a SerpAPI response to a flat list of RawSignals.

        SerpAPI returns the daily trending searches under
        ``trending_searches`` (list of dicts with a ``query`` field)
        and the related-queries block under
        ``related_queries.{top,rising}``. We pull both and tag them
        with the ``type`` field so downstream code can distinguish
        "this is the trending feed" from "this is a related query".
        """
        out: list[RawSignal] = []

        if not isinstance(payload, dict):
            return out

        for item in payload.get("trending_searches") or []:
            if not isinstance(item, dict):
                continue
            label = item.get("query")
            if not isinstance(label, str) or not label.strip():
                continue
            volume_raw = item.get("search_volume") or item.get("value") or 0
            try:
                score = float(volume_raw)
            except (TypeError, ValueError):
                score = 0.0
            out.append(
                RawSignal(
                    platform="google_trends",
                    type="trending_search",
                    label=label.strip(),
                    source_id=f"google_trends:google_trends_serpapi:trending:{label}",
                    source_url=item.get("link") or item.get("serpapi_link"),
                    raw_payload=item,
                    language="en",
                    region="XX",
                    score=score,
                )
            )

        related = payload.get("related_queries") or {}
        if isinstance(related, dict):
            for bucket, sig_type in (
                ("top", "related_top"),
                ("rising", "related_rising"),
            ):
                items = related.get(bucket) or []
                if not isinstance(items, list):
                    continue
                for item in items:
                    if not isinstance(item, dict):
                        continue
                    label = item.get("query")
                    if not isinstance(label, str) or not label.strip():
                        continue
                    volume_raw = item.get("value") or 0
                    score = 0.0
                    if isinstance(volume_raw, str):
                        # "Breakout" or "+5500%" — keep the raw string in
                        # the payload and fall back to 0.0 for the score.
                        try:
                            score = float(volume_raw.rstrip("%").replace("+", ""))
                        except ValueError:
                            score = 0.0
                    elif isinstance(volume_raw, (int, float)):
                        score = float(volume_raw)
                    out.append(
                        RawSignal(
                            platform="google_trends",
                            type=sig_type,
                            label=label.strip(),
                            source_id=(
                                f"google_trends:google_trends_serpapi:"
                                f"{bucket}:{label}"
                            ),
                            source_url=item.get("link") or item.get("serpapi_link"),
                            raw_payload=item,
                            language="en",
                            region="XX",
                            score=score,
                        )
                    )

        return out
