# Trend Radar — operator manual

> Status: **v1 (shipped 2026-09-08)**. Audience: on-call engineers + agency admins.

This document explains what the Trend Radar feature is, how it is wired, what it costs, and how to operate it. Read it once, then keep the [on-call runbook](#on-call-runbook) section in your back pocket.

## What it is

Trend Radar is the discovery + curation layer for the planner. It pulls signals from 12+ external platforms (TikTok, YouTube, Reddit, X, Instagram, Threads, LinkedIn, Pinterest, Spotify, Meta Ads Library, Google Trends, plus generic Apify actors), normalises them, scores them, and surfaces the planner-facing "Trends" tab in the workspace app.

The v1 ships four planner tabs that consume the same data:

1. **Discover** — open feed, ranked by Fit score (per-workspace).
2. **For You** — same feed, ranked by velocity and recency.
3. **Boards** — user-curated collections.
4. **Briefs** — closed-loop view: which content items rode which trend, and what happened.

It also ships a single **admin Sources** page (`/app/agency-settings/trend-sources`) that lists every supported extractor, lets a workspace manager enable / configure / disable each one, and shows per-source health (circuit state, 24h success rate, cost, avg duration).

## How to use it

1. An agency admin enables `trend_radar` and configures at least one source on the Sources page. Complete the source's terms acknowledgement and add a key when the source requires one.
2. Open **Trends** inside a workspace. **Discover** is the broad feed; use the vertical filter and saved filters to narrow it to the audience or topic you are planning for.
3. Use **For You** when you want the highest-velocity signals for that workspace. Treat the score as a prioritisation hint, not a guarantee of performance.
4. Create a **Board** for a campaign, client, or recurring content theme and keep the signals you want to revisit there.
5. From a promising signal, choose **Use in brief**. LaraTik opens Quick Create with the trend title and short brief prefilled and records the trend-to-content relationship.
6. Use **Briefs** to review those relationships later. The content item remains editable through the normal planning and approval flow; Trend Radar never publishes automatically.

If no signals appear, check the workspace opt-out list, source health, the signal's seven-day expiry window, and whether the source has completed at least one successful sync.

## What it isn't

It is **not** a social listening / brand-monitoring tool, and it is **not** a content auto-publisher. We do not track brand mentions, and we do not post on behalf of the agency. If you want social listening, point [Mention](https://mention.com) at your handles and call it a day.

It is also **not** a free unlimited firehose. Every paid source consumes a quota, and the cost of the operation is visible on the Sources page in real time. The scheduler is rate-limited per `(platform, source_key)` and a per-source circuit breaker pauses extraction after 5 consecutive errors inside a 10-minute window.

## Architecture

```
┌─────────────────────┐       ┌────────────────────┐       ┌────────────────────┐
│  laratik-planner    │       │ services/trends    │       │ external platforms │
│  (Next.js, Postgres)│◄─────►│  (FastAPI, asyncpg)│◄─────►│  TikTok, YouTube,  │
│                     │  HTTP │                    │  HTTP │  Reddit, X, …      │
└─────────────────────┘       └────────────────────┘       └────────────────────┘
        │                              │
        │ writes/reads                 │ scrapes, normalises,
        │ trend tables                 │ scores, embeds
        ▼                              ▼
┌─────────────────────┐       ┌────────────────────┐
│ Postgres — 12 trend │       │ ML models (lazy):  │
│ tables (Drizzle)    │       │ BART-MNLI, VADER,  │
│ + 3 ops tables      │       │ Detoxify, MiniLM,  │
│ (security_audit,    │       │ sentence-trans.    │
│  rate_limit,        │       │ cached in          │
│  app_error_event)   │       │ /app/data/models   │
└─────────────────────┘       └────────────────────┘
```

The Next.js app reads its own Postgres for the planner UI. The Python sidecar is the only component that talks to the external platforms; the Next.js app talks to the sidecar over HTTP (`/v1/feed`, `/v1/embed`, `/v1/sources/health`, `/v1/sources/{key}/test`).

The 12 trend tables are:

| #   | Table                     | Purpose                                         |
| --- | ------------------------- | ----------------------------------------------- |
| 1   | `trend_source`            | Per-agency source enablement + config           |
| 2   | `trend_signal`            | Normalised trend data + embeddings              |
| 3   | `trend_board`             | User-curated collections                        |
| 4   | `trend_board_item`        | Board ↔ signal link with feedback               |
| 5   | `trend_brief`             | Closed-loop: trend → published content item     |
| 6   | `trend_fetch_job`         | Sync job log                                    |
| 7   | `trend_source_health`     | Per-source health snapshot (circuit state)      |
| 8   | `trend_source_audit`      | Append-only audit of source-config changes      |
| 9   | `trend_source_activity`   | Per-source activity feed (capped at 100/source) |
| 10  | `trend_feedback`          | User feedback events for Fit score training     |
| 11  | `saved_filter`            | Saved Trends filters (per-user)                 |
| 12  | `workspace_source_optout` | Per-workspace opt-out override                  |

Privacy boundary: the sidecar's `_scrub_sentry_event` strips every trend label, source URL, and raw payload from Sentry breadcrumbs. The Next.js audit log is the only place trend labels can land; it is access-controlled.

## Per-source setup

Each platform has its own setup guide under [`./trend-sources/`](./trend-sources/). The five "1.0 sources" (those enabled by default for new agencies) have full ~500-word guides:

- [TikTok](./trend-sources/tiktok.md)
- [YouTube](./trend-sources/youtube.md)
- [Reddit](./trend-sources/reddit.md)
- [Meta Ads Library](./trend-sources/meta-ads-library.md)
- [Google Trends](./trend-sources/google-trends.md)

The remaining 7 sources are stubbed today ("Coming soon" + a link to the source catalog) and will get full guides as their extractors graduate from `experimental` to `paid` or `free`:

- [X (Twitter)](./trend-sources/x.md) — stub
- [Instagram](./trend-sources/instagram.md) — stub
- [Threads](./trend-sources/threads.md) — stub
- [LinkedIn](./trend-sources/linkedin.md) — stub
- [Pinterest](./trend-sources/pinterest.md) — stub
- [Spotify](./trend-sources/spotify.md) — stub
- [Apify (generic actors)](./trend-sources/apify.md) — stub

The source catalog (which sources exist, their tier, their TOS class) is rendered on the admin Sources page and is also available as JSON at `GET /v1/sources/catalog`.

## Cost calculator

A single sync cycle costs:

- **CPU**: 1 BART-MNLI pass per signal (~50ms on a T4). At a default cadence of 6h and 200 signals per cycle, that's 0.5 GPU-minutes per source per day.
- **Per-call API costs** (paid sources only):

| Source                  | Free?                                      | Per-call cost | Quota      |
| ----------------------- | ------------------------------------------ | ------------- | ---------- |
| TikTok Research API     | First 1k req/month free, then $0.0005/req  | metered       | per-month  |
| YouTube Data API v3     | 10k units/day free                         | $0            | per-day    |
| Reddit OAuth            | 60 req/min free                            | $0            | per-minute |
| Meta Ads Library        | Free                                       | $0            | n/a        |
| Google Trends (SerpAPI) | 100 searches/month free, then $0.01/search | metered       | per-month  |
| X v2 API                | $100/month for 10k tweets                  | metered       | per-month  |
| Apify (generic actors)  | Pay per actor compute unit                 | varies        | per-month  |

A small agency (5 workspaces, 4 free sources, 1 paid) consumes about **$0–$15 / month**. A mid-size agency (20 workspaces, 6 paid sources) consumes about **$80–$300 / month**. The Sources page shows the per-source 24h cost; the Prometheus metric `ai_trend_cost_cents_total{platform, source}` is the long-running total.

## Monitoring + alerts

**Prometheus metrics** (exposed at `/metrics` on both the sidecar and the Next.js process):

- `ai_trend_signals_total{platform, source, status}` — signals extracted (counter).
- `ai_trend_extraction_duration_seconds{platform, source}` — extraction latency (histogram).
- `ai_trend_cost_cents_total{platform, source}` — cumulative cost (counter).
- `ai_trend_source_status{agency_id, source, status}` — current source state (gauge; values: 0=disabled, 1=healthy, 2=degraded, 3=down, 4=rate_limited, 5=quota_exhausted).
- `circuit_breaker_state_changes_total{source_key, from_state, to_state}` — counter.

**Sentry tags** on every sidecar exception:

- `capability=trend_radar`
- `platform={platform}` (x, tiktok, youtube, …)
- `source={source_key}` (tiktok_tamnd, tiktok_research, …)
- `costCents={integer}` — the cumulative cost up to the moment of the exception

**Recommended alert rules** (Grafana or your existing stack):

1. `rate(ai_trend_source_status{status="down"}[5m]) > 0` for any source for >10m → page the on-call.
2. `sum by (source) (rate(ai_trend_cost_cents_total[1h])) > 200` → cost runaway; page only during business hours.
3. `increase(circuit_breaker_state_changes_total{to_state="open"}[1h]) > 3` → trip-too-often signal; investigate upstream.

## Common operations

### Rotate an API key

1. Sign in as agency admin.
2. Go to `/app/agency-settings/trend-sources`.
3. Find the source card, click "Configure".
4. Paste the new key. Click "Save".
5. The change is logged to `trend_source_audit` with `action=configure`.
6. The scheduler picks up the new key on the next sync cycle (within 6h by default; force-run with `POST /v1/sources/{key}/test` to confirm).

### Disable a source for a single workspace

Use the **workspace opt-out**, not the agency-level disable. The workspace's Trends page will hide the source but the rest of the agency is unaffected. The opt-out is at `/app/w/{slug}/settings/trends`.

To disable agency-wide, flip `enabled=false` on the source card. The scheduler will skip it on the next cycle.

### Add a custom source (custom Apify actor)

Custom Apify actors are first-class. Add a JSON config block to the agency's `trend_source` row, e.g.:

```json
{
  "apify_actor_id": "apify~my-custom-trend-scraper",
  "input": { "region": "DE", "max_items": 100 }
}
```

The sidecar's `app/extractor/apify.py` reads the actor ID + input, calls the Apify sync API, and normalises the result. There is no Python change required.

### Debug a degraded source

1. Open the Sources page; find the source card.
2. Check the **circuit state** (closed | open | half_open).
3. If **open**: the breaker tripped because of 5 errors in 10m. Click "Retry now" to force-close the breaker and try a one-off fetch via the test button.
4. If the test fetch fails, look at the `last_error` JSON on the card and the Sentry breadcrumbs for `capability=trend_radar source=<key>`.
5. The most common cause is a rate-limit response from the upstream platform; the breaker keeps the source paused for `CIRCUIT_BREAKER_COOLDOWN_MINUTES` (default 15).

## Privacy + retention

- **Trend labels and source URLs are never sent to Sentry.** The `_scrub_sentry_event` filter in `app/observability.py` walks every event and replaces any `label`, `source_url`, `raw_payload`, `embedding`, or `sourceId` key with `"[redacted]"`.
- **The audit log retains nothing personal.** `security_audit_event.metadata` for trend operations carries source key + counts, never user data.
- **GDPR delete** — the workspace settings page has a "Delete my trend data" button. Clicking it deletes workspace-owned rows from `trend_signals`, `trend_boards`, `trend_board_items`, `trend_briefs`, and `trend_feedback`. Agency-scoped source health and activity remain intact for operational monitoring. The action is recorded in `security_audit_event`.
- **Retention**: trend signals are kept for 7 days by default (`expires_at` column) and expired rows are excluded from feed and signal-detail queries. Boards, briefs, and feedback are kept until the workspace deletes them. Audit rows are kept for 7 years per the standard commercial / tax record retention.

## On-call runbook

If you are paged for a Trend Radar incident:

1. **Open the Sources page** in the affected agency. Look for cards in red (status = `down` or `circuit_state=open`).
2. **Click the test button** on the affected source. If it returns `success=true`, the breaker will close itself on the next sync cycle.
3. **If the test fetch fails**, read the `error` field on the response. The top 5 errors are:
   - `upstream 429` → rate-limited; the breaker will retry after the cooldown. Do not page the user.
   - `upstream 401` / `403` → API key invalid. Rotate the key. The action is in the [Rotate an API key](#rotate-an-api-key) section.
   - `upstream 5xx` → upstream is down. The breaker is your friend; do nothing. Re-check in 15m.
   - `timeout` → check the sidecar container's CPU + memory. If it is OOM-killed, restart it.
   - `unknown_source_key` → a custom source was added with a typo. Check the `apify_actor_id`.
4. **If multiple sources are down**, the sidecar itself may be the problem. Check the container logs and the Sentry project for `capability=trend_radar`. Restart the sidecar.
5. **If only one workspace is affected** but other workspaces are fine, check the workspace's opt-out list — a member may have accidentally enabled an opt-out for all sources.

When in doubt, [the per-source setup guide](./trend-sources/) has a "What to do when it breaks" section.
