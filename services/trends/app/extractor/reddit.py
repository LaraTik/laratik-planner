"""Reddit extractors — anonymous JSON + PRAW (OAuth).

Two flavours live in this file because they share the subreddit loop
and the signal-mapping shape.

* :class:`RedditJsonSource`  — hits ``reddit.com/r/{sub}.json`` with
  no auth, ~10 req/min/IP. Default-ON for low-frequency polls.
* :class:`RedditPrawSource` — uses the official PRAW library with
  OAuth2 credentials, 60 req/min. Default-ON for high-throughput
  polling.

Both extractors iterate the same curated subreddit list and produce
the same :class:`RawSignal` shape, so downstream persistence code is
identical regardless of which one ran.
"""
from __future__ import annotations

import asyncio
import os
from typing import Any, ClassVar

import httpx

from app.extractor.base import RawSignal, Source, ValidationResult
from app.extractor.registry import register_source
from app.models import TrendSource
from app.observability import get_logger


logger = get_logger(__name__)


# ─── Defaults ─────────────────────────────────────────────────────────────────
_DEFAULT_SUBREDDITS: tuple[str, ...] = (
    "all", "popular", "technology", "food", "coffee",
    "fashion", "art", "gaming", "movies", "music",
)
_DEFAULT_SORT: str = "hot"
_DEFAULT_TIME_FILTER: str = "day"
_DEFAULT_LIMIT: int = 25
_DEFAULT_USER_AGENT: str = "laratik-trends/0.1.0 (by /u/laratik)"

_REDDIT_BASE: str = "https://www.reddit.com"


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _signal_from_post(
    post: dict[str, Any], *, source_key: str, platform: str = "reddit"
) -> RawSignal | None:
    """Translate a single Reddit post into a :class:`RawSignal`.

    Returns ``None`` when the post lacks the minimum fields we need
    (id, subreddit, title) so the caller can skip it without raising.
    """
    if not isinstance(post, dict):
        return None
    post_id = post.get("id")
    subreddit = post.get("subreddit")
    title = (post.get("title") or "").strip()
    if not post_id or not subreddit or not title:
        return None

    score_raw = post.get("score", 0) or 0
    try:
        score = float(score_raw)
    except (TypeError, ValueError):
        score = 0.0

    permalink = post.get("permalink")
    source_url = (
        f"https://www.reddit.com{permalink}" if permalink else None
    )

    return RawSignal(
        platform=platform,
        type="post",
        label=title,
        source_id=f"reddit:{source_key}:t3_{post_id}",
        source_url=source_url,
        raw_payload=post,
        language="en",
        region="XX",
        score=score,
    )


# ─── 1. Anonymous JSON ────────────────────────────────────────────────────────
@register_source
class RedditJsonSource:
    """Reddit anonymous JSON — no auth, ~10 req/min/IP.

    Each call hits ``/r/{subreddit}/{sort}.json`` for every subreddit
    in the configured list and returns up to ``limit`` posts per
    subreddit. With the default 10 subreddits × 25 posts the call
    returns 250 signals.
    """

    platform: ClassVar[str] = "reddit"
    source_key: ClassVar[str] = "reddit_json"

    # ------------------------------------------------------------------ config
    @staticmethod
    def validate_config(config: dict[str, Any]) -> ValidationResult:
        errors: list[str] = []
        warnings: list[str] = []
        subs = config.get("subreddits", list(_DEFAULT_SUBREDDITS))
        if not isinstance(subs, list) or not subs:
            errors.append("subreddits must be a non-empty list")
        else:
            for s in subs:
                if not isinstance(s, str) or not s.strip():
                    errors.append(f"invalid subreddit entry: {s!r}")
        sort = config.get("sort", _DEFAULT_SORT)
        if sort not in {"hot", "new", "rising", "top", "controversial"}:
            errors.append(f"sort={sort!r} is not a valid Reddit sort")
        limit = config.get("limit", _DEFAULT_LIMIT)
        if not isinstance(limit, int) or not 1 <= limit <= 100:
            errors.append("limit must be an integer in [1, 100]")
        if warnings and not errors:
            return ValidationResult(ok=True, warnings=warnings)
        if errors:
            return ValidationResult.failure(*errors)
        return ValidationResult.success()

    # ------------------------------------------------------------------ fetch
    async def fetch(self, source: TrendSource) -> list[RawSignal]:
        cfg = source.config or {}
        subreddits: list[str] = cfg.get("subreddits", list(_DEFAULT_SUBREDDITS))
        sort: str = cfg.get("sort", _DEFAULT_SORT)
        time_filter: str = cfg.get("time_filter", _DEFAULT_TIME_FILTER)
        limit: int = int(cfg.get("limit", _DEFAULT_LIMIT))

        headers = {
            "User-Agent": _DEFAULT_USER_AGENT,
            "Accept": "application/json",
        }

        signals: list[RawSignal] = []
        # A single AsyncClient, reused across all subreddit calls. The
        # ~10 req/min anonymous limit means we keep this sequential —
        # bursting with a Semaphore just gets us 429'd.
        try:
            async with httpx.AsyncClient(
                base_url=_REDDIT_BASE,
                headers=headers,
                timeout=20.0,
            ) as client:
                for sub in subreddits:
                    listing_signals = await self._fetch_listing(
                        client, sub, sort=sort, time_filter=time_filter, limit=limit
                    )
                    signals.extend(listing_signals)
                    # A polite pause between subreddits keeps us under
                    # the 10 req/min IP throttle for the anonymous API.
                    if sub is not subreddits[-1]:
                        await asyncio.sleep(0.5)
        except httpx.HTTPError as exc:
            logger.warning(
                "reddit_json.fetch.network_error",
                error_class=exc.__class__.__name__,
                error=str(exc)[:300],
            )
            return signals  # partial result is better than nothing

        logger.info(
            "reddit_json.fetch.ok",
            source_key=source.source_key,
            subreddits=len(subreddits),
            count=len(signals),
        )
        return signals

    # ------------------------------------------------------------------ helpers
    async def _fetch_listing(
        self,
        client: httpx.AsyncClient,
        subreddit: str,
        *,
        sort: str,
        time_filter: str,
        limit: int,
    ) -> list[RawSignal]:
        url = f"/r/{subreddit}/{sort}.json"
        params: dict[str, str | int] = {"limit": limit}
        if sort == "top":
            params["t"] = time_filter

        try:
            resp = await client.get(url, params=params)
        except httpx.HTTPError as exc:
            logger.warning(
                "reddit_json.fetch.subreddit_error",
                subreddit=subreddit,
                error_class=exc.__class__.__name__,
                error=str(exc)[:200],
            )
            return []

        if resp.status_code == 429:
            logger.warning(
                "reddit_json.fetch.rate_limited",
                subreddit=subreddit,
            )
            return []
        if resp.status_code != 200:
            logger.warning(
                "reddit_json.fetch.bad_status",
                subreddit=subreddit,
                status=resp.status_code,
            )
            return []

        try:
            payload = resp.json()
        except ValueError:
            return []

        children = (((payload or {}).get("data") or {}).get("children") or [])
        out: list[RawSignal] = []
        for child in children:
            post = child.get("data") if isinstance(child, dict) else None
            if post is None:
                continue
            sig = _signal_from_post(post, source_key=self.source_key)
            if sig is not None:
                out.append(sig)
        return out


# ─── 2. PRAW (OAuth) ──────────────────────────────────────────────────────────
@register_source
class RedditPrawSource:
    """Reddit via PRAW — OAuth2 script app, 60 req/min.

    PRAW is imported lazily so the sidecar can run without the library
    installed (it's not in ``pyproject.toml``'s default deps). When the
    import fails or credentials are missing, :meth:`fetch` logs and
    returns an empty list instead of crashing the scheduler tick.
    """

    platform: ClassVar[str] = "reddit"
    source_key: ClassVar[str] = "reddit_praw"

    # ------------------------------------------------------------------ config
    @staticmethod
    def validate_config(config: dict[str, Any]) -> ValidationResult:
        errors: list[str] = []
        if not os.environ.get("REDDIT_CLIENT_ID"):
            errors.append("REDDIT_CLIENT_ID env var is not set")
        if not os.environ.get("REDDIT_CLIENT_SECRET"):
            errors.append("REDDIT_CLIENT_SECRET env var is not set")
        if not os.environ.get("REDDIT_USER_AGENT"):
            # PRAW requires a user agent; flag but don't fail.
            pass
        subs = config.get("subreddits", list(_DEFAULT_SUBREDDITS))
        if not isinstance(subs, list) or not subs:
            errors.append("subreddits must be a non-empty list")
        if errors:
            return ValidationResult.failure(*errors)
        return ValidationResult.success()

    # ------------------------------------------------------------------ fetch
    async def fetch(self, source: TrendSource) -> list[RawSignal]:
        cfg = source.config or {}
        subreddits: list[str] = cfg.get("subreddits", list(_DEFAULT_SUBREDDITS))
        sort: str = cfg.get("sort", _DEFAULT_SORT)
        time_filter: str = cfg.get("time_filter", _DEFAULT_TIME_FILTER)
        limit: int = int(cfg.get("limit", _DEFAULT_LIMIT))

        try:
            import praw  # type: ignore[import-not-found]
        except ImportError:
            logger.warning(
                "reddit_praw.fetch.praw_not_installed",
                source_key=source.source_key,
            )
            return []

        client_id = os.environ.get("REDDIT_CLIENT_ID")
        client_secret = os.environ.get("REDDIT_CLIENT_SECRET")
        user_agent = os.environ.get("REDDIT_USER_AGENT", _DEFAULT_USER_AGENT)

        if not client_id or not client_secret:
            logger.warning(
                "reddit_praw.fetch.missing_credentials",
                source_key=source.source_key,
            )
            return []

        try:
            reddit = praw.Reddit(
                client_id=client_id,
                client_secret=client_secret,
                user_agent=user_agent,
                check_for_async=False,
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "reddit_praw.fetch.client_init_failed",
                error_class=exc.__class__.__name__,
                error=str(exc)[:200],
            )
            return []

        # PRAW is sync; run each listing fetch in a worker thread so
        # the asyncio loop stays responsive. We do them sequentially
        # so the OAuth rate limiter (60 req/min) is not violated.
        signals: list[RawSignal] = []
        for sub in subreddits:
            try:
                listing_posts = await asyncio.to_thread(
                    self._fetch_listing_sync,
                    reddit,
                    sub,
                    sort=sort,
                    time_filter=time_filter,
                    limit=limit,
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning(
                    "reddit_praw.fetch.subreddit_error",
                    subreddit=sub,
                    error_class=exc.__class__.__name__,
                    error=str(exc)[:200],
                )
                continue
            signals.extend(listing_posts)
            if sub is not subreddits[-1]:
                await asyncio.sleep(0.25)

        logger.info(
            "reddit_praw.fetch.ok",
            source_key=source.source_key,
            subreddits=len(subreddits),
            count=len(signals),
        )
        return signals

    # ------------------------------------------------------------------ helpers
    @staticmethod
    def _fetch_listing_sync(
        reddit: Any,
        subreddit: str,
        *,
        sort: str,
        time_filter: str,
        limit: int,
    ) -> list[RawSignal]:
        """Synchronous PRAW listing fetch, called via ``to_thread``."""
        sub = reddit.subreddit(subreddit)
        method = getattr(sub, sort, sub.hot)
        if sort == "top":
            iterator = method(time_filter=time_filter, limit=limit)
        else:
            iterator = method(limit=limit)

        out: list[RawSignal] = []
        for post in iterator:
            # PRAW's lazy loader exposes the same ``__dict__`` shape as
            # the JSON API; feed it through the shared mapper.
            payload = vars(post) if hasattr(post, "__dict__") else {}
            sig = _signal_from_post(payload, source_key="reddit_praw")
            if sig is not None:
                out.append(sig)
        return out
