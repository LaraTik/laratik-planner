"""YouTube Data API v3 extractor.

Reads ``videos.list?chart=mostPopular`` — the official, free, first-party
trend endpoint. The default 10,000 units/day per project is the single
best free trend signal in the stack, so this extractor is default-ON.

Endpoint reference
------------------
``GET https://www.googleapis.com/youtube/v3/videos``

Query parameters
    key             API key (env ``YOUTUBE_API_KEY``).
    part            ``snippet,statistics`` (always both).
    chart           ``mostPopular`` (fixed).
    regionCode      ISO 3166-1 alpha-2; default ``US``.
    videoCategoryId YouTube category id; ``0`` = all.
    maxResults      1..50; default 50.

Quota
-----
* ``videos.list`` costs 1 unit per call. With 10k units/day this
  extractor can run 200 times/day before the daily quota is hit
  (assuming a single 50-result page per call).
* 403 with ``quotaExceeded`` reason raises :class:`QuotaExceededError`
  so the caller can trip the circuit breaker instead of treating the
  failure as a transient network error.
"""
from __future__ import annotations

import os
from typing import Any, ClassVar

import httpx

from app.extractor.base import RawSignal, Source, ValidationResult
from app.extractor.registry import register_source
from app.models import TrendSource
from app.observability import get_logger


logger = get_logger(__name__)


# ─── Error class ──────────────────────────────────────────────────────────────
class QuotaExceededError(RuntimeError):
    """Raised when the YouTube Data API returns ``quotaExceeded``.

    The circuit breaker watches for this and opens the breaker so the
    next 6 hours of scheduler ticks skip this source instead of
    burning more quota on a known-exhausted project.
    """


# ─── Defaults ─────────────────────────────────────────────────────────────────
_DEFAULT_REGION: str = "US"
_DEFAULT_CATEGORY: str = "0"  # 0 = All on YouTube's chart endpoint
_DEFAULT_MAX_RESULTS: int = 50

_VIDEO_FIELDS: str = "snippet(title,channelTitle,categoryId,defaultLanguage,publishedAt),statistics(viewCount,likeCount,commentCount)"

_API_BASE: str = "https://www.googleapis.com/youtube/v3/videos"


# ─── Extractor ────────────────────────────────────────────────────────────────
@register_source
class YoutubeDataApiSource:
    """YouTube Data API v3 — official most-popular chart.

    Implements the :class:`app.extractor.base.Source` protocol.
    """

    platform: ClassVar[str] = "youtube"
    source_key: ClassVar[str] = "youtube_data_api"

    # ------------------------------------------------------------------ config
    @staticmethod
    def validate_config(config: dict[str, Any]) -> ValidationResult:
        errors: list[str] = []
        warnings: list[str] = []

        if not os.environ.get("YOUTUBE_API_KEY"):
            errors.append(
                "YOUTUBE_API_KEY env var is not set — the Data API will return 400/403"
            )

        region = config.get("region_code", _DEFAULT_REGION)
        if not isinstance(region, str) or len(region) != 2:
            errors.append(
                f"region_code must be a 2-letter ISO code, got {region!r}"
            )

        category = config.get("video_category_id", _DEFAULT_CATEGORY)
        allowed = {"0", "1", "2", "10", "15", "17", "20", "22", "23",
                   "24", "25", "26", "27", "28"}
        if category not in allowed:
            warnings.append(
                f"video_category_id={category!r} is outside the curated set; "
                "YouTube will accept it but the value may not be in the catalog"
            )

        max_results = config.get("max_results_per_page", _DEFAULT_MAX_RESULTS)
        if not isinstance(max_results, int) or not 1 <= max_results <= 50:
            errors.append("max_results_per_page must be an integer in [1, 50]")

        if errors:
            return ValidationResult.failure(*errors)
        return ValidationResult(ok=True, warnings=warnings)

    # ------------------------------------------------------------------ fetch
    async def fetch(self, source: TrendSource) -> list[RawSignal]:
        api_key = os.environ.get("YOUTUBE_API_KEY")
        if not api_key:
            logger.warning(
                "youtube.fetch.no_api_key",
                source_key=source.source_key,
            )
            return []

        cfg = source.config or {}
        region = cfg.get("region_code", _DEFAULT_REGION)
        category = cfg.get("video_category_id", _DEFAULT_CATEGORY)
        max_results = int(cfg.get("max_results_per_page", _DEFAULT_MAX_RESULTS))

        params: dict[str, str | int] = {
            "key": api_key,
            "part": "snippet,statistics",
            "chart": "mostPopular",
            "regionCode": region,
            "maxResults": max_results,
        }
        if category and category != "0":
            params["videoCategoryId"] = category

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                resp = await client.get(_API_BASE, params=params)
        except httpx.HTTPError as exc:
            logger.warning(
                "youtube.fetch.network_error",
                source_key=source.source_key,
                error_class=exc.__class__.__name__,
                error=str(exc)[:300],
            )
            return []

        # Quota exhausted — surface a typed error so the breaker can open.
        if resp.status_code == 403:
            try:
                payload = resp.json()
            except ValueError:
                payload = {}
            errors = (payload.get("error", {}).get("errors") or [])
            if any(e.get("reason") == "quotaExceeded" for e in errors):
                logger.warning(
                    "youtube.fetch.quota_exceeded",
                    source_key=source.source_key,
                )
                raise QuotaExceededError("YouTube Data API quota exceeded")

            logger.warning(
                "youtube.fetch.forbidden",
                source_key=source.source_key,
                status=resp.status_code,
                body=resp.text[:300],
            )
            return []

        if resp.status_code != 200:
            logger.warning(
                "youtube.fetch.bad_status",
                source_key=source.source_key,
                status=resp.status_code,
                body=resp.text[:300],
            )
            return []

        try:
            payload = resp.json()
        except ValueError as exc:
            logger.warning(
                "youtube.fetch.invalid_json",
                source_key=source.source_key,
                error=str(exc)[:200],
            )
            return []

        items = payload.get("items") or []
        signals: list[RawSignal] = []
        for item in items:
            try:
                signals.append(self._signal_from_item(item, region))
            except (KeyError, TypeError, ValueError) as exc:
                # A single malformed item should not poison the rest of
                # the page; skip it and keep going.
                logger.debug(
                    "youtube.fetch.skip_item",
                    error_class=exc.__class__.__name__,
                    error=str(exc)[:200],
                )
                continue

        logger.info(
            "youtube.fetch.ok",
            source_key=source.source_key,
            region=region,
            category=category,
            count=len(signals),
        )
        return signals

    # ------------------------------------------------------------------ helpers
    def _signal_from_item(self, item: dict[str, Any], region: str) -> RawSignal:
        """Translate a single ``videos.list`` row into a :class:`RawSignal`."""
        video_id: str = item["id"]
        snippet = item.get("snippet", {}) or {}
        statistics = item.get("statistics", {}) or {}

        title = (snippet.get("title") or "").strip()
        channel = (snippet.get("channelTitle") or "").strip()

        # viewCount comes back as a string in the JSON — coerce.
        view_count_raw = statistics.get("viewCount", "0") or "0"
        try:
            score = float(view_count_raw)
        except (TypeError, ValueError):
            score = 0.0

        language = (snippet.get("defaultLanguage") or "en")[:8] or "en"

        return RawSignal(
            platform=self.platform,
            type="video",
            label=title or video_id,
            source_id=f"youtube:video:{video_id}",
            source_url=f"https://www.youtube.com/watch?v={video_id}",
            raw_payload=item,
            language=language,
            region=region,
            score=score,
        )
