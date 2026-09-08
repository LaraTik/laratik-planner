"""Observability: structlog, Prometheus counters, Sentry breadcrumb helper.

Centralised so every other module has a single import for emitting metrics
and structured logs. The Sentry helper intentionally NEVER includes the
trend label, source URL, or raw payload (privacy: see master prompt §2.2).
"""

from __future__ import annotations

import logging
import sys
from typing import Any, Optional

import structlog
from prometheus_client import Counter, Gauge, Histogram

from app.config import get_settings


# ─── Prometheus metrics ──────────────────────────────────────────────────────
# One counter per sidecar-level event so the existing ops dashboards can
# graph them without redefining the metric names.
SYNC_TOTAL = Counter(
    "sync_total",
    "Number of sync attempts (any trigger).",
    ["source_key", "outcome"],
)
SYNC_DURATION_SECONDS = Histogram(
    "sync_duration_seconds",
    "Wall-clock duration of a sync attempt.",
    ["source_key"],
    buckets=(0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600),
)
SYNC_SIGNALS_TOTAL = Counter(
    "sync_signals_total",
    "Number of signals persisted by a sync attempt.",
    ["source_key", "platform"],
)
SYNC_ERRORS_TOTAL = Counter(
    "sync_errors_total",
    "Number of errors encountered by a sync attempt, classified.",
    ["source_key", "error_class"],
)
COST_CENTS_TOTAL = Counter(
    "cost_cents_total",
    "Cumulative cost in cents of paid-API calls (SerpAPI, X v2, etc.).",
    ["source_key"],
)
EMBED_REQUESTS_TOTAL = Counter(
    "embed_requests_total",
    "Number of /v1/embed calls (testing + warmup).",
    ["outcome"],
)
FEED_QUERIES_TOTAL = Counter(
    "feed_queries_total",
    "Number of /v1/feed calls.",
    ["sort_by"],
)
CIRCUIT_BREAKER_STATE_CHANGES = Counter(
    "circuit_breaker_state_changes_total",
    "Number of circuit-breaker state transitions per source.",
    ["source_key", "from_state", "to_state"],
)


# ─── Trend Radar metrics (capability-tagged) ─────────────────────────────────
# Per the plan §25 — these four metrics are the named exports for the
# Trend Radar capability. They share the same Counter / Histogram
# / Gauge primitives so they land in the same /metrics scrape as the
# existing ones, and any existing dashboard panel that pivots on
# `capability` will surface them automatically.
AI_TREND_SIGNALS_TOTAL = Counter(
    "ai_trend_signals_total",
    "Trend signals extracted by the sidecar (capability=trend_radar).",
    ["platform", "source", "status"],
)
AI_TREND_EXTRACTION_DURATION_SECONDS = Histogram(
    "ai_trend_extraction_duration_seconds",
    "Per-source extraction latency for the Trend Radar capability.",
    ["platform", "source"],
    buckets=(0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300),
)
AI_TREND_COST_CENTS_TOTAL = Counter(
    "ai_trend_cost_cents_total",
    "Cumulative cost in cents of paid Trend Radar API calls (SerpAPI, X v2, etc.).",
    ["platform", "source"],
)
# `ai_trend_source_status` is a gauge; status is encoded as a stable
# integer (0=disabled, 1=healthy, 2=degraded, 3=down, 4=rate_limited,
# 5=quota_exhausted). The `ai_trend_source_status.labels(...)` set
# call updates the value for the (agency, source) pair. The
# scheduler refreshes these on every cycle.
AI_TREND_SOURCE_STATUS = Gauge(
    "ai_trend_source_status",
    "Current health status of a Trend Radar source (capability=trend_radar).",
    ["agency_id", "source", "status"],
)

# Status code constants for `ai_trend_source_status`.
TREND_SOURCE_STATUS_DISABLED = 0
TREND_SOURCE_STATUS_HEALTHY = 1
TREND_SOURCE_STATUS_DEGRADED = 2
TREND_SOURCE_STATUS_DOWN = 3
TREND_SOURCE_STATUS_RATE_LIMITED = 4
TREND_SOURCE_STATUS_QUOTA_EXHAUSTED = 5


# ─── Trend Radar Sentry tags (capability-tagged) ────────────────────────────
# When a sidecar event reaches Sentry, these tags are attached so
# the on-call view can filter by capability and source. Privacy:
# the trend label, source URL, and raw payload are NEVER included
# (see `_scrub_sentry_event`).
TREND_RADAR_TAGS = ("capability", "platform", "source", "costCents")
TREND_RADAR_CAPABILITY = "trend_radar"


def tag_trend_radar_event(
    *,
    platform: str,
    source: str,
    cost_cents: int = 0,
) -> dict[str, str]:
    """Return a Sentry-tags dict for a Trend Radar event.

    Use this in `captureError` / `captureMessage` calls so the
    sidecar's exceptions land in Sentry with the same
    `capability=trend_radar` tag as the Next.js app's exceptions.
    The actual `setTag` call is in `_apply_trend_radar_tags` so
    callers can either pass the dict to Sentry's `tags` param or
    rely on this helper.
    """
    return {
        "capability": TREND_RADAR_CAPABILITY,
        "platform": platform,
        "source": source,
        "costCents": str(int(cost_cents)),
    }


def _apply_trend_radar_tags(
    tags: dict[str, str],
    *,
    platform: str,
    source: str,
    cost_cents: int = 0,
) -> dict[str, str]:
    """Merge Trend Radar tags into an existing tag dict. New keys win."""
    merged = dict(tags or {})
    merged.update(
        tag_trend_radar_event(
            platform=platform,
            source=source,
            cost_cents=cost_cents,
        )
    )
    return merged


# ─── Logging ─────────────────────────────────────────────────────────────────
_configured = False


def configure_logging() -> None:
    """Wire up structlog with JSON output to stdout.

    Idempotent — calling twice (e.g. in the test client) is a no-op so
    the second call doesn't double-stamp the log records.
    """
    global _configured
    if _configured:
        return

    settings = get_settings()
    level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)

    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=level,
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )
    _configured = True


def get_logger(name: str = "trends") -> structlog.stdlib.BoundLogger:
    """Return a structlog logger bound to the calling module's name."""
    if not _configured:
        configure_logging()
    return structlog.get_logger(name)


# ─── Sentry breadcrumb helper ────────────────────────────────────────────────
_sentry_initialised = False


def init_sentry() -> None:
    """Initialise Sentry from the configured DSN. No-op when unset.

    Imports `sentry_sdk` lazily so the sidecar can run without it installed
    (the requirement is an environment decision, not a hard dep).
    """
    global _sentry_initialised
    if _sentry_initialised:
        return
    settings = get_settings()
    if not settings.SENTRY_DSN:
        return
    try:
        import sentry_sdk  # type: ignore[import-not-found]
    except ImportError:
        get_logger("observability").warning(
            "sentry_sdk.missing",
            note="SENTRY_DSN set but sentry-sdk is not installed; continuing without Sentry.",
        )
        return

    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        # We report ONLY breadcrumbs + exceptions from this sidecar. We never
        # include the trend label, source URL, or raw payload — see
        # before_send scrubber.
        before_send=_scrub_sentry_event,
        traces_sample_rate=0.0,  # we do APM via Prometheus
        environment="trends-sidecar",
    )
    _sentry_initialised = True


def _scrub_sentry_event(event: dict[str, Any], hint: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Strip trend label / source URL / raw payload from any Sentry event.

    Privacy: master prompt §2.2 says no trend data may land in Sentry. This
    walker prunes suspect keys anywhere they appear (message, tags, extras,
    breadcrumbs, exception values).
    """
    deny_keys = {
        "label",
        "trend_label",
        "normalized_label",
        "source_url",
        "raw_payload",
        "sourceId",
        "source_id",
        "embedding",
    }

    def scrub(obj: Any) -> Any:
        if isinstance(obj, dict):
            return {
                k: ("[redacted]" if k in deny_keys else scrub(v))
                for k, v in obj.items()
            }
        if isinstance(obj, list):
            return [scrub(v) for v in obj]
        if isinstance(obj, str):
            # Belt + braces: if the value itself contains a trend label
            # embedded in a longer string, replace the string.
            if any(s in obj.lower() for s in ("trend_label=", "source_url=")):
                return "[redacted-contains-trend-data]"
            return obj
        return obj

    return scrub(event)


def capture_breadcrumb(
    category: str,
    message: str,
    *,
    level: str = "info",
    data: Optional[dict[str, Any]] = None,
) -> None:
    """Add a Sentry breadcrumb. No-op when Sentry is not configured.

    The `data` dict is scrubbed through the same deny-list as
    `_scrub_sentry_event` so we never accidentally log trend data.
    """
    if not _sentry_initialised:
        return
    try:
        import sentry_sdk  # type: ignore[import-not-found]
    except ImportError:
        return
    sentry_sdk.add_breadcrumb(
        category=category,
        message=message,
        level=level,
        data=_scrub_sentry_event(data or {}, {}),
    )
