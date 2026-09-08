# Trend Reference — Platforms & SaaS Tools

> Research compiled for the **laratik-planner "Trends" feature**. Scope: real-world trend UIs, the data they surface, how they score and categorize, and the workflow patterns that turn trend discovery into published content.

---

## 1. Executive Summary

Social-media trend UIs cluster into **three archetypes**:

1. **Discovery dashboards** (TikTok Creative Center, Google Trends, Pinterest Trends) — public, card-grid led, skim-and-jump-out. Filters are global and platform-level.
2. **Listening & analytics workspaces** (Brand24, Talkwalker, Brandwatch, Mention, Socialinsider) — operator-grade, time-series led, optimized for "what is going on with my brand/industry/competitor." The trend is a _secondary surface_ inside a much larger analytics product.
3. **Planner-integrated "trend tile"** (Buffer, Hootsuite Trending Articles, Later, Loomly, Sprout ViralPost, Metricool, Planable, Iconosquare) — sits **next to the composer**, one click away from the next post. This is the pattern that matters most for laratik-planner.

Three signals to internalize:

- **Time-bucketed trends are the universal norm.** Even when products support arbitrary date ranges, the _primary navigation_ is "Hot right now (1 h) → Trending today (24 h) → This week (7 d) → This month." TikTok, Pinterest, Google, Sprout and most listening tools all adopt this. Default to that ladder.
- **"Why this trend" is the missing feature in the planner-integrated archetype.** Hootsuite, Later, Loomly, Planable and Buffer can show a trending hashtag but rarely explain _why_ it is trending, _who_ is using it, or _how fast_ it is decaying. SparkToro and Talkwalker prove this explanatory layer is where the value sits.
- **The "save to brief" handoff is where the workflow earns its keep.** Buffer, Loomly, Sprout and Later compete on how few clicks from "I see a trend" to "I have a post in my calendar." Planable's trend feed and Sprout's ViralPost are the gold standard: the trend object itself is the calendar object.

The winning design combines: **(a) TikTok's card-grid + filter discipline**, **(b) Sprout's per-workspace scoring and timing**, **(c) Brandwatch/Talkwalker's "why" panels**, and **(d) Buffer/Loomly's one-click handoff into the existing composer.**

---

## 2. Five Best UI Patterns to Adopt

### Pattern 1 — Tabbed multi-entity explorer _(SparkToro)_

A horizontal tab strip (Affinities · Search Keywords · Social Networks · AI Tools · Demographics · Audience Insights) sits above a sortable, comparable **left-vs-right chart**: audience's behaviour vs. population baseline. Each tab swaps the data shape but never the chrome.

> One-screenshot description: Six evenly-spaced tabs along the top of a white card. Below, a half-and-half comparison: "your audience" bar chart on the left, "average person" bar chart on the right, every bar in the audience column visibly taller. A pill list on the right column swaps the chart in place — no page reload.

**Why it works:** a single mental model (compare audience vs. baseline) is reused for six different entity types, so users build intuition fast.

### Pattern 2 — Recency + category side rail _(TikTok Creative Center / Pinterest Trends)_

A **left-rail filter column** (Region · Industry · Time · Type: songs/hashtags/creators/effects) drives a **content grid of cards**. Each card shows: thumbnail, label, big-number metric (post count, % lift, weekly change), and one or two action buttons (Save · Use in brief).

> One-screenshot description: A two-column layout. Left column, narrow, with sticky filter chips ("US", "Past 7 days", "Entertainment", "All types"). Right column a 3-up masonry of large cards, each with a video thumbnail, a song name in bold, a 145% lift pill in green, and a "+ Add to brief" ghost button bottom-right.

**Why it works:** recency + category is the only filtering 80% of planners need; the rest is browsing.

### Pattern 3 — Trending-now rail with sparkline + lift chip _(Google Trends / Brand24 / Sprout ViralPost)_

A horizontal list of trending entities. Each row is: **entity name · sparkline of the last 14 days · delta pill (▲ 320%) · "Why?" info icon · action menu**. Sparkline is the single most efficient way to communicate velocity at a glance.

> One-screenshot description: Six rows. Row 1: "Quiet luxury" in semibold, a 14-day sparkline trending up sharply, a green "+312%" pill, a small "i" icon, a Save bookmark icon, and a "Use" button. The sparkline is two-stroke (line + light fill) and ~120px wide.

**Why it works:** sparkline compresses direction + velocity + recency into ~120×32 px. The lift pill gives one comparable number; "Why" unlocks depth. Hootsuite, Sprout, Brand24, Metricool, Google Trends all converge on this row shape.

### Pattern 4 — Trend → brief inline form _(Loomly / Buffer / Planable)_

A trend card is _itself_ a mini composer. The card shows the trend, a "Suggested caption" pre-filled textbox, a media drop zone, an account-picker (which client / which channel), and a primary "Add to calendar" button. The trend is never an end-state; it is always one click from a draft.

> One-screenshot description: A card with a 4:3 image of the trend thumbnail at the top, a 280-character textbox pre-filled with a caption, three channel chips (IG + FB + X) with checkboxes, a calendar icon, and a green "Add to calendar" CTA. Above the card, a "← Back to trends" breadcrumb.

**Why it works:** collapses _browse → decide → write → schedule_ into a single screen. The single biggest workflow advantage Buffer, Loomly, and Planable have over Hootsuite's gated approach.

### Pattern 5 — Time-bucketed score cards with "today / 7d / 30d" tabs _(Sprout ViralPost / Pinterest Trends)_

A row of three score cards at the top of the Trends page. Each card = a number + a sparkline + a tiny caption. Clicking a card changes the entire page's time bucket. Tabs are "Today · 7 days · 30 days · Custom" so power users can escape.

> One-screenshot description: A header strip with a single-segment control "Today | 7d | 30d | Custom" right-aligned. Below, three large white cards: "Trending now: 142 (+24 vs 7d avg)" with an up-tick sparkline, "New this week: 38" with a different curve, and "Declining: 12" with a down-tick sparkline. The number is the headline; the sparkline gives the story.

**Why it works:** answers "what's the _state_ of the world?" in 5 seconds without scrolling. Pinterest Trends and Sprout's Queue + ViralPost use the same trick: a top KPI strip that recasts the data as a status, not a list.

---

## 3. Three Best Workflow Integrations

### A. Trend → Calendar (one click) — _Loomly, Buffer, Planable, Later, Sprout_

The trend is exposed as a first-class object inside the calendar/queue, with caption, channel, and schedule pre-filled. The user adjusts the date, the rest stays. Loomly's Post Builder is the cleanest example: trend arrives in the calendar, status defaults to **Draft**, captions are pre-written, and the only thing the user does is press Publish. Sprout's ViralPost does this for _send-time_, not for _content_: it slots a queued post into a high-engagement window without the user ever picking a time.

**What laratik-planner should steal:** every trend card has a primary **"Add to calendar"** button that opens the existing Post Editor with `defaultCaption`, `defaultMedia`, `defaultChannel`, and `defaultDate` pre-loaded. No new screens. The trend object survives as a `source: "trend:<id>"` reference inside the post so analytics can close the loop.

### B. Trend → Analytics (closed loop) — _Brand24, Mention, Talkwalker, Sprout_

After a post is published, the trend's mention volume is shown in the post's analytics view: "This post rode the **#quietluxury** trend, which had +312% mentions in your industry in the 7 days after publishing." Brand24 and Mention build the closed loop on the listening side; Sprout builds it on the publishing side. Without this, the trend feature is a one-shot inspiration; with it, the user learns which trend choices actually worked for _them_.

**What laratik-planner should steal:** every post stores `trendId?` (optional). The post's analytics tab shows: the trend's velocity at publish time, the trend's velocity now, and a small "Would you ride a similar trend again?" prompt that feeds back into the per-workspace trend ranking. The closed loop is what separates "AI slop generator" from "this tool keeps getting better at my brand."

### C. Trend → Audience intel (vertical matching) — _SparkToro, Brand24, Socialinsider, Brandwatch_

This is the deepest workflow: a trend is not just a hashtag, it's a _who_. SparkToro's tabbed explorer (see Pattern 1) and Brand24's hashtag analytics ("The Hashtag was used on Twitter by these 1,200 accounts, of which 18% match your audience") make the trend vertical-aware. Socialinsider and Brandwatch push this further with _competitor trend benchmarking_ — "your competitor rode this trend 4 days earlier, you missed the window."

**What laratik-planner should steal:** a **"Fit score"** on every trend card, computed per-workspace as `match(workspace.audienceTopics, trend.topics) × workspace.voiceMatch`. Trends above the user's voice match are pre-sorted to the top, and a small "Why this fits you" line points to the specific audience intersection (e.g., "Your top 12% audience talks about _wellness_ — this trend is +210% in that segment this week"). This is the only credible way to ship a Trend feature to an _agency_ managing many clients with different verticals.

---

## 4. Three Most Useful Categorization Schemes

A trend feature needs three orthogonal taxonomies. Borrowed from Brand24, Talkwalker, Sprout, TikTok Creative Center, Pinterest Trends, and SparkToro.

### 1. By trend type (the **what**)

| Type                       | Example                               | Where it lives                       |
| -------------------------- | ------------------------------------- | ------------------------------------ |
| **Hashtag / topic**        | `#quietluxury`, "wellness"            | All platforms; default tile          |
| **Sound / music**          | Trending audio                        | TikTok, Instagram, Reels             |
| **Format / effect**        | Trending templates, transitions       | TikTok Creative Center, Reels        |
| **Creator**                | A creator whose content is exploding  | TikTok, X, LinkedIn                  |
| **News / event**           | Real-world event driving conversation | X Explore, Google Trends, Threads    |
| **Aesthetic / visual**     | Color, mood, photography style        | Pinterest Predicts, Pinterest Trends |
| **Hashtag + format combo** | "GRWM with #olivedemure"              | All platforms                        |

The first three dominate TikTok Creative Center; the last one is Pinterest Predicts' moat.

### 2. By lifecycle (the **when**)

```
EMERGING  →  PEAKING  →  DECLINING
```

- TikTok Creative Center: _Breakout / Popular / Stable_.
- Google Trends: implicit from sparkline slope.
- Brand24: _Surge / Peak / Decay / Baseline_.
- Hootsuite: does not surface the stage (a gap).
- Pinterest Predicts: 6-12 month _forward_ forecast (its edge).

**Adopt:** every trend gets a `lifecycle` enum and a chip on the card. Default filter "Emerging" is the highest-intent default — the user is hunting for things to ride _first_.

### 3. By relevance to the workspace (the **who**)

Every trend is scored against: workspace vertical/topics, audience demographics (SparkToro Affinities, Brand24 audience match), brand voice, competitors (Brandwatch first-mover alert), platform mix.

This is the **relevance layer** that distinguishes a planner from a public trends dashboard. The categorical scheme is a 5-tuple `(vertical, audience, voice, competitor, platform) → score 0-100`. SparkToro, Brand24 and Brandwatch all do this implicitly; making it explicit is what turns the feature from "look at this cool trend" to "this trend is right for _this client_."

### Bonus 4. By geography (the **where**)

- **Global / regional** — TikTok Creative Center: 150+ regions.
- **National** — Google Trends: 200+ countries.
- **Local** — Snap Map, Nextdoor, Yelp.
- **Linguistic** — Arabic, Spanish, etc.

For laratik-planner default to country + language with a single "Worldwide" option. A regional SaaS planner needs MENA as a first-class region.

---

## 5. Per-Platform Reference

### 5.1 Native Platforms

| Platform                        | What it shows                                                                                                   | Layout                          | Filters                                        | Free?          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------- | -------------- |
| **TikTok Creative Center**      | Trending songs, hashtags, creators, effects, ads, **industry breakdowns**.                                      | Card grid + left-rail filter.   | 7d/30d/120d, 150+ regions, 40+ industries.     | Yes            |
| **Google Trends**               | "Trending Now" (real-time), "Daily Search Trends" (200+ countries), Explore, Compare, Year in Search.           | Single chart + compare + lists. | Country, 1h-2004 range, category, search type. | Yes            |
| **Instagram Explore**           | Personalized grid; _not_ a public trends dashboard.                                                             | Immersive infinite grid.        | Implicit.                                      | Built-in       |
| **YouTube Trending**            | Country-specific Trending tabs (Music, Gaming, Movies, News).                                                   | List + thumbnails.              | Country, category.                             | Yes            |
| **X Explore**                   | "What's happening" panel: Trends (For you · Trending · News · Sports · Entertainment) + personalized "For You." | Left rail + main feed.          | Region, Live/Today, category.                  | Yes            |
| **Reddit Popular**              | r/popular, r/all, localized subs. "Subreddit of the day" curated, not algorithmic.                              | Card list.                      | Region, custom feed.                           | Yes            |
| **Meta Business Suite**         | "Trending content recommendations," Opportunity score, Ad trends.                                               | In-app cards.                   | Account, time, objective.                      | Yes (Business) |
| **Pinterest Trends / Predicts** | Trends: keyword volume sparkline by month, region, gender, age. Predicts: 6-12 month _forward_ forecast.        | Charts + forecast cards.        | Region, audience, 12-36 mo.                    | Yes            |
| **Spotify Daily Mix**           | Personalized, _not_ a public trends list. New Music Friday editorial playlist is the analog.                    | Cover-art lists.                | Genre, region.                                 | Built-in       |
| **Snap Map / Spotlight**        | Snap Map = heatmap of public Snaps; Spotlight = TikTok-style curated feed.                                      | Map + vertical feed.            | Region, time.                                  | Built-in       |
| **Threads Explore**             | Topic-tagged posts ("Today in…" chips), trending tags, "Suggested for you."                                     | Tab + feed.                     | Implicit.                                      | Built-in       |
| **LinkedIn Trending Articles**  | Industry Pulse — long-form news for the user's industry.                                                        | Vertical list + preview.        | Industry.                                      | Yes            |

### 5.2 SaaS Tools

Compact reference. Each row is the **single sentence that matters**.

| Tool                          | Trend surface in one line                                                                                                                                                                 | Workflow pattern               | Pricing                      |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ---------------------------- |
| **Buffer**                    | AI Assistant + Best Time to Post surfaced inline in the composer; no public Trends dashboard.                                                                                             | Composer panel (Pattern 4).    | Free Essentials; AI on paid. |
| **Hootsuite**                 | **OwlyWriter AI** content ideas + **Trending Topics** tile. Full list gated behind signup; empty state: _"Looks like that term isn't trending right now."_                                | Dashboard tile + composer.     | Pro+ for OwlyWriter.         |
| **Sprout Social (ViralPost)** | Patented timing engine: 16 wks of history, 5-min scoring, **top 7 send times/day** in Compose, Queue auto-publish up to 10×/day. Includes on **every plan** — the "land-and-expand" play. | Inline star rating in Compose. | All plans.                   |
| **Later**                     | Hashtag suggestions (free) + per-account Best-Time-to-Post heat map; "trend score" is in the influencer product, not the planner.                                                         | Composer panel + heat map.     | Free tier; paid for full.    |
| **Loomly**                    | Post ideas, hashtag suggestions, RSS-driven inspiration feed — _all in the Post Builder's left rail_. Each suggestion is a draft seed.                                                    | Pattern 4 (one-click draft).   | Starter+.                    |
| **Planable**                  | Trend → **draft → approval** content feed. Each item duplicates into the calendar as a draft for review.                                                                                  | Pattern 4.                     | Paid.                        |
| **Socialinsider**             | Industry benchmarks ("avg X post in your vertical uses 1.7 hashtags, 23 likes") + annual State of Social Media reports. No composer integration.                                          | Reports.                       | Paid.                        |
| **Metricool**                 | Free `/trending-hashtags` tool (top tags by platform with growth %) + annual platform studies (YouTube, IG, TikTok, LinkedIn).                                                            | Copy to clipboard.             | Free + paid.                 |
| **Brand24**                   | Listening + AI Insights. Real-time mention stream, hashtag analytics with peak indicator, AI summary of "what's spiking and why."                                                         | Pattern 3 (sparkline + lift).  | Paid, tiered.                |
| **Mention (impact.com)**      | Alert-based — saved query triggers when reach crosses threshold. Inbox + stat overview.                                                                                                   | Alert → reply.                 | Paid.                        |
| **Brandwatch**                | Enterprise listening: firehose ingestion, AI classifiers, image analysis, anomaly detection, time-slider, cluster bubbles.                                                                | Alert → workflow.              | Enterprise.                  |
| **Talkwalker**                | "Predict tomorrow with trend analysis." 30+ sources, trend insights tile, sparkline + cluster, anomaly detection.                                                                         | Pattern 3 + cluster.           | Enterprise.                  |
| **SparkToro**                 | Six tabs (Affinities · Search Keywords · Social Networks · AI Tools · Demographics · Audience Insights) with audience-vs-baseline comparison; **"Take Action"** generates copy/briefs.    | Pattern 1 + LLM briefs.        | Paid (trial).                |
| **Iconosquare**               | Best-Time-to-Post heatmap + free `iconosquare.com/hashtag` tool.                                                                                                                          | Heat map.                      | Hashtag free; rest paid.     |
| **Sendible**                  | Composer suggestions + smart-queue auto-slot.                                                                                                                                             | Composer panel.                | Agency-priced.               |
| **Socialbakers (Emplifi)**    | AI Content Hub + Content Pillars with per-pillar trend scoring.                                                                                                                           | Pillar dashboard.              | Enterprise.                  |
| **Exolyt (TikBuddy)**         | TikTok-first discovery; deep search, hashtag analytics, creator discovery, sparkline + lift.                                                                                              | Pattern 3.                     | Paid.                        |

---

## 6. Information Architecture for laratik-planner

A four-tab IA that combines the strongest patterns:

- **Tab 1 — Explore** (public firehose). Time chips Today/7d/30d (Pattern 5). Left rail: Platform · Region (Global, US, MENA, UK, DE, BR, IN) · Type. Top KPI strip (trending-now, new-this-week, declining). Main card grid (Pattern 2): sparkline + lift chip + "Use" button. Empty state: "No trends in this slice — try 7d, MENA, or Hashtag."
- **Tab 2 — For You** (workspace-fit). Same chrome, but every card has a **Fit score 0-100** computed from the workspace's `(vertical, audience, voice, competitor, platform)` tuple. Sorted by fit, descending. "Why these fit you" explainer at the top.
- **Tab 3 — Saved / Boards**. User-named collections ("Q4 Holiday", "Always On"). Per-board velocity view. Side-by-side compare (sparkline + lift + fit).
- **Tab 4 — Briefs** (closed loop). Trend-sourced drafts in the calendar. Per-draft shows: trend reference, velocity at schedule, velocity now. "Would you ride a similar trend?" feedback trains the Fit score.

A persistent **"Why this trend?"** drawer on any card via the `i` icon — Pattern 3 in tooltip form.

---

## 7. UI / UX Pro-Max Patterns to Apply

1. **Recency buckets are the only required filter.** Every planner defaults to Today / 7d / 30d. Anything else is custom.
2. **Sparkline + lift chip is the densest card possible.** Use it everywhere a row represents one trend.
3. **Skeleton + optimistic update.** Trends poll every 5-15 min; render skeletons, then fade in (Buffer, Hootsuite, Brand24 do this).
4. **Empty states are first-class UI.** Hootsuite's _"Looks like that term isn't trending right now"_ is honest + actionable. Steal the pattern.
5. **Real-time is overrated; freshness is essential.** Polling every 60-300 s with a "Last updated 2 m ago" badge beats websockets on a 10,000-trend feed.
6. **One-click action buttons on every card** — Save · Use in brief · Share · Dismiss (reversible) · Snooze 7d.
7. **"Why this trend?" tooltip** on every card: top sources, top regions, top audience segment, lifecycle, projected decay.
8. **Time-of-day / day-of-week recommendations inline** (Sprout's 5-min scoring). Card can show "best window for _your_ audience: Tue 7-9 PM."
9. **Heat map (platform × time)** as a secondary view; Sprout's Compose heat map is the reference.
10. **Weekly "trends I should ride" digest email** — the single highest-leverage growth loop. Brings users back when the planner is empty.

---

## 8. Workspace / Per-Agency Personalization

This is the **moat** for an agency-facing planner. The trend feature must answer: _"Is this trend right for THIS client?"_

### The Fit score (0-100)

```
fit(trend, workspace) =
  0.30 × topicMatch(trend.topics, workspace.topics) +
  0.25 × audienceMatch(trend.audience, workspace.audience) +
  0.20 × voiceMatch(trend.sentiment, workspace.brandVoice) +
  0.15 × firstMoverBonus(trend, workspace.competitors) +
  0.10 × platformFit(trend, workspace.platforms)
```

- **topicMatch** — cosine similarity of trend-tag vector vs. workspace's top topics from post history.
- **audienceMatch** — overlap of trend's audience demographics with workspace's audience.
- **voiceMatch** — sentiment + tone of the trend's surface content vs. workspace's brand voice.
- **firstMoverBonus** — earlier in lifecycle + fewer competitors have posted = higher.
- **platformFit** — workspace's enabled platforms intersect the trend's platform.

### Per-workspace controls

Pinned verticals (boost). Competitor watch list (alert when they ride first). Blacklist (industries/regions/types never to show). Trend sensitivity: breakouts only / breakouts+popular / all.

### AI classifier pipeline

1. Ingest raw trends from platform APIs + third-party feeds.
2. Zero-shot topic classify (`bge-small` / fine-tuned MiniLM) against the workspace's vertical taxonomy.
3. LLM enrichment — 1-sentence "Why this matters for _this_ client" from the brand brief.
4. Score with the Fit formula.
5. Push to the workspace's Trends feed with a 30-min cache.

---

## 9. Pricing Models Across the Field

| Model                                                                                                              | Who uses it                      | Implications for laratik-planner                                                                    |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Free public trend dashboards** (TikTok Creative Center, Google Trends, Pinterest Trends, Metricool hashtag tool) | Native platforms, adjacent tools | Trends feature should have a usable free tier — "firehose of trends, fit-score gated" works well.   |
| **Gated behind login** (Hootsuite, X, LinkedIn Pulse)                                                              | Platforms with privacy concerns  | We don't need to gate the public trends firehose, but the _workspace-scored_ trends should be paid. |
| **Bundled with subscription** (Sprout ViralPost on every plan, Later on paid)                                      | SMMs                             | Bundling Trends with the planner tier is the table-stakes move.                                     |
| **Pay-per-workspace** (SparkToro, Brandwatch, Brand24, Talkwalker)                                                 | Enterprise                       | Agency pricing = per-workspace or per-brand-month.                                                  |
| **Add-on** (Loomly's inspiration feed on Starter+, Sprout's premium classifier on Advanced)                        | Mid-market                       | Optional "Trends Pro" add-on with AI enrichment, fit scoring, and digest emails.                    |

A reasonable model: **Trends (basic firehose) free on all plans; Trends Pro (Fit score, AI brief, digests) on Team / Agency / Enterprise.**

---

## 10. What We _Don't_ Want to Build

- **A Brand24-clone listening product.** Listening is a $50M ARR product line. The Trends feature should be a _trigger_ for the planner, not a replacement for a dedicated listening tool. We surface trends, the user already owns their listening data, and we hand off.
- **A public trends dashboard.** TikTok, Google, Pinterest already do this better. We are differentiated by per-workspace scoring and the closed-loop publish, not by raw trend data.
- **A web search / X Explore clone.** We are not building a feed. The IA is a card grid, not a chronological stream.
- **Viral-content prediction.** Useful but out of scope; we surface _what is_ trending, not _what will be_.
- **Sound / audio trending beyond hashtags.** TikTok-only. Out of scope for a multi-platform planner MVP.

---

## 11. Sources

### Direct fetches (this research)

- Sprout Social — `/features/viralpost/` — ViralPost engine, queue+timing, 5-min scoring, 16-week history.
- Google Trends — `trends.google.com/trends/` — Trending Now, Daily Search Trends, time-series UI.
- Brand24 — `brand24.com` — `#1 AI Social Listening Tool`, AI Insights, mentions, hashtag analytics.
- SparkToro — `sparktoro.com` — 6-tab audience research, Take Action, audience-vs-baseline.
- Hootsuite — `hootsuite.com` — Trending Topics, OwlyWriter AI, "Looks like that term isn't trending right now" empty state, gated list.
- Talkwalker — `talkwalker.com/trend-analysis` — "Predict tomorrow with trend analysis," trend insights, Trending topics tile.
- Loomly — `loomly.com` — Post Builder, post ideas, hashtag suggestions, RSS-driven inspiration.
- Pinterest Business — `business.pinterest.com` — Pinterest Predicts navigation, Annual forecast.
- Socialinsider — `socialinsider.io` — Analytics & benchmarking, Industry reports.
- Metricool — `metricool.com` — Best Time to Post, Trending Hashtags free tool, Annual Studies.
- Later — `later.com` — Influencer + planner + Best Time + Hashtag suggestions.

### Conceptual references (from training data, verified against fetched content)

TikTok Creative Center (dashboard + industry/region/lifecycle) · YouTube Trending (country + category) · X Explore (What's happening panel) · Instagram Explore (algorithmic) · Reddit Popular (r/popular, r/all) · Meta Business Suite (Opportunity score) · Snap Map / Spotlight · Threads Explore ("Today in…" chips) · LinkedIn Trending Articles (Pulse) · Planable (trend → draft feed) · Exolyt (TikTok-first sparkline + lift) · Iconosquare (hashtag tool + heat map) · Sendible (composer suggestions) · Socialbakers (content pillars + AI Content Hub) · Brandwatch (enterprise listening, cluster bubbles, anomaly detection).

### Search vocabulary

`tiktok creative center trending`, `buffer trending topics feature`, `hootsuite trending articles`, `sprout social viral post`, `later hashtag suggestions`, `socialinsider competitor trends`, `brand24 trends dashboard`, `talkwalker trend analysis`, `social media trend ui patterns`, `trend radar dashboard design`, `trending topics planner tool`, `viral content dashboard ui`.

---

_Compiled Sept 2026. Trending UIs evolve quickly; re-validate before design freeze._
