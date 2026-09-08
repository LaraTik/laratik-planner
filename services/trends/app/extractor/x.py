"""X (formerly Twitter) extractors.

Two source classes in this module:

* :class:`XTwikitSource`        — unofficial reader via the ``twikit`` library.
  Uses the iOS-app internal API. **Grey-area ToS** — see ``tos_warning`` —
  workspace admins must opt in knowingly. Account ban risk.
* :class:`XV2PaidSource`        — official X API v2, pay-per-use tier.
  ``$0.005`` per ``/2/tweets/search/recent`` read, ``$0.010`` per
  ``/2/trends/by/woeid/{id}`` lookup. The scheduler enforces the
  per-agency monthly cost cap.

Both classes implement the :class:`app.extractor.base.Source` protocol
and are auto-registered via :func:`app.extractor.base.register` so the
scheduler can pick them up at import time.
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
_TWIKIT_DEFAULT_QUERIES: list[str] = ["AI", "sustainability", "wellness"]
_TWIKIT_DEFAULT_WOEIDS: list[int] = [1, 23424977, 23424975, 23424938, 23424747]
_XV2_DEFAULT_TWEET_FIELDS: list[str] = [
    "created_at",
    "public_metrics",
    "lang",
    "author_id",
]

_XV2_SEARCH_URL: str = "https://api.twitter.com/2/tweets/search/recent"
_XV2_TRENDS_URL: str = "https://api.twitter.com/2/trends/by/woeid/{woeid}"
_X_TIMEOUT: float = 30.0


# ─── XTwikitSource ──────────────────────────────────────────────────────────
@register
class XTwikitSource:
    """Unofficial X reader via the ``twikit`` Python library.

    >>> pip install twikit

    The library talks to the same internal GraphQL endpoint the X iOS
    app uses. It is the most reliable *free* X read client in 2026 but
    violates X's developer policy and risks account bans. Workspaces
    must keep at least 3 accounts in rotation.

    **ToS warning** (surfaced in the onboarding flow):

        Uses unofficial X API. Risk of account ban. Use at your own risk.
    """

    platform: ClassVar[str] = "x"
    source_key: ClassVar[str] = "x_twikit"
    tos_warning: str = (
        "Uses unofficial X API. Risk of account ban. Use at your own risk."
    )

    # ── validation ──────────────────────────────────────────────────────
    @staticmethod
    def validate_config(config: dict[str, Any]) -> ValidationResult:
        """Static config validator. Returns success with warnings on empty
        query lists — the extractor will then fall back to trends-only."""
        warnings: list[str] = []
        errors: list[str] = []

        queries = config.get("queries") or []
        if not isinstance(queries, list) or not all(
            isinstance(q, str) for q in queries
        ):
            errors.append("`queries` must be a list of strings")
        elif len(queries) == 0:
            warnings.append(
                "`queries` is empty — will only pull the per-woeid trends feed"
            )

        include_trends = config.get("include_trends", "yes")
        if include_trends not in {"yes", "no"}:
            errors.append("`include_trends` must be 'yes' or 'no'")

        if errors:
            return ValidationResult.failure(*errors)
        return ValidationResult(ok=True, warnings=warnings)

    # ── fetch ───────────────────────────────────────────────────────────
    async def fetch(self, source: TrendSource) -> list[RawSignal]:
        """Pull trends + per-query search results via twikit.

        Implementation note: ``twikit`` is a *sync* library that talks
        to the iOS internal API. To keep the sidecar's event loop
        non-blocking we delegate the sync calls to a thread via
        :func:`asyncio.to_thread`. The ``twikit.Client`` itself caches
        cookies in-process; workspaces must supply ``X_AUTH_TOKEN`` and
        ``X_CT0`` secrets in ``provider_secret`` (loaded via
        ``config.get('auth_token')`` / ``config.get('ct0')``).
        """
        import asyncio

        config: dict[str, Any] = source.config or {}
        queries: list[str] = config.get("queries") or _TWIKIT_DEFAULT_QUERIES
        include_trends: bool = config.get("include_trends", "yes") == "yes"
        woeids: list[int] = config.get("woeids") or _TWIKIT_DEFAULT_WOEIDS
        search_tab: str = config.get("search_tab", "Top")
        max_per_query: int = int(config.get("max_tweets_per_query", 50))

        signals: list[RawSignal] = []

        # ── Trends feed ────────────────────────────────────────────────
        if include_trends:
            try:
                trend_signals = await asyncio.to_thread(
                    self._fetch_trends_sync, woeids
                )
                signals.extend(trend_signals)
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "xtwikit_trends_failed",
                    source_key=self.source_key,
                    error_class=type(exc).__name__,
                    error=str(exc),
                )

        # ── Search feed ────────────────────────────────────────────────
        for query in queries:
            try:
                query_signals = await asyncio.to_thread(
                    self._fetch_search_sync, query, search_tab, max_per_query
                )
                signals.extend(query_signals)
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "xtwikit_search_failed",
                    source_key=self.source_key,
                    query=query,
                    error_class=type(exc).__name__,
                    error=str(exc),
                )

        return signals

    # ── internal sync helpers (run in thread) ──────────────────────────
    def _build_client(self) -> Any:
        """Build a twikit client. ``twikit`` is imported lazily so the
        module is optional — if a workspace doesn't opt in, the
        dependency is not required."""
        from twikit import Client  # type: ignore[import-not-found]

        client = Client("en-US")
        # The workspace stores these in provider_secret; the scheduler
        # injects them as env vars when it spins up the job. Cookies
        # must already be loaded by the time fetch() is called.
        auth_token = os.environ.get("X_AUTH_TOKEN")
        ct0 = os.environ.get("X_CT0")
        if auth_token and ct0:
            client.set_cookies({"auth_token": auth_token, "ct0": ct0})
        return client

    def _fetch_trends_sync(self, woeids: list[int]) -> list[RawSignal]:
        client = self._build_client()
        signals: list[RawSignal] = []
        for woeid in woeids:
            try:
                trends = client.get_trends("trending", woeid)
            except Exception:
                # twikit's get_trends takes (woeid) or (category, woeid);
                # we try the simpler shape first and fall back on TypeError.
                trends = client.get_trends(woeid)  # type: ignore[call-arg]
            for trend in (trends or [])[:50]:
                name = getattr(trend, "name", None) or str(trend)
                tweet_count = getattr(trend, "tweet_count", None) or 0
                signals.append(
                    RawSignal(
                        platform=self.platform,
                        type="trend",
                        label=name,
                        source_id=f"x:twikit:trend:{woeid}:{name}",
                        source_url=None,
                        raw_payload={
                            "woeid": woeid,
                            "tweet_count": tweet_count,
                            "rank": getattr(trend, "rank", None),
                        },
                        language="en",
                        region="WW",
                        score=float(tweet_count or 0),
                        fetched_at=datetime.utcnow(),
                    )
                )
        return signals

    def _fetch_search_sync(
        self, query: str, tab: str, limit: int
    ) -> list[RawSignal]:
        client = self._build_client()
        signals: list[RawSignal] = []
        # search_tweet returns an iterator of tweets
        for tweet in client.search_tweet(query, tab) or []:
            if len(signals) >= limit:
                break
            tweet_id = getattr(tweet, "id", None) or getattr(tweet, "tweet_id", None)
            text = getattr(tweet, "text", "") or ""
            user = getattr(tweet, "user", None)
            author = getattr(user, "name", "") if user else ""
            signals.append(
                RawSignal(
                    platform=self.platform,
                    type="tweet",
                    label=text[:200] or f"{author}: (no text)",
                    source_id=f"x:twikit:tweet:{tweet_id}" if tweet_id else f"x:twikit:tweet:{hash(text)}",
                    source_url=(
                        f"https://x.com/{getattr(user, 'screen_name', 'i')}/status/{tweet_id}"
                        if tweet_id and user
                        else None
                    ),
                    raw_payload={
                        "query": query,
                        "tab": tab,
                        "tweet_id": tweet_id,
                        "author": author,
                        "lang": getattr(tweet, "lang", None),
                        "like_count": getattr(tweet, "favorite_count", 0),
                        "retweet_count": getattr(tweet, "retweet_count", 0),
                        "reply_count": getattr(tweet, "reply_count", 0),
                    },
                    language=(getattr(tweet, "lang", None) or "en"),
                    region="XX",
                    score=float(
                        (getattr(tweet, "favorite_count", 0) or 0)
                        + (getattr(tweet, "retweet_count", 0) or 0) * 2
                    ),
                    fetched_at=datetime.utcnow(),
                )
            )
        return signals


# ─── XV2PaidSource ──────────────────────────────────────────────────────────
@register
class XV2PaidSource:
    """Official X API v2, pay-per-use tier.

    Cost (X 2026 pricing):

    * ``/2/tweets/search/recent`` — ``$0.005`` per call
    * ``/2/trends/by/woeid/{id}`` — ``$0.010`` per call

    Both endpoints are metered; the per-agency monthly cap is enforced
    by the scheduler via the ``cost_per_call_cents`` value in
    ``catalog.SOURCES``.

    **ToS:** clean (official first-party API). No ``tos_warning``.
    """

    platform: ClassVar[str] = "x"
    source_key: ClassVar[str] = "x_v2_paid"
    tos_warning: str = ""  # clean ToS — no warning required

    # ── validation ──────────────────────────────────────────────────────
    @staticmethod
    def validate_config(config: dict[str, Any]) -> ValidationResult:
        errors: list[str] = []

        # Bearer token can come from env OR per-workspace secret; the
        # scheduler injects it into source.config under "bearer_token".
        token = (config.get("bearer_token") or os.environ.get("X_BEARER_TOKEN") or "").strip()
        if not token:
            errors.append(
                "X_BEARER_TOKEN env var (or `bearer_token` in config) is required"
            )

        queries = config.get("queries") or []
        if not isinstance(queries, list):
            errors.append("`queries` must be a list of strings")

        woeids = config.get("woeids") or _TWIKIT_DEFAULT_WOEIDS
        if not isinstance(woeids, list):
            errors.append("`woeids` must be a list of integers")

        if errors:
            return ValidationResult.failure(*errors)
        return ValidationResult.success()

    # ── fetch ───────────────────────────────────────────────────────────
    async def fetch(self, source: TrendSource) -> list[RawSignal]:
        config: dict[str, Any] = source.config or {}
        token: str = (
            config.get("bearer_token")
            or os.environ.get("X_BEARER_TOKEN")
            or ""
        ).strip()
        if not token:
            log.error(
                "xv2_paid_no_token",
                source_key=self.source_key,
                hint="set X_BEARER_TOKEN or pass bearer_token in config",
            )
            return []

        queries: list[str] = config.get("queries") or []
        woeids: list[int] = config.get("woeids") or _TWIKIT_DEFAULT_WOEIDS
        max_per_query: int = int(config.get("max_results_per_query", 50))
        tweet_fields: list[str] = config.get("tweet_fields") or _XV2_DEFAULT_TWEET_FIELDS

        signals: list[RawSignal] = []
        headers = {"Authorization": f"Bearer {token}"}

        async with httpx.AsyncClient(timeout=_X_TIMEOUT) as client:
            # ── Search recent tweets ────────────────────────────────────
            for query in queries:
                params = {
                    "query": f"{query} -is:retweet lang:en",
                    "max_results": min(max_per_query, 100),
                    "tweet.fields": ",".join(tweet_fields),
                }
                try:
                    resp = await client.get(
                        _XV2_SEARCH_URL, headers=headers, params=params
                    )
                    resp.raise_for_status()
                    data = resp.json()
                except httpx.HTTPError as exc:
                    log.warning(
                        "xv2_search_failed",
                        source_key=self.source_key,
                        query=query,
                        error_class=type(exc).__name__,
                        error=str(exc),
                    )
                    continue

                for tweet in data.get("data") or []:
                    signals.append(self._tweet_to_signal(query, tweet))

            # ── Per-woeid trends ────────────────────────────────────────
            for woeid in woeids:
                try:
                    resp = await client.get(
                        _XV2_TRENDS_URL.format(woeid=woeid), headers=headers
                    )
                    resp.raise_for_status()
                    data = resp.json()
                except httpx.HTTPError as exc:
                    log.warning(
                        "xv2_trends_failed",
                        source_key=self.source_key,
                        woeid=woeid,
                        error_class=type(exc).__name__,
                        error=str(exc),
                    )
                    continue

                for idx, trend in enumerate(data.get("data") or []):
                    signals.append(self._trend_to_signal(woeid, idx, trend))

        return signals

    # ── helpers ────────────────────────────────────────────────────────
    @staticmethod
    def _tweet_to_signal(query: str, tweet: dict[str, Any]) -> RawSignal:
        metrics = tweet.get("public_metrics") or {}
        score = float(
            (metrics.get("like_count", 0) or 0)
            + (metrics.get("retweet_count", 0) or 0) * 2
        )
        return RawSignal(
            platform="x",
            type="tweet",
            label=(tweet.get("text") or "")[:200],
            source_id=f"x:v2:tweet:{tweet.get('id', '')}",
            source_url=(
                f"https://x.com/i/web/status/{tweet.get('id')}"
                if tweet.get("id")
                else None
            ),
            raw_payload={
                "query": query,
                "tweet_id": tweet.get("id"),
                "author_id": tweet.get("author_id"),
                "lang": tweet.get("lang"),
                "created_at": tweet.get("created_at"),
                "metrics": metrics,
            },
            language=tweet.get("lang") or "en",
            region="XX",
            score=score,
            fetched_at=datetime.utcnow(),
        )

    @staticmethod
    def _trend_to_signal(woeid: int, rank: int, trend: dict[str, Any]) -> RawSignal:
        name = trend.get("name") or trend.get("trend_name") or str(trend)
        tweet_count = int(trend.get("tweet_count") or 0)
        return RawSignal(
            platform="x",
            type="trend",
            label=name,
            source_id=f"x:v2:trend:{woeid}:{name}",
            source_url=None,
            raw_payload={
                "woeid": woeid,
                "rank": rank,
                "tweet_count": tweet_count,
            },
            language="en",
            region="XX",
            score=float(tweet_count),
            fetched_at=datetime.utcnow(),
        )
