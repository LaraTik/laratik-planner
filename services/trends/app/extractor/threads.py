"""Threads extractors.

Two source classes in this module:

* :class:`ThreadsApiSource`      — official Threads API (Meta Graph
  extension). Clean ToS, requires App Review + threads_user_id.
* :class:`ThreadsKawsarlogSource` — unofficial reader via the
  ``threads-py`` library (kawsarlog). **Grey-area ToS** — see
  ``tos_warning``.

Both classes implement the :class:`app.extractor.base.Source` protocol
and are auto-registered via :func:`app.extractor.base.register`.
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
_THREADS_DEFAULT_FIELDS: list[str] = [
    "id",
    "text",
    "timestamp",
    "permalink",
    "media_type",
]
_THREADS_API_BASE: str = "https://graph.threads.net/v1.0"
_THREADS_TIMEOUT: float = 30.0


# ─── ThreadsApiSource ───────────────────────────────────────────────────────
@register
class ThreadsApiSource:
    """Official Threads API (Meta Graph).

    Requires:

    * A Meta app with the Threads use case approved.
    * A long-lived user access token (``THREADS_ACCESS_TOKEN`` env var
      or ``access_token`` in the per-source config).
    * The numeric ``threads_user_id`` of the account that granted the
      token.

    The API has no ``/trends`` endpoint — we approximate by listing
    recent threads (up to 25 per call) for the configured keywords and
    ranking by ``like_count + 2 * reply_count`` in the analysis
    pipeline.
    """

    platform: ClassVar[str] = "threads"
    source_key: ClassVar[str] = "threads_api"
    tos_warning: str = ""  # clean first-party API

    # ── validation ──────────────────────────────────────────────────────
    @staticmethod
    def validate_config(config: dict[str, Any]) -> ValidationResult:
        errors: list[str] = []

        token = (
            config.get("access_token")
            or os.environ.get("THREADS_ACCESS_TOKEN")
            or ""
        ).strip()
        if not token:
            errors.append(
                "THREADS_ACCESS_TOKEN env var (or `access_token` in config) is required"
            )

        user_id = config.get("threads_user_id")
        if not user_id or not isinstance(user_id, str):
            errors.append("`threads_user_id` is required")

        keywords = config.get("keywords") or []
        if not isinstance(keywords, list):
            errors.append("`keywords` must be a list of strings")

        search_type = config.get("search_type", "recent")
        if search_type not in {"recent", "top", "profiles"}:
            errors.append("`search_type` must be one of recent|top|profiles")

        if errors:
            return ValidationResult.failure(*errors)
        return ValidationResult.success()

    # ── fetch ───────────────────────────────────────────────────────────
    async def fetch(self, source: TrendSource) -> list[RawSignal]:
        config: dict[str, Any] = source.config or {}
        token: str = (
            config.get("access_token")
            or os.environ.get("THREADS_ACCESS_TOKEN")
            or ""
        ).strip()
        user_id: str = config.get("threads_user_id", "")
        keywords: list[str] = config.get("keywords") or []
        search_type: str = config.get("search_type", "recent")
        fields: list[str] = config.get("fields") or _THREADS_DEFAULT_FIELDS

        if not token or not user_id:
            return []

        signals: list[RawSignal] = []
        async with httpx.AsyncClient(timeout=_THREADS_TIMEOUT) as client:
            # ── Account thread listing (authored content) ──────────────
            try:
                resp = await client.get(
                    f"{_THREADS_API_BASE}/{user_id}/threads",
                    params={
                        "fields": ",".join(fields),
                        "limit": 25,
                        "access_token": token,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
            except httpx.HTTPError as exc:
                log.warning(
                    "threads_api_list_failed",
                    source_key=self.source_key,
                    error_class=type(exc).__name__,
                    error=str(exc),
                )
                data = {}

            for thread in (data.get("data") or [])[:25]:
                signals.append(self._thread_to_signal(thread, query=None))

            # ── Keyword search ──────────────────────────────────────────
            for keyword in keywords:
                try:
                    resp = await client.get(
                        f"{_THREADS_API_BASE}/{user_id}/search",
                        params={
                            "q": keyword,
                            "search_type": search_type,
                            "fields": ",".join(fields),
                            "limit": 25,
                            "access_token": token,
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()
                except httpx.HTTPError as exc:
                    log.warning(
                        "threads_api_search_failed",
                        source_key=self.source_key,
                        keyword=keyword,
                        error_class=type(exc).__name__,
                        error=str(exc),
                    )
                    continue

                for thread in (data.get("data") or [])[:25]:
                    signals.append(self._thread_to_signal(thread, query=keyword))

        return signals

    # ── helpers ────────────────────────────────────────────────────────
    @staticmethod
    def _thread_to_signal(
        thread: dict[str, Any], query: str | None
    ) -> RawSignal:
        text = thread.get("text") or ""
        likes = int(thread.get("like_count") or 0)
        replies = int(thread.get("reply_count") or 0)
        return RawSignal(
            platform="threads",
            type="thread",
            label=text[:200] or "(empty thread)",
            source_id=f"threads:api:{thread.get('id', '')}",
            source_url=thread.get("permalink"),
            raw_payload={
                "thread_id": thread.get("id"),
                "text": text,
                "timestamp": thread.get("timestamp"),
                "media_type": thread.get("media_type"),
                "media_url": thread.get("media_url"),
                "like_count": likes,
                "reply_count": replies,
                "repost_count": thread.get("repost_count"),
                "quote_count": thread.get("quote_count"),
                "view_count": thread.get("view_count"),
                "query": query,
            },
            language="en",
            region="XX",
            score=float(likes + 2 * replies),
            fetched_at=datetime.utcnow(),
        )


# ─── ThreadsKawsarlogSource ─────────────────────────────────────────────────
@register
class ThreadsKawsarlogSource:
    """Unofficial Threads reader via the ``threads-py`` library
    (kawsarlog).

    >>> pip install threads-py

    Authenticated via the same account-cookie mechanism that powers
    the web client. Unmaintained since 2024-Q3 — keep as a fallback
    for when the official API quota is hit. Account ban risk.

    **ToS warning** (surfaced in the onboarding flow):

        Uses unofficial Threads API. Risk of account ban.
    """

    platform: ClassVar[str] = "threads"
    source_key: ClassVar[str] = "kawsarlog_threads"
    tos_warning: str = (
        "Uses unofficial Threads API. Risk of account ban."
    )

    # ── validation ──────────────────────────────────────────────────────
    @staticmethod
    def validate_config(config: dict[str, Any]) -> ValidationResult:
        warnings: list[str] = []
        errors: list[str] = []

        keywords = config.get("keywords") or []
        if not isinstance(keywords, list):
            errors.append("`keywords` must be a list of strings")
        elif not keywords:
            warnings.append(
                "`keywords` is empty — no per-keyword searches will run"
            )

        max_posts = config.get("max_posts_per_keyword", 50)
        if not isinstance(max_posts, int) or not (1 <= max_posts <= 500):
            errors.append("`max_posts_per_keyword` must be an int in [1, 500]")

        if not (os.environ.get("THREADS_AUTH_TOKEN") or os.environ.get("THREADS_SESSION_ID")):
            warnings.append(
                "THREADS_AUTH_TOKEN / THREADS_SESSION_ID env vars not set; "
                "kawsarlog will fall back to anonymous reads (low rate limits)"
            )

        if errors:
            return ValidationResult.failure(*errors)
        return ValidationResult(ok=True, warnings=warnings)

    # ── fetch ───────────────────────────────────────────────────────────
    async def fetch(self, source: TrendSource) -> list[RawSignal]:
        """Pull per-keyword search results via threads-py.

        Implementation note: ``threads-py`` is sync; we delegate the
        blocking call to a thread via :func:`asyncio.to_thread` so the
        sidecar's event loop stays non-blocking.
        """
        import asyncio

        config: dict[str, Any] = source.config or {}
        keywords: list[str] = config.get("keywords") or []
        max_posts: int = int(config.get("max_posts_per_keyword", 50))

        signals: list[RawSignal] = []
        for keyword in keywords:
            try:
                kw_signals = await asyncio.to_thread(
                    self._fetch_keyword_sync, keyword, max_posts
                )
                signals.extend(kw_signals)
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "kawsarlog_threads_keyword_failed",
                    source_key=self.source_key,
                    keyword=keyword,
                    error_class=type(exc).__name__,
                    error=str(exc),
                )

        return signals

    # ── internal sync helpers (run in thread) ──────────────────────────
    def _build_client(self) -> Any:
        """Build a threads-py client. Imported lazily so the
        dependency is optional."""
        try:
            from threads import Threads  # type: ignore[import-not-found]
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "threads-py is not installed; run `pip install threads-py`"
            ) from exc

        client = Threads()
        # The library accepts either a username/password combo (for
        # login) or a session_id cookie (for reuse). Prefer the
        # cookie path so we don't burn credentials on every fetch.
        session_id = os.environ.get("THREADS_SESSION_ID")
        if session_id:
            try:
                client.load_session(session_id=session_id)
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "kawsarlog_threads_session_load_failed",
                    error_class=type(exc).__name__,
                    error=str(exc),
                )
        return client

    def _fetch_keyword_sync(self, keyword: str, limit: int) -> list[RawSignal]:
        client = self._build_client()
        signals: list[RawSignal] = []
        try:
            # threads-py exposes `search(keyword)` and `get_post(id)`.
            # Search returns a list of post dicts; the shape varies
            # across versions, so we read defensively.
            results = client.search(keyword) or []
        except Exception as exc:  # noqa: BLE001
            log.debug(
                "kawsarlog_threads_search_failed",
                keyword=keyword,
                error_class=type(exc).__name__,
                error=str(exc),
            )
            return signals

        for idx, post in enumerate(results):
            if idx >= limit:
                break
            post_id = (
                post.get("id")
                or post.get("pk")
                or post.get("post_id")
                or f"{keyword}:{idx}"
            )
            text = post.get("text") or post.get("caption") or ""
            like_count = int(
                post.get("like_count")
                or (post.get("like_count_info", {}) or {}).get("like_count")
                or 0
            )
            reply_count = int(
                post.get("reply_count")
                or (post.get("text_post_app_info", {}) or {}).get("direct_reply_count")
                or 0
            )
            signals.append(
                RawSignal(
                    platform=self.platform,
                    type="thread",
                    label=text[:200] or f"{keyword}: (no text)",
                    source_id=f"threads:kawsarlog:{post_id}",
                    source_url=post.get("permalink") or post.get("url"),
                    raw_payload={
                        "query": keyword,
                        "post_id": post_id,
                        "user": post.get("user") or post.get("user_name"),
                        "timestamp": post.get("taken_at") or post.get("timestamp"),
                        "media_type": post.get("media_type"),
                        "like_count": like_count,
                        "reply_count": reply_count,
                    },
                    language=post.get("language") or "en",
                    region="XX",
                    score=float(like_count + 2 * reply_count),
                    fetched_at=datetime.utcnow(),
                )
            )
        return signals
