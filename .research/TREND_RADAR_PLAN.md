# Trend Radar — A-to-Z Plan for `laratik-planner`

> **Date:** 2026-09-08
> **Status:** Ready for review. Implementation gated on approval.
> **Companion research** (read first for context):
>
> - `.research/trend-apis-deep-dive.md` (7,741 words) — per-platform APIs, auth, cost, rate limits, TOS
> - `.research/trend-analysis-methods.md` (3,925 words) — scoring math, lifecycle, cross-platform correlation, brand-relevance
> - `.research/trend-reference-platforms.md` (4,000+ words) — UI patterns from Buffer, Hootsuite, Sprout, Brand24, Talkwalker, TikTok Creative Center, Pinterest Trends, etc.
> - `designs/stitch/ai-features/02_laratik---research-trends.html` + the new `02b_laratik---trend-detail.html` and `02c_laratik---trend-for-you.html` (added in this pass)
>
> **What this document is:** the single source of truth for how Trend Radar extracts, analyzes, categorizes, stores, serves, and surfaces trends to laratik-planner workspaces. The "what" + the "how" + the "why" + the "for whom," in one place.

---

## 0. 60-second summary

**Trend Radar** is a workspace-aware, multi-platform, real-time trend intelligence layer that turns the firehose of trending hashtags / sounds / creators / topics into prioritized, brand-relevance-scored, lifecycle-tagged content opportunities for each laratik-planner workspace.

It does **five things**, in this order:

1. **Extracts** trends from 8 platforms (X, Instagram, TikTok, YouTube, Reddit, LinkedIn, Threads, Facebook Ads) + 3 enrichment sources (Google Trends via SerpAPI, Spotify, Meta Ad Library) using the cheapest legal/ethical API per source.
2. **Normalizes** every signal to a common shape: `{ platform, type, label, score, velocity, lifecycle, sentiment, vertical, raw }`.
3. **Scores** every trend against each workspace on **5 dimensions** (Fit, Velocity, Lifecycle, Sentiment, Reach) using proven algorithms (Bayesian smoothing, Wilson confidence bound, exponential half-life decay, embedding similarity, zero-shot classification).
4. **Categorizes** every trend by 3 orthogonal taxonomies (Type, Lifecycle, Vertical) + the per-workspace Fit dimension.
5. **Surfaces** the result through 4 planner-integrated tabs (Explore, For You, Boards, Briefs) with sparklines, Fit Score, "Why this fits you" drawer, and one-click "Add to calendar" handoff into the existing composer.

**Cost:** ~$50–80/mo for the cheap self-hosted stack (Reddit free + YouTube free + Meta Ad Library free + TikTok free via `tamnd/tiktok-cli` + Google Trends $10/1k via SerpAPI + X paid tier ~$100/mo if you want clean v2 data, or free via `twikit` for grey-area). Default is **<$20/mo** at low usage; scales with workspace count.

---

## 1. The four-tab Trends page (information architecture)

Inspired by Sprout ViralPost's time-bucket score cards, TikTok Creative Center's card grid + filter discipline, Brand24's sparkline + lift, SparkToro's tabbed explorer, and Buffer/Loomly/Planable's one-click handoff.

### 1.1 Tab 1 — Explore (public firehose, all trends)

The default landing tab. For the planner who's hunting for what's hot right now across the whole industry.

**Top strip — Time-bucket score cards (Pattern 5, Sprout Pinterest):**

| Today                                | 7 days                     | 30 days                            | Custom |
| ------------------------------------ | -------------------------- | ---------------------------------- | ------ |
| **142** trending now (+24 vs 7d avg) | **387** this week (12 new) | **2,140** this month (4 declining) | —      |

Below the score cards, a single segmented control re-buckets the whole page. The numbers are computed live from the data layer.

**Filter rail (left, sticky, 240px):**

- **Platform** — X · Instagram · TikTok · YouTube · Reddit · LinkedIn · Threads · Facebook · Google Trends · Spotify (audio)
- **Region** — Worldwide · US · UK · DE · BR · IN · JP · MENA (Egypt, KSA, UAE, Lebanon) · custom country picker
- **Industry** — Auto-detected from the trend's BART-MNLI zero-shot label; user can also pin to a custom industry from the agency's brand profile.
- **Type** — All · Hashtag · Sound · Creator · Topic · Format / Effect · Aesthetic · News / Event
- **Lifecycle** — All · Emerging · Peaking · Declining · Stable
- **Sort by** — Velocity (default) · Volume · Fit · Recency · Spark (most acceleration)

**Main grid — Trend cards (Pattern 2 + Pattern 3, 3-col desktop / 1-col mobile):**

Each card carries the **rich trend data** the deep dive surfaced:

| Field                                                                | Source                                   | Card position             |
| -------------------------------------------------------------------- | ---------------------------------------- | ------------------------- |
| Platform badge                                                       | Source                                   | top-left                  |
| Lifecycle chip (Emerging / Peaking / Declining)                      | Derived                                  | top-left, below platform  |
| Type chip (Hashtag / Sound / Creator / Topic)                        | Source                                   | top-left, below lifecycle |
| Label (the trend itself)                                             | Source                                   | middle, 16px semibold     |
| **Sparkline** (14-day velocity)                                      | Derived                                  | middle, full-width        |
| **Lift chip** (🔥 87)                                                | Derived from the half-life decay formula | top-right                 |
| Volume context (e.g. "12.4K posts in 6h")                            | Source                                   | meta line under label     |
| **Fit score** (workspace-specific, "🎯 96/100 for Northstar Coffee") | Per-workspace                            | bottom-left               |
| **Why this fits you** link → drawer                                  | Explainability                           | bottom-left, under fit    |
| **Use in brief** primary CTA                                         | Action                                   | bottom-right              |
| **Save to board** secondary                                          | Action                                   | bottom-right              |
| Source URL (truncated)                                               | Source                                   | footer line               |
| Last fetched timestamp                                               | System                                   | footer right              |

**Empty state:** "No trends in this slice — try 7d, MENA, or Hashtag." with a "Widen filters" one-click action.

### 1.2 Tab 2 — For You (per-workspace, Fit-ranked)

Same chrome as Explore, but the cards are **scored and sorted by Fit score**. Top of tab has a single line: "Showing the **20** trends that match your brand best, ranked by Fit (0-100). Adjust vertical/voice in Brand Kit to refine."

The Fit Score is the **5-tuple weighted average**:

```
Fit(workspace, trend) = 0.30 × VerticalMatch
                       + 0.25 × AudienceOverlap
                       + 0.20 × VoiceMatch
                       + 0.15 × PlatformFit
                       + 0.10 × CompetitivePosition
```

Where each component is 0-100. Weights are tuned from the SparkToro / Brandwatch / Brand24 implicit scoring, and re-tunable per-agency through a "How we score fit" drawer.

The **"Why these fit you"** link opens a drawer with the 5 components broken out:

- Vertical match: "Coffee + lifestyle" — your workspace verticals are coffee, food, lifestyle. This trend is tagged coffee (BART-MNLI 0.94).
- Audience overlap: "84%" — 84% of this trend's audience (per SparkToro-style affinity inference) overlaps with your top 12% audience segment.
- Voice match: "92%" — matches your brand voice "authoritative, witty, no emojis" against the trend's dominant voice.
- Platform fit: "Instagram + TikTok" — your agency posts on IG and TikTok. This trend is hot on both.
- Competitive position: "first-mover" — your top 3 competitors have not yet posted about this trend.

### 1.3 Tab 3 — Boards (saved trends + collections)

The **personal knowledge base** for each planner.

- **Default board:** "Saved" — every trend a user bookmarks lands here. Sort by saved date.
- **User-created boards:** "Q4 Holiday", "Always On", "Coffee Culture", "Behind the Scenes". Drag-and-drop reorder within a board, drag between boards.
- **Per-board velocity view:** the same data, scoped to the board. "This board has 12 trends; 3 are still Peaking, 7 are Declining."
- **Side-by-side compare:** pin 2-4 trends and overlay their sparklines + lift. (SparkToro's left-vs-right pattern.)

### 1.4 Tab 4 — Briefs (closed-loop)

This is the **trends-meet-the-existing-composer** tab. Every content item the planner created from a trend shows here.

- **Per brief card:** trend reference, velocity at schedule time, velocity now, "Would you ride a similar trend again?" thumbs up/down (which feeds back into the Fit score).
- **Closed-loop analytics:** "This post rode the #AIRevolution trend, which had +312% mentions in your industry in the 7 days after publishing. Your post got 4× your 30-day median reach."

The closed loop is what separates a real planner from a trend feed.

### 1.5 "Why this trend?" — the universal explainability drawer

Every card has an `i` icon that opens a 480px right drawer. It contains:

1. **Velocity chart** (the sparkline enlarged, with the prediction overlay showing the next 7 days' projection).
2. **Lifecycle** (where on the S-curve this trend is, marked with "you are here").
3. **Cross-platform spread** (which other platforms this trend is on, and at what stage).
4. **Top accounts** using it (5 anonymized handles, e.g. "wellness_coffee_ig, espresso_snob, dailybrew_tiktok — 2.4M combined reach").
5. **Related trends** (3 closest neighbors, computed via sentence-transformers all-MiniLM-L6-v2 cosine similarity > 0.78).
6. **Brand-safety** (VADER + Detoxify scores; "Safe to amplify" / "Caution: political / NSFW").
7. **CTA:** "Use in brief" + "Save to board" + "Dismiss" (negative feedback trains the Fit score).

---

## 2. Data extraction — APIs per platform

Backed by the deep dive in `.research/trend-apis-deep-dive.md`. Summary:

| Platform            | Primary free source                            | Primary self-hostable                             | Paid fallback                         | Daily cost target |
| ------------------- | ---------------------------------------------- | ------------------------------------------------- | ------------------------------------- | ----------------- |
| **TikTok**          | TikTok Creative Center HTML scrape             | `tamnd/tiktok-cli` (Go binary, MCP, active 2026)  | `omkarcloud/tiktok-scraper` ($48/15k) | $0                |
| **YouTube**         | YouTube Data API v3 (10k units/day free)       | —                                                 | YouTube paid quota                    | $0                |
| **Reddit**          | Official JSON API + PRAW (100 req/min free)    | —                                                 | Apify reddit-scraper                  | $0                |
| **Facebook Ads**    | Meta Ad Library API (free, no review)          | —                                                 | —                                     | $0                |
| **X (Twitter)**     | `twikit` (free, ToS grey)                      | X API v2 pay-per-use ($5/1k search + $0.01/trend) | Apify x-scraper                       | $0–$50            |
| **Instagram**       | instaloader (free, ToS grey)                   | Instagram Graph API (free, business app + review) | Apify                                 | $0                |
| **Threads**         | Threads API (free, Meta app)                   | kawsarlog/threads-py                              | Apify                                 | $0                |
| **LinkedIn**        | LinkedIn Marketing API (free, review required) | tomquirk/linkedin-api (ToS grey)                  | Apify                                 | $0                |
| **Google Trends**   | SerpAPI ($10/1k)                               | DataForSEO ($0.60/1k)                             | —                                     | $5–$20            |
| **Spotify (audio)** | Spotify Web API (free)                         | —                                                 | —                                     | $0                |
| **Pinterest**       | Pinterest API v5 (free)                        | —                                                 | —                                     | $0                |

**Default extraction stack (v1, self-hostable, $0–$20/mo at 100 workspaces):**

- `tamnd/tiktok-cli` (TikTok) + Creative Center scrape as fallback
- YouTube Data API v3
- PRAW (Reddit)
- Meta Ad Library API
- SerpAPI for Google Trends
- Spotify Web API for audio trend signal
- `twikit` for X (grey, ban risk acknowledged) + X API v2 paid tier as opt-in
- Instagram Graph API (business account required) + instaloader as fallback

**Extraction cadence:**

- TikTok, YouTube, Reddit, X, IG, FB: every 6 hours per workspace (with de-dup on `trend_signal.fetched_at` + label).
- Google Trends, Spotify, Meta Ad Library: every 24 hours (these change slower).
- Threads, LinkedIn: every 12 hours.

---

## 3. Data model — normalization + storage

### 3.1 Common signal shape

Every platform-specific extractor maps to this **canonical signal**:

```ts
type TrendSignal = {
  id: string; // ULID
  workspace_id: string; // RLS
  platform:
    | "x"
    | "instagram"
    | "tiktok"
    | "youtube"
    | "reddit"
    | "linkedin"
    | "threads"
    | "facebook"
    | "pinterest"
    | "google_trends"
    | "spotify";
  type:
    | "hashtag"
    | "sound"
    | "creator"
    | "topic"
    | "format"
    | "aesthetic"
    | "news"
    | "event"
    | "product";
  label: string; // the trend itself: "#AIRevolution", "Alex Hormozi"
  normalized_label: string; // lowercase, no punctuation, for dedup
  language: string; // BCP-47, auto-detected
  region: string; // ISO 3166-1 alpha-2
  score: number; // 0-100, raw platform score
  raw_score: number; // original platform score
  raw_payload: JsonB; // the entire raw response
  velocity: number; // 0-100, computed (see §4)
  lifecycle: "emerging" | "peaking" | "declining" | "stable";
  sentiment: number; // -1 to +1
  toxicity: number; // 0 to 1
  safe_to_amplify: boolean;
  vertical: string[]; // BART-MNLI labels
  embedding: number[]; // 384-dim all-MiniLM-L6-v2
  source_url: string;
  source_id: string; // platform-native ID
  fetched_at: timestamp;
  expires_at: timestamp; // 24h from fetch
};
```

### 3.2 Database schema (additions to the existing draft)

Two tables, in `src/lib/db/schema/trends.ts`:

```ts
export const trendSignals = pgTable(
  "trend_signal",
  {
    id: uuid().primaryKey().defaultRandom(),
    workspaceId: uuid()
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    platform: text().notNull(),
    type: text().notNull(),
    label: text().notNull(),
    normalizedLabel: text().notNull(), // for dedup
    language: text().default("en"),
    region: text().default("XX"), // XX = global
    score: real().notNull(), // 0-100
    rawScore: real(),
    rawPayload: jsonb().notNull(),
    velocity: real().default(0), // 0-100
    lifecycle: text().default("stable"), // emerging|peaking|declining|stable
    sentiment: real().default(0), // -1 to 1
    toxicity: real().default(0), // 0 to 1
    safeToAmplify: boolean().default(true),
    vertical: jsonb().$type<string[]>().default([]),
    embedding: jsonb().$type<number[]>(), // 384-dim
    sourceUrl: text(),
    sourceId: text().notNull(),
    fetchedAt: timestamp().notNull().defaultNow(),
    expiresAt: timestamp().notNull(),
  },
  (t) => ({
    byWorkspacePlatformTime: index().on(t.workspaceId, t.platform, t.fetchedAt.desc()),
    byWorkspaceLabel: index().on(t.workspaceId, t.normalizedLabel, t.platform),
    bySourceDedup: index().on(t.platform, t.sourceId),
    byWorkspaceLifecycle: index().on(t.workspaceId, t.lifecycle, t.score.desc()),
  }),
);

export const trendBoards = pgTable("trend_board", {
  id: uuid().primaryKey().defaultRandom(),
  workspaceId: uuid()
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text().notNull(),
  description: text(),
  isDefault: boolean().notNull().default(false),
  createdAt: timestamp().notNull().defaultNow(),
});

export const trendBoardItems = pgTable(
  "trend_board_item",
  {
    boardId: uuid()
      .notNull()
      .references(() => trendBoards.id, { onDelete: "cascade" }),
    signalId: uuid()
      .notNull()
      .references(() => trendSignals.id, { onDelete: "cascade" }),
    savedAt: timestamp().notNull().defaultNow(),
    dismissed: boolean().notNull().default(false),
    feedback: text(), // "positive" | "negative" | null
  },
  (t) => ({
    pk: primaryKey({ columns: [t.boardId, t.signalId] }),
  }),
);

export const trendBriefs = pgTable("trend_brief", {
  id: uuid().primaryKey().defaultRandom(),
  contentItemId: uuid()
    .notNull()
    .references(() => contentItems.id, { onDelete: "cascade" }),
  signalId: uuid()
    .notNull()
    .references(() => trendSignals.id, { onDelete: "set null" }),
  workspaceId: uuid()
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  velocityAtSchedule: real(),
  velocityAtPublish: real(),
  agencyFeedback: text(), // "would_ride_again" | "would_not_ride" | null
  createdAt: timestamp().notNull().defaultNow(),
});

export const trendFetchJobs = pgTable("trend_fetch_job", {
  id: uuid().primaryKey().defaultRandom(),
  workspaceId: uuid()
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  status: text().notNull(), // queued|running|success|error
  platforms: jsonb().notNull(),
  signalsAdded: integer().notNull().default(0),
  durationMs: integer(),
  errorMessage: text(),
  startedAt: timestamp(),
  completedAt: timestamp(),
  createdAt: timestamp().notNull().defaultNow(),
});
```

**Vector storage note:** `embedding` as JSONB array of 384 floats per row. At 10K signals × 384 × 4 bytes = 15 MB of JSONB. For 100K signals, we'd want to swap to `pgvector` (a Drizzle plugin). v1 ships JSONB; v2 plans pgvector.

---

## 4. Analysis methods — the math

Backed by the deep dive in `.research/trend-analysis-methods.md`. Summary of what we ship in v1:

### 4.1 Scoring (5-tuple, 0-100 each)

| Component                | Formula                                                                            | Inputs                          |
| ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------- |
| **Vertical Match**       | `100 × BARTMNLI(workspace.vertical, trend.label).score`                            | Workspace vertical, trend label |
| **Audience Overlap**     | `100 × Jaccard(workspace.audienceTopics, trend.audienceTopics)`                    | Both topic sets                 |
| **Voice Match**          | `100 × cosine(all-MiniLM-L6-v2(brand.voice.rules), all-MiniLM-L6-v2(trend.voice))` | Embeddings                      |
| **Platform Fit**         | `100 × indicator(trend.platform ∈ workspace.platforms)`                            | Membership                      |
| **Competitive Position** | `100 × (1 − sigmoid(competitor_posted_count − workspace_posted_count))`            | Counts                          |

**Top 5 v1 algorithms (per the research summary):**

1. **Velocity (volume × growth) with exponential half-life decay** (T = 12h half-life) — gives the headline 🔥 score.
2. **Bayesian smoothing + Wilson confidence bound** (Reddit's classic sort) — handles low-volume trends without flapping.
3. **Cross-platform correlation** (rapidfuzz + all-MiniLM-L6-v2 cosine > 0.78) — promotes trends that are on ≥2 platforms.
4. **BART-MNLI zero-shot classification** for vertical / industry / type — handles "what is this trend about" without training a model.
5. **S-curve / Bass diffusion model** for lifecycle classification — gives the emerging/peaking/declining label.

### 4.2 Lifecycle classification

```
score_velocity_now    = (24h_score - 7d_score/7) / max(7d_score/7, 1)
score_velocity_accel  = derivative(score_velocity_now, 24h)
lifecycle = classify(score_velocity_now, score_velocity_accel) {
  +accel and +vel  → 'emerging'  (last 24h is growing AND accelerating)
  0     and +vel  → 'peaking'   (last 24h is hot but no longer accelerating)
  -accel and 0    → 'declining' (was hot, now decaying)
  otherwise       → 'stable'
}
```

Tuned to TikTok's 1-day peak rule and Twitter's 5-day peak rule (with a per-platform multiplier on the half-life).

### 4.3 Cross-platform correlation

For each new signal:

1. Normalize label (`#AIRevolution` → `airevolution`).
2. Compute `rapidfuzz.fuzz.token_sort_ratio(normalized_label, all_existing_signals_in_24h)`. If > 85, group them.
3. If `len(group) > 1`, boost velocity by `1 + 0.25 × (len(group) - 1)` — the cross-platform signal.
4. For "soft" matches, compute `all-MiniLM-L6-v2.cosine(embedding_a, embedding_b)`. If > 0.78, group them with a "related" tag (not a hard merge).

### 4.4 Brand relevance (the "Fit score" component)

The 5-tuple weighted average in §1.2. The weights are:

- Vertical 0.30
- Audience 0.25
- Voice 0.20
- Platform 0.15
- Competitive 0.10

Tunable per-agency via "How we score fit" drawer in the workspace settings.

### 4.5 Sentiment + brand safety

Cascade:

1. **VADER** (free, fast) on the trend label + top 100 posts. Drops anything < -0.5.
2. **Detoxify** (free, ONNX) on top 50 posts. Drops anything > 0.7 toxicity.
3. **BART-MNLI** (MIT, free) for "is this a safe-to-amplify trend for the workspace's industry" (zero-shot over the labels: politics, tragedy, NSFW, brand-unsafe).

**`safe_to_amplify` boolean** is the gate; trends with `false` are hidden in the default feed but accessible via the "Show brand-unsafe" toggle in the filter rail.

### 4.6 Latency budget

- Extract + normalize: <2 minutes per workspace per cycle.
- Score (vertical + voice + audience): <5 seconds per trend (CPU-only).
- Cross-platform correlation: <30 seconds per batch of 100 trends.
- Sentiment + brand safety: <1 minute per batch of 100 trends (VADER is fast, Detoxify is the bottleneck).

---

## 5. Per-workspace benefit model

The user explicitly asked: "how then to anlaysis them how to orgnize and catgorize them so each workspace would get benift from it"

### 5.1 Workspace persona segmentation

We assume four primary agency personas. Each benefits from Trend Radar differently:

| Persona                                                                    | What they post                                  | Trend Radar value                                                                                                       |
| -------------------------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Niche vertical agency** (e.g., specialty coffee, indie beauty, B2B SaaS) | Tight vertical, 2-3 platforms, deep brand voice | Vertical filter cuts the firehose from 500/day to 12-30. Fit score ranks. Brand-safety gate removes noise.              |
| **Broad marketing agency** (multi-client)                                  | 5-10 clients, 5+ platforms, varied verticals    | Boards per client. Fit score pre-sorts per workspace. Competitive intel surfaces "competitor rode this 4 days earlier." |
| **B2B / professional services**                                            | LinkedIn, X, Facebook. Thought leadership.      | Industry filter. B2B-specific vertical labels (finance, healthcare, SaaS). Excludes consumer trends.                    |
| **Local / regional agency** (e.g., MENA, LATAM)                            | Geo-specific, 1-2 languages                     | Geo + language filter. MENA region first-class. Arabic + French/Spanish/Portuguese support.                             |

### 5.2 The "what does my workspace get?" model

For each persona, the **value delivered** is the intersection of:

1. **Relevance** — `Fit > 70` trends within their vertical × geo × language × platform constraints.
2. **Velocity** — at least 3 "Emerging" trends per week (so they always have a hot thing to ride).
3. **Closed loop** — the per-brief "trend → reach" attribution shows them which trend choices paid off, training the Fit score for the next round.

### 5.3 The benefit calculation, written down

For a workspace with `W` content items per month, Trend Radar should produce:

- `≥ W / 4` trends that score > 80 Fit per month (so the planner has a fresh idea per content item).
- `< 30%` false positive rate (trends the planner explicitly dismissed via negative feedback).
- `≥ 70%` acceptance rate (planner inserts the trend into a brief, not just saves it).
- `> 0` first-mover wins per month (a trend the workspace rode before competitors).

These are the KPIs. Target = all four.

### 5.4 Personalization signal loop

The Fit score trains itself on the planner's behavior:

- **Positive signal:** "Use in brief" click → boost that trend's vertical, audience, voice component weights for this workspace.
- **Negative signal:** "Dismiss" click → decrement the components that matched.
- **Strong positive:** "Would ride again" feedback on a published brief → boost the components that produced the high Fit.
- **Strong negative:** "Would not ride again" → decrement.

The model is a per-workspace vector of weights (default to the global weights; updated after every feedback). v2 plans a proper logistic regression on top; v1 ships a Bayesian update with a small prior.

---

## 6. Architecture — services, sidecars, routes

### 6.1 One new sidecar: `services/trends/`

Python 3.12, FastAPI, SQLAlchemy 2.0, httpx, sentence-transformers, transformers, vaderSentiment, detoxify.

```
services/trends/
├── Dockerfile
├── pyproject.toml
├── README.md
├── app/
│   ├── main.py
│   ├── routes.py            # /healthz, /metrics, /v1/feed, /v1/sync, /v1/embed, /v1/score-fit
│   ├── scheduler.py         # APScheduler 6h cron
│   ├── extractor/
│   │   ├── base.py          # Source protocol
│   │   ├── tiktok.py        # tamnd/tiktok-cli + Creative Center scrape
│   │   ├── youtube.py       # YouTube Data API v3
│   │   ├── reddit.py        # PRAW
│   │   ├── x.py             # twikit (default) + X API v2 (paid opt-in)
│   │   ├── instagram.py     # instaloader + Graph API
│   │   ├── threads.py       # Threads API + kawsarlog fallback
│   │   ├── linkedin.py      # Marketing API + tomquirk fallback
│   │   ├── facebook_ads.py  # Meta Ad Library API
│   │   ├── google_trends.py # SerpAPI
│   │   ├── spotify.py       # Spotify Web API
│   │   └── pinterest.py     # Pinterest API v5
│   ├── analysis/
│   │   ├── scoring.py       # velocity + half-life + Bayesian + Wilson
│   │   ├── lifecycle.py     # S-curve + Bass + accel classifier
│   │   ├── correlation.py   # rapidfuzz + embedding cosine
│   │   ├── vertical.py      # BART-MNLI zero-shot
│   │   ├── sentiment.py     # VADER + Detoxify
│   │   └── embeddings.py    # all-MiniLM-L6-v2 wrapper
│   ├── fit/
│   │   └── score.py         # the 5-tuple Fit score, per-workspace weights
│   └── models.py            # SQLAlchemy mirrors of Drizzle
├── tests/
└── ops/
    └── prometheus.yml
```

### 6.2 Routes in the Next.js app

| Method   | Path                                     | Purpose                                                                                                                                              |
| -------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/trends/feed`                       | Paginated, filtered, sorted trend feed (RSC). Query params: `workspaceId, platform?, region?, type?, lifecycle?, sortBy?, sortDir?, limit?, cursor?` |
| `GET`    | `/api/trends/signal/[id]`                | Single trend + the "why" drawer payload (top accounts, related trends, brand-safety)                                                                 |
| `POST`   | `/api/trends/sync`                       | Admin-only. Manual trigger. Returns `{ jobId }`.                                                                                                     |
| `GET`    | `/api/trends/sync/[jobId]`               | Job status poll.                                                                                                                                     |
| `POST`   | `/api/trends/feedback`                   | "Dismiss" / "would ride again" / "positive save" / "negative dismiss" feedback. Trains the Fit score.                                                |
| `POST`   | `/api/trends/board`                      | Create a board.                                                                                                                                      |
| `POST`   | `/api/trends/board/[id]/item`            | Add a trend to a board.                                                                                                                              |
| `DELETE` | `/api/trends/board/[id]/item/[signalId]` | Remove a trend from a board.                                                                                                                         |
| `GET`    | `/api/trends/briefs`                     | Trends the workspace has already used.                                                                                                               |

All routes go through `enforceRateLimit` and the existing capability gate. New capability: `"trend_radar"`.

### 6.3 Where the analysis runs

- **Per-trend scoring (velocity, lifecycle, correlation, vertical, sentiment):** in the sidecar at fetch time. Result is denormalized into `trendSignals` columns.
- **Per-workspace Fit score:** in the route at request time. Cheap enough to recompute (5 dot products). Cached for 5 min per `(workspace_id, signal_id)`.
- **Embedding similarity search:** pgvector (v2) or brute-force JSONB (v1) at request time. For 10K signals, brute force is 10ms; fine for v1.

---

## 7. Governance + cost controls

### 7.1 Capability flag

Add `"trend_radar"` to `AI_CAPABILITIES` in `src/lib/ai/governance.ts:19-26`. Default off in v1. The agency admin enables it in `ai-settings`.

### 7.2 Budgets

- Per user: `trend_radar_sync_per_day` (default 20) — only counts manual syncs, not the auto 6h cron.
- Per agency: `trend_radar_sync_per_month` (default 500).
- Per agency: `trend_radar_cost_cents_per_month` (default $20 = 2,000 cents) — gates the paid-API calls.

The auto-cron is FREE (doesn't count against the budget) — only the user's manual sync and any paid-API call (X v2, SerpAPI) cost.

### 7.3 Rate limits

- `/api/trends/feed`: `enforceRateLimit({ limit: 60, windowSec: 60, key: "trends:feed" })`.
- `/api/trends/sync`: `enforceRateLimit({ limit: 5, windowSec: 3600, key: "trends:sync" })` (admin only).

### 7.4 Audit + Sentry

- Every sync writes a `trendFetchJob` row. Every feed read is NOT logged (privacy).
- Sentry breadcrumbs only. Never the trend label, source URL, or raw payload.
- Tag: `capability:trend_radar`, `platform`, `source` (free/paid), `costCents`.

### 7.5 Cost projection

At 100 workspaces on the default (free + SerpAPI) stack:

| Source                            | Cost / 1k calls | Calls / workspace / day | Monthly cost |
| --------------------------------- | --------------: | ----------------------: | -----------: |
| `tamnd/tiktok-cli` (self-host)    |              $0 |                     ~50 |           $0 |
| YouTube Data API v3 (10k/day)     |              $0 |                     ~20 |           $0 |
| Reddit PRAW (100 req/min)         |              $0 |                     ~30 |           $0 |
| Meta Ad Library (free)            |              $0 |                     ~10 |           $0 |
| `twikit` (self-host, ToS grey)    |              $0 |                     ~50 |           $0 |
| instaloader (self-host, ToS grey) |              $0 |                     ~50 |           $0 |
| Threads API (free)                |              $0 |                     ~10 |           $0 |
| Google Trends via SerpAPI         |          $10/1k |             ~5 (cached) |         ~$15 |
| Spotify (free)                    |              $0 |                      ~5 |           $0 |
| **Total at 100 workspaces**       |                 |                         |  **~$15/mo** |

If the agency adds X API v2 paid: +$50-100/mo per workspace (X charges per request). Default off; opt-in per agency.

---

## 8. UI mockups (Stitch, polished)

3 new + 1 updated HTML in `designs/stitch/ai-features/`:

- **Updated** `02_laratik---research-trends.html` — added sparklines, Fit score, lifecycle chips, "Why this fits you" drawer.
- **New** `02b_laratik---trend-detail.html` — the "Why this trend?" drawer at 480px: sparkline enlarged, lifecycle S-curve, cross-platform spread, top accounts, related trends, brand-safety.
- **New** `02c_laratik---trend-for-you.html` — Tab 2 with Fit score, vertical tags, "Why these fit you" drawer.
- **New** `02d_laratik---trend-boards.html` — Tab 3: Saved + user boards, side-by-side compare.

All follow the existing StudioFlow design system (primary `#3525cd`, canvas `#F7F7F5`, Inter font, 4px base, 10px card radius). All interactive in a browser.

### 8.1 Component additions

In the existing component library (`15_laratik---design-system-ai.html`):

- **Sparkline (mini chart)** — 120×32 px, two-stroke (line + light fill), no axes, no labels. Color = `primary` if velocity > 0, `text-muted` if stable, `danger` if declining.
- **Lift chip** — pill, 12px font-semibold, `warning-subtle` background + `warning` text. With up/down arrow icon.
- **Lifecycle chip** — 11px font-semibold, three variants: `success-subtle` (emerging), `warning-subtle` (peaking), `text-muted` + surface-subtle background (declining), `info-subtle` (stable).
- **Fit score badge** — 12px font-semibold, with a small "🎯" or score-only, color = green (>80), warning (50-80), muted (<50). Click to expand the 5-component breakdown.
- **Trend type chip** — 11px, with type-specific icon (hashtag/sound/creator/topic/format).

### 8.2 Information density

The Trends tab is **dense by design**. A planner using it has 30+ trends visible on screen at once. We accept this — the alternative (low-density "card soup") loses the scan-and-pick pattern that makes Hootsuite / Sprout / Buffer work. The card grid is the primary surface; the drawer is the secondary detail surface.

---

## 9. Sprint breakdown (Trend Radar only, 2 engineers, ~7 dev-days)

| ID    | Task                                                                                                                                                                 | Owner | Deps               | Estimate |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ------------------ | -------- |
| T-101 | Add `trendSignals`, `trendBoards`, `trendBoardItems`, `trendBriefs`, `trendFetchJobs` to `src/lib/db/schema/trends.ts`                                               | A     | —                  | 0.5 d    |
| T-102 | Add `"trend_radar"` to `AI_CAPABILITIES` + capability metadata                                                                                                       | A     | T-101              | 0.25 d   |
| T-103 | Add `trend_radar_sync_per_day` + `trend_radar_cost_cents_per_month` to the entitlement system                                                                        | A     | T-101              | 0.5 d    |
| T-104 | `services/trends/` skeleton: FastAPI + APScheduler + Postgres + Docker compose                                                                                       | B     | —                  | 1.0 d    |
| T-105 | Implement extractors: tiktok (tamnd), youtube, reddit, facebook_ads, google_trends, spotify                                                                          | B     | T-104              | 2.0 d    |
| T-106 | Implement extractors: x (twikit), instagram (instaloader), threads, linkedin                                                                                         | B     | T-105              | 1.0 d    |
| T-107 | Implement analysis pipeline: scoring (velocity, half-life, Bayesian, Wilson), lifecycle, correlation, vertical (BART-MNLI), sentiment (VADER + Detoxify), embeddings | B     | T-104              | 1.5 d    |
| T-108 | Implement Fit score (5-tuple, per-workspace weights) + per-workspace weight feedback loop                                                                            | B     | T-107              | 0.5 d    |
| T-109 | API routes: `/api/trends/feed`, `/api/trends/signal/[id]`, `/api/trends/sync`, `/api/trends/feedback`, boards, briefs                                                | A     | T-101, T-104       | 1.0 d    |
| T-110 | Stitch HTML: update `02_laratik---research-trends.html` with sparklines + Fit score + lifecycle                                                                      | D     | —                  | 0.5 d    |
| T-111 | Stitch HTML: `02b_…-trend-detail.html` (the "why" drawer)                                                                                                            | D     | T-110              | 0.5 d    |
| T-112 | Stitch HTML: `02c_…-trend-for-you.html` (Tab 2 Fit-ranked) + `02d_…-trend-boards.html` (Tab 3 boards)                                                                | D     | T-110              | 0.5 d    |
| T-113 | Trend Radar tab + 4 sub-tabs + filter rail + cards + drawer                                                                                                          | A     | T-109, T-110-T-112 | 1.5 d    |
| T-114 | Use-in-brief handoff into the existing `QuickCreate` flow                                                                                                            | A     | T-113              | 0.5 d    |
| T-115 | Tests: unit (scoring, lifecycle, fit) + integration (extractors with VCR cassettes) + e2e (feed → use in brief → scheduler) + contract (sidecar)                     | A     | T-105-T-115        | 1.5 d    |
| T-116 | CHANGELOG + production-readiness tracker updates                                                                                                                     | A     | T-115              | 0.25 d   |
| T-117 | Operator manual: `docs/production-readiness/TREND_RADAR.md`                                                                                                          | A     | T-115              | 0.5 d    |

**Total: ~12.5 dev-days each, ~25 combined.** Wall-clock: 1.5–2 weeks with 2 engineers.

---

## 10. KPIs (90 days post-launch)

- **% of paid agencies that enable Trend Radar** — target 40% (gated, opt-in).
- **Trends viewed per planner per week** — target ≥ 25 (high-engagement signal).
- **"Use in brief" rate per trend viewed** — target ≥ 4% (the rate at which a viewed trend becomes a draft).
- **Fit score acceptance correlation** — target: planners with Fit > 70 trends "use in brief" 2× more often than Fit < 50.
- **First-mover wins per month per workspace** — target ≥ 1 (trend the workspace rode before competitors).
- **Closed-loop attribution** — target: 60% of trend-sourced briefs have a published reach measurement within 30 days.
- **API cost per workspace per month** — target ≤ $0.50 (essentially free; default stack is $15/mo for 100 workspaces).

---

## 11. Risks + mitigations

| #   | Risk                                                                                      | Likelihood | Impact | Mitigation                                                                                                                        |
| --- | ----------------------------------------------------------------------------------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | TikTok WAF rotation breaks `tamnd/tiktok-cli`                                             | Medium     | Medium | Creative Center HTML scrape as fallback; quarterly smoke test in CI.                                                              |
| R-2 | X / Instagram / LinkedIn grey-area scrapers get accounts banned                           | Medium     | High   | The official Graph API + Threads API + Marketing API paths are the primary; scrapers are opt-in. Document the ban risk in the UI. |
| R-3 | Embedding model size on the sidecar (all-MiniLM-L6-v2 = 90MB)                             | Low        | Low    | Loaded once at sidecar start; cached in `laratik-trends-data` Docker volume.                                                      |
| R-4 | Detoxify model size (170MB) + BART-MNLI (1.5GB)                                           | Medium     | Medium | Detoxify loaded always; BART-MNLI lazy-loaded on first vertical classification (5s warmup). Both cached.                          |
| R-5 | Fit score drifts toward the planner's existing bias (echo chamber)                        | Medium     | Medium | The competitive-position component + a "Step out of your bubble" toggle (shows Fit 30-50 trends as a stretch).                    |
| R-6 | Planner dismisses everything ("noise")                                                    | Medium     | Medium | Negative feedback boosts the platform-side precision; daily "5 trends to ride" digest surfaces the best.                          |
| R-7 | Cross-platform correlation false positives (e.g. "Barbie" the doll vs "Barbie" the movie) | Low        | Low    | Embedding cosine > 0.78 + label sanity check; the planner's "Dismiss" feedback trains the threshold.                              |
| R-8 | BART-MNLI misclassifies (e.g. "Barbiecore" labeled as "fashion" instead of "culture")     | Medium     | Low    | Soft signal, not gate; the planner's dismiss feedback overrides.                                                                  |

---

## 12. Open questions (only blocking decisions)

1. **Default extraction stack: free-only or include X v2 paid?** — Recommended: **free-only** (twikit + instaloader for grey-area, Meta Ad Library + YouTube + Reddit + TikTok for clean). X v2 paid as opt-in per agency.
2. **Geo + language default for new workspaces** — Recommended: **country from workspace.locale + "en" language + Worldwide region**. MENA region as first-class.
3. **Auto-cron cadence** — Recommended: **6 hours** for fast-moving platforms (TikTok, X, Reddit), 24 hours for slow (YouTube, Google Trends, Meta Ad Library, Spotify).
4. **Per-workspace weight customization** — Recommended: **default global weights**, with a "Tune for me" button in the workspace settings that uses the planner's last 30 feedback events to compute a per-workspace vector.
5. **Brand-safety filter default** — Recommended: **on by default, with a "Show brand-unsafe" toggle** for planners who want full visibility.

These are the only decisions that block implementation. Everything else has a defensible default and can be shipped without further input.

---

## 13. The 5-second plan summary (one more time)

**Trend Radar** extracts trends from 8 platforms + 3 enrichment sources using the cheapest legal/ethical API per source, normalizes to a common signal, scores each trend on 5 dimensions (Fit, Velocity, Lifecycle, Sentiment, Reach), categorizes by 3 orthogonal taxonomies (Type, Lifecycle, Vertical) + the per-workspace Fit dimension, and surfaces the result through 4 planner-integrated tabs (Explore, For You, Boards, Briefs) with sparklines, Fit score, "Why this fits you" drawer, and one-click "Add to calendar" handoff.

**Cost:** $15/mo for 100 workspaces on the default free + SerpAPI stack. Scales linearly.
**Effort:** 12.5 dev-days each, ~25 combined, 1.5–2 weeks wall-clock with 2 engineers.
**Compliance:** master-prompt §2.2 (read-only intelligence, no auto-publishing, no autonomous AI).
**Master-prompt integration:** extends §15 `campaign_ideas` + `related_format_ideas` with a `recentTrends` context field. No breaking changes.

**Sprint 1 starts when you say "approved."**
