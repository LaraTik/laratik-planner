"""Trend Radar — source catalog.

Single source of truth for every signal source the sidecar can extract from.
The catalog is read by the scheduler (to decide which sources run at what
cadence), by the entitlement layer (to decide what a workspace is allowed to
turn on), and by the UI (to render the source-management page with API key
fields, default toggles, and ToS warnings).

Source tiers
------------
- ``free``  : $0 per call. Includes everything that has a hard free tier
  (YouTube 10k units/day, Reddit OAuth, Meta Ad Library, Spotify) and
  everything that scrapes (TOS risk captured separately).
- ``paid``  : metered cost per call. The scheduler enforces a per-agency
  monthly cap (``trend_radar_cost_cents_per_month``) and refuses to run
  paid sources once the cap is hit.
- ``experimental`` : a flag the UI uses to hide sources that we want to
  keep in the catalog (so we don't lose the research) but don't recommend
  to agencies yet. Currently no source uses this tier; reserved for
  future use.

ToS class
---------
- ``clean`` : official first-party API with documented, allowed use.
- ``grey``  : unofficial scraper, or paid wrapper that scrapes a TOS-
  restricted surface. The source is functional but a workspace should
  opt in knowingly.
- ``review_required`` : first-party API that needs the platform's App
  Review / business verification before it can be used for production
  read traffic. The source is still ``free`` once approved.

Cadence buckets
---------------
Per the Trend Radar plan §2 / §12.3:

- ``6h``  : fast-moving, real-time feeds (TikTok, YouTube, Reddit, X,
  Instagram, Facebook).
- ``12h`` : medium-velocity feeds (Threads, LinkedIn).
- ``24h`` : slow-changing editorial / aggregation feeds (Google Trends,
  Spotify, Meta Ad Library, Pinterest).

The scheduler interprets these as cron expressions; ``6h`` becomes
``0 */6 * * *``, ``12h`` becomes ``0 */12 * * *``, ``24h`` becomes
``0 0 * * *``.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

# Tier — cost class
TIER_FREE: str = "free"
TIER_PAID: str = "paid"
TIER_EXPERIMENTAL: str = "experimental"

# ToS class — legal / policy posture
TOS_CLEAN: str = "clean"
TOS_GREY: str = "grey"
TOS_REVIEW_REQUIRED: str = "review_required"

# Cadence buckets the scheduler understands
CADENCE_1H: str = "1h"
CADENCE_3H: str = "3h"
CADENCE_6H: str = "6h"
CADENCE_12H: str = "12h"
CADENCE_24H: str = "24h"

VALID_CADENCES: frozenset[str] = frozenset(
    {CADENCE_1H, CADENCE_3H, CADENCE_6H, CADENCE_12H, CADENCE_24H}
)


# ---------------------------------------------------------------------------
# Dataclass
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class SourceDefinition:
    """Typed definition of a single trend source.

    Frozen so the catalog can be shared across threads without defensive
    copies. The 18 instances are constructed once at import time.
    """

    # Identity -----------------------------------------------------------
    key: str
    """Stable, lowercase, snake_case identifier. Used as the primary key
    in the database, the API, and the per-workspace override config."""

    display_name: str
    """Human-readable label shown in the source-management UI."""

    platform: str
    """The platform the signal comes from. One of: ``tiktok``,
    ``youtube``, ``reddit``, ``facebook``, ``threads``, ``spotify``,
    ``google_trends``, ``x``, ``instagram``, ``linkedin``,
    ``pinterest``."""

    # Classification -----------------------------------------------------
    tier: str
    """Cost class — one of ``free``, ``paid``, ``experimental``."""

    tos_class: str
    """Legal posture — one of ``clean``, ``grey``, ``review_required``."""

    # Wiring -------------------------------------------------------------
    extractor_module: str
    """Dotted import path of the extractor module that fetches this
    source, relative to ``services/trends/app``. Example:
    ``"extractor.tiktok"`` resolves to
    ``services/trends/app/extractor/tiktok.py``."""

    # Defaults -----------------------------------------------------------
    free_default: bool
    """Whether a new agency should have this source enabled out of the
    box. ``True`` for the 10 sources the v1 default stack relies on;
    ``False`` for opt-in sources."""

    cost_per_call_cents: float
    """Average cost per extractor invocation in US cents. ``0`` for
    free-tier sources, ``0.5`` for X v2 paid ($5 per 1k), ``1.0`` for
    SerpAPI Google Trends ($50 per 5k = $10 per 1k), etc. The scheduler
    multiplies this by call counts to enforce the agency's monthly cap."""

    rate_limit_per_minute: int
    """Documented per-minute rate limit. ``0`` when no documented limit
    exists or when the limit is enforced by the platform as a soft ban
    (e.g. scrapers that get IP-walled)."""

    rate_limit_per_day: int
    """Documented per-day rate limit. ``0`` when no documented limit
    exists. YouTube's 10k units/day is a quota, not a rate limit, but
    we surface it here so the entitlement UI can show it."""

    requires_api_key: bool
    """Whether the workspace must configure an API key (or OAuth
    credentials) before the extractor can run."""

    api_key_env_var: str | None
    """Primary environment variable that holds the API key, or ``None``
    if no key is needed. For sources that need multiple env vars
    (e.g. Reddit OAuth needs client_id + client_secret + user_agent)
    the convention is to put the primary token in this field and
    document the rest in the ``config_schema`` ``x-env-vars`` array."""

    api_key_url: str | None
    """Link to the vendor's signup / credentials page, shown in the UI
    next to the API-key field. ``None`` when no key is needed."""

    default_cadence: str
    """Default extraction cadence — one of ``1h``, ``3h``, ``6h``,
    ``12h``, ``24h``. Per-workspace cadence can override this."""

    supported_languages: list[str]
    """List of ISO-639 language codes the source supports, or
    ``["all"]`` when the source is language-agnostic."""

    config_schema: dict[str, Any]
    """JSON Schema (draft 2020-12) describing the per-source config
    fields the UI should render and validate. The top-level object is
    always a schema with ``type: object`` and a ``properties`` map."""

    notes: str
    """One-sentence description of what the source gives you, shown
    in the source-management UI as a tooltip."""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _schema(
    *,
    description: str,
    properties: dict[str, Any],
    required: list[str] | None = None,
) -> dict[str, Any]:
    """Build a JSON Schema dict with the boilerplate the rest of the
    codebase expects: ``type: object``, ``additionalProperties: false``,
    a top-level ``description``, and an ``x-source`` tag the form
    generator keys off of."""
    schema: dict[str, Any] = {
        "type": "object",
        "description": description,
        "additionalProperties": False,
        "properties": properties,
    }
    if required:
        schema["required"] = required
    return schema


def _str_field(
    *,
    description: str,
    default: str | None = None,
    enum: list[str] | None = None,
    examples: list[str] | None = None,
) -> dict[str, Any]:
    spec: dict[str, Any] = {"type": "string", "description": description}
    if default is not None:
        spec["default"] = default
    if enum is not None:
        spec["enum"] = enum
    if examples is not None:
        spec["examples"] = examples
    return spec


def _int_field(
    *,
    description: str,
    default: int | None = None,
    minimum: int | None = None,
    maximum: int | None = None,
) -> dict[str, Any]:
    spec: dict[str, Any] = {"type": "integer", "description": description}
    if default is not None:
        spec["default"] = default
    if minimum is not None:
        spec["minimum"] = minimum
    if maximum is not None:
        spec["maximum"] = maximum
    return spec


def _arr_field(
    *,
    description: str,
    items: dict[str, Any] | None = None,
    default: list[Any] | None = None,
    min_items: int | None = None,
    max_items: int | None = None,
) -> dict[str, Any]:
    spec: dict[str, Any] = {
        "type": "array",
        "description": description,
        "items": items or {"type": "string"},
    }
    if default is not None:
        spec["default"] = default
    if min_items is not None:
        spec["minItems"] = min_items
    if max_items is not None:
        spec["maxItems"] = max_items
    return spec


# ---------------------------------------------------------------------------
# Shared config field fragments
# ---------------------------------------------------------------------------

_REGION_CODES: dict[str, Any] = _str_field(
    description="ISO 3166-1 alpha-2 region code. US, GB, DE, IN, BR, JP, AE, SA, EG, WW.",
    default="US",
    enum=[
        "WW", "US", "GB", "DE", "FR", "IN", "BR", "JP", "CA", "AU",
        "AE", "SA", "EG", "LB", "MX", "ES", "IT", "NL", "PL", "TR",
        "ID", "PH", "TH", "VN", "KR", "SG", "MY", "ZA", "NG", "KE",
    ],
    examples=["US", "AE"],
)


# ---------------------------------------------------------------------------
# Source definitions
# ---------------------------------------------------------------------------

SOURCES: tuple[SourceDefinition, ...] = (
    # 1. TikTok Creative Center (HTML scrape) -----------------------------
    SourceDefinition(
        key="tiktok_creative_center",
        display_name="TikTok Creative Center",
        platform="tiktok",
        tier=TIER_FREE,
        tos_class=TOS_CLEAN,
        extractor_module="extractor.tiktok_creative_center",
        free_default=True,
        cost_per_call_cents=0.0,
        rate_limit_per_minute=0,
        rate_limit_per_day=0,
        requires_api_key=False,
        api_key_env_var=None,
        api_key_url=None,
        default_cadence=CADENCE_6H,
        supported_languages=["all"],
        config_schema=_schema(
            description=(
                "Per-workspace overrides for the TikTok Creative Center "
                "weekly scrape. Creative Center exposes trending sounds, "
                "hashtags, and creators per region but no public API."
            ),
            properties={
                "regions": _arr_field(
                    description="Region codes to scrape (defaults to WW if empty).",
                    items={"type": "string", "enum": ["WW", "US", "GB", "DE", "BR", "JP", "AE", "SA", "EG", "IN"]},
                    default=["WW"],
                    min_items=1,
                ),
                "period_days": _int_field(
                    description="Rolling window to scrape (7d or 30d).",
                    default=7,
                    minimum=1,
                    maximum=30,
                ),
                "include_creators": _str_field(
                    description="Whether to scrape the creator leaderboard.",
                    default="yes",
                    enum=["yes", "no"],
                ),
            },
        ),
        notes="Official TikTok 'trending sounds + hashtags + creators' leaderboard scraped weekly via Playwright.",
    ),

    # 2. tamnd/tiktok-cli (Go binary) --------------------------------------
    SourceDefinition(
        key="tiktok_tamnd_cli",
        display_name="TikTok (tamnd CLI)",
        platform="tiktok",
        tier=TIER_FREE,
        tos_class=TOS_GREY,
        extractor_module="extractor.tiktok_tamnd_cli",
        free_default=True,
        cost_per_call_cents=0.0,
        rate_limit_per_minute=0,
        rate_limit_per_day=0,
        requires_api_key=False,
        api_key_env_var=None,
        api_key_url=None,
        default_cadence=CADENCE_6H,
        supported_languages=["all"],
        config_schema=_schema(
            description=(
                "Config for the tamnd/tiktok-cli Go binary. Use this for "
                "per-hashtag video scraping; pair with the Creative Center "
                "source for the leaderboard signal."
            ),
            properties={
                "hashtags": _arr_field(
                    description="Hashtags to scrape (without the leading #).",
                    items={"type": "string"},
                    default=[],
                    min_items=1,
                ),
                "max_videos_per_hashtag": _int_field(
                    description="Cap on videos returned per hashtag per run.",
                    default=100,
                    minimum=10,
                    maximum=1000,
                ),
                "proxy_url": _str_field(
                    description="Optional residential proxy URL to avoid IP bans.",
                    default="",
                ),
            },
            required=["hashtags"],
        ),
        notes="Self-hosted Go scraper for per-hashtag TikTok video feeds. Grey ToS but actively maintained.",
    ),

    # 3. YouTube Data API v3 ----------------------------------------------
    SourceDefinition(
        key="youtube_data_api",
        display_name="YouTube Data API v3",
        platform="youtube",
        tier=TIER_FREE,
        tos_class=TOS_CLEAN,
        extractor_module="extractor.youtube",
        free_default=True,
        cost_per_call_cents=0.0,
        rate_limit_per_minute=0,
        rate_limit_per_day=10000,
        requires_api_key=True,
        api_key_env_var="YOUTUBE_API_KEY",
        api_key_url="https://console.cloud.google.com/apis/credentials",
        default_cadence=CADENCE_6H,
        supported_languages=["all"],
        config_schema=_schema(
            description=(
                "Config for the YouTube Data API v3 chart endpoints. "
                "Default quota is 10k units/day per project; "
                "videos.list costs 1 unit, search.list costs 100 units."
            ),
            properties={
                "region_code": _REGION_CODES,
                "video_category_id": _str_field(
                    description=(
                        "YouTube video category. 0=All, 10=Music, 17=Sports, "
                        "20=Gaming, 24=Entertainment, 28=Science & Tech."
                    ),
                    default="0",
                    enum=["0", "1", "2", "10", "15", "17", "20", "22", "23", "24", "25", "26", "27", "28"],
                ),
                "max_results_per_page": _int_field(
                    description="Page size for videos.list (max 50).",
                    default=50,
                    minimum=1,
                    maximum=50,
                ),
            },
        ),
        notes="Official YouTube trending charts. The single best free trend signal in the stack — 10k units/day.",
    ),

    # 4. Reddit JSON (anonymous) -----------------------------------------
    SourceDefinition(
        key="reddit_json",
        display_name="Reddit JSON (anonymous)",
        platform="reddit",
        tier=TIER_FREE,
        tos_class=TOS_CLEAN,
        extractor_module="extractor.reddit_json",
        free_default=True,
        cost_per_call_cents=0.0,
        rate_limit_per_minute=10,
        rate_limit_per_day=0,
        requires_api_key=False,
        api_key_env_var=None,
        api_key_url=None,
        default_cadence=CADENCE_6H,
        supported_languages=["en"],
        config_schema=_schema(
            description=(
                "Config for anonymous Reddit JSON reads (no OAuth). "
                "Anonymous traffic is throttled to ~10 req/min/IP; "
                "use reddit_praw for higher throughput."
            ),
            properties={
                "subreddits": _arr_field(
                    description="Subreddits to poll (without r/). Use 'popular' and 'all' for the global feeds.",
                    items={"type": "string"},
                    default=["popular", "all"],
                    min_items=1,
                ),
                "sort": _str_field(
                    description="Listing sort for each subreddit.",
                    default="hot",
                    enum=["hot", "new", "rising", "top", "controversial"],
                ),
                "time_filter": _str_field(
                    description="Time window when sort=top.",
                    default="day",
                    enum=["hour", "day", "week", "month", "year", "all"],
                ),
                "limit": _int_field(
                    description="Posts to return per listing (max 100).",
                    default=50,
                    minimum=1,
                    maximum=100,
                ),
            },
        ),
        notes="Anonymous Reddit JSON API — no auth, ~10 req/min/IP. Sufficient for low-frequency polls.",
    ),

    # 5. Reddit PRAW (OAuth) --------------------------------------------
    SourceDefinition(
        key="reddit_praw",
        display_name="Reddit (PRAW OAuth)",
        platform="reddit",
        tier=TIER_FREE,
        tos_class=TOS_CLEAN,
        extractor_module="extractor.reddit_praw",
        free_default=True,
        cost_per_call_cents=0.0,
        rate_limit_per_minute=60,
        rate_limit_per_day=0,
        requires_api_key=True,
        api_key_env_var="REDDIT_CLIENT_ID",
        api_key_url="https://www.reddit.com/prefs/apps",
        default_cadence=CADENCE_6H,
        supported_languages=["en"],
        config_schema=_schema(
            description=(
                "Config for the PRAW library (OAuth2 script app). "
                "60 req/min OAuth, vs. 10 req/min anonymous. "
                "PRAW needs client_id + client_secret + user_agent."
            ),
            properties={
                "subreddits": _arr_field(
                    description="Subreddits to poll.",
                    items={"type": "string"},
                    default=["popular", "all"],
                    min_items=1,
                ),
                "sort": _str_field(
                    description="Listing sort.",
                    default="hot",
                    enum=["hot", "new", "rising", "top", "controversial"],
                ),
                "time_filter": _str_field(
                    description="Time window when sort=top.",
                    default="day",
                    enum=["hour", "day", "week", "month", "year", "all"],
                ),
                "limit": _int_field(
                    description="Posts per listing (max 100).",
                    default=100,
                    minimum=1,
                    maximum=100,
                ),
            },
        ),
        notes="The canonical Reddit read client. 60 req/min OAuth. Use this as the default-ON Reddit source.",
    ),

    # 6. Meta Ad Library API ---------------------------------------------
    SourceDefinition(
        key="meta_ads_library",
        display_name="Meta Ad Library API",
        platform="facebook",
        tier=TIER_FREE,
        tos_class=TOS_CLEAN,
        extractor_module="extractor.meta_ads_library",
        free_default=True,
        cost_per_call_cents=0.0,
        rate_limit_per_minute=3,
        rate_limit_per_day=0,
        requires_api_key=True,
        api_key_env_var="META_ACCESS_TOKEN",
        api_key_url="https://developers.facebook.com/apps/",
        default_cadence=CADENCE_24H,
        supported_languages=["all"],
        config_schema=_schema(
            description=(
                "Config for the Meta Ad Library API. The cleanest paid-ads "
                "trend signal: 'what brands are spending money to amplify "
                "right now' is the leading indicator of organic trends."
            ),
            properties={
                "search_terms": _arr_field(
                    description="Search terms to query (one per call, paginated).",
                    items={"type": "string"},
                    default=[],
                    min_items=1,
                ),
                "ad_reached_countries": _arr_field(
                    description="ISO country codes where the ads ran.",
                    items={"type": "string", "enum": ["US", "GB", "DE", "FR", "BR", "IN", "JP", "AE", "SA", "EG"]},
                    default=["US"],
                    min_items=1,
                ),
                "ad_active_status": _str_field(
                    description="Whether to include active, inactive, or all ads.",
                    default="active",
                    enum=["active", "inactive", "all"],
                ),
                "ad_type": _str_field(
                    description="Filter by ad type.",
                    default="all",
                    enum=["all", "political_and_issue_ads", "housing", "employment", "credit"],
                ),
            },
            required=["search_terms"],
        ),
        notes="Free Meta Ad Library. No App Review. The single most underrated free trend API of 2026.",
    ),

    # 7. Threads API (Meta Graph) ----------------------------------------
    SourceDefinition(
        key="threads_api",
        display_name="Threads API",
        platform="threads",
        tier=TIER_FREE,
        tos_class=TOS_CLEAN,
        extractor_module="extractor.threads",
        free_default=True,
        cost_per_call_cents=0.0,
        rate_limit_per_minute=0,
        rate_limit_per_day=250,
        requires_api_key=True,
        api_key_env_var="THREADS_ACCESS_TOKEN",
        api_key_url="https://developers.facebook.com/apps/",
        default_cadence=CADENCE_12H,
        supported_languages=["all"],
        config_schema=_schema(
            description=(
                "Config for the Threads API (Meta Graph extension). "
                "The API has no 'trending' endpoint — we approximate "
                "by searching a curated keyword list and ranking "
                "by reply/like velocity."
            ),
            properties={
                "keywords": _arr_field(
                    description="Keywords to search Threads for.",
                    items={"type": "string"},
                    default=[],
                    min_items=1,
                ),
                "search_type": _str_field(
                    description="Threads search result type.",
                    default="recent",
                    enum=["recent", "top", "profiles"],
                ),
                "fields": _arr_field(
                    description="Threads media fields to return.",
                    items={"type": "string", "enum": ["id", "text", "timestamp", "media_type", "media_url", "permalink", "shortcode", "thumbnail_url", "children", "is_quote_post", "like_count", "reply_count", "repost_count", "quote_count", "view_count"]},
                    default=["id", "text", "timestamp", "like_count", "reply_count"],
                ),
            },
            required=["keywords"],
        ),
        notes="Official Threads API. Needs a Meta app + Threads use case review. No 'trending' endpoint — build it from search.",
    ),

    # 8. Spotify Web API -------------------------------------------------
    SourceDefinition(
        key="spotify_web_api",
        display_name="Spotify Web API",
        platform="spotify",
        tier=TIER_FREE,
        tos_class=TOS_CLEAN,
        extractor_module="extractor.spotify",
        free_default=True,
        cost_per_call_cents=0.0,
        rate_limit_per_minute=0,
        rate_limit_per_day=0,
        requires_api_key=True,
        api_key_env_var="SPOTIFY_CLIENT_ID",
        api_key_url="https://developer.spotify.com/dashboard",
        default_cadence=CADENCE_24H,
        supported_languages=["all"],
        config_schema=_schema(
            description=(
                "Config for the Spotify Web API (OAuth client credentials "
                "flow). Viral-50 / Top-50 chart playlists are gated to "
                "label partners; we read the public playlist IDs and "
                "fall back to editorial playlists + cross-validate with "
                "Last.fm."
            ),
            properties={
                "playlist_ids": _arr_field(
                    description="Spotify playlist IDs to track. Defaults to the public editorial 'Viral 50' and 'Top 50' per region.",
                    items={"type": "string"},
                    default=["37i9dQZEVXbMDoHDwVN2tF"],  # Viral 50 Global
                ),
                "search_queries": _arr_field(
                    description="Optional search queries to track emerging tracks.",
                    items={"type": "string"},
                    default=[],
                ),
                "market": _str_field(
                    description="ISO 3166-1 alpha-2 market code.",
                    default="US",
                ),
            },
        ),
        notes="Official Spotify read API. Use it for audio trend signal; chart playlists may 403 for non-partner callers.",
    ),

    # 9. SerpAPI Google Trends -------------------------------------------
    SourceDefinition(
        key="google_trends_serpapi",
        display_name="Google Trends (SerpAPI)",
        platform="google_trends",
        tier=TIER_PAID,
        tos_class=TOS_GREY,
        extractor_module="extractor.google_trends_serpapi",
        free_default=True,
        cost_per_call_cents=1.0,
        rate_limit_per_minute=0,
        rate_limit_per_day=0,
        requires_api_key=True,
        api_key_env_var="SERPAPI_KEY",
        api_key_url="https://serpapi.com/manage-api-key",
        default_cadence=CADENCE_24H,
        supported_languages=["all"],
        config_schema=_schema(
            description=(
                "Config for SerpAPI's Google Trends endpoint ($50/mo for "
                "5k searches = $10/1k = 1¢/call). The most reliable "
                "Google Trends data source in 2026 — pytrends is dead."
            ),
            properties={
                "queries": _arr_field(
                    description="Search queries to track (max 5 per call).",
                    items={"type": "string"},
                    default=[],
                    min_items=1,
                    max_items=5,
                ),
                "geo": _str_field(
                    description="ISO country code or 'Worldwide'.",
                    default="Worldwide",
                ),
                "time_range": _str_field(
                    description="Time range. 'now 1-d', 'today 1-m', 'today 3-m', 'today 12-m', 'today 5-y', 'all'.",
                    default="today 1-m",
                    enum=["now 1-H", "now 4-H", "now 1-d", "today 1-m", "today 3-m", "today 12-m", "today 5-y", "all"],
                ),
                "include_related_queries": _str_field(
                    description="Whether to also fetch related (top + rising) queries.",
                    default="yes",
                    enum=["yes", "no"],
                ),
            },
            required=["queries"],
        ),
        notes="Paid Google Trends via SerpAPI. 1¢/call. Default-capped at $15/mo per agency.",
    ),

    # 10. twikit (X) -----------------------------------------------------
    SourceDefinition(
        key="x_twikit",
        display_name="X (twikit)",
        platform="x",
        tier=TIER_FREE,
        tos_class=TOS_GREY,
        extractor_module="extractor.x_twikit",
        free_default=True,
        cost_per_call_cents=0.0,
        rate_limit_per_minute=20,
        rate_limit_per_day=0,
        requires_api_key=True,
        api_key_env_var="X_AUTH_TOKEN",
        api_key_url="https://github.com/d60/twikit",
        default_cadence=CADENCE_6H,
        supported_languages=["all"],
        config_schema=_schema(
            description=(
                "Config for the twikit library (d60/twikit on GitHub). "
                "Uses the iOS-app internal API. Violates X's developer "
                "policy but is the most reliable free X read client "
                "in 2026. Account ban risk — needs at least 3 accounts "
                "in rotation."
            ),
            properties={
                "queries": _arr_field(
                    description="Search queries to run on X (Trends + Search tabs).",
                    items={"type": "string"},
                    default=[],
                    min_items=1,
                ),
                "search_tab": _str_field(
                    description="Which search tab to use.",
                    default="Top",
                    enum=["Latest", "Top", "People", "Photos", "Videos"],
                ),
                "max_tweets_per_query": _int_field(
                    description="Cap on tweets returned per query per run.",
                    default=50,
                    minimum=10,
                    maximum=500,
                ),
                "include_trends": _str_field(
                    description="Whether to also pull the per-woeid Trends feed.",
                    default="yes",
                    enum=["yes", "no"],
                ),
                "woeids": _arr_field(
                    description="Where-On-Earth IDs to pull trends for. 1=Worldwide, 23424977=US, 23424975=GB, 23424938=DE, 23424747=AE, 23424936=SA, 23424802=EG.",
                    items={"type": "integer"},
                    default=[1, 23424977, 23424975, 23424938, 23424747],
                ),
            },
            required=["queries"],
        ),
        notes="Free X reader via twikit. Grey ToS, account ban risk. Default-ON in v1; risk documented.",
    ),

    # 11. X API v2 (paid) ------------------------------------------------
    SourceDefinition(
        key="x_v2_paid",
        display_name="X API v2 (paid)",
        platform="x",
        tier=TIER_PAID,
        tos_class=TOS_CLEAN,
        extractor_module="extractor.x_v2",
        free_default=False,
        cost_per_call_cents=0.5,
        rate_limit_per_minute=5,
        rate_limit_per_day=0,
        requires_api_key=True,
        api_key_env_var="X_API_BEARER_TOKEN",
        api_key_url="https://developer.twitter.com/en/portal",
        default_cadence=CADENCE_6H,
        supported_languages=["all"],
        config_schema=_schema(
            description=(
                "Config for the official X API v2 pay-per-use tier. "
                "$0.010 per trends/place call, $0.005 per search-recent "
                "post read, $0.001 per owned-read. 75 req/15min for "
                "Trends, 450/15min for search. 24h UTC dedup window."
            ),
            properties={
                "queries": _arr_field(
                    description="Search queries for /2/tweets/search/recent.",
                    items={"type": "string"},
                    default=[],
                ),
                "woeids": _arr_field(
                    description="WOEIDs for /2/trends/by/woeid/{id}.",
                    items={"type": "integer"},
                    default=[1, 23424977, 23424975, 23424938, 23424747],
                ),
                "max_results_per_query": _int_field(
                    description="Per-query cap (10–100 for recent, 10–500 for all).",
                    default=50,
                    minimum=10,
                    maximum=500,
                ),
                "tweet_fields": _arr_field(
                    description="Expansion fields to return (created_at, public_metrics, lang, etc.).",
                    items={"type": "string", "enum": ["created_at", "public_metrics", "lang", "author_id", "entities", "referenced_tweets", "in_reply_to_user_id", "geo"]},
                    default=["created_at", "public_metrics", "lang", "author_id"],
                ),
            },
        ),
        notes="Official paid X API v2. $5/1k search + $0.01/trend. Default-OFF; per-agency opt-in.",
    ),

    # 12. instaloader (Instagram) ----------------------------------------
    SourceDefinition(
        key="instagram_instaloader",
        display_name="Instagram (instaloader)",
        platform="instagram",
        tier=TIER_FREE,
        tos_class=TOS_GREY,
        extractor_module="extractor.instagram_instaloader",
        free_default=False,
        cost_per_call_cents=0.0,
        rate_limit_per_minute=3,
        rate_limit_per_day=0,
        requires_api_key=False,
        api_key_env_var="INSTAGRAM_USERNAME",
        api_key_url=None,
        default_cadence=CADENCE_12H,
        supported_languages=["all"],
        config_schema=_schema(
            description=(
                "Config for instaloader. Per-hashtag or per-profile "
                "scraping. Meta has been IP-banning instaloader users "
                "since Q4 2024 — only use for spot checks, not 24/7 "
                "trend radar."
            ),
            properties={
                "hashtags": _arr_field(
                    description="Hashtags to scrape (without #).",
                    items={"type": "string"},
                    default=[],
                ),
                "profiles": _arr_field(
                    description="Instagram usernames to scrape (without @).",
                    items={"type": "string"},
                    default=[],
                ),
                "max_posts_per_target": _int_field(
                    description="Cap on posts returned per hashtag/profile per run.",
                    default=50,
                    minimum=1,
                    maximum=500,
                ),
            },
        ),
        notes="Self-hosted IG scraper via instaloader. Grey ToS. Default-OFF; per-workspace opt-in.",
    ),

    # 13. Instagram Graph API -------------------------------------------
    SourceDefinition(
        key="instagram_graph_api",
        display_name="Instagram Graph API",
        platform="instagram",
        tier=TIER_FREE,
        tos_class=TOS_REVIEW_REQUIRED,
        extractor_module="extractor.instagram_graph",
        free_default=False,
        cost_per_call_cents=0.0,
        rate_limit_per_minute=3,
        rate_limit_per_day=0,
        requires_api_key=True,
        api_key_env_var="INSTAGRAM_ACCESS_TOKEN",
        api_key_url="https://developers.facebook.com/apps/",
        default_cadence=CADENCE_6H,
        supported_languages=["all"],
        config_schema=_schema(
            description=(
                "Config for the Instagram Graph API (Meta). Requires App "
                "Review with instagram_basic + instagram_manage_insights. "
                "Gives you hashtag top/recent media — build trending "
                "rankings by counting posts/hour per hashtag."
            ),
            properties={
                "user_id": _str_field(
                    description="The Instagram Business account user_id the token is for.",
                ),
                "hashtags": _arr_field(
                    description="Hashtags to track (without #). ~5 per vertical.",
                    items={"type": "string"},
                    default=[],
                    min_items=1,
                ),
                "fields": _str_field(
                    description="Comma-separated fields for the media response.",
                    default="id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count",
                ),
                "media_type": _str_field(
                    description="Restrict to one media type for ranking clarity.",
                    default="any",
                    enum=["any", "image", "video", "reel"],
                ),
            },
            required=["user_id", "hashtags"],
        ),
        notes="Official Instagram Graph API. Needs App Review + business account. Default-OFF; per-workspace opt-in.",
    ),

    # 14. tomquirk/linkedin-api -----------------------------------------
    SourceDefinition(
        key="linkedin_tomquirk",
        display_name="LinkedIn (tomquirk)",
        platform="linkedin",
        tier=TIER_FREE,
        tos_class=TOS_GREY,
        extractor_module="extractor.linkedin_tomquirk",
        free_default=False,
        cost_per_call_cents=0.0,
        rate_limit_per_minute=0,
        rate_limit_per_day=100,
        requires_api_key=True,
        api_key_env_var="LINKEDIN_EMAIL",
        api_key_url="https://github.com/tomquirk/linkedin-api",
        default_cadence=CADENCE_12H,
        supported_languages=["all"],
        config_schema=_schema(
            description=(
                "Config for tomquirk/linkedin-api. Unofficial Python "
                "wrapper that uses authenticated-session cookies. "
                "Violates LinkedIn ToS. Keep well below 100 req/day."
            ),
            properties={
                "hashtags": _arr_field(
                    description="Hashtags to track (without #).",
                    items={"type": "string"},
                    default=[],
                ),
                "author_urns": _arr_field(
                    description="LinkedIn author URNs to track.",
                    items={"type": "string"},
                    default=[],
                ),
                "max_posts_per_target": _int_field(
                    description="Cap on posts returned per target per run.",
                    default=25,
                    minimum=1,
                    maximum=100,
                ),
            },
        ),
        notes="Self-hosted LinkedIn scraper (tomquirk). Grey ToS. Default-OFF; per-workspace opt-in.",
    ),

    # 15. LinkedIn Marketing API ----------------------------------------
    SourceDefinition(
        key="linkedin_marketing_api",
        display_name="LinkedIn Marketing API",
        platform="linkedin",
        tier=TIER_FREE,
        tos_class=TOS_REVIEW_REQUIRED,
        extractor_module="extractor.linkedin_marketing",
        free_default=False,
        cost_per_call_cents=0.0,
        rate_limit_per_minute=0,
        rate_limit_per_day=100,
        requires_api_key=True,
        api_key_env_var="LINKEDIN_CLIENT_ID",
        api_key_url="https://www.linkedin.com/developers/apps",
        default_cadence=CADENCE_24H,
        supported_languages=["all"],
        config_schema=_schema(
            description=(
                "Config for the official LinkedIn Marketing Developer "
                "Platform. Requires App Review with r_organization_social "
                "+ r_ads_reporting. 100 req/day per endpoint. No "
                "'trending' feed — build it from per-hashtag + per-author "
                "post polls."
            ),
            properties={
                "organization_urns": _arr_field(
                    description="LinkedIn organization URNs (urn:li:organization:XXX) to track.",
                    items={"type": "string"},
                    default=[],
                ),
                "hashtags": _arr_field(
                    description="Hashtags to track (urn:li:hashtag:XXX after first lookup).",
                    items={"type": "string"},
                    default=[],
                ),
                "sort_by": _str_field(
                    description="Post sort criterion.",
                    default="ENGAGEMENT",
                    enum=["ENGAGEMENT", "CREATED_TIME", "RECENTLY_POSTED"],
                ),
            },
        ),
        notes="Official LinkedIn Marketing API. Needs App Review. 100 req/day cap. Default-OFF; per-workspace opt-in.",
    ),

    # 16. Pinterest API v5 ----------------------------------------------
    SourceDefinition(
        key="pinterest_api_v5",
        display_name="Pinterest API v5",
        platform="pinterest",
        tier=TIER_FREE,
        tos_class=TOS_CLEAN,
        extractor_module="extractor.pinterest",
        free_default=False,
        cost_per_call_cents=0.0,
        rate_limit_per_minute=16,
        rate_limit_per_day=0,
        requires_api_key=True,
        api_key_env_var="PINTEREST_ACCESS_TOKEN",
        api_key_url="https://developers.pinterest.com/apps/",
        default_cadence=CADENCE_24H,
        supported_languages=["all"],
        config_schema=_schema(
            description=(
                "Config for Pinterest API v5. The /v5/trends/pinterest "
                "endpoint was removed in 2025-Q4 — rank by save_count "
                "velocity on search results."
            ),
            properties={
                "queries": _arr_field(
                    description="Search queries to track (one per call).",
                    items={"type": "string"},
                    default=[],
                    min_items=1,
                ),
                "region": _str_field(
                    description="Pinterest region code (US, GB, DE, etc.).",
                    default="US",
                ),
                "max_results_per_query": _int_field(
                    description="Pin cap per query per run.",
                    default=50,
                    minimum=1,
                    maximum=250,
                ),
            },
            required=["queries"],
        ),
        notes="Official Pinterest API v5. Clean ToS, no /trends endpoint — rank search results by save velocity.",
    ),

    # 17. Apify X scraper ------------------------------------------------
    SourceDefinition(
        key="apify_x_scraper",
        display_name="X (Apify scraper)",
        platform="x",
        tier=TIER_PAID,
        tos_class=TOS_GREY,
        extractor_module="extractor.apify_x",
        free_default=False,
        cost_per_call_cents=0.05,
        rate_limit_per_minute=50,
        rate_limit_per_day=0,
        requires_api_key=True,
        api_key_env_var="APIFY_API_TOKEN",
        api_key_url="https://console.apify.com/account/integrations",
        default_cadence=CADENCE_6H,
        supported_languages=["all"],
        config_schema=_schema(
            description=(
                "Config for an Apify X scraper actor (e.g. "
                "apidojo/twitter-scraper-lite, valig/twitter-trends-scraper). "
                "$0.10–$0.50 per 1k results. Use as a fallback when "
                "twikit account pool is exhausted."
            ),
            properties={
                "actor_id": _str_field(
                    description="Apify actor ID, e.g. 'apidojo/twitter-scraper-lite'.",
                    default="apidojo/twitter-scraper-lite",
                ),
                "search_terms": _arr_field(
                    description="Search terms (one per actor run).",
                    items={"type": "string"},
                    default=[],
                ),
                "max_tweets_per_run": _int_field(
                    description="Cap on tweets returned per run.",
                    default=1000,
                    minimum=100,
                    maximum=10000,
                ),
                "include_trends_actor": _str_field(
                    description="Optional trends actor to also run.",
                    default="",
                ),
            },
        ),
        notes="Apify X scrapers — paid ($0.05–0.50/1k). Default-OFF; per-workspace opt-in.",
    ),

    # 18. kawsarlog/threads-py ------------------------------------------
    SourceDefinition(
        key="kawsarlog_threads",
        display_name="Threads (kawsarlog)",
        platform="threads",
        tier=TIER_FREE,
        tos_class=TOS_GREY,
        extractor_module="extractor.kawsarlog_threads",
        free_default=False,
        cost_per_call_cents=0.0,
        rate_limit_per_minute=0,
        rate_limit_per_day=0,
        requires_api_key=False,
        api_key_env_var=None,
        api_key_url=None,
        default_cadence=CADENCE_12H,
        supported_languages=["all"],
        config_schema=_schema(
            description=(
                "Config for kawsarlog/threads-py. Unofficial Threads "
                "scraper. Unmaintained since 2024-Q3 and bundled with "
                "many other platforms — use only as a Threads fallback "
                "when the official API quota is hit."
            ),
            properties={
                "keywords": _arr_field(
                    description="Search keywords to track.",
                    items={"type": "string"},
                    default=[],
                ),
                "max_posts_per_keyword": _int_field(
                    description="Cap on posts returned per keyword per run.",
                    default=50,
                    minimum=1,
                    maximum=500,
                ),
            },
        ),
        notes="Self-hosted Threads scraper. Grey ToS, unmaintained. Default-OFF; per-workspace opt-in fallback.",
    ),
)


# ---------------------------------------------------------------------------
# Lookup table (key -> definition)
# ---------------------------------------------------------------------------

_BY_KEY: dict[str, SourceDefinition] = {s.key: s for s in SOURCES}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_source(key: str) -> SourceDefinition | None:
    """Get a single source definition by key. Returns ``None`` if the
    key is not in the catalog."""
    return _BY_KEY.get(key)


def all_sources() -> list[SourceDefinition]:
    """Get all source definitions, sorted by ``display_name``.

    Returns a fresh list every call so callers may sort, filter, or
    mutate the result without affecting the catalog."""
    return sorted(SOURCES, key=lambda s: s.display_name)


def default_on_sources() -> list[SourceDefinition]:
    """Get the sources that should be enabled by default for a new
    agency. The list is the 10 sources marked ``free_default=True`` in
    the v1 plan, sorted by ``display_name``."""
    return sorted((s for s in SOURCES if s.free_default), key=lambda s: s.display_name)


def free_sources() -> list[SourceDefinition]:
    """Get all free-tier sources (``tier='free'``), sorted by
    ``display_name``. Includes both default-ON and default-OFF
    free-tier sources; default-ON is read from ``free_default``."""
    return sorted(
        (s for s in SOURCES if s.tier == TIER_FREE),
        key=lambda s: s.display_name,
    )


def paid_sources() -> list[SourceDefinition]:
    """Get all paid-tier sources (``tier='paid'``), sorted by
    ``display_name``."""
    return sorted(
        (s for s in SOURCES if s.tier == TIER_PAID),
        key=lambda s: s.display_name,
    )


def grey_sources() -> list[SourceDefinition]:
    """Get all grey-area sources (``tos_class='grey'``), sorted by
    ``display_name``. These are the ones the UI must surface a ToS
    warning on before the workspace can enable them."""
    return sorted(
        (s for s in SOURCES if s.tos_class == TOS_GREY),
        key=lambda s: s.display_name,
    )


def by_platform(platform: str) -> list[SourceDefinition]:
    """Get all sources for a given platform, sorted by
    ``display_name``. Returns an empty list if the platform has no
    sources in the catalog."""
    return sorted(
        (s for s in SOURCES if s.platform == platform),
        key=lambda s: s.display_name,
    )


__all__ = [
    "CADENCE_1H",
    "CADENCE_3H",
    "CADENCE_6H",
    "CADENCE_12H",
    "CADENCE_24H",
    "SOURCES",
    "SourceDefinition",
    "TIER_EXPERIMENTAL",
    "TIER_FREE",
    "TIER_PAID",
    "TOS_CLEAN",
    "TOS_GREY",
    "TOS_REVIEW_REQUIRED",
    "VALID_CADENCES",
    "all_sources",
    "by_platform",
    "default_on_sources",
    "free_sources",
    "get_source",
    "grey_sources",
    "paid_sources",
]
