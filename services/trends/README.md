# laratik-trends

Trend Radar sidecar — a Python FastAPI service that runs alongside the
Next.js app and is responsible for **extracting, normalising, scoring, and
serving cross-platform social trends** for the laratik planner.

The sidecar owns:

- The periodic sync scheduler (APScheduler 3.x)
- The per-source circuit breaker
- The 12 SQLAlchemy tables that mirror the Drizzle schema in the Next.js app
- The heavy ML model loads (BART-MNLI, detoxify, all-MiniLM-L6-v2)
- The Fit-score + cross-platform correlation pipeline

The Next.js app reads/writes the same Postgres via Drizzle and calls into
the sidecar through the `/v1/feed`, `/v1/sync`, `/v1/sources/*`, and
`/v1/embed` HTTP routes.

## Run locally (without Docker)

```bash
# 1. install
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

# 2. env
export DATABASE_URL=postgresql://user:pass@localhost:5432/laratik
export LOG_LEVEL=info

# 3. dev
uvicorn app.main:app --reload --port 8010
# or:  task dev  (alias defined in pyproject.toml)
```

## Run in Docker (the production way)

```bash
docker build -t laratik-trends .
docker run --rm -p 8010:8010 \
  -e DATABASE_URL=postgresql://user:pass@db:5432/laratik \
  -e SENTRY_DSN=... \
  -v laratik-trends-data:/app/data/models \
  laratik-trends
```

The image is multi-stage; the runtime stage is `python:3.12-slim` and
runs as a non-root user (`trends`). The ML model cache is mounted at
`/app/data/models` so restarts don't re-download.

## Health + metrics

| Path           | Purpose                      |
| -------------- | ---------------------------- |
| `GET /healthz` | liveness probe (returns 200) |
| `GET /metrics` | Prometheus text exposition   |

`/healthz` returns `{ "status": "ok", "model_loaded": true, "scheduler_running": true }`
once the lifespan has finished.

## API surface

| Method | Path                           | Purpose                                  |
| ------ | ------------------------------ | ---------------------------------------- |
| `GET`  | `/v1/feed`                     | paginated, filtered trend feed           |
| `GET`  | `/v1/feed/{signalId}`          | single signal + "why this trend" payload |
| `POST` | `/v1/sync`                     | queue a manual sync (returns `jobId`)    |
| `GET`  | `/v1/sync/{jobId}`             | poll the job status                      |
| `GET`  | `/v1/sources/health`           | per-source health snapshot               |
| `POST` | `/v1/sources/{sourceKey}/test` | run a 1-call sample fetch for one source |
| `POST` | `/v1/embed`                    | embed strings (testing + smoke test)     |

OpenAPI / Swagger UI is served at `http://localhost:8010/docs` in dev.

## Environment variables

| Name                               | Required | Default             | Description                                                                 |
| ---------------------------------- | -------- | ------------------- | --------------------------------------------------------------------------- |
| `DATABASE_URL`                     | yes      | —                   | Postgres DSN. `postgresql://` is auto-rewritten to `postgresql+asyncpg://`. |
| `SYNC_DEFAULT_CADENCE_MINUTES`     | no       | `360`               | Per-source sync interval when no override is set.                           |
| `CIRCUIT_BREAKER_THRESHOLD`        | no       | `5`                 | Errors in window before the breaker trips OPEN.                             |
| `CIRCUIT_BREAKER_WINDOW_MINUTES`   | no       | `10`                | Sliding window for counting errors.                                         |
| `CIRCUIT_BREAKER_COOLDOWN_MINUTES` | no       | `15`                | How long OPEN stays OPEN before half-opening.                               |
| `SENTRY_DSN`                       | no       | —                   | Sentry DSN. The sidecar scrubs trend labels + raw payloads before sending.  |
| `LOG_LEVEL`                        | no       | `info`              | `debug` \| `info` \| `warning` \| `error`                                   |
| `MODEL_CACHE_DIR`                  | no       | `/app/data/models`  | Where sentence-transformers / detoxify / BART-MNLI cache to.                |
| `SERPAPI_KEY`                      | no       | —                   | Google Trends via SerpAPI                                                   |
| `YOUTUBE_API_KEY`                  | no       | —                   | YouTube Data API v3                                                         |
| `REDDIT_CLIENT_ID` / `_SECRET`     | no       | —                   | PRAW                                                                        |
| `META_ACCESS_TOKEN`                | no       | —                   | Instagram Graph API + Meta Ad Library                                       |
| `THREADS_USER_ID` / `_TOKEN`       | no       | —                   | Threads API                                                                 |
| `SPOTIFY_CLIENT_ID` / `_SECRET`    | no       | —                   | Spotify Web API                                                             |
| `X_BEARER_TOKEN`                   | no       | —                   | X API v2 (opt-in paid)                                                      |
| `TIKTOK_TAMND_PATH`                | no       | `/usr/local/bin/tt` | Absolute path to the tamnd/tiktok-cli binary                                |

## Tests

```bash
pip install -e ".[dev]"
pytest -v
# or:  task test
```

VCR cassettes under `tests/cassettes/` capture the upstream HTTP calls
so the test suite is hermetic.

## Project layout

```
services/trends/
├── Dockerfile
├── pyproject.toml
├── README.md
└── app/
    ├── main.py             # FastAPI app + lifespan
    ├── routes.py           # route aggregator
    ├── routes_*.py         # per-resource routes (feed, sync, sources, embed)
    ├── config.py           # Pydantic BaseSettings
    ├── db.py               # async SQLAlchemy 2.0 engine
    ├── models.py           # 12 ORM models mirroring the Drizzle tables
    ├── scheduler.py        # APScheduler 3.x
    ├── circuit_breaker.py  # 3-state breaker
    ├── fallback.py         # per-platform fallback chain
    ├── dedupe.py           # per-source signal dedup
    ├── observability.py    # structlog + Prometheus + Sentry
    ├── extractor/
    │   ├── base.py         # Source protocol + RawSignal
    │   └── …               # one module per platform (added in T-105/T-106)
    ├── analysis/
    │   ├── scoring.py      # velocity + half-life + Bayesian + Wilson
    │   ├── lifecycle.py    # S-curve + Bass diffusion
    │   ├── correlation.py  # rapidfuzz + embedding cosine
    │   ├── sentiment.py    # VADER + Detoxify
    │   ├── vertical.py     # BART-MNLI zero-shot
    │   └── embeddings.py   # all-MiniLM-L6-v2 wrapper
    └── fit/
        └── score.py        # 5-tuple weighted Fit score
```

## Where to look first

- **Adding a new source extractor** → `app/extractor/base.py` (the
  `Source` protocol) + drop a new `app/extractor/<platform>.py` module
  that implements it. Register it with the `@register` decorator.
- **Tuning the Fit score** → `app/fit/score.py` (the weights, the
  component formulas, the Bayesian update).
- **Changing the sync cadence** → `app/scheduler.py` (`_register_job`)
  or per-source via the `trend_source.cadence_minutes` column.
- **Reading the analysis math** → `app/analysis/scoring.py` (the four
  primitives every other number is built on).
