"""LinkedIn extractors.

Two source classes in this module:

* :class:`LinkedinTomquirkSource`     — unofficial reader via the
  ``linkedin-api`` library (tomquirk). **Grey-area ToS** — see
  ``tos_warning``.
* :class:`LinkedinMarketingApiSource` — official LinkedIn Marketing
  Developer Platform. Clean ToS but App Review required.

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
_LINKEDIN_API_BASE: str = "https://api.linkedin.com"
_LINKEDIN_TIMEOUT: float = 30.0
_LINKEDIN_DEFAULT_SORT: str = "ENGAGEMENT"
_LINKEDIN_URN_PREFIX: str = "urn:li:hashtag:"


# ─── LinkedinTomquirkSource ─────────────────────────────────────────────────
@register
class LinkedinTomquirkSource:
    """Unofficial LinkedIn reader via the ``linkedin-api`` library
    (tomquirk).

    >>> pip install linkedin-api

    Authenticated via session cookies (``li_at`` + ``JSESSIONID``)
    loaded from the workspace's managed secret. The library exposes
    ``Profile(username).to_dict()`` for profile reads and a
    ``search`` method for hashtag / author URN lookups.

    **ToS warning** (surfaced in the onboarding flow):

        Uses unofficial LinkedIn scraping. Risk of account ban.
    """

    platform: ClassVar[str] = "linkedin"
    source_key: ClassVar[str] = "linkedin_tomquirk"
    tos_warning: str = (
        "Uses unofficial LinkedIn scraping. Risk of account ban."
    )

    # ── validation ──────────────────────────────────────────────────────
    @staticmethod
    def validate_config(config: dict[str, Any]) -> ValidationResult:
        warnings: list[str] = []
        errors: list[str] = []

        hashtags = config.get("hashtags") or []
        author_urns = config.get("author_urns") or []
        if not isinstance(hashtags, list):
            errors.append("`hashtags` must be a list of strings")
        if not isinstance(author_urns, list):
            errors.append("`author_urns` must be a list of strings")
        if not hashtags and not author_urns:
            errors.append("at least one of `hashtags` or `author_urns` is required")

        max_posts = config.get("max_posts_per_target", 25)
        if not isinstance(max_posts, int) or not (1 <= max_posts <= 100):
            errors.append("`max_posts_per_target` must be an int in [1, 100]")

        # The library reads cookies from env or the .secret file
        if not (os.environ.get("LINKEDIN_LI_AT") and os.environ.get("LINKEDIN_JSESSIONID")):
            warnings.append(
                "LINKEDIN_LI_AT / LINKEDIN_JSESSIONID env vars not set; "
                "tomquirk cannot authenticate — every request will 401"
            )

        if errors:
            return ValidationResult.failure(*errors)
        return ValidationResult(ok=True, warnings=warnings)

    # ── fetch ───────────────────────────────────────────────────────────
    async def fetch(self, source: TrendSource) -> list[RawSignal]:
        """Pull hashtag + author-URN posts via linkedin-api (delegated
        to a thread because the library is sync)."""
        import asyncio

        config: dict[str, Any] = source.config or {}
        hashtags: list[str] = config.get("hashtags") or []
        author_urns: list[str] = config.get("author_urns") or []
        max_posts: int = int(config.get("max_posts_per_target", 25))

        signals: list[RawSignal] = []

        for hashtag in hashtags:
            try:
                tag_signals = await asyncio.to_thread(
                    self._fetch_hashtag_sync, hashtag, max_posts
                )
                signals.extend(tag_signals)
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "tomquirk_linkedin_hashtag_failed",
                    source_key=self.source_key,
                    hashtag=hashtag,
                    error_class=type(exc).__name__,
                    error=str(exc),
                )

        for urn in author_urns:
            try:
                urn_signals = await asyncio.to_thread(
                    self._fetch_author_sync, urn, max_posts
                )
                signals.extend(urn_signals)
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "tomquirk_linkedin_author_failed",
                    source_key=self.source_key,
                    author_urn=urn,
                    error_class=type(exc).__name__,
                    error=str(exc),
                )

        return signals

    # ── internal sync helpers (run in thread) ──────────────────────────
    def _build_client(self) -> Any:
        """Build a linkedin-api client. Imported lazily so the
        dependency is optional."""
        try:
            from linkedin_api import Linkedin  # type: ignore[import-not-found]
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "linkedin-api is not installed; run `pip install linkedin-api`"
            ) from exc

        # The library reads cookies from .secret by default, but we
        # prefer env vars so the scheduler can swap secrets per-job.
        li_at = os.environ.get("LINKEDIN_LI_AT")
        jsessionid = os.environ.get("LINKEDIN_JSESSIONID")
        if li_at and jsessionid:
            return Linkedin(li_at=li_at, jsessionid=jsessionid)
        return Linkedin()

    def _fetch_hashtag_sync(self, hashtag: str, limit: int) -> list[RawSignal]:
        client = self._build_client()
        signals: list[RawSignal] = []
        try:
            # The library exposes search_posts; results are dicts with
            # a `urn` per post. Some versions also expose
            # `get_hashtag_posts(hashtag)`.
            search_fn = getattr(client, "get_hashtag_posts", None) or getattr(
                client, "search_posts", None
            )
            if search_fn is None:
                log.debug("tomquirk_no_hashtag_search_method")
                return signals
            results = search_fn(hashtag) or []
        except Exception as exc:  # noqa: BLE001
            log.debug(
                "tomquirk_linkedin_hashtag_search_failed",
                hashtag=hashtag,
                error_class=type(exc).__name__,
                error=str(exc),
            )
            return signals

        for idx, post in enumerate(results):
            if idx >= limit:
                break
            post_urn = post.get("urn") or post.get("entityUrn") or f"{hashtag}:{idx}"
            text = post.get("commentary") or post.get("text") or ""
            signals.append(
                RawSignal(
                    platform=self.platform,
                    type="linkedin_post",
                    label=text[:200] or f"#{hashtag}",
                    source_id=f"li:tomquirk:hashtag:{hashtag}:{post_urn}",
                    source_url=post.get("permalink") or post.get("url"),
                    raw_payload={
                        "hashtag": hashtag,
                        "urn": post_urn,
                        "text": text,
                        "posted_at": post.get("postedAt") or post.get("posted_at"),
                        "like_count": post.get("likeCount")
                        or post.get("socialDetail", {}).get("likeCount"),
                        "comment_count": post.get("commentCount")
                        or post.get("socialDetail", {}).get("commentCount"),
                        "author_urn": post.get("author"),
                    },
                    language="en",
                    region="XX",
                    score=float(
                        (post.get("likeCount") or 0)
                        + (post.get("commentCount") or 0) * 2
                    ),
                    fetched_at=datetime.utcnow(),
                )
            )
        return signals

    def _fetch_author_sync(self, urn: str, limit: int) -> list[RawSignal]:
        client = self._build_client()
        signals: list[RawSignal] = []
        try:
            results = client.search_posts(urn) or []
        except Exception as exc:  # noqa: BLE001
            log.debug(
                "tomquirk_linkedin_author_search_failed",
                author_urn=urn,
                error_class=type(exc).__name__,
                error=str(exc),
            )
            return signals

        for idx, post in enumerate(results):
            if idx >= limit:
                break
            post_urn = post.get("urn") or post.get("entityUrn") or f"{urn}:{idx}"
            text = post.get("commentary") or post.get("text") or ""
            signals.append(
                RawSignal(
                    platform=self.platform,
                    type="linkedin_post",
                    label=text[:200] or f"urn:{urn}",
                    source_id=f"li:tomquirk:author:{urn}:{post_urn}",
                    source_url=post.get("permalink") or post.get("url"),
                    raw_payload={
                        "author_urn": urn,
                        "urn": post_urn,
                        "text": text,
                        "like_count": post.get("likeCount"),
                        "comment_count": post.get("commentCount"),
                    },
                    language="en",
                    region="XX",
                    score=float(
                        (post.get("likeCount") or 0)
                        + (post.get("commentCount") or 0) * 2
                    ),
                    fetched_at=datetime.utcnow(),
                )
            )
        return signals


# ─── LinkedinMarketingApiSource ─────────────────────────────────────────────
@register
class LinkedinMarketingApiSource:
    """Official LinkedIn Marketing Developer Platform.

    Requires:

    * A LinkedIn app approved for ``r_organization_social`` and
      ``r_ads_reporting``.
    * An OAuth 2.0 access token (3-legged flow, stored in
      ``LINKEDIN_ACCESS_TOKEN`` env var).
    * One or more organization URNs (``urn:li:organization:{id}``).

    Endpoint: ``GET /rest/ugcPosts?q=criteria&authors=List(...)&count=50``.
    """

    platform: ClassVar[str] = "linkedin"
    source_key: ClassVar[str] = "linkedin_marketing_api"
    tos_warning: str = ""  # clean first-party API; App Review handled at catalog layer

    # ── validation ──────────────────────────────────────────────────────
    @staticmethod
    def validate_config(config: dict[str, Any]) -> ValidationResult:
        errors: list[str] = []

        token = (
            config.get("access_token")
            or os.environ.get("LINKEDIN_ACCESS_TOKEN")
            or ""
        ).strip()
        if not token:
            errors.append(
                "LINKEDIN_ACCESS_TOKEN env var (or `access_token` in config) is required"
            )

        org_urns = config.get("organization_urns") or []
        hashtags = config.get("hashtags") or []
        if not isinstance(org_urns, list):
            errors.append("`organization_urns` must be a list of strings")
        if not isinstance(hashtags, list):
            errors.append("`hashtags` must be a list of strings")
        if not org_urns and not hashtags:
            errors.append(
                "at least one of `organization_urns` or `hashtags` is required"
            )

        sort_by = config.get("sort_by", _LINKEDIN_DEFAULT_SORT)
        if sort_by not in {"ENGAGEMENT", "CREATED_TIME", "RECENTLY_POSTED"}:
            errors.append(
                "`sort_by` must be one of ENGAGEMENT|CREATED_TIME|RECENTLY_POSTED"
            )

        if errors:
            return ValidationResult.failure(*errors)
        return ValidationResult.success()

    # ── fetch ───────────────────────────────────────────────────────────
    async def fetch(self, source: TrendSource) -> list[RawSignal]:
        config: dict[str, Any] = source.config or {}
        token: str = (
            config.get("access_token")
            or os.environ.get("LINKEDIN_ACCESS_TOKEN")
            or ""
        ).strip()
        org_urns: list[str] = config.get("organization_urns") or []
        hashtags: list[str] = config.get("hashtags") or []
        sort_by: str = config.get("sort_by", _LINKEDIN_DEFAULT_SORT)

        if not token:
            return []

        signals: list[RawSignal] = []
        async with httpx.AsyncClient(
            base_url=_LINKEDIN_API_BASE,
            timeout=_LINKEDIN_TIMEOUT,
            headers={
                "Authorization": f"Bearer {token}",
                "LinkedIn-Version": "202401",
                "X-Restli-Protocol-Version": "2.0.0",
            },
        ) as client:
            # ── Per-organization post listing ───────────────────────────
            for org_urn in org_urns:
                author_param = org_urn.replace(":", "%3A")
                try:
                    resp = await client.get(
                        "/rest/ugcPosts",
                        params={
                            "q": "criteria",
                            "authors": f"List({author_param})",
                            "count": 50,
                            "sortBy": sort_by,
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()
                except httpx.HTTPError as exc:
                    log.warning(
                        "linkedin_marketing_org_posts_failed",
                        org_urn=org_urn,
                        error_class=type(exc).__name__,
                        error=str(exc),
                    )
                    continue

                for post in (data.get("elements") or [])[:50]:
                    signals.append(self._post_to_signal(post, source=org_urn))

            # ── Per-hashtag lookup (resolve URN then list) ─────────────
            for hashtag in hashtags:
                hashtag_urn = (
                    hashtag
                    if hashtag.startswith("urn:li:hashtag:")
                    else f"{_LINKEDIN_URN_PREFIX}{hashtag.lower()}"
                )
                try:
                    resp = await client.get(
                        "/rest/ugcPosts",
                        params={
                            "q": "criteria",
                            "authors": f"List({hashtag_urn.replace(':', '%3A')})",
                            "count": 50,
                            "sortBy": sort_by,
                        },
                    )
                    resp.raise_for_status()
                    data = resp.json()
                except httpx.HTTPError as exc:
                    log.warning(
                        "linkedin_marketing_hashtag_posts_failed",
                        hashtag=hashtag,
                        error_class=type(exc).__name__,
                        error=str(exc),
                    )
                    continue

                for post in (data.get("elements") or [])[:50]:
                    signals.append(self._post_to_signal(post, source=hashtag))

        return signals

    # ── helpers ────────────────────────────────────────────────────────
    @staticmethod
    def _post_to_signal(post: dict[str, Any], source: str) -> RawSignal:
        # LinkedIn's response shape nests text + social metrics under
        # specific keys; we read defensively because the API has
        # evolved across versions.
        author = post.get("author") or source
        ugc_id = post.get("id") or post.get("entityUrn") or ""
        text = ""
        commentary = (
            (post.get("commentary") or "").strip()
            if isinstance(post.get("commentary"), str)
            else ""
        )
        text = commentary[:200] or ugc_id
        # `specificContent.com.linkedin.ugc.ShareContent.commentary`
        # is the canonical location for long-form post text.
        specific = post.get("specificContent") or {}
        share = specific.get("com.linkedin.ugc.ShareContent") or {}
        alt_text = (share.get("commentary") or "").strip()
        if alt_text:
            text = alt_text[:200]
        score = float(
            (post.get("likeCount") or 0) + (post.get("commentCount") or 0) * 2
        )
        return RawSignal(
            platform="linkedin",
            type="linkedin_post",
            label=text or ugc_id,
            source_id=f"li:marketing:{ugc_id}",
            source_url=post.get("permalink") or f"https://www.linkedin.com/feed/update/{ugc_id}",
            raw_payload={
                "author": author,
                "ugc_id": ugc_id,
                "created_at": post.get("createdAt")
                or (post.get("created") or {}).get("time"),
                "last_modified": post.get("lastModified"),
                "like_count": post.get("likeCount"),
                "comment_count": post.get("commentCount"),
                "share_count": post.get("shareCount"),
                "view_count": (post.get("content") or {}).get("media") or {},
                "source": source,
            },
            language="en",
            region="XX",
            score=score,
            fetched_at=datetime.utcnow(),
        )
