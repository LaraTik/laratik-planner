# AI Features — A-to-Z Implementation Plan for `laratik-planner`

> **Status:** Draft for review and approval. No code has been written yet.
> **Companion docs:** `.research/INTEGRATION_REPORT.md` (the why), this file (the how), `.research/HANDOFF.md` (the approval gate), `.research/designs/` (the UI).
> **Date:** 2026-09-07
> **Scope:** 3 new features (Trend Radar, Brand-aware Image Gen, Reel Generator + AI Subtitle) + 5 existing-feature improvements, all shipped behind the agency database master switch and capability allowlist.

---

## 0. Master checklist (the "done" definition)

A feature is "done" when **every** box in its section is checked. A sprint is "done" when every feature in it is done. The plan is "done" when all 5 sprints are done.

Per-feature definition of done (all 8 must hold):

- [ ] Schema migration is forward + backward compatible, with a rollback tested
- [ ] Code is behind the per-agency database master switch (default off) AND a per-agency capability allow-list
- [ ] Daily + monthly budget enforcement wired via `enforceAiBudget` + `reconcileAiBudget`
- [ ] Unit tests pass (`pnpm test:unit`)
- [ ] Integration tests pass (`pnpm test:integration`) with `TEST_DATABASE_URL=planner_test`
- [ ] E2E test added to `tests/e2e/`
- [ ] Sentry error capture + structured logs (`pino` with `requestId` + `capability`)
- [ ] At least one new Stitch HTML in `designs/stitch/` (or updated existing screen) + a `SCREEN_PARITY.md` row

---

## 1. Feature 1 — Trend Radar

**User story:** "As a social-media planner, I want to see what's trending right now on the platforms my agency targets, so I can use those trends to seed the `campaign_ideas` and `related_format_ideas` capabilities."

**Acceptance criteria:**

- New "Trends" tab on the planning toolbar.
- Tab shows the top 20 trending topics per platform for the last 24 hours, ranked by `score`.
- Clicking a trend opens a `QuickCreate` drawer pre-filled with the trend label.
- `campaign_ideas` and `related_format_ideas` capabilities receive the top-3 trends for the active workspace as context.
- If the sidecar is down, the tab is empty and the §15 capabilities degrade gracefully (no error toast).
- No trend data is logged to Sentry; only aggregate counts (e.g. `trend_signals.fetched_total`).

### 1.1 Architecture

```
Next.js 16 (App Router)                              Postgres 16
  /app/(app)/app/w/[slug]/research/trends                  ▲
  (server component, RSC)                                 │
  ┌────────────────────────────────────────────┐           │
  │ /api/trends/feed?workspace=…&platform=…    │           │
  │ /api/trends/sync (admin, manual trigger)   │           │
  └────────────────┬───────────────────────────┘           │
                   │                                       │
                   ▼                                       │
   ┌────────────────────────────────────────────┐          │
   │ services/trends/ (Python 3.12, FastAPI)    │          │
   │ ┌──────────────────────────────────────┐   │          │
   │ │  Cron: every 6h (per workspace)      │   │          │
   │ │  • Agent-Reach MCP (Twitter/X,        │   │          │
   │ │    Reddit, YouTube, GitHub, Bilibili, │   │          │
   │ │    XiaoHongShu)                       │   │          │
   │ │  • tamnd/tiktok-cli (TikTok)          │   │          │
   │ │  • kawsarlog/social-media-apis        │   │          │
   │ │    (IG, LinkedIn, Threads — fallback) │   │          │
   │ │  • Meta Ad Library scripts (FB Ads)    │   │          │
   │ │  Dedup, score, persist                │   │          │
   │ └──────────────────────────────────────┘   │          │
   │ ┌──────────────────────────────────────┐   │          │
   │ │  /healthz, /metrics (Prom), /v1/feed  │   │          │
   │ └──────────────────────────────────────┘   │          │
   │ Port 8010, env: TRENDS_SERVICE_URL        │          │
   └────────────────────────────────────────────┘          │
```

### 1.2 Database schema

New file: `src/lib/db/schema/trends.ts`. Drizzle table:

```ts
import { pgTable, uuid, text, timestamp, jsonb, integer, real, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { workspaces } from "./workspaces";

export const trendSignals = pgTable(
  "trend_signal",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(), // 'twitter' | 'reddit' | 'tiktok' | 'instagram' | 'linkedin' | 'threads' | 'youtube' | 'bilibili' | 'xhs'
    topicType: text("topic_type").notNull(), // 'hashtag' | 'audio' | 'creator' | 'phrase' | 'topic'
    label: text("label").notNull(),
    score: real("score").notNull(), // 0-100, normalized across platforms
    rawPayload: jsonb("raw_payload").notNull(), // { source_url, post_count, sentiment, ... }
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => ({
    byWorkspacePlatformTime: index("trend_signal_workspace_platform_time_idx").on(
      t.workspaceId,
      t.platform,
      t.fetchedAt.desc(),
    ),
    byWorkspaceTime: index("trend_signal_workspace_time_idx").on(t.workspaceId, t.fetchedAt.desc()),
  }),
);

export const trendFetchJobs = pgTable("trend_fetch_job", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  status: text("status").notNull(), // 'queued' | 'running' | 'success' | 'error'
  platforms: jsonb("platforms").notNull(), // string[]
  signalsAdded: integer("signals_added").notNull().default(0),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Append `trendSignals, trendFetchJobs` to the export list in `src/lib/db/schema/index.ts`. Migration file: `drizzle/0XXX_trend_signals.sql` — generated via `pnpm db:generate`. Forward-compatible: nullable columns, no NOT NULL changes to existing tables.

### 1.3 API contracts

**`GET /api/trends/feed`** — read-only.

```ts
// Request
{ workspaceId: string, platform?: string, since?: string, limit?: number /* 1-50, default 20 */ }

// Response 200
{
  signals: Array<{
    id: string;
    platform: string;
    topicType: string;
    label: string;
    score: number;
    fetchedAt: string;  // ISO
    sourceUrl?: string;
  }>;
  nextCursor?: string;  // for pagination
}
```

**`POST /api/trends/sync`** — admin-only, manual trigger. Auth: `requireWriteCapability` + workspace role = `admin`.

```ts
// Request
{ workspaceId: string, platforms?: string[] /* default = all configured */ }

// Response 202
{ jobId: string }
```

**`GET /api/trends/sync/[jobId]`** — poll job status.

```ts
// Response 200
{ id: string, status: 'queued'|'running'|'success'|'error', signalsAdded: number, errorMessage?: string }
```

Zod schemas: `src/lib/validation/trends.ts` (3 schemas, mirrors existing `src/lib/validation/agency.ts` pattern). All routes go through `enforceRateLimit({ limit: 30, windowSec: 60, key: "trends:feed" })`.

### 1.4 Python sidecar

Path: `services/trends/`. Stack: Python 3.12, FastAPI 0.115, SQLAlchemy 2.0, httpx, `agent-reach` (pip), `tamnd-tiktok-cli` (subprocess).

Files:

```
services/trends/
├── Dockerfile
├── pyproject.toml
├── README.md
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app
│   ├── routes.py            # /healthz, /metrics, /v1/feed, /v1/sync
│   ├── models.py            # SQLAlchemy models (mirror Drizzle)
│   ├── db.py                # connection pool, DSN from env
│   ├── scoring.py           # normalize raw counts → 0-100
│   ├── dedupe.py            # fuzzy label dedupe (rapidfuzz, 85% threshold)
│   ├── sources/
│   │   ├── __init__.py
│   │   ├── base.py          # Source protocol: name, fetch(), normalize()
│   │   ├── agent_reach.py   # wraps agent-reach MCP
│   │   ├── tiktok.py        # subprocess tamnd/tiktok-cli
│   │   ├── social_apis.py   # wraps kawsarlog/social-media-apis
│   │   └── ad_library.py    # Meta Ad Library API
│   └── scheduler.py         # APScheduler, 6h cron
├── tests/
│   ├── conftest.py
│   ├── test_dedupe.py
│   ├── test_scoring.py
│   └── test_sources.py      # with VCR.py cassettes
└── ops/
    ├── healthcheck.sh
    └── prometheus.yml
```

`app/main.py` exposes:

- `GET /healthz` → `{ status: "ok", sources: ["agent_reach", "tiktok", ...], last_run_at: ISO }`
- `GET /metrics` → Prometheus text format
- `POST /v1/sync` → enqueue a job, return `{ jobId }`
- `GET /v1/feed` → proxy to Postgres

`app/scheduler.py` runs `run_for_workspace(workspace_id)` every 6h per workspace. Configured in `app/main.py` lifespan. If the sidecar restarts, the scheduler resumes from `trend_fetch_job.completed_at` — it does NOT re-fetch workspaces that have a success within the last 6h.

`docker-compose.yml` addition:

```yaml
trends:
  build: ./services/trends
  restart: unless-stopped
  env_file: .env
  environment:
    - TRENDS_DB_URL=${DATABASE_URL}
    - TRENDS_LOG_LEVEL=info
  ports:
    - "127.0.0.1:8010:8010" # only loopback; called from the app container
  volumes:
    - laratik-trends-data:/app/data # for VCR cassettes + scoring cache
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8010/healthz"]
    interval: 30s
    timeout: 5s
    retries: 3
```

### 1.5 UI components

**New files:**

- `src/app/(app)/app/w/[slug]/research/trends/page.tsx` — RSC, server-side fetch
- `src/app/(app)/app/w/[slug]/research/trends/trends-grid.tsx` — client component
- `src/components/trends/trend-card.tsx`
- `src/components/trends/trend-filters.tsx` (platform, time window)
- `src/components/trends/trends-empty-state.tsx`
- `src/components/trends/sync-trigger-button.tsx` (admin only)
- `src/app/api/trends/feed/route.ts`
- `src/app/api/trends/sync/route.ts`
- `src/app/api/trends/sync/[jobId]/route.ts`

**Updated files:**

- `src/app/(app)/app/w/[slug]/layout.tsx` — add "Trends" tab to the vertical sidebar (Stitch pattern from M0)
- `src/lib/ai/context.ts` — extend `loadAiContext()` to add `recentTrends: TrendSignal[]` (top 3, last 24h)
- `src/lib/ai/governance.ts` — add `"trend_radar"` to `AI_CAPABILITIES`; budget = `trend_radar_requests_per_day` (per user) + `trend_radar_requests_month` (per agency)

**Stitch design (new):** `designs/stitch/<id>_laratik---research-trends.html` + `.png`. Follows `studioflow---agency-ai-settings-approved.html` pattern (Tailwind CDN, arbitrary-value classes, design system colors). See Section 1.8 below for the layout.

### 1.6 Tests

- **Unit:** `services/trends/tests/test_dedupe.py` (fuzzy match), `test_scoring.py` (normalize 0-100).
- **Integration (sidecar):** `test_sources.py` with VCR cassettes for each source (recorded once, replayed forever; cassettes checked in to `services/trends/tests/cassettes/`).
- **Integration (app):** `src/lib/validation/trends.test.ts` — Zod schemas reject invalid input.
- **E2E:** `tests/e2e/trends.spec.ts` — admin clicks "Sync now", polls until success, trends appear on the tab; planner clicks a trend, sees the QuickCreate drawer with the label pre-filled.
- **Contract:** `tests/contract/trends-sidecar.test.ts` — fake sidecar implements the same OpenAPI spec; route uses the contract; never call the real sidecar from CI.

### 1.7 Governance + observability

- **Capability flag:** `trend_radar` added to `AI_CAPABILITIES` in `src/lib/ai/governance.ts:19-26`. Default off. The agency admin enables it in `/app/agency-settings/ai` (existing form, picks up the new toggle automatically via `AI_CAPABILITY_METADATA` in `src/lib/ai/capabilities.ts:104-174`).
- **Budget:** new `enforceAiBudget({ capability: "trend_radar", estimatedInputTokens: 0, estimatedOutputTokens: 0, ... })` call on every `POST /api/trends/sync`. Read counts (the `feed` route) do NOT count against budget — they are a read of a cached table. Daily per-user cap: 20 syncs. Monthly per-agency cap: 500 syncs.
- **Rate limit:** `enforceRateLimit({ limit: 30, windowSec: 60, key: "trends:feed" })` on the read route. The sync route is admin-only and rate-limited at 1/hour.
- **Audit:** every sync writes a `trend_fetch_job` row. Every feed read is NOT logged (privacy: we don't log who saw which trend).
- **Sentry:** only the sidecar reports to Sentry (`DSN_SENTRY_TRENDS`); the app side never logs trend data to Sentry.
- **Prometheus:** sidecar exports `trend_signals_fetched_total{platform}`, `trend_signals_score_avg{platform}`, `trend_fetch_job_duration_seconds`.

### 1.8 Stitch design

**Layout (1440px desktop, drawer 480px on quick-create):**

- **Top bar (existing):** workspace tabs (Overview / Planning / **Trends** / Calendar / Reviews / Social Channels / Brand Kit / Team) — Trends is new, sits between Planning and Calendar.
- **Page header:** "Trends" (28px Inter 600) + subtitle "Last 24 hours, ranked by platform signal strength." (14px Inter 400 text-muted) + right-aligned "Sync now" button (admin only) + last-sync timestamp.
- **Filter bar:** platform chips (All / X / Reddit / TikTok / Instagram / LinkedIn / YouTube) — pill-shaped, primary-subtle background when active, white with border when inactive.
- **Trends grid:** 3-column on desktop, 1-column on mobile. Each `TrendCard`:
  - Top row: platform badge (icon + label, 12px Inter 500) on the left, score badge (e.g. "🔥 87", 12px Inter 600) on the right.
  - Middle: `label` (16px Inter 600) — e.g. "#AIRevolution", "Alex Hormozi", "CapCut template X".
  - Bottom: topic-type chip + source URL (truncated, 13px Inter 400 text-muted) + "Use in brief" link button (40px standard, secondary outline).
- **Empty state:** "No trends yet." 14px Inter 400 text-muted, with an illustration slot.
- **Loading state:** 6 skeleton cards (placeholder shimmer, 1.5s loop).
- **Quick-create drawer (right, 480px):** pre-fills the brief with the trend label; planner edits the title, picks a format, picks channels, clicks "Create". Same `QuickCreateDrawer` pattern as `9794f1aa_northstar-coffee---quick-create-content-drawer.html`.

**Color usage:** primary `#3525cd` only for the active platform chip and the "Use in brief" CTA. Cards are white `#FFFFFF` on canvas `#F7F7F5`. Score badge uses `warning-subtle` background + `warning` text (orange).

### 1.9 Rollout + rollback

- **Phase 0 (dev):** merged to `main` with the agency database master switch disabled. Manual QA on a single workspace.
- **Phase 1 (canary):** 5% of agencies get a one-time email offering the feature, with a feature flag `trend_radar` in `aiFeatureSettings` defaulted to `false` (agency opts in).
- **Phase 2 (GA):** `trend_radar` toggle in the agency admin form, default off, documented in release notes.
- **Rollback:** `ALTER TABLE trend_signal DISABLE ROW LEVEL SECURITY;` (instant) + the feature flag at the route layer. The sidecar can be down indefinitely without breaking the app.

---

## 2. Feature 2 — Brand-aware Image Generation

**User story:** "As a planner, I want to generate an on-brand image for a `content_item` from the content detail page, so I don't have to switch to Canva/Firefly/Recraft and re-upload."

**Acceptance criteria:**

- New "Generate image" button on the content detail page, next to the §15 AI buttons.
- Modal with: aspect ratio (1:1, 9:16, 16:9, 4:5), provider (auto / Flux / gpt-image-1 / Qwen-Image / Ideogram), prompt editor, "Use brand references" toggle (default on).
- On submit: provider call → result lands in the existing media library as a draft asset → linked to the `content_item` → Insert / Replace / Copy / Try-again in the AI panel.
- Cost preview shown before submit ("Estimated cost: $0.04 (1k) / $0.17 (2k)").
- Failure: provider rejection surfaced verbatim; AI credit refunded; no auto-retry.
- The brand references are the top-3 hero images from the agency's Brand Kit, auto-selected at Brand Kit setup.

### 2.1 Architecture

```
Next.js 16 (App Router)                              Postgres 16
  Content detail page                                       ▲
  ┌────────────────────────────────────────────┐           │
  │ <GenerateImageButton> → opens modal        │           │
  │ <GenerateImageModal>                        │           │
  │   - aspect ratio                            │           │
  │   - provider                                │           │
  │   - prompt                                  │           │
  │   - "use brand references" (default on)     │           │
  │   - cost preview                            │           │
  │   - [Generate]                              │           │
  └────────────────┬───────────────────────────┘           │
                   │                                       │
                   ▼                                       │
   ┌────────────────────────────────────────────┐           │
   │ POST /api/ai/image/generate                │           │
   │ ┌──────────────────────────────────────┐   │           │
   │ │ 1. Auth (hasWorkspaceRole)           │   │           │
   │ │ 2. Resolve agency + feature settings │   │           │
   │ │ 3. Check capability "image_gen"      │   │           │
   │ │ 4. enforceAiBudget                   │   │           │
   │ │ 5. loadBrandReferences (top-3)       │   │           │
   │ │ 6. provider call                     │   │           │
   │ │    (Vercel AI SDK generateImage)      │   │           │
   │ │ 7. download + upload to S3           │   │           │
   │ │ 8. write image_generations row       │   │           │
   │ │ 9. write media_asset row             │   │           │
   │ │ 10. reconcileAiBudget                │   │           │
   │ │ 11. recordUsage                      │   │           │
   │ └──────────────────────────────────────┘   │           │
   └────────────────┬───────────────────────────┘           │
                   │                                       │
                   ▼                                       │
   Vercel AI SDK (TypeScript)                      Replicate / OpenAI /
   ┌────────────────────────────────────┐          Google / fal.ai / Recraft
   │ @ai-sdk/openai                     │  ──HTTP──►  (the actual providers)
   │ @ai-sdk/replicate                  │
   │ @ai-sdk/fal                        │
   │ @ai-sdk/google                     │
   │ @ai-sdk/anthropic (no image; prompt│
   │   engineering only)                │
   └────────────────────────────────────┘
```

### 2.2 Database schema

New file: `src/lib/db/schema/ai-image.ts`. Drizzle tables:

```ts
import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  index,
  real,
  pgEnum,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { users } from "./identity";
import { contentItems } from "./content";
import { mediaAssets } from "./media";

export const imageProviderEnum = pgEnum("image_provider", [
  "replicate",
  "openai",
  "google",
  "fal",
  "recraft",
  "ideogram",
]);

export const imageAspectRatioEnum = pgEnum("image_aspect_ratio", ["1:1", "9:16", "16:9", "4:5"]);

export const imageQualityEnum = pgEnum("image_quality", ["draft", "standard", "hero"]);

export const imageGenerations = pgTable(
  "image_generation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: imageProviderEnum("provider").notNull(),
    model: text("model").notNull(), // e.g. 'flux-1.1-pro', 'gpt-image-1'
    prompt: text("prompt").notNull(),
    aspectRatio: imageAspectRatioEnum("aspect_ratio").notNull(),
    quality: imageQualityEnum("quality").notNull().default("standard"),
    brandRefIds: jsonb("brand_ref_ids").$type<string[]>().notNull().default([]),
    status: text("status").notNull(), // 'pending' | 'success' | 'error' | 'rejected'
    errorCode: text("error_code"), // 'provider_rejected' | 'budget_exceeded' | 'rate_limited' | 'internal'
    errorMessage: text("error_message"), // redacted for user display
    costCents: integer("cost_cents"), // actual cost in USD cents
    durationMs: integer("duration_ms"),
    assetId: uuid("asset_id").references(() => mediaAssets.id, { onDelete: "set null" }),
    providerResponseId: text("provider_response_id"), // for provider-side dedupe
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    byContentItem: index("image_generation_content_item_idx").on(
      t.contentItemId,
      t.createdAt.desc(),
    ),
    byAgencyTime: index("image_generation_agency_time_idx").on(t.agencyId, t.createdAt.desc()),
    byUserTime: index("image_generation_user_time_idx").on(t.userId, t.createdAt.desc()),
  }),
);

export const brandReferenceSets = pgTable(
  "brand_reference_set",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // 'default' for v1
    heroAssetIds: jsonb("hero_asset_ids").$type<string[]>().notNull(), // top 3 from Brand Kit
    providerMeta: jsonb("provider_meta").notNull().default({}), // { recraft_style_id, ip_adapter_id, ... }
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byAgencyName: index("brand_reference_set_agency_name_idx").on(t.agencyId, t.name),
  }),
);
```

A new server-side cron (1 per day) computes the `brand_reference_set` from the agency's Brand Kit. Hook: on the existing Brand Kit "Save" action, invalidate the cache and recompute inline.

### 2.3 API contracts

**`POST /api/ai/image/generate`**

```ts
// Request
{
  contentItemId: string /* uuid */,
  provider?: 'auto' | 'replicate' | 'openai' | 'google' | 'fal' | 'recraft' | 'ideogram',
  model?: string,
  prompt: string /* 1-2000 chars, sanitized */,
  aspectRatio: '1:1' | '9:16' | '16:9' | '4:5',
  quality?: 'draft' | 'standard' | 'hero',
  useBrandReferences?: boolean,  // default true
  brandRefAssetIds?: string[],   // override; default = top 3 from brand_reference_set
}

// Response 200
{
  id: string /* image_generation.id */,
  status: 'success' | 'error' | 'rejected',
  assetId?: string /* media_assets.id */,
  url?: string /* signed S3 URL, 5 min TTL */,
  thumbnailUrl?: string,
  costCents: number,
  errorCode?: string,
  errorMessage?: string,
}

// Response 429 (budget exceeded)
{ error: 'budget_exceeded', resource: 'ai_image_month', currentUsage: N, limit: M }

// Response 403 (capability not enabled)
{ error: 'capability_disabled', capability: 'image_generation' }
```

**`GET /api/ai/image/[id]`** — for the AI panel "Try again" → re-fetch the result, also used by the dashboard.

**`POST /api/ai/image/estimate`** — cost preview before the user clicks "Generate".

```ts
// Request (same as generate minus the prompt execution)
{ provider, model, quality, aspectRatio }
// Response 200
{ estimatedCostCents: number, breakdown: { provider: number, processing: number } }
```

### 2.4 Library code

New file: `src/lib/ai/image.ts`.

```ts
import { generateImage } from "ai";
import { openai } from "@ai-sdk/openai";
import { replicate } from "@ai-sdk/replicate";
import { fal } from "@ai-sdk/fal";
import { google } from "@ai-sdk/google";
import { z } from "zod";

export const ImageGenInputSchema = z.object({
  prompt: z.string().min(1).max(2000),
  aspectRatio: z.enum(["1:1", "9:16", "16:9", "4:5"]),
  quality: z.enum(["draft", "standard", "hero"]).default("standard"),
  provider: z
    .enum(["auto", "replicate", "openai", "google", "fal", "recraft", "ideogram"])
    .default("auto"),
  model: z.string().optional(),
  brandRefUrls: z.array(z.string().url()).max(3).optional(),
});

export interface ImageGenResult {
  assetId: string;
  url: string;
  costCents: number;
  provider: string;
  model: string;
  providerResponseId: string;
}

export async function generateOnBrandImage(
  input: z.infer<typeof ImageGenInputSchema>,
): Promise<ImageGenResult> {
  // 1. sanitize prompt (promptSanitizer)
  // 2. resolve provider (auto → heuristic by aspect + prompt)
  // 3. call Vercel AI SDK generateImage
  // 4. download result buffer
  // 5. upload to S3 (existing media library)
  // 6. write media_assets row
  // 7. return ImageGenResult
}
```

Provider cost matrix (hardcoded, refreshed via `pnpm run costs:sync` daily):

| Provider  | Model                  | Draft (1k) | Standard (1k) | Hero (2k) |
| --------- | ---------------------- | ---------: | ------------: | --------: |
| replicate | flux-1.1-pro           |      $0.05 |         $0.05 |     $0.20 |
| replicate | prunaai/p-image        |     $0.003 |           n/a |       n/a |
| replicate | qwen-image-3-pro       |      $0.04 |         $0.04 |     $0.12 |
| openai    | gpt-image-1            |      $0.04 |         $0.04 |     $0.17 |
| google    | gemini-2.5-flash-image |      $0.02 |         $0.02 |     $0.05 |
| fal       | flux-dev               |      $0.03 |         $0.03 |     $0.12 |
| recraft   | v3                     |      $0.08 |         $0.08 |     $0.25 |
| ideogram  | v3                     |      $0.05 |         $0.05 |     $0.10 |

### 2.5 UI components

**New files:**

- `src/components/ai/generate-image-button.tsx` — sits beside the existing §15 buttons on the content detail page
- `src/components/ai/generate-image-modal.tsx` — the form
- `src/components/ai/generate-image-result.tsx` — Insert / Replace / Copy / Try-again (mirrors §15 pattern)
- `src/components/ai/brand-reference-picker.tsx` — checkbox grid of the agency's top-3 hero assets

**Updated files:**

- `src/app/(app)/app/w/[slug]/content/[id]/page.tsx` — add the new button to the existing AI section
- `src/lib/ai/capabilities.ts` — add `"image_generation"` to `AiCapabilityId` + `AI_CAPABILITY_METADATA`
- `src/lib/ai/governance.ts` — add to `AI_CAPABILITIES`
- `src/lib/db/schema/index.ts` — re-export `imageGenerations`, `brandReferenceSets`
- `package.json` — add `@ai-sdk/openai`, `@ai-sdk/replicate`, `@ai-sdk/fal`, `@ai-sdk/google`, `ai` (Vercel AI SDK 5)
- `.env.example` — `REPLICATE_API_KEY`, `FAL_KEY`, `GOOGLE_AI_API_KEY`, `OPENAI_API_KEY` (optional, agency-configurable per provider)
- `src/app/api/agency/ai-settings/route.ts` — add `image_generation` toggle to the form schema (auto-rendered via `AI_CAPABILITY_METADATA`)

### 2.6 Tests

- **Unit:** `src/lib/ai/image.test.ts` — sanitize rejects injection, provider resolution, cost matrix correctness.
- **Integration:** `src/app/api/ai/image/generate/route.test.ts` — uses a fake `Vercel AI SDK` provider (mocked), tests: budget enforcement, capability allow-list, success / error / rejected paths, asset link to `media_assets`.
- **E2E:** `tests/e2e/image-gen.spec.ts` — planner opens modal, picks aspect, clicks Generate, sees the result inserted into the brief.
- **Contract:** `tests/contract/image-provider.test.ts` — fake providers for each vendor, never call paid APIs from CI.

### 2.7 Governance + observability

- **Capability flag:** `image_generation` in `AI_CAPABILITIES` (default off). Agency admin enables it in the existing settings form.
- **Budget:**
  - Per user: `image_gen_per_day` (default 30)
  - Per agency: `image_gen_per_month` (default 500)
  - Per agency: `image_cost_cents_per_month` (default $300 = 30,000 cents) — this is the actual $ budget, not the request count. `enforceAiBudget` extends to accept `estimatedCostCents` instead of tokens.
- **Rate limit:** `enforceRateLimit({ limit: 10, windowSec: 60, key: "ai:image:gen" })`.
- **Audit:** every generation writes an `image_generation` row + an `ai_usage_events` row. The provider response id is stored for dedupe.
- **Sentry:** `breadcrumbs` only, never the prompt or the result image. Tag: `capability:image_generation`, `provider`, `model`, `aspectRatio`.
- **Prometheus:** `ai_image_generation_total{provider, model, status}`, `ai_image_generation_cost_cents_total{provider}`, `ai_image_generation_duration_seconds`.

### 2.8 Stitch design

**New screen:** `designs/stitch/<id>_laratik---ai-image-generate.html` + `.png`.

- **Trigger:** small button (40px standard, secondary outline, icon: `auto_awesome`) on the content detail page, next to the existing §15 buttons.
- **Modal:** 560px wide, centered, white background, canvas backdrop at 50% opacity. Header: "Generate image" (20px Inter 600), close X top-right. Body: 4 form sections (aspect, provider, prompt, brand refs), each 16px padded. Footer: cost preview (left) + [Cancel] [Generate] (right).
- **Aspect ratio selector:** 4 horizontal chips, each showing a wireframe rect of the right shape (1:1 square, 9:16 tall, 16:9 wide, 4:5 mid-tall). Active state: primary-subtle bg + primary text + primary border. Inactive: white + outline.
- **Provider selector:** 6 horizontal chips (auto / Flux / GPT-Image / Qwen / Ideogram / Recraft). Auto is the default.
- **Prompt editor:** full-width textarea, 4 lines, monospace `text-[14px]`, with a small character counter (e.g. `120 / 2000`) at the bottom-right.
- **Brand references:** 3 thumbnails in a row, each 80px square, with a checkbox overlay. Top of section: "Use brand references" master toggle. Subtitle: "Top 3 hero images from your Brand Kit. Used by the model to match style."
- **Cost preview:** `Estimated cost: $0.04` in 13px Inter 500 text-muted, with a small "i" icon. When `quality=hero`, shows `$0.17` in warning color.
- **Loading state:** modal stays open, button disabled, replaced by a spinner + "Generating… (this can take up to 30 seconds)". Cancel button remains active.
- **Result panel:** replaces the form. Shows the generated image (square 240px), "Insert" primary button + "Replace" secondary + "Copy URL" link + "Try again" link. Below: provider + model + cost metadata in 12px Inter 400 text-muted.

### 2.9 Rollout + rollback

- **Phase 0 (dev):** default off, manual QA with 1 internal workspace.
- **Phase 1 (canary):** the "Pro" plan tier gets the feature enabled by default; "Starter" gets it disabled.
- **Phase 2 (GA):** all plan tiers, agency opt-in.
- **Rollback:** flip the capability off in `aiFeatureSettings`; the route refuses with 403. The sidecar code is feature-flagged, so a code rollback to the previous commit is also safe.

---

## 3. Feature 3 — Reel Generator + AI Subtitle

**User story (Reel):** "As a planner, from any `content_item` with format ∈ {`short_form_video`, `long_form_video`}, I want to click 'Make Reel' and get back a 9:16 vertical Reel with B-roll, voice, music, and burned-in kinetic captions."

**User story (Subtitle):** "As a planner, on any uploaded video in the media library, I want to click 'Add subtitles' and get back a subtitled version with word-level kinetic captions."

**Acceptance criteria:**

- Reel Generator: 5-step pipeline (script → B-roll → voice → music → caption burn-in). Each step is recoverable; failure of one step doesn't kill the whole job.
- Cheap tier (Pexels + Suno + ElevenLabs + faster-whisper) is the default; cost ~$0.10/Reel.
- Premium tier (Replicate Veo 3 / Sora 2 / Kling 2.1 for AI B-roll) is opt-in, cost preview shown before submit.
- Subtitle feature: takes an existing media asset, returns an SRT + burned-in MP4.
- All sidecar steps are observable via SSE; UI shows "Step 4/9 — Generating voice (30s)" with a live progress bar.

### 3.1 Architecture

```
Next.js 16 (App Router)                              Postgres 16
  Content detail page                                       ▲
  ┌────────────────────────────────────────────┐           │
  │ <MakeReelButton> (format = video)          │           │
  │ <MakeReelModal>                            │           │
  │ <ReelProgressPanel> (SSE)                  │           │
  │ <ReelResultPanel>                          │           │
  │                                            │           │
  │ <AddSubtitlesButton> (any video asset)     │           │
  │ <SubtitlesResultPanel>                     │           │
  └────────────────┬───────────────────────────┘           │
                   │                                       │
                   ▼                                       │
   ┌────────────────────────────────────────────┐           │
   │ POST /api/ai/reel/generate                 │           │
   │ GET  /api/ai/reel/[id]/stream (SSE)        │           │
   │ GET  /api/ai/reel/[id]                     │           │
   │ POST /api/ai/subtitles                     │           │
   └────────────────┬───────────────────────────┘           │
                   │                                       │
                   ▼                                       │
   services/reels/ (Python 3.12, FastAPI)             ┌────┴────┐
   ┌────────────────────────────────────────────┐    │ S3      │
   │  Step 1: script  — MiniMax (existing)      │    │ (audio, │
   │  Step 2: b-roll  — Pexels (free, 200/hr)   │    │  video, │
   │                + Pixabay (fallback)        │    │  caption│
   │  Step 3: voice   — ElevenLabs / Suno audio │    │  files) │
   │  Step 4: music   — Suno v4 (paid)          │    └─────────┘
   │  Step 5: avatar  — D-ID (opt, paid)        │
   │                or LivePortrait (self-host) │
   │  Step 6: transcribe — faster-whisper       │
   │  Step 7: stitch  — moviepy + ffmpeg        │
   │  Step 8: caption alignment — whisperx      │
   │  Step 9: render  — ffmpeg ass filter       │
   │  + Replicate router (premium opt-in):      │
   │    Veo 3 / Sora 2 / Kling 2.1 / Wan 2.2   │
   │    for AI-generated B-roll                 │
   └────────────────────────────────────────────┘
```

### 3.2 Database schema

New file: `src/lib/db/schema/ai-reel.ts`:

```ts
import { pgTable, uuid, text, timestamp, jsonb, integer, index, pgEnum } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { users } from "./identity";
import { contentItems } from "./content";
import { mediaAssets } from "./media";

export const reelProviderTierEnum = pgEnum("reel_provider_tier", ["cheap", "premium"]);
export const reelJobStatusEnum = pgEnum("reel_job_status", [
  "queued",
  "running",
  "success",
  "error",
  "cancelled",
]);

export const reelJobs = pgTable(
  "reel_job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentItemId: uuid("content_item_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: reelJobStatusEnum("status").notNull().default("queued"),
    tier: reelProviderTierEnum("tier").notNull().default("cheap"),
    durationSec: integer("duration_sec").notNull().default(15), // 15, 30, 60
    voiceProvider: text("voice_provider"), // 'elevenlabs' | 'none' | 'upload'
    musicProvider: text("music_provider"), // 'suno' | 'none' | 'upload'
    avatarProvider: text("avatar_provider"), // 'did' | 'liveportrait' | 'none'
    brollProvider: text("broll_provider"), // 'pexels' | 'pixabay' | 'replicate' | 'none'
    captionProvider: text("caption_provider").notNull().default("faster_whisper"),
    script: text("script"), // LLM-generated
    brollAssetIds: jsonb("broll_asset_ids").$type<string[]>().notNull().default([]),
    voiceUrl: text("voice_url"),
    musicUrl: text("music_url"),
    avatarUrl: text("avatar_url"),
    captionsVttUrl: text("captions_vtt_url"),
    outputAssetId: uuid("output_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    costEstimateCents: integer("cost_estimate_cents").notNull(), // shown before submit
    costActualCents: integer("cost_actual_cents"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    stepLog: jsonb("step_log")
      .$type<Array<{ step: string; status: string; durationMs: number; at: string }>>()
      .notNull()
      .default([]),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    byContentItem: index("reel_job_content_item_idx").on(t.contentItemId, t.createdAt.desc()),
    byAgencyStatus: index("reel_job_agency_status_idx").on(t.agencyId, t.status),
    byUserTime: index("reel_job_user_time_idx").on(t.userId, t.createdAt.desc()),
  }),
);

export const reelSubtitleJobs = pgTable(
  "reel_subtitle_job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceAssetId: uuid("source_asset_id")
      .notNull()
      .references(() => mediaAssets.id, { onDelete: "cascade" }),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: reelJobStatusEnum("status").notNull().default("queued"),
    language: text("language").default("en"), // BCP-47; auto-detect if null
    model: text("model").notNull().default("faster-whisper-large-v3"),
    outputSrtUrl: text("output_srt_url"),
    outputVttUrl: text("output_vtt_url"),
    outputAssetId: uuid("output_asset_id").references(() => mediaAssets.id, {
      onDelete: "set null",
    }),
    costActualCents: integer("cost_actual_cents").notNull().default(0), // always 0 (self-host whisper)
    durationMs: integer("duration_ms"),
    stepLog: jsonb("step_log")
      .$type<Array<{ step: string; status: string; durationMs: number; at: string }>>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => ({
    bySource: index("reel_subtitle_job_source_idx").on(t.sourceAssetId, t.createdAt.desc()),
  }),
);
```

### 3.3 API contracts

**`POST /api/ai/reel/generate`**

```ts
// Request
{
  contentItemId: string,
  tier: 'cheap' | 'premium',
  durationSec: 15 | 30 | 60,
  voice: { provider: 'elevenlabs' | 'none' | 'upload', voiceId?: string, audioUrl?: string },
  music: { provider: 'suno' | 'none' | 'upload', genre?: string, trackUrl?: string },
  avatar: { provider: 'did' | 'liveportrait' | 'none', presenterAssetId?: string },
  broll: { provider: 'pexels' | 'pixabay' | 'replicate', model?: string /* Replicate model id */ },
  captions: { style: 'kinetic' | 'subtitle', position: 'bottom' | 'center' | 'top' },
  costAccepted: boolean,  // explicit user consent for the premium cost
}

// Response 202
{ jobId: string, sseUrl: string /* /api/ai/reel/[id]/stream */ }
```

**`GET /api/ai/reel/[id]/stream`** — Server-Sent Events, `text/event-stream`.

```
event: step
data: {"step": 1, "name": "script", "status": "running", "durationMs": 0}

event: step
data: {"step": 1, "name": "script", "status": "success", "durationMs": 1200}

event: step
data: {"step": 2, "name": "broll", "status": "running", "durationMs": 0}

...

event: done
data: {"jobId": "...", "status": "success", "outputAssetId": "...", "url": "https://..."}

event: error
data: {"code": "provider_rejected", "message": "..."}
```

**`POST /api/ai/subtitles`**

```ts
// Request
{
  sourceAssetId: string,
  language?: string /* BCP-47, default auto */,
  model?: 'faster-whisper-tiny' | 'faster-whisper-base' | 'faster-whisper-large-v3',
  burnIn: boolean,
}

// Response 202
{ jobId: string, sseUrl: string }
```

### 3.4 Python sidecar

Path: `services/reels/`. Files:

```
services/reels/
├── Dockerfile
├── pyproject.toml
├── README.md
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app
│   ├── routes.py
│   ├── steps/
│   │   ├── __init__.py
│   │   ├── script.py        # calls MiniMax (or local LLM)
│   │   ├── broll.py         # Pexels, Pixabay, Replicate
│   │   ├── voice.py         # ElevenLabs
│   │   ├── music.py         # Suno
│   │   ├── avatar.py        # D-ID, LivePortrait
│   │   ├── transcribe.py    # faster-whisper
│   │   ├── align.py         # whisperx
│   │   ├── stitch.py        # moviepy
│   │   └── render.py        # ffmpeg ass filter
│   ├── state.py             # JobState machine, recoverable
│   ├── streaming.py         # SSE writer
│   └── llm_client.py        # MiniMax Anthropic-compat client
├── tests/
│   ├── conftest.py
│   ├── test_steps.py        # per-step unit tests
│   ├── test_state.py        # recovery
│   └── cassettes/
└── ops/
    └── healthcheck.sh
```

`app/main.py` exposes:

- `GET /healthz`
- `GET /metrics`
- `POST /v1/reel` → `{ jobId, sseUrl }`
- `GET /v1/reel/[id]/stream` → SSE
- `POST /v1/subtitles` → `{ jobId, sseUrl }`

Each step is idempotent and re-runnable. The state machine persists every transition; a crashed job is recovered by re-running from the last successful step.

`docker-compose.yml` addition:

```yaml
reels:
  build: ./services/reels
  restart: unless-stopped
  env_file: .env
  environment:
    - REELS_DB_URL=${DATABASE_URL}
    - REELS_PEXELS_API_KEY=${PEXELS_API_KEY}
    - REELS_ELEVENLABS_API_KEY=${ELEVENLABS_API_KEY}
    - REELS_SUNO_API_KEY=${SUNO_API_KEY}
    - REELS_DID_API_KEY=${DID_API_KEY}
    - REELS_REPLICATE_API_KEY=${REPLICATE_API_KEY}
    - REELS_MINIMAX_BASE_URL=${MINIMAX_BASE_URL}
    - REELS_MINIMAX_API_KEY=${MINIMAX_API_KEY}
  ports:
    - "127.0.0.1:8011:8011"
  volumes:
    - laratik-reels-data:/app/data # for whisper models cache (~150 MB for large-v3)
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:8011/healthz"]
    interval: 30s
    timeout: 5s
    retries: 3
  deploy:
    resources:
      limits:
        memory: 4G # whisper + ffmpeg + moviepy peak
```

### 3.5 UI components

**New files:**

- `src/components/ai/make-reel-button.tsx` — on content detail page, only when `format ∈ {short_form_video, long_form_video}`
- `src/components/ai/make-reel-modal.tsx` — the form (tier, duration, voice, music, avatar, B-roll, captions, cost preview, accept-cost checkbox)
- `src/components/ai/reel-progress-panel.tsx` — SSE consumer, 9 steps, each with a status icon
- `src/components/ai/reel-result-panel.tsx` — video player + Insert / Replace / Copy / Try-again
- `src/components/ai/add-subtitles-button.tsx` — on every video asset
- `src/components/ai/subtitles-progress-panel.tsx` — 3 steps (audio extract → transcribe → burn-in)
- `src/components/ai/subtitles-result-panel.tsx`
- `src/app/api/ai/reel/generate/route.ts`
- `src/app/api/ai/reel/[id]/route.ts`
- `src/app/api/ai/reel/[id]/stream/route.ts`
- `src/app/api/ai/subtitles/route.ts`
- `src/app/api/ai/subtitles/[id]/route.ts`
- `src/app/api/ai/subtitles/[id]/stream/route.ts`

**Updated files:**

- `src/lib/ai/capabilities.ts` — add `"reel_generation"`, `"subtitle_generation"`
- `src/lib/ai/governance.ts` — add to `AI_CAPABILITIES`
- `src/lib/db/schema/index.ts` — re-export `reelJobs`, `reelSubtitleJobs`
- `src/app/(app)/app/w/[slug]/content/[id]/page.tsx` — conditionally render `<MakeReelButton>` based on format
- `src/components/media/video-asset-actions.tsx` — add `<AddSubtitlesButton>` to the action menu
- `.env.example` — add all the new provider keys
- `src/components/ai/ai-assistance-section.tsx` — slot the new buttons next to the existing §15

### 3.6 Tests

- **Unit (sidecar):** each `app/steps/test_*.py` mocks external services (Pexels, ElevenLabs, Suno, MiniMax) and verifies the step's input/output contract.
- **Integration (sidecar):** `test_state.py` — verify the state machine recovers from each failure point (e.g. ffmpeg dies at step 7 → restart from step 7).
- **Unit (app):** `src/app/api/ai/reel/generate.test.ts` — capability allow-list, budget, rate limit, cost-accept gate.
- **E2E:** `tests/e2e/reel.spec.ts` — planner clicks Make Reel, picks cheap tier, watches the progress panel, gets the result. A second test for premium tier with cost-accept.
- **E2E:** `tests/e2e/subtitles.spec.ts` — planner uploads a 30s video, clicks Add Subtitles, sees the SRT + burned-in MP4.
- **Contract:** `tests/contract/reel-sidecar.test.ts` — fake sidecar implements the OpenAPI spec.

### 3.7 Governance + observability

- **Capability flags:** `reel_generation` + `subtitle_generation` (default off for both; `subtitle_generation` is cheap enough to be on by default in a later phase).
- **Budget:**
  - Per user: `reel_gen_per_day` (default 5)
  - Per agency: `reel_gen_per_month` (default 50)
  - Per agency: `reel_cost_cents_per_month` (default $50 = 5,000 cents for cheap tier; $500 for premium)
  - Subtitle: per-agency monthly only (no daily cap; the cost is essentially zero)
- **Rate limit:** `enforceRateLimit({ limit: 5, windowSec: 60, key: "ai:reel:gen" })`.
- **Audit:** every job writes a `reel_job` row. Every step transition writes to `step_log` (jsonb). Every SSE event is logged to pino with `requestId`.
- **Sentry:** `breadcrumbs` only; never the script, voice audio, or rendered video. Tag: `capability:reel_generation`, `tier`, `durationSec`, `step`.
- **Prometheus:** `ai_reel_job_total{tier, status}`, `ai_reel_job_duration_seconds{tier, step}`, `ai_reel_job_cost_cents_total{tier, provider}`.

### 3.8 Stitch design

**New screen:** `designs/stitch/<id>_laratik---ai-reel-generate.html` + `.png`.

- **Trigger:** "Make Reel" primary button (40px, primary bg) on the content detail page when format = `short_form_video` or `long_form_video`. Icon: `movie_filter`.
- **Modal (560px):** header "Make Reel" + close X. Body sections (in order):
  1. **Duration:** segmented control (15s / 30s / 60s) — 15s is default.
  2. **Tier:** 2 large cards side-by-side. Cheap: $0.10/Reel + "Pexels B-roll + Suno + ElevenLabs". Premium: $2.50+ /Reel + "AI B-roll (Replicate router)".
  3. **Voice:** radio group (None / ElevenLabs (Sarah, Adam, 8 voices) / Upload my own). Subtitle: "Detected language: en. Audio will be generated from the script."
  4. **Music:** radio group (None / Suno v4 / Upload). Sub-genre chips below when Suno is picked.
  5. **Avatar:** radio group (None / D-ID presenter / LivePortrait self-host). Hidden when format = `static_post` or `carousel`.
  6. **B-roll:** radio group (Pexels / Pixabay / Replicate AI). Subtitle under Replicate: "Default: Veo 3 Fast (~$2.50/Reel)."
  7. **Captions:** checkbox "Burn in kinetic captions" (default on). Style sub-options: position (top/center/bottom), font size.
  8. **Cost preview:** `$0.10` (cheap) or `$2.50` (premium) — 24px Inter 600 + subtitle "Estimated; final cost may vary ±20%."
  9. **Cost-accept checkbox** (premium only): "I accept that this Reel will cost $2.50+ and consume the agency's AI budget."
- **Footer:** [Cancel] [Generate] (right-aligned).
- **Progress panel (replaces modal on submit):** vertical stepper, 9 steps, each with a status icon (pending / running / success / error). Running step has a spinner; success has a green check; error has a red X with a tooltip. Live duration counter at the top: "12.3s elapsed". Step 9 ends with the "Done — preview your Reel" CTA.
- **Result panel:** video player (480px wide, 9:16), "Insert" primary + "Replace" secondary + "Copy URL" + "Try again" (re-runs with the same settings). Below the player: provider + tier + cost metadata.
- **Subtitle feature UI:** same as Reel but only 3 steps, no tier choice, free.

### 3.9 Rollout + rollback

- **Phase 0 (dev):** default off, manual QA on internal workspace.
- **Phase 1 (canary):** Pro plan tier only, opt-in.
- **Phase 2 (GA):** all plan tiers, opt-in. Subtitle is auto-enabled for all tiers (it's free).
- **Rollback:** the capability flag; the sidecar is independent. A sidecar crash only blocks new Reel/Subtitle jobs; existing jobs in `running` state get marked `error` after 5 min timeout.

---

## 4. The 5 existing-feature improvements

### 4.1 Improvement A — `caption_drafts` produces 3 variants

**Files to change:**

- `src/app/api/ai/generate/route.ts` — modify the `caption_drafts` switch branch (around line 200-250) to call `draftCaption()` 3 times with different `temperature` values (0.7, 0.9, 1.1).
- `src/lib/ai/index.ts` — update `draftCaption()` to accept an optional `variantIndex: 0|1|2` parameter (or keep the existing function and add a new `draftCaptionVariants()`).
- `src/lib/ai/capabilities.ts` — update `caption_drafts` metadata `willUpdate` to `["caption", "hashtags", "caption_variants"]` and add a new `variants: string[]` to the response shape.
- `src/components/ai/caption-drafts-panel.tsx` — render the 3 variants as tabs (Variant 1, Variant 2, Variant 3) with the existing Insert / Replace / Copy / Try-again pattern. Add "Why these differ?" tooltip explaining the temperature variation.

**Response shape (backward-compatible):**

```ts
{ text: string /* the first variant, for backward compat */, variants: [string, string, string] }
```

**Test:** `tests/contract/caption-variants.test.ts` — verify 3 calls to `chat()`, 3 different temperatures, 3 distinct (or near-distinct) texts.

**Effort:** 0.5 dev-day.

### 4.2 Improvement B — Brand voice in system block

**Files to change:**

- `src/lib/ai/index.ts` — modify `buildImproveBriefSystemPrompt()` and `draftCaption()` to take a new `voiceGuidance: string` parameter and prepend it to the system message (NOT the user message).
- `src/lib/ai/voice-guidance.ts` (new) — exports `renderVoiceGuidance(brandKit, locale)` returning the formatted voice string.
- `src/app/api/ai/generate/route.ts` — call `renderVoiceGuidance()` from `loadAiContext()` and pass it to the new system-block parameter.
- `src/lib/ai/capabilities.ts` — add `voice_guidance` to the `willUpdate` / `willNotChange` arrays for `caption_drafts`, `brief_improvement`, `completeness_check`.

**The voice guidance string (example):**

```
Brand voice (these are hard constraints — follow them exactly):
- tone: [authoritative, witty, warm]
- do: [use "we" not "I", reference data with citations, end with a question]
- don't: [no emojis, no exclamation marks after the first sentence, no "just" / "simply" / "obviously"]
- register: [professional, Gulf Arabic preferred when locale=ar-AE]
- anti-patterns: [vague claims, "in today's world", "let me tell you", "game-changer"]
```

**Test:** `tests/contract/voice-guidance.test.ts` — verify the system message contains the voice rules, not the user message; verify the `Will not change: brand_voice` contract.

**Effort:** 0.5 dev-day.

### 4.3 Improvement C — Viral-potential ranker for `related_format_ideas`

**Files to change:**

- `src/lib/ai/index.ts` — modify the `related_format_ideas` branch in `chat()` to call `/v1/score` (the new sidecar route, see below) after the LLM returns.
- `services/scoring/` (new Python sidecar) — wraps `kishan-arya/Content-diffusion-simulator`. Exposes `POST /v1/score { brief, formats, targetPlatform } → { scores: { format, score }[] }`.
- `src/lib/ai/score.ts` (new) — TS client for the sidecar.
- `src/lib/ai/capabilities.ts` — `related_format_ideas` metadata `hint` becomes "3-5 format suggestions, ranked by predicted viral potential."

**Response shape (new field):**

```ts
{
  text: string,
  variants: string[],
  scores: { format: string, score: number /* 0-100 */ }[]
}
```

**Test:** `tests/contract/viral-score.test.ts` — fake sidecar returns known scores; verify the route sorts variants by score descending.

**Effort:** 1 dev-day (0.5 for the sidecar skeleton + 0.5 for the route + tests).

### 4.4 Improvement D — Brand-voice penalty in `completeness_check`

**Files to change:**

- `src/lib/ai/index.ts` — `checkCompleteness()` system prompt gets a new clause: "If the brief contradicts the Brand Kit voice rules, deduct 20 points and add the violation to the 'Missing' list. Reference the rule by name."
- `src/lib/ai/capabilities.ts` — `completeness_check` metadata `hint` becomes "Score 0-100, missing pieces, AND any brand-voice violations. — 20 points per violation."

**Test:** `tests/contract/completeness-voice.test.ts` — fixture with a brief that violates a voice rule; expect score ≤ 80 and the rule name in `Missing`.

**Effort:** 0.25 dev-day.

### 4.5 Improvement E — Platform rules as a data table

**Files to change:**

- `src/lib/db/schema/platform-rules.ts` (new) — `platformAdapatationRules` table: `(id, platform, maxLength, hashtagDensity, hookRule, paragraphStyle, linkRule, createdAt, updatedAt)`. RLS by `agency_id` for per-agency overrides + a global `is_default` flag for the system defaults.
- `scripts/seed-platform-rules.ts` (new) — seed the 10 platforms from `src/lib/channels/command.ts:4-15` with sensible defaults.
- `src/lib/ai/index.ts` — `platformAdapt()` system prompt builder reads the rule from the table instead of an `if/else` chain.
- `src/app/(app)/app/agency-settings/platform-rules/page.tsx` (new) — admin UI to view + override the rules per agency. Uses the existing DataTable component.
- `src/components/ai/platform-adaptation-panel.tsx` — when the planner picks a target platform, the rule is shown as a small "Why this rewrite?" disclosure.

**Default rules (seeded):**

| platform  | maxLength          | hashtagDensity | hookRule              | paragraphStyle               | linkRule       |
| --------- | ------------------ | -------------- | --------------------- | ---------------------------- | -------------- |
| x         | 280                | low (0-2)      | front-load            | single                       | allowed        |
| linkedin  | 3000               | low (3-5)      | first-line insight    | short paragraphs (1-3 lines) | allowed        |
| instagram | 2200               | high (5-15)    | first 125 chars       | line-broken                  | not in caption |
| tiktok    | 4000               | high (3-5)     | spoken delivery       | short sentences              | not in caption |
| facebook  | 5000               | low (1-3)      | question or stat      | single paragraph             | allowed        |
| youtube   | 5000 (description) | mid (3-5)      | title + first 2 lines | structured                   | in description |
| threads   | 500                | low (0-2)      | single thought        | single                       | not in body    |
| pinterest | 500                | high (5-10)    | keyword-front         | structured                   | in description |
| snapchat  | 200                | low (0-1)      | first 30 chars        | single                       | not in caption |
| other     | 2200               | mid (3-5)      | flexible              | flexible                     | allowed        |

**Test:** `tests/contract/platform-rules.test.ts` — verify the system prompt renders the rule; verify the admin CRUD on the table; verify the agency override wins over the default.

**Effort:** 1 dev-day.

---

## 5. Architecture additions (cross-cutting)

### 5.1 Three new sidecars

```
services/
├── trends/        # Feature 1 (port 8010)
├── reels/         # Feature 3 (port 8011)
├── scoring/       # Improvement C (port 8012)
└── qa/            # Future (Improvement in v2; port 8013)
```

All share the same skeleton (FastAPI, `pyproject.toml`, Dockerfile, `/healthz`, `/metrics`, `/v1/...` JSON, SSE where needed). A `services/_template/` directory captures the convention so future sidecars can be scaffolded in 30 min.

### 5.2 Provider abstraction

`src/lib/ai/providers.ts` (new) — single source of truth for the AI provider allow-list per agency. Each agency has a `providerConfig` row (new table) that records which providers are enabled + the encrypted key reference. The existing `loadManagedAiSecret` pattern from `src/lib/ai/provider-secret.ts` is reused.

New schema: `src/lib/db/schema/provider-config.ts` (probably already exists; verify before adding).

### 5.3 `enforceAiBudget` extension

The existing `enforceAiBudget` (in `src/lib/ai/governance.ts:256-394`) takes `estimatedInputTokens` and `estimatedOutputTokens`. Extend to also accept an optional `estimatedCostCents: number`. If provided, the budget is enforced against the agency's `image_cost_cents_per_month` or `reel_cost_cents_per_month` counter, not the token counter.

Backward compatible: existing callers that pass only tokens still work. The new image / reel routes pass cost instead.

### 5.4 Capability metadata extension

The `AiCapabilityMetadata` in `src/lib/ai/capabilities.ts:104-174` is the single source of truth for the agency admin form. Adding a new capability is a single insertion. The form auto-renders the new toggle, the content detail page auto-renders the new button (when `enabledOnContentDetail: true`), and the route's `switch` handles the new case.

The 3 new capabilities:

```ts
{ id: "image_generation", label: "Generate image", adminLabel: "Image generation",
  description: "Generate on-brand images for this content item from the §15 prompt surface.",
  enabledOnContentDetail: true, hint: "Picks a provider, calls it, inserts the result." },
{ id: "reel_generation", label: "Make Reel", adminLabel: "Reel generation",
  description: "Turn a content item into a vertical Reel with B-roll, voice, music, and captions.",
  enabledOnContentDetail: true, hint: "Cheap tier $0.10/Reel; premium tier $2.50+." },
{ id: "subtitle_generation", label: "Add subtitles", adminLabel: "Subtitle generation",
  description: "Auto-add kinetic captions to any uploaded video.",
  enabledOnContentDetail: true, hint: "Free, self-hosted faster-whisper." },
```

### 5.5 Observability

- **Sentry:** new tags: `capability`, `provider`, `model`, `aspectRatio`, `tier`, `durationSec`. New breadcrumb types: `ai.reel.step`, `ai.image.provider_call`, `ai.trends.sync`.
- **Prometheus:** new metrics (one per capability) under the `ai_` namespace. The existing `AGENTS.md` doesn't have a Prometheus setup yet; this plan introduces the convention.
- **Logs:** pino with `requestId`, `agencyId`, `userId`, `capability`, `provider`, `costCents`. Never log the prompt or the result.

### 5.6 Security + privacy

- **Prompt sanitizer:** the existing `promptSanitizer` (used for the text LLM) is also applied to the image prompt. A user pasting "ignore previous instructions and…" into the image prompt is rejected with a 400.
- **Content moderation:** the provider's rejection is surfaced verbatim; the credit is refunded. No auto-retry (a rejection means the user asked for something the provider won't produce).
- **PII detection:** before any caption is sent to the LLM, run `microsoft/presidio` (existing recommendation) on the brief; redact PII before the call. (Future v2.)
- **Brand reference isolation:** the agency's brand_reference_set is `agency_id` RLS-locked. Cross-tenant access is impossible.
- **Sidecar auth:** every sidecar requires `X-Service-Token: ${LARATIK_SERVICE_TOKEN}` from the app container. Tokens are rotated quarterly.

### 5.7 i18n (bilingual contract §22)

- **Provider language code:** when generating text or voice, the locale (`agency_locale`) is passed to the provider. ElevenLabs gets a `language_code` (e.g. `ar-AE`); Replicate gets a "respond in Arabic" instruction in the prompt.
- **MENA register:** the `agency-agents-ar` Arabic fork's Gulf Arabic register is the default for `locale=ar-AE` and `locale=ar-SA`; Egyptian register for `locale=ar-EG`. (Add per-locale personas as a follow-up.)
- **UI strings:** every new string is added to `src/messages/en.json` and `src/messages/ar.json`. The Plan's bilingual check (per the workflow in `AGENTS.md`) must pass.

---

## 6. Sprint-by-sprint task list

### Sprint 1 (week 1) — Foundations + improvements A, B, D + agency-agents port

| ID    | Task                                                                                                                           | Owner | Deps  | Estimate |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ | ----- | ----- | -------- |
| T-101 | Port 6 personas from `agency-agents` + Arabic fork into `src/lib/ai/voice-guidance/`                                           | A     | —     | 1.0 d    |
| T-102 | Wire `renderVoiceGuidance()` into `loadAiContext()` and the system block (Improvement B)                                       | A     | T-101 | 0.5 d    |
| T-103 | `caption_drafts` returns 3 variants (Improvement A)                                                                            | A     | T-101 | 0.5 d    |
| T-104 | `completeness_check` brand-voice penalty (Improvement D)                                                                       | A     | T-102 | 0.25 d   |
| T-105 | `agency-agents` persona port unit tests                                                                                        | A     | T-101 | 0.5 d    |
| T-106 | Stitch designs: updated `cb0de669_studioflow---agency-ai-settings-approved.html` + 3-variant caption panel                     | D     | T-103 | 0.5 d    |
| T-107 | Schema for `image_generation`, `reel_job`, `reel_subtitle_job`, `trend_signal`, `brand_reference_set` (forward migration only) | B     | —     | 0.5 d    |
| T-108 | Extend `enforceAiBudget` to accept `estimatedCostCents`                                                                        | B     | T-107 | 0.5 d    |
| T-109 | Set up `services/_template/` Python sidecar skeleton                                                                           | B     | —     | 0.5 d    |
| T-110 | Set up `services/scoring/` (Improvement C)                                                                                     | B     | T-109 | 0.5 d    |

**Sprint 1 total:** ~5.25 dev-days each, ~10.5 dev-days combined.

### Sprint 2 (week 2) — Trend Radar (Feature 1)

| ID    | Task                                                                       | Owner | Deps         | Estimate |
| ----- | -------------------------------------------------------------------------- | ----- | ------------ | -------- |
| T-201 | `services/trends/` (full implementation: Agent-Reach, TikTok, social_apis) | B     | T-109, T-110 | 3.0 d    |
| T-202 | `/api/trends/feed`, `/api/trends/sync`, `/api/trends/sync/[jobId]` routes  | A     | T-201        | 1.0 d    |
| T-203 | `loadAiContext()` extension for `recentTrends`                             | A     | T-201        | 0.5 d    |
| T-204 | Trends tab + `TrendCard` + filters                                         | A     | T-202        | 1.0 d    |
| T-205 | Quick-create drawer pre-fill                                               | A     | T-204        | 0.5 d    |
| T-206 | Stitch design: research/trends page + drawer                               | D     | T-204        | 0.5 d    |
| T-207 | Unit + integration + e2e tests                                             | A     | T-202-T-205  | 1.0 d    |
| T-208 | Capability flag + budget + rate limit + audit                              | A     | T-107        | 0.5 d    |

**Sprint 2 total:** ~8.0 dev-days each, ~16 dev-days combined.

### Sprint 3 (week 3) — Brand-aware Image Gen (Feature 2) + Improvement C, E

| ID    | Task                                                                            | Owner | Deps         | Estimate |
| ----- | ------------------------------------------------------------------------------- | ----- | ------------ | -------- |
| T-301 | Install Vercel AI SDK + provider packages; write `src/lib/ai/image.ts`          | A     | —            | 1.5 d    |
| T-302 | `/api/ai/image/generate`, `/api/ai/image/estimate`, `/api/ai/image/[id]` routes | A     | T-301, T-108 | 1.5 d    |
| T-303 | `brand_reference_set` auto-compute cron (1/day)                                 | A     | T-107        | 1.0 d    |
| T-304 | `<GenerateImageButton>` + modal + result panel                                  | A     | T-302        | 2.0 d    |
| T-305 | Stitch design: ai-image-generate modal                                          | D     | T-304        | 0.5 d    |
| T-306 | Unit + integration + e2e tests                                                  | A     | T-302-T-304  | 1.5 d    |
| T-307 | Capability flag + budget (cost-based) + rate limit + audit                      | A     | T-108        | 0.5 d    |
| T-308 | `platform_adaptation_rules` schema + seed (Improvement E)                       | B     | T-107        | 0.5 d    |
| T-309 | `platformAdapt()` reads from the table (Improvement E)                          | A     | T-308        | 0.5 d    |
| T-310 | Admin UI for `platform_adaptation_rules`                                        | A     | T-308        | 0.5 d    |
| T-311 | Wire `services/scoring/` into `related_format_ideas` (Improvement C)            | B     | T-110        | 0.5 d    |

**Sprint 3 total:** ~10.5 dev-days each, ~21 dev-days combined.

### Sprint 4 (week 4) — Reel Generator + AI Subtitle (Feature 3)

| ID    | Task                                                                                                                                                     | Owner | Deps         | Estimate |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------ | -------- |
| T-401 | `services/reels/` (full implementation: 9 steps + state machine + SSE)                                                                                   | B     | T-109        | 5.0 d    |
| T-402 | `/api/ai/reel/generate`, `/api/ai/reel/[id]`, `/api/ai/reel/[id]/stream`, `/api/ai/subtitles`, `/api/ai/subtitles/[id]`, `/api/ai/subtitles/[id]/stream` | A     | T-401, T-108 | 1.5 d    |
| T-403 | `<MakeReelButton>` + modal + progress panel (SSE) + result panel                                                                                         | A     | T-402        | 2.5 d    |
| T-404 | `<AddSubtitlesButton>` + progress + result                                                                                                               | A     | T-402        | 1.0 d    |
| T-405 | Stitch design: ai-reel-generate modal + progress + result                                                                                                | D     | T-403        | 0.5 d    |
| T-406 | Unit + integration + e2e tests                                                                                                                           | A     | T-401-T-404  | 1.5 d    |
| T-407 | Capability flag + budget (cost-based, per-tier) + rate limit + audit                                                                                     | A     | T-108        | 1.0 d    |

**Sprint 4 total:** ~13.0 dev-days each, ~26 dev-days combined.

### Sprint 5 (week 5) — Polish + observability + docs

| ID    | Task                                                                 | Owner | Deps       | Estimate |
| ----- | -------------------------------------------------------------------- | ----- | ---------- | -------- |
| T-501 | Sentry breadcrumbs + Prometheus exporters                            | A     | all        | 1.0 d    |
| T-502 | `pnpm costs:sync` daily job (refresh provider cost matrix)           | A     | T-301      | 0.5 d    |
| T-503 | Bilingual check: every new string in `en.json` + `ar.json`           | A     | all UI     | 0.5 d    |
| T-504 | Visual regression tests against new Stitch HTMLs                     | A     | all Stitch | 0.5 d    |
| T-505 | `CHANGELOG.md` + `PRODUCTION_READINESS_TRACKER.md` updates           | A     | all        | 0.5 d    |
| T-506 | `docs/production-readiness/AI_FEATURES_GUIDE.md` (operator manual)   | A     | all        | 0.5 d    |
| T-507 | Final review: open questions answered by user, KPIs defined, GA gate | A     | all        | 0.5 d    |

**Sprint 5 total:** ~4.0 dev-days each, ~8 dev-days combined.

### Grand total

- **Total dev-days:** ~71.5 dev-days (across both engineers, parallel work)
- **Wall-clock:** 5 weeks (S1–S5) with 2 engineers, ~10 weeks with 1 engineer
- **Story points (Fibonacci, 1 SP = 0.5 d):** ~143 SP
- **Lines of code estimate:** TS: ~3,500 new + ~800 modified; Python: ~1,800 new; SQL: ~250 new; HTML (Stitch): ~2,000 new

---

## 7. Risks + mitigations

| #    | Risk                                                                                         | Likelihood | Impact | Mitigation                                                                                                                                           |
| ---- | -------------------------------------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1  | TikTok scrapers break every 2-4 months on signature changes                                  | High       | Medium | Agent-Reach + tamnd/tiktok-cli + kawsarlog fallback triple; weekly smoke test in CI; sidecar isolated from app                                       |
| R-2  | Provider cost spike (e.g. Sora 2 Pro at $7.50/Reel)                                          | Medium     | High   | `cost_accepted: boolean` gate on premium tier; per-agency monthly cost cap; cost preview before submit; default to cheap tier                        |
| R-3  | Brand reference drift (agency changes Brand Kit, generated images look off-brand)            | Medium     | Medium | Auto-recompute `brand_reference_set` on Brand Kit save; 1/day cron as backup; admin can manually re-trigger                                          |
| R-4  | Avatar lip-sync fails on accents / cross-language                                            | Medium     | Medium | Whisper-detected language must feed TTS language code; refuse to render if mismatch                                                                  |
| R-5  | Sidecar OOM on 4K source video for Reel                                                      | Medium     | Low    | Cap source video resolution to 1080p at upload; pre-flight check                                                                                     |
| R-6  | Provider rejection (faces, celebrities, NSFW) surfaces as a generic 500                      | Medium     | Medium | Catch the rejection; surface verbatim; refund the credit; never auto-retry                                                                           |
| R-7  | GitHub API rate limit blocks the Trend Radar source updates                                  | Low        | Low    | Cache responses (VCR cassettes + per-day dedupe); use the paid Apify fallback if needed                                                              |
| R-8  | AGPL-3.0 dependency accidentally introduced                                                  | Low        | High   | CI step: `pnpm license-check` fails the build on AGPL/GPL for any Node dep; pre-commit hook `git-secrets`                                            |
| R-9  | AI budget bypassed (user calls /api/ai/image directly without going through enforceAiBudget) | Low        | High   | Route layer is the only entry point; lint rule forbids direct `lib/ai/image.generateOnBrandImage` from any non-route caller; PR review checklist     |
| R-10 | Generation result linked to wrong content_item (race condition)                              | Low        | Medium | Transactional: write `image_generation` + `media_asset` + `content_item.asset_link` in a single Drizzle transaction; on failure, roll back all three |

---

## 8. KPIs (90 days post-launch)

- **% of paid agencies that enable the new AI features** — target 40% (gated features, opt-in).
- **AI generations per active planner per week** — target ≥ 8 (1 Reel + 3 captions + 2 image drafts + 2 trend-driven ideas).
- **AI generation cost per agency per month** — target ≤ $30 (cheap tier). Server-enforced.
- **Time from brief → first AI draft** — target ≤ 30 s. Today ~8 s; the new Reel target is 90 s.
- **% of AI drafts the planner edits before publishing** — target ≥ 70% (lower = auto-accepted = human-in-the-loop broken).
- **% of agency plans that allow all 9 capabilities** — target 25% (most plans gate Reels + Image Gen behind Pro+).
- **% of Reels / Images that need a regeneration** — target ≤ 25% (more = the prompt is bad).
- **Trend Radar: 7-day rolling usage** — target 1.5 reads per planner per day. (If lower, the sidecar is broken; if higher, the §15 capabilities are stealing the show.)
- **NPS for the AI features** — target ≥ 30 (measured via the existing in-app survey).

---

## 9. Open questions (the only blocking decisions)

1. **Provider budget per agency per month** — assumed $30 cheap / $250 premium. What is the actual number per plan?
2. **Reel Generator premium tier** — expose at all, or cheap-only?
3. **Image Gen: which providers allowed by default?** Recommended: Replicate + OpenAI opt-in.
4. **Trend Radar: per-agency or per-user opt-in?**
5. **Reel Generator script extraction LLM call** — through existing `MINIMAX_BASE_URL` with new `reel_jobs` budget, or separate budget?
6. **Expose MCP to the planner UI** so external agents can call laratik capabilities, or keep MCP sidecar-only?
7. **LivePortrait self-host** — does the VPS have a GPU, or do we D-ID only?
8. **Suno music library** — use a fixed per-agency seed list (predictable, cheap) or let the planner pick the genre (creative, but harder to budget)?

These are the only decisions that block implementation. Everything else has a defensible default and can be shipped without further input.
