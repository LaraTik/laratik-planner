"""Instagram extractors.

Two source classes in this module:

* :class:`InstagramInstaloaderSource` — unofficial reader via the
  ``instaloader`` library. **Grey-area ToS** — see ``tos_warning`` —
  Meta has been IP-banning instaloader users since Q4 2024. Use only
  for spot checks.
* :class:`InstagramGraphApiSource`   — official Instagram Graph API.
  Requires App Review (``instagram_basic`` + ``instagram_manage_insights``)
  and a Business / Creator account. Clean ToS.

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
_INSTALOADER_DEFAULT_HASHTAGS: list[str] = [
    "coffee",
    "fashion",
    "food",
    "travel",
    "fitness",
    "lifestyle",
]
_INSTALOADER_MAX_PER_HASHTAG: int = 30  # → 180 signals per call when 6 hashtags

_GRAPH_API_BASE: str = "https://graph.facebook.com/v21.0"
_GRAPH_API_TIMEOUT: float = 30.0


# ─── InstagramInstaloaderSource ─────────────────────────────────────────────
@register
class InstagramInstaloaderSource:
    """Unofficial Instagram reader via the ``instaloader`` library.

    >>> pip install instaloader

    Anonymous reads work for public hashtags. For private profiles or
    to avoid 429-throttling the scheduler should also pass
    ``INSTAGRAM_USERNAME`` + ``INSTAGRAM_PASSWORD`` env vars (the
    library will then log in once and reuse the session).

    **ToS warning** (surfaced in the onboarding flow):

        Uses unofficial Instagram scraping. Risk of account ban.
    """

    platform: ClassVar[str] = "instagram"
    source_key: ClassVar[str] = "instagram_instaloader"
    tos_warning: str = (
        "Uses unofficial Instagram scraping. Risk of account ban."
    )

    # ── validation ──────────────────────────────────────────────────────
    @staticmethod
    def validate_config(config: dict[str, Any]) -> ValidationResult:
        warnings: list[str] = []
        errors: list[str] = []

        hashtags = config.get("hashtags") or []
        profiles = config.get("profiles") or []
        if not isinstance(hashtags, list):
            errors.append("`hashtags` must be a list of strings")
        if not isinstance(profiles, list):
            errors.append("`profiles` must be a list of strings")
        if not hashtags and not profiles:
            errors.append("at least one of `hashtags` or `profiles` is required")

        max_posts = config.get("max_posts_per_target", 50)
        if not isinstance(max_posts, int) or not (1 <= max_posts <= 500):
            errors.append("`max_posts_per_target` must be an int in [1, 500]")

        if errors:
            return ValidationResult.failure(*errors)

        # Soft warning: no auth env vars configured
        if not (os.environ.get("INSTAGRAM_USERNAME") and os.environ.get("INSTAGRAM_PASSWORD")):
            warnings.append(
                "INSTAGRAM_USERNAME / INSTAGRAM_PASSWORD env vars not set; "
                "anonymous reads only — expect aggressive rate-limiting"
            )

        return ValidationResult(ok=True, warnings=warnings)

    # ── fetch ───────────────────────────────────────────────────────────
    async def fetch(self, source: TrendSource) -> list[RawSignal]:
        """Fetch hashtag / profile posts via instaloader (delegated to a
        thread because the library is sync)."""
        import asyncio

        config: dict[str, Any] = source.config or {}
        hashtags: list[str] = config.get("hashtags") or _INSTALOADER_DEFAULT_HASHTAGS
        profiles: list[str] = config.get("profiles") or []
        max_posts: int = int(config.get("max_posts_per_target", _INSTALOADER_MAX_PER_HASHTAG))

        signals: list[RawSignal] = []

        for hashtag in hashtags:
            try:
                tag_signals = await asyncio.to_thread(
                    self._fetch_hashtag_sync, hashtag, max_posts
                )
                signals.extend(tag_signals)
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "instaloader_hashtag_failed",
                    source_key=self.source_key,
                    hashtag=hashtag,
                    error_class=type(exc).__name__,
                    error=str(exc),
                )

        for username in profiles:
            try:
                profile_signals = await asyncio.to_thread(
                    self._fetch_profile_sync, username, max_posts
                )
                signals.extend(profile_signals)
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "instaloader_profile_failed",
                    source_key=self.source_key,
                    profile=username,
                    error_class=type(exc).__name__,
                    error=str(exc),
                )

        return signals

    # ── internal sync helpers (run in thread) ──────────────────────────
    def _build_loader(self) -> Any:
        """Build a logged-in instaloader instance if env vars are set,
        otherwise an anonymous one. Imported lazily so the dependency
        is optional for workspaces that don't opt in."""
        import instaloader  # type: ignore[import-not-found]

        loader = instaloader.Instaloader(
            download_pictures=False,
            download_videos=False,
            download_video_thumbnails=False,
            save_metadata=False,
            quiet=True,
        )
        user = os.environ.get("INSTAGRAM_USERNAME")
        pwd = os.environ.get("INSTAGRAM_PASSWORD")
        if user and pwd:
            try:
                loader.login(user, pwd)
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "instaloader_login_failed",
                    error_class=type(exc).__name__,
                    error=str(exc),
                )
        return loader

    def _fetch_hashtag_sync(self, hashtag: str, limit: int) -> list[RawSignal]:
        import instaloader  # type: ignore[import-not-found]

        loader = self._build_loader()
        signals: list[RawSignal] = []
        # instaloader's Hashtag iterator returns top posts; the public
        # API exposes get_top_posts() and get_posts() iterators.
        try:
            posts_iter = instaloader.Hashtag.from_name(loader.context, hashtag).get_top_posts()
        except Exception:
            posts_iter = []
        for idx, post in enumerate(posts_iter):
            if idx >= limit:
                break
            signals.append(
                RawSignal(
                    platform=self.platform,
                    type="hashtag_post",
                    label=(post.caption or "")[:200] or f"#{hashtag}",
                    source_id=f"ig:instaloader:hashtag:{hashtag}:{post.mediaid}",
                    source_url=f"https://www.instagram.com/p/{post.shortcode}/",
                    raw_payload={
                        "hashtag": hashtag,
                        "media_id": post.mediaid,
                        "shortcode": post.shortcode,
                        "owner": getattr(post.owner_profile, "username", None),
                        "likes": post.likes,
                        "comments": post.comments,
                        "is_video": post.is_video,
                        "typename": post.typename,
                        "date_utc": (
                            post.date_utc.isoformat() if post.date_utc else None
                        ),
                    },
                    language="en",
                    region="XX",
                    score=float((post.likes or 0) + (post.comments or 0) * 2),
                    fetched_at=datetime.utcnow(),
                )
            )
        return signals

    def _fetch_profile_sync(self, username: str, limit: int) -> list[RawSignal]:
        import instaloader  # type: ignore[import-not-found]

        loader = self._build_loader()
        signals: list[RawSignal] = []
        try:
            profile = instaloader.Profile.from_username(loader.context, username)
            posts_iter = profile.get_posts()
        except Exception:
            return signals
        for idx, post in enumerate(posts_iter):
            if idx >= limit:
                break
            signals.append(
                RawSignal(
                    platform=self.platform,
                    type="profile_post",
                    label=(post.caption or "")[:200] or f"@{username}",
                    source_id=f"ig:instaloader:profile:{username}:{post.mediaid}",
                    source_url=f"https://www.instagram.com/p/{post.shortcode}/",
                    raw_payload={
                        "profile": username,
                        "media_id": post.mediaid,
                        "shortcode": post.shortcode,
                        "likes": post.likes,
                        "comments": post.comments,
                        "is_video": post.is_video,
                    },
                    language="en",
                    region="XX",
                    score=float((post.likes or 0) + (post.comments or 0) * 2),
                    fetched_at=datetime.utcnow(),
                )
            )
        return signals


# ─── InstagramGraphApiSource ────────────────────────────────────────────────
@register
class InstagramGraphApiSource:
    """Official Instagram Graph API (Meta).

    Requires a Meta app with App Review for ``instagram_basic`` and
    ``instagram_manage_insights`` plus a Business / Creator account.
    The token is a long-lived user token; the scheduler rotates it
    via the standard 60-day refresh flow.

    Returns up to 50 media per call. We approximate "trending" by
    ranking media from the configured hashtags by
    ``like_count + 2 * comments_count``.
    """

    platform: ClassVar[str] = "instagram"
    source_key: ClassVar[str] = "instagram_graph_api"
    tos_warning: str = ""  # clean first-party API; App Review is handled at the catalog layer

    # ── validation ──────────────────────────────────────────────────────
    @staticmethod
    def validate_config(config: dict[str, Any]) -> ValidationResult:
        errors: list[str] = []

        user_id = config.get("user_id")
        if not user_id or not isinstance(user_id, str):
            errors.append("`user_id` (Instagram Business user_id) is required")

        token = (
            config.get("access_token")
            or os.environ.get("INSTAGRAM_ACCESS_TOKEN")
            or ""
        ).strip()
        if not token:
            errors.append(
                "INSTAGRAM_ACCESS_TOKEN env var (or `access_token` in config) is required"
            )

        hashtags = config.get("hashtags") or []
        if not isinstance(hashtags, list) or not hashtags:
            errors.append("`hashtags` must be a non-empty list of strings")

        media_type = config.get("media_type", "any")
        if media_type not in {"any", "image", "video", "reel"}:
            errors.append("`media_type` must be one of any|image|video|reel")

        if errors:
            return ValidationResult.failure(*errors)
        return ValidationResult.success()

    # ── fetch ───────────────────────────────────────────────────────────
    async def fetch(self, source: TrendSource) -> list[RawSignal]:
        config: dict[str, Any] = source.config or {}
        user_id: str = config.get("user_id", "")
        token: str = (
            config.get("access_token")
            or os.environ.get("INSTAGRAM_ACCESS_TOKEN")
            or ""
        ).strip()
        hashtags: list[str] = config.get("hashtags") or []
        fields: str = config.get(
            "fields",
            "id,caption,media_type,media_url,permalink,timestamp,"
            "like_count,comments_count",
        )
        media_type: str = config.get("media_type", "any")

        if not user_id or not token or not hashtags:
            return []

        signals: list[RawSignal] = []
        async with httpx.AsyncClient(timeout=_GRAPH_API_TIMEOUT) as client:
            for hashtag in hashtags:
                try:
                    hashtag_id = await self._resolve_hashtag_id(
                        client, token, user_id, hashtag
                    )
                except httpx.HTTPError as exc:
                    log.warning(
                        "ig_graph_hashtag_resolve_failed",
                        hashtag=hashtag,
                        error_class=type(exc).__name__,
                        error=str(exc),
                    )
                    continue
                if not hashtag_id:
                    continue
                try:
                    resp = await client.get(
                        f"{_GRAPH_API_BASE}/{hashtag_id}/top_media",
                        params={
                            "user_id": user_id,
                            "fields": fields,
                            "access_token": token,
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()
                except httpx.HTTPError as exc:
                    log.warning(
                        "ig_graph_top_media_failed",
                        hashtag=hashtag,
                        error_class=type(exc).__name__,
                        error=str(exc),
                    )
                    continue

                for media in (data.get("data") or [])[:50]:
                    if media_type != "any" and media.get("media_type") != media_type.upper():
                        continue
                    signals.append(self._media_to_signal(hashtag, media))

        return signals

    # ── helpers ────────────────────────────────────────────────────────
    @staticmethod
    async def _resolve_hashtag_id(
        client: httpx.AsyncClient,
        token: str,
        user_id: str,
        hashtag: str,
    ) -> str | None:
        """Look up the IG hashtag ID. Returns None if the hashtag is
        not indexed yet or the API returns 4xx (treated as soft fail)."""
        try:
            resp = await client.get(
                f"{_GRAPH_API_BASE}/ig_hashtag_search",
                params={
                    "user_id": user_id,
                    "q": hashtag,
                    "access_token": token,
                },
            )
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as exc:
            log.debug(
                "ig_hashtag_search_failed",
                hashtag=hashtag,
                error_class=type(exc).__name__,
                error=str(exc),
            )
            return None
        results = data.get("data") or []
        return results[0].get("id") if results else None

    @staticmethod
    def _media_to_signal(hashtag: str, media: dict[str, Any]) -> RawSignal:
        likes = int(media.get("like_count") or 0)
        comments = int(media.get("comments_count") or 0)
        return RawSignal(
            platform="instagram",
            type="hashtag_media",
            label=(media.get("caption") or "")[:200] or f"#{hashtag}",
            source_id=f"ig:graph:hashtag:{hashtag}:{media.get('id', '')}",
            source_url=media.get("permalink"),
            raw_payload={
                "hashtag": hashtag,
                "media_id": media.get("id"),
                "media_type": media.get("media_type"),
                "media_url": media.get("media_url"),
                "timestamp": media.get("timestamp"),
                "like_count": likes,
                "comments_count": comments,
            },
            language="en",
            region="XX",
            score=float(likes + 2 * comments),
            fetched_at=datetime.utcnow(),
        )
