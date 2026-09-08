"""Apify extractors.

One source class in this module:

* :class:`ApifySource` — generic Apify actor wrapper. Drives any
  Apify actor (X scraper, Instagram hashtag scraper, Reddit
  scraper, ...) via the Apify REST API. Each actor is registered as
  a separate source in :mod:`app.extractor.catalog`.

The wrapper translates the per-source ``actor_id`` config into an
actor run, polls the run to completion, fetches the dataset items,
and maps each item into a :class:`RawSignal`.

**ToS warning** (surfaced in the onboarding flow):

    Apify actors may use unofficial scrapers. ToS varies by actor.
"""
from __future__ import annotations

import asyncio
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
_APIFY_BASE: str = "https://api.apify.com/v2"
_APIFY_TIMEOUT: float = 30.0
_APIFY_POLL_INTERVAL_SEC: float = 5.0
_APIFY_MAX_POLL_SEC: float = 600.0  # 10 minutes per run

# Cost class — these match the catalog's `cost_per_call_cents` field
# so the scheduler can bill workspaces correctly. Default actors:
#   * apify/cheapest-x-scraper         $0.10 / 1k
#   * apify/instagram-hashtag-scraper  $0.50 / 1k
#   * apify/reddit-scraper             $0.50 / 1k
_APIFY_DEFAULT_ACTORS: list[dict[str, Any]] = [
    {
        "actor_id": "apify/cheapest-x-scraper",
        "platform": "x",
        "cost_per_call_cents": 0.01,  # $0.10/1k
    },
    {
        "actor_id": "apify/instagram-hashtag-scraper",
        "platform": "instagram",
        "cost_per_call_cents": 0.05,  # $0.50/1k
    },
    {
        "actor_id": "apify/reddit-scraper",
        "platform": "reddit",
        "cost_per_call_cents": 0.05,  # $0.50/1k
    },
]


# ─── ApifySource ────────────────────────────────────────────────────────────
@register
class ApifySource:
    """Generic Apify actor wrapper.

    Auth: ``APIFY_TOKEN`` env var (or ``api_token`` in the per-source
    config).

    Flow per ``fetch()``:

    1. ``POST /v2/acts/{actor_id}/runs`` with the per-source input.
    2. Poll ``GET /v2/acts/{actor_id}/runs/{run_id}`` every 5s until
       ``SUCCEEDED`` / ``FAILED`` / ``TIMED-OUT`` (max 10 min).
    3. ``GET /v2/datasets/{dataset_id}/items`` to fetch the items.
    4. Map each item into a :class:`RawSignal` via the per-actor
       mapper (or the generic fallback).

    The platform value is inferred from the actor_id prefix when the
    catalog entry does not pin one explicitly.
    """

    platform: ClassVar[str] = "apify"
    source_key: ClassVar[str] = "apify"
    tos_warning: str = (
        "Apify actors may use unofficial scrapers. ToS varies by actor."
    )

    # ── validation ──────────────────────────────────────────────────────
    @staticmethod
    def validate_config(config: dict[str, Any]) -> ValidationResult:
        errors: list[str] = []

        token = (
            config.get("api_token")
            or os.environ.get("APIFY_TOKEN")
            or os.environ.get("APIFY_API_TOKEN")
            or ""
        ).strip()
        if not token:
            errors.append(
                "APIFY_TOKEN env var (or `api_token` in config) is required"
            )

        actor_id = config.get("actor_id")
        if not actor_id or not isinstance(actor_id, str):
            errors.append("`actor_id` is required (e.g. 'apify/cheapest-x-scraper')")

        for key in ("search_terms", "max_items_per_run"):
            if key in config and not isinstance(config[key], (list, int)):
                errors.append(f"`{key}` must be a list of strings or an int")

        if errors:
            return ValidationResult.failure(*errors)
        return ValidationResult.success()

    # ── fetch ───────────────────────────────────────────────────────────
    async def fetch(self, source: TrendSource) -> list[RawSignal]:
        config: dict[str, Any] = source.config or {}
        token: str = (
            config.get("api_token")
            or os.environ.get("APIFY_TOKEN")
            or os.environ.get("APIFY_API_TOKEN")
            or ""
        ).strip()
        actor_id: str = config.get("actor_id", "")
        if not token or not actor_id:
            return []

        # Build the actor input. The exact shape is actor-specific, so
        # we pass a generic dict that the most common actors accept:
        #   * `searchTerms` — list of search terms
        #   * `maxItems`    — per-run cap
        #   * `proxy`       — optional proxy config
        actor_input: dict[str, Any] = {}
        if config.get("search_terms"):
            actor_input["searchTerms"] = config["searchTerms"]
        if config.get("max_items_per_run"):
            actor_input["maxItems"] = int(config["max_items_per_run"])
        if config.get("include_trends_actor"):
            actor_input["includeTrendsActor"] = config["include_trends_actor"]
        if config.get("hashtags"):
            actor_input["hashtags"] = config["hashtags"]
        if config.get("proxy_url"):
            actor_input["proxy"] = {"useApifyProxy": True}
        # Allow workspaces to override anything via `extra_input`.
        actor_input.update(config.get("extra_input") or {})

        platform_hint: str = self._platform_from_actor_id(actor_id)

        try:
            dataset_id = await self._run_actor(actor_id, actor_input, token)
        except Exception as exc:  # noqa: BLE001
            log.warning(
                "apify_run_failed",
                source_key=self.source_key,
                actor_id=actor_id,
                error_class=type(exc).__name__,
                error=str(exc),
            )
            return []

        if not dataset_id:
            return []

        items = await self._fetch_dataset(dataset_id, token)
        mapper = _APIFY_MAPPERS.get(actor_id, _generic_mapper)
        signals: list[RawSignal] = []
        for item in items:
            try:
                signal = mapper(item, platform_hint=platform_hint, actor_id=actor_id)
                if signal is not None:
                    signals.append(signal)
            except Exception as exc:  # noqa: BLE001
                log.debug(
                    "apify_mapper_failed",
                    actor_id=actor_id,
                    error_class=type(exc).__name__,
                    error=str(exc),
                )
        return signals

    # ── Apify REST helpers ──────────────────────────────────────────────
    async def _run_actor(
        self, actor_id: str, actor_input: dict[str, Any], token: str
    ) -> str | None:
        """Start an actor run and poll until it finishes. Returns the
        dataset_id on success, None on failure or timeout."""
        async with httpx.AsyncClient(
            base_url=_APIFY_BASE,
            timeout=_APIFY_TIMEOUT,
            headers={"Authorization": f"Bearer {token}"},
        ) as client:
            try:
                resp = await client.post(
                    f"/acts/{actor_id}/runs",
                    json=actor_input,
                )
                resp.raise_for_status()
                run = resp.json() or {}
            except httpx.HTTPError as exc:
                log.warning(
                    "apify_run_start_failed",
                    actor_id=actor_id,
                    error_class=type(exc).__name__,
                    error=str(exc),
                )
                return None

            run_id = (run.get("data") or {}).get("id")
            if not run_id:
                return None

            # Poll until terminal state.
            elapsed = 0.0
            while elapsed < _APIFY_MAX_POLL_SEC:
                await asyncio.sleep(_APIFY_POLL_INTERVAL_SEC)
                elapsed += _APIFY_POLL_INTERVAL_SEC
                try:
                    resp = await client.get(
                        f"/acts/{actor_id}/runs/{run_id}"
                    )
                    resp.raise_for_status()
                    run = resp.json() or {}
                except httpx.HTTPError as exc:
                    log.debug(
                        "apify_run_poll_failed",
                        actor_id=actor_id,
                        run_id=run_id,
                        error_class=type(exc).__name__,
                        error=str(exc),
                    )
                    continue

                status = (run.get("data") or {}).get("status")
                if status in {"SUCCEEDED", "FAILED", "TIMED-OUT", "ABORTED"}:
                    break

            final_status = (run.get("data") or {}).get("status")
            if final_status != "SUCCEEDED":
                log.warning(
                    "apify_run_not_succeeded",
                    actor_id=actor_id,
                    run_id=run_id,
                    status=final_status,
                )
                return None

            return (run.get("data") or {}).get("defaultDatasetId")

    async def _fetch_dataset(
        self, dataset_id: str, token: str
    ) -> list[dict[str, Any]]:
        """Fetch all items from an Apify dataset (paginated)."""
        items: list[dict[str, Any]] = []
        offset = 0
        limit = 1000
        async with httpx.AsyncClient(
            base_url=_APIFY_BASE,
            timeout=_APIFY_TIMEOUT,
            headers={"Authorization": f"Bearer {token}"},
        ) as client:
            while True:
                try:
                    resp = await client.get(
                        f"/datasets/{dataset_id}/items",
                        params={"offset": offset, "limit": limit},
                    )
                    resp.raise_for_status()
                    batch = resp.json() or []
                except httpx.HTTPError as exc:
                    log.warning(
                        "apify_dataset_fetch_failed",
                        dataset_id=dataset_id,
                        error_class=type(exc).__name__,
                        error=str(exc),
                    )
                    break
                if not batch:
                    break
                items.extend(batch)
                if len(batch) < limit:
                    break
                offset += limit
        return items

    # ── helpers ────────────────────────────────────────────────────────
    @staticmethod
    def _platform_from_actor_id(actor_id: str) -> str:
        """Best-effort platform inference from the actor_id prefix."""
        aid = actor_id.lower()
        if "x-" in aid or "twitter" in aid:
            return "x"
        if "instagram" in aid or "-ig-" in aid:
            return "instagram"
        if "reddit" in aid:
            return "reddit"
        if "tiktok" in aid:
            return "tiktok"
        if "youtube" in aid:
            return "youtube"
        if "linkedin" in aid:
            return "linkedin"
        if "threads" in aid:
            return "threads"
        return "unknown"


# ─── Per-actor mappers ─────────────────────────────────────────────────────
def _x_scraper_mapper(
    item: dict[str, Any], *, platform_hint: str, actor_id: str
) -> RawSignal | None:
    """Mapper for the apify/cheapest-x-scraper family."""
    text = item.get("text") or item.get("full_text") or item.get("tweet") or ""
    tweet_id = (
        item.get("id")
        or item.get("tweet_id")
        or item.get("id_str")
        or ""
    )
    user = item.get("user") or item.get("author") or {}
    author = user.get("screen_name") or user.get("name") if isinstance(user, dict) else str(user)
    return RawSignal(
        platform="x",
        type="tweet",
        label=text[:200] or f"{author}: (no text)",
        source_id=f"x:apify:{actor_id}:{tweet_id}",
        source_url=item.get("url") or item.get("twitterUrl"),
        raw_payload={
            "tweet_id": tweet_id,
            "author": author,
            "lang": item.get("lang") or item.get("language"),
            "metrics": {
                "like_count": item.get("favorite_count")
                or item.get("like_count")
                or 0,
                "retweet_count": item.get("retweet_count") or 0,
                "reply_count": item.get("reply_count") or 0,
            },
        },
        language=item.get("lang") or "en",
        region="XX",
        score=float(
            (item.get("favorite_count") or 0)
            + (item.get("retweet_count") or 0) * 2
        ),
        fetched_at=datetime.utcnow(),
    )


def _ig_scraper_mapper(
    item: dict[str, Any], *, platform_hint: str, actor_id: str
) -> RawSignal | None:
    """Mapper for the apify/instagram-hashtag-scraper family."""
    caption = item.get("caption") or item.get("text") or ""
    shortcode = item.get("shortCode") or item.get("shortcode") or item.get("code") or ""
    return RawSignal(
        platform="instagram",
        type="hashtag_post",
        label=caption[:200] or (item.get("hashtag") or "(no caption)"),
        source_id=f"ig:apify:{actor_id}:{item.get('id', shortcode)}",
        source_url=f"https://www.instagram.com/p/{shortcode}/" if shortcode else item.get("url"),
        raw_payload={
            "shortcode": shortcode,
            "hashtag": item.get("hashtag"),
            "owner": item.get("ownerUsername") or item.get("owner"),
            "like_count": item.get("likesCount") or item.get("likes"),
            "comment_count": item.get("commentsCount") or item.get("comments"),
            "timestamp": item.get("timestamp"),
        },
        language="en",
        region="XX",
        score=float(
            (item.get("likesCount") or item.get("likes") or 0)
            + (item.get("commentsCount") or item.get("comments") or 0) * 2
        ),
        fetched_at=datetime.utcnow(),
    )


def _reddit_scraper_mapper(
    item: dict[str, Any], *, platform_hint: str, actor_id: str
) -> RawSignal | None:
    """Mapper for the apify/reddit-scraper family."""
    title = item.get("title") or item.get("name") or ""
    return RawSignal(
        platform="reddit",
        type="post",
        label=title[:200] or "(untitled post)",
        source_id=f"reddit:apify:{actor_id}:{item.get('id', '')}",
        source_url=item.get("url") or item.get("permalink"),
        raw_payload={
            "subreddit": item.get("subreddit") or item.get("communityName"),
            "score": item.get("score") or item.get("upvotes"),
            "num_comments": item.get("numComments") or item.get("comments"),
            "created_at": item.get("createdAt") or item.get("created_utc"),
        },
        language="en",
        region="XX",
        score=float(item.get("score") or 0),
        fetched_at=datetime.utcnow(),
    )


def _generic_mapper(
    item: dict[str, Any], *, platform_hint: str, actor_id: str
) -> RawSignal | None:
    """Fallback mapper: turn the first few text fields into a signal."""
    text = (
        item.get("text")
        or item.get("title")
        or item.get("caption")
        or item.get("name")
        or item.get("url")
        or ""
    )
    return RawSignal(
        platform=platform_hint or "unknown",
        type="apify_item",
        label=text[:200] or "(empty item)",
        source_id=(
            f"apify:{actor_id}:{item.get('id', '')}"
            or f"apify:{actor_id}:{hash(str(item))}"
        ),
        source_url=item.get("url") or item.get("link"),
        raw_payload=item,
        language=item.get("lang") or "en",
        region="XX",
        score=float(item.get("score") or item.get("like_count") or 0),
        fetched_at=datetime.utcnow(),
    )


# Actor-id → mapper dispatch table. Apify actors don't expose a
# stable schema, so we list the actors we explicitly support here
# and fall back to the generic mapper for everything else.
_APIFY_MAPPERS: dict[str, Any] = {
    "apify/cheapest-x-scraper": _x_scraper_mapper,
    "apify/twitter-scraper": _x_scraper_mapper,
    "apify/instagram-hashtag-scraper": _ig_scraper_mapper,
    "apify/instagram-scraper": _ig_scraper_mapper,
    "apify/reddit-scraper": _reddit_scraper_mapper,
}


__all__ = [
    "APIFY_DEFAULT_ACTORS",
    "ApifySource",
]
