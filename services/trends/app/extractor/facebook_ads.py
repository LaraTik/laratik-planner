"""Meta Ad Library API extractor.

The Meta Ad Library is the cleanest free paid-ads trend signal — what
brands are spending money to amplify right now is the leading
indicator of what's about to trend organically. No App Review
required; just a developer access token.

Endpoint
--------
``GET https://graph.facebook.com/v18.0/ads_archive``

Query parameters
    access_token          required, from ``META_ACCESS_TOKEN``.
    search_terms          one or more terms to search (space-separated
                          in the API; the extractor joins list inputs
                          with a space).
    ad_reached_countries  JSON-encoded list of ISO country codes.
    ad_active_status      one of ``active`` / ``inactive`` / ``all``.
    ad_type               optional; ``all`` by default.
    fields                requested fields (see ``_DEFAULT_FIELDS``).
    limit                 1..50; default 50.

Quota
-----
No documented daily cap; soft rate limit enforced by Meta at ~3 req/min.
The extractor fires one request per call; per-source cadence (24h)
keeps us well under that.
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


# ─── Defaults ─────────────────────────────────────────────────────────────────
_API_BASE: str = "https://graph.facebook.com/v18.0/ads_archive"

_DEFAULT_COUNTRIES: tuple[str, ...] = ("US",)
_DEFAULT_ACTIVE_STATUS: str = "active"
_DEFAULT_LIMIT: int = 50

_DEFAULT_FIELDS: str = (
    "ad_creation_time,"
    "ad_creative_bodies,"
    "ad_creative_link_captions,"
    "ad_creative_link_titles,"
    "ad_delivery_start_time,"
    "ad_snapshot_url,"
    "bylines,"
    "page_id,"
    "page_name,"
    "publisher_platforms,"
    "estimated_audience_size,"
    "impressions,"
    "spend"
)

_DEFAULT_SEARCH_TERMS: tuple[str, ...] = ()  # must be supplied by config


# ─── Helpers ──────────────────────────────────────────────────────────────────
def _signal_from_ad(
    ad: dict[str, Any], *, source_key: str
) -> RawSignal | None:
    """Translate one Ad Library row into a :class:`RawSignal`."""
    if not isinstance(ad, dict):
        return None
    ad_id = ad.get("id")
    if not ad_id:
        return None

    bodies = ad.get("ad_creative_bodies") or []
    label: str = ""
    if isinstance(bodies, list) and bodies:
        first = bodies[0]
        if isinstance(first, str):
            label = first.strip()
    if not label:
        # Fall back to a link title or byline so the signal still has
        # a human-readable label downstream.
        titles = ad.get("ad_creative_link_titles") or []
        if isinstance(titles, list) and titles and isinstance(titles[0], str):
            label = titles[0].strip()
    if not label:
        bylines = ad.get("bylines") or []
        if isinstance(bylines, list) and bylines and isinstance(bylines[0], str):
            label = bylines[0].strip()
    if not label:
        return None

    page_name = (ad.get("page_name") or "").strip() or None

    spend = ad.get("spend") or {}
    score = 0.0
    if isinstance(spend, dict):
        upper = spend.get("upper_bound")
        lower = spend.get("lower_bound")
        try:
            score = (float(upper) + float(lower)) / 2.0
        except (TypeError, ValueError):
            # Some ads only carry a single bound; use whatever's there.
            try:
                score = float(upper if upper is not None else lower)
            except (TypeError, ValueError):
                score = 0.0

    snapshot_url = ad.get("ad_snapshot_url")

    return RawSignal(
        platform="facebook",
        type="ad",
        label=label,
        source_id=f"facebook:ad:{ad_id}",
        source_url=snapshot_url,
        raw_payload=ad,
        language="en",
        region="US",
        score=score,
    )


# ─── Extractor ────────────────────────────────────────────────────────────────
@register_source
class MetaAdLibrarySource:
    """Meta Ad Library API — official, free, no App Review."""

    platform: ClassVar[str] = "facebook"
    source_key: ClassVar[str] = "meta_ads_library"

    # ------------------------------------------------------------------ config
    @staticmethod
    def validate_config(config: dict[str, Any]) -> ValidationResult:
        errors: list[str] = []
        if not os.environ.get("META_ACCESS_TOKEN"):
            errors.append("META_ACCESS_TOKEN env var is not set")

        terms = config.get("search_terms", list(_DEFAULT_SEARCH_TERMS))
        if not isinstance(terms, list) or not terms:
            errors.append("search_terms must be a non-empty list")

        countries = config.get("ad_reached_countries", list(_DEFAULT_COUNTRIES))
        if not isinstance(countries, list) or not countries:
            errors.append("ad_reached_countries must be a non-empty list")

        status = config.get("ad_active_status", _DEFAULT_ACTIVE_STATUS)
        if status not in {"active", "inactive", "all"}:
            errors.append(
                f"ad_active_status={status!r} is not one of active/inactive/all"
            )

        if errors:
            return ValidationResult.failure(*errors)
        return ValidationResult.success()

    # ------------------------------------------------------------------ fetch
    async def fetch(self, source: TrendSource) -> list[RawSignal]:
        access_token = os.environ.get("META_ACCESS_TOKEN")
        if not access_token:
            logger.warning(
                "facebook_ads.fetch.no_token",
                source_key=source.source_key,
            )
            return []

        cfg = source.config or {}
        search_terms: list[str] = cfg.get(
            "search_terms", list(_DEFAULT_SEARCH_TERMS)
        )
        if not search_terms:
            logger.warning(
                "facebook_ads.fetch.no_search_terms",
                source_key=source.source_key,
            )
            return []

        # The Meta API accepts a single ``search_terms`` string; the
        # catalog config exposes a list so workspaces can curate per
        # vertical. We OR the terms with spaces — Meta treats each
        # token independently and returns ads matching any of them.
        joined_terms = " ".join(t.strip() for t in search_terms if t.strip())

        countries: list[str] = cfg.get(
            "ad_reached_countries", list(_DEFAULT_COUNTRIES)
        )
        ad_status: str = cfg.get("ad_active_status", _DEFAULT_ACTIVE_STATUS)
        ad_type: str = cfg.get("ad_type", "all")
        limit: int = int(cfg.get("limit", _DEFAULT_LIMIT))

        params: dict[str, str | int] = {
            "access_token": access_token,
            "search_terms": joined_terms,
            "ad_reached_countries": str(countries).replace("'", '"'),
            "ad_active_status": ad_status,
            "fields": _DEFAULT_FIELDS,
            "limit": min(max(limit, 1), 50),
        }
        if ad_type and ad_type != "all":
            params["ad_type"] = ad_type.upper()

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(_API_BASE, params=params)
        except httpx.HTTPError as exc:
            logger.warning(
                "facebook_ads.fetch.network_error",
                error_class=exc.__class__.__name__,
                error=str(exc)[:300],
            )
            return []

        if resp.status_code == 401 or resp.status_code == 403:
            logger.warning(
                "facebook_ads.fetch.auth_error",
                status=resp.status_code,
                body=resp.text[:300],
            )
            return []

        if resp.status_code != 200:
            logger.warning(
                "facebook_ads.fetch.bad_status",
                status=resp.status_code,
                body=resp.text[:300],
            )
            return []

        try:
            payload = resp.json()
        except ValueError as exc:
            logger.warning(
                "facebook_ads.fetch.invalid_json",
                error=str(exc)[:200],
            )
            return []

        ads = payload.get("data") or []
        signals: list[RawSignal] = []
        for ad in ads:
            sig = _signal_from_ad(ad, source_key=self.source_key)
            if sig is not None:
                signals.append(sig)

        logger.info(
            "facebook_ads.fetch.ok",
            source_key=source.source_key,
            count=len(signals),
        )
        return signals
