"""laratik-trends sidecar package.

A FastAPI service that runs alongside the Next.js app and is responsible for
extracting, normalising, scoring, and serving cross-platform social trends.

Modules:
- main: FastAPI app factory + lifespan (model warmup, scheduler start)
- routes: HTTP API (healthz, metrics, feed, sync, sources, embed)
- db: async SQLAlchemy 2.0 engine + session factory
- models: ORM models mirroring the Drizzle tables in the Next.js app
- scheduler: APScheduler jobs for the periodic sync cycle
- circuit_breaker: 3-state breaker that gates failing sources
- fallback: ordered list of per-platform fallback extractors
- extractor: pluggable source extractors (one module per platform)
- analysis: scoring, lifecycle, correlation, sentiment, vertical, embeddings
- fit: per-workspace Fit score (the 5-tuple weighted average)
- dedupe: per-source signal dedup helpers
- observability: structlog + Prometheus counters + Sentry breadcrumbs
- config: Pydantic BaseSettings loaded from env vars
"""

__version__ = "0.1.0"
