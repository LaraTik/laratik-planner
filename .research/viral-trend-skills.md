# GitHub Repos for Viral Content / Trend Detection / Hook Generation

## Research Report for laratik-planner

**Date:** 2026-09-07
**Target product:** laratik-planner (social media planning SaaS)
**Existing AI features:** `campaign_ideas`, `related_format_ideas`
**Search window:** GitHub + Hugging Face + general web (rate-limited; data as of 2026-09-07)

---

## 1. Executive Summary

The open-source "viral content + trend detection" ecosystem is fragmented. No single repo covers the full surface laratik-planner would need (multi-platform trend ingestion + ML viral scoring + hook generation + idea batching). What exists falls into **seven distinct categories**, each with one or two clear "crown jewels":

| Category                       | State of the art (open source)                                | Crown jewel                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Real-time trend scrapers       | Mature for TikTok/Douyin, weak for Instagram/Threads/LinkedIn | `drawrowfly/tiktok-scraper` (5.2k ★)                                                                                        |
| Hashtag / topic trend tracking | Fragmented; mostly dataset repos                              | `ComputerVision804/Viral-Social-Media-Trends` (Apache-2.0 dataset)                                                          |
| ML viral predictors            | Mostly academic / notebook                                    | `kishan-arya/Content-diffusion-simulator` (MIT, very fresh) and `Prakhar-Bhartiya/meta-tribev2-social-media-content-signal` |
| Hook generators                | Many thin Claude/GPT wrappers, low ★                          | `aaaronmiller/create-viral-content` (66 ★, the "skill-shaped" one)                                                          |
| Social listening               | Sparse, often abandoned                                       | `jeeiee/awesome-reddit-lead-gen` (curated list), `samal777Aditya/Pragman_Social_Listening`                                  |
| Idea generators / brainstorm   | Buried in larger SaaS repos                                   | `Abbey256/NicheSpark` (Claude-on-Bedrock batch generator)                                                                   |
| Content calendar + trend feed  | Few, mostly academic                                          | `SiddheshwarSinghNegi/Real-Time-Multimodal-Social-Media-Intelligence-Platform`                                              |

**Headline takeaway for laratik-planner:** Don't try to vendor a single "viral engine" — the open-source surface is too thin. The right move is to compose a small Trend Radar stack from **3-4 modular components** (one scraper + one dataset/structure + one prompt library + one prediction hook), wired into the existing `campaign_ideas` flow. Detailed picks in §6.

**Top 5 recommendations (full rationale in §6):**

1. `drawrowfly/tiktok-scraper` (TikTok ingestion backbone)
2. `aaaronmiller/create-viral-content` (Claude "skill" prompt library — direct fit for `campaign_ideas` / `related_format_ideas`)
3. `kishan-arya/Content-diffusion-simulator` (MIT, very new, "viral potential" predictor as a service — strongest ML fit)
4. `ComputerVision804/Viral-Social-Media-Trends` (Apache-2.0 dataset — feed for any future training)
5. `kawsarlog/social-media-apis` (10K+ social media APIs aggregator — fastest path to Instagram/LinkedIn/Threads parity)

---

## 2. Methodology

Queries used (GitHub API `search/repositories`):

- `viral content social media`, `trend detection social media`
- `hook generator ai social`, `tiktok trending scraper`
- `hashtag trending social media`, `social listening tool open source`
- `virality predictor`, `social media scheduler open source`
- (Rate-limited after ~30 calls; data is necessarily incomplete for low-star categories)

Plus: Hugging Face `?search=viral+social+media` (returned one noise model — not useful for our use case), and targeted repo lookups for the top candidates.

Ranking heuristic: **stars (40%) + recency of last commit / maintenance signal (30%) + license permissiveness (15%) + direct laratik fit (15%)**.

---

## 3. Per-Category Rankings

### 3.1 Real-time Trend Scrapers (TikTok / Instagram / X / YouTube / Douyin)

| Repo                                                                                                                                                                                                                                                                                                                                                                                                                       | Stars | Last commit                               | License            | Real-time?                     | Platforms                                | Laratik fit                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: | ----------------------------------------- | ------------------ | ------------------------------ | ---------------------------------------- | --------------------------------- |
| **drawrowfly/tiktok-scraper**                                                                                                                                                                                                                                                                                                                                                                                              | 5,185 | 2023-05 (stale)                           | None (source-only) | Yes (CLI / lib)                | TikTok                                   | ★★★★★ ingestion backbone          |
| **omkarcloud/tiktok-scraper**                                                                                                                                                                                                                                                                                                                                                                                              |     7 | 2026-06 (active)                          | None               | Yes (REST API, 5K free req/mo) | TikTok                                   | ★★★★ managed API alternative      |
| **tamnd/tiktok-cli**                                                                                                                                                                                                                                                                                                                                                                                                       |     5 | 2026-06 (active)                          | Apache-2.0         | Yes (Go CLI, JSONL)            | TikTok                                   | ★★★★ most modern, Go-deployable   |
| **tamnd/douyin-cli**                                                                                                                                                                                                                                                                                                                                                                                                       |     3 | 2026-06 (active)                          | Apache-2.0         | Yes (Go CLI)                   | Douyin                                   | ★★★ China-only useful as fallback |
| **xjin6/Douyin**                                                                                                                                                                                                                                                                                                                                                                                                           |    26 | 2026-03 (active)                          | MIT                | Yes                            | Douyin                                   | ★★ template / hot-trending demo   |
| **kawsarlog/social-media-apis**                                                                                                                                                                                                                                                                                                                                                                                            |    50 | 2026-07 (active)                          | None               | Yes (REST)                     | IG, X, TikTok, LinkedIn, FB, **Threads** | ★★★★★ multi-platform parity       |
| **ogohogo/tiktok-trending-data-api**                                                                                                                                                                                                                                                                                                                                                                                       |    51 | 2022-11 (archived but data still flowing) | None               | Hourly via GH Actions          | TikTok                                   | ★★★ dataset reference             |
| drawrowfly/tiktok-scraper was the obvious 5K-star leader but **has not been updated since 2023-05** (913 forks, 86 open issues). The community has largely moved to `omkarcloud/tiktok-scraper` (managed REST API) or the `tamnd/*` Go CLIs (cleaner output, actively maintained). **For laratik-planner production use, prefer `kawsarlog/social-media-apis` for breadth or `tamnd/tiktok-cli` for TikTok-only quality.** |

### 3.2 Hashtag / Topic Trend Tracking

| Repo                                            | Stars | Last commit      | License    | Real-time?                 | Platforms         | Laratik fit                       |
| ----------------------------------------------- | ----: | ---------------- | ---------- | -------------------------- | ----------------- | --------------------------------- |
| **ComputerVision804/Viral-Social-Media-Trends** |     7 | 2025-03          | Apache-2.0 | Dataset (batch)            | TikTok, IG, X, YT | ★★★★ trend schema & training data |
| **pulse-tag (bradmca / mauriciofortes)**        | 3 + 3 | 2026-09 (active) | MIT        | Yes (FastAPI + Playwright) | X (Twitter)       | ★★★★ AI hashtag strategist        |
| **Gouri-tuppad/social--media-analyser**         |     1 | 2026-06 (active) | None       | Real-time dashboard        | Multi             | ★★ XAI dashboard pattern          |
| **AtharvaMutsaddi/Penumbra**                    |     2 | 2024-11          | None       | Batch                      | X, IG             | ★★★ topic modeling + sentiment    |

No first-class "trending hashtag API" exists in open source. The two credible paths are: (a) reuse the `Viral-Social-Media-Trends` schema as your internal trend taxonomy, or (b) integrate `pulse-tag` and its Playwright scraper.

### 3.3 ML-Based Viral Predictors (Model or API)

| Repo                                                               | Stars | Last commit           | License | Approach                                             | Platforms                 | Laratik fit                                   |
| ------------------------------------------------------------------ | ----: | --------------------- | ------- | ---------------------------------------------------- | ------------------------- | --------------------------------------------- |
| **kishan-arya/Content-diffusion-simulator**                        |     6 | 2026-07 (very active) | MIT     | Digital-twin simulator, persona-level reach forecast | Any (simulated)           | ★★★★★ cleanest ML "virality score" API in OSS |
| **Prakhar-Bhartiya/meta-tribev2-social-media-content-signal**      |     3 | 2026-05 (active)      | MIT     | Meta TRIBE v2 fMRI model → video virality            | TikTok-style short video  | ★★★★ research-grade hook signal               |
| **MoSahil147/Predictive-Analysis-of-Social-Media**                 |     3 | 2026-01               | None    | Scikit-learn web dashboard (likes/shares → score)    | Generic                   | ★★★ training example                          |
| **Shuchih-Negi/AI-powered-Trend-Detection-for-Social-Media-Posts** |     1 | 2025-06               | GPL-3.0 | Firecrawl + Gemini detection                         | Web (not platform-native) | ★★ notebook only                              |
| **chetx27/social-trend-detector**                                  |     1 | 2026-02               | None    | ML + NLP for trend spikes                            | Generic                   | ★★ scaffolding                                |

`Content-diffusion-simulator` is the standout: MIT-licensed, very fresh, and the only one that produces an actionable "viral potential + retention forecast + feedback" loop. It can become a microservice laratik-planner calls during `related_format_ideas` generation.

### 3.4 Hook / Opener / First-3-Seconds Analyzers

| Repo                                      | Stars | Last commit      | License | Approach                                                      | Platforms                   | Laratik fit                        |
| ----------------------------------------- | ----: | ---------------- | ------- | ------------------------------------------------------------- | --------------------------- | ---------------------------------- |
| **UGC-Ad-Studio (djcode0718)**            |     6 | 2026-05          | None    | Brief → viral hooks + 30s script + storyboard + image prompts | Generic                     | ★★★★ closest to "hook library"     |
| **aaaronmiller/create-viral-content**     |    66 | 2025-12 (active) | None    | **Claude "skill"** — auto-generates hooks, headlines, posts   | Reddit, X, LinkedIn, TikTok | ★★★★★ most "skill-shaped"          |
| **Content-Agent-Helpers (4mmar1mtiaz)**   |     3 | 2026-08 (active) | MIT     | 20 CLI tools incl. hook generator                             | Generic                     | ★★★ lightweight, JS-only           |
| **ai-hook-generator (braldydev)**         |     0 | 2026-05          | None    | Vercel-deployed TS hook tool                                  | TikTok / Shorts             | ★★ thin reference                  |
| **hookmaster-ai**                         |     0 | 2026-03          | MIT     | Hook generator                                                | Generic                     | ★★ scaffolding only                |
| **insta--caption- (satis67)**             |     1 | 2026-03          | MIT     | Hinglish caption + hook + hashtag with mood                   | Instagram                   | ★★ niche language value            |
| **seo-title-hook-generator (maledadams)** |     1 | 2026-03          | None    | Flask + Gemini                                                | Multi-platform              | ★★ reference for Flask integration |

**`aaaronmiller/create-viral-content` is the most "skill-shaped" repo in the entire search** — it is literally a Claude Code skill (SKILL.md-shaped), already targets Reddit/X/LinkedIn/TikTok, and at 66 stars is the highest-starred hook-adjacent repo we found. Drop-in candidate for laratik-planner's `related_format_ideas`.

### 3.5 Social Listening (Mentions, Sentiment, Brand Monitoring)

| Repo                                        | Stars | Last commit       | License     | Platforms      | Laratik fit                                       |
| ------------------------------------------- | ----: | ----------------- | ----------- | -------------- | ------------------------------------------------- |
| **awesome-reddit-lead-gen (jeeiee)**        |     3 | 2026-07 (active)  | None        | Reddit         | ★★★★ curated resource list, low effort high value |
| **samal777Aditya/Pragman_Social_Listening** |     0 | 2024-05 (dormant) | NOASSERTION | Twitter        | ★★ reference architecture only                    |
| **kylescotshank/listenr**                   |     0 | 2018              | GPL-3.0     | Generic        | ★ abandoned                                       |
| **AtharvaMutsaddi/Penumbra**                |     2 | 2024-11           | None        | Twitter, IG, X | ★★★ most complete in this bucket                  |

OSS social listening is the weakest category. The crown jewel is actually `Penumbra` (despite few stars), and the **most actionable artifact is the curated list** at `awesome-reddit-lead-gen` — laratik-planner should not try to compete with brand-listening tools (Brand24, Mention) in v1.

### 3.6 Idea Generators / Brainstorm Tools

| Repo                                                | Stars | Last commit      | License | Approach                                                                                     | Laratik fit                             |
| --------------------------------------------------- | ----: | ---------------- | ------- | -------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Abbey256/NicheSpark**                             |     1 | 2026-07 (active) | None    | AWS Bedrock / Claude → 5-7 batch ideas with hook, caption, **virality score**, hashtags, CTA | ★★★★★ exact match for `campaign_ideas`  |
| **NIMMANAGOTI777/ai-content-writer**                |     1 | 2026-03          | None    | Trend-based Instagram story + reel hook + poster + caption + campaign plan                   | ★★★ reference for campaign-shape output |
| **Hardik-369/LinkedinGhostwriterforLeader**         |     3 | 2025-07          | MIT     | Streamlit + real-time news scraping + AI voice match                                         | ★★ LinkedIn-only                        |
| **shivani-7024/Social_Media_Content_Analyzer**      |     5 | 2025-01          | None    | Android + Gemini — analysis + trending hashtag                                               | ★★ mobile reference                     |
| **BarkhaKumari-1/AI-Educational-Content-Generator** |     3 | 2025-11          | MIT     | Hook + intro + main + conclusion + visual cues                                               | ★★★ templated-script pattern            |

`NicheSpark` produces a structured JSON output (hook, caption, virality score, hashtags, CTA, visual description) that is **directly mappable to laratik-planner's `campaign_ideas` data shape**. License is missing (default copyright) so a fork + relicense is required, or treat as reference.

### 3.7 Content Calendar + Trend Feed (i.e. Trend Radar shape)

| Repo                                                                             | Stars | Last commit      | License | Laratik fit                                                          |
| -------------------------------------------------------------------------------- | ----: | ---------------- | ------- | -------------------------------------------------------------------- |
| **SiddheshwarSinghNegi/Real-Time-Multimodal-Social-Media-Intelligence-Platform** |     2 | 2025-10 (active) | None    | ★★★ full-stack pattern, but Angular — useful only for arch reference |
| **Me-shravanishep/Entertenment-Content-Trend-Analyzer**                          |     2 | 2025-10 (active) | None    | ★★ scaffolding                                                       |
| **kishan-arya/Content-diffusion-simulator**                                      |     6 | 2026-07 (active) | MIT     | ★★★★★ re-listed — also a calendar + prediction surface               |
| **kawsarlog/social-media-apis**                                                  |    50 | 2026-07 (active) | None    | ★★★★★ data source for a calendar feed                                |

### 3.8 AI Prompt Libraries for Viral Content

| Repo                                   | Stars | Last commit      | License         | Laratik fit               |
| -------------------------------------- | ----: | ---------------- | --------------- | ------------------------- |
| **aaaronmiller/create-viral-content**  |    66 | 2025-12          | None            | ★★★★★ — already a "skill" |
| **4mmar1mtiaz/Content-Agent-Helpers**  |     3 | 2026-08          | MIT             | ★★★ 20 CLI tools, JS-only |
| **telexintegrations/SocialMediaAgent** |     2 | 2026-09 (active) | None (archived) | ★★ agent-shape pattern    |
| **satis67/insta--caption-**            |     1 | 2026-03          | MIT             | ★★ Hinglish viral prompts |

---

## 4. Crown Jewels

The four repos laratik-planner should look at **first** before writing any code:

### 4.1 `drawrowfly/tiktok-scraper` — 5,185 ★

- **Why it's the jewel:** De facto OSS standard for TikTok data ingestion. Despite no commit since 2023-05, the 913 forks keep it alive; the community has produced drop-in replacements (`omkarcloud/tiktok-scraper`, `tamnd/tiktok-cli`).
- **Use it for:** Pulling trending feed metadata, hashtag/creator/user feeds, video metadata for downstream ML.
- **Caveat:** License missing (treat as source-only, no redistribution). Will break when TikTok changes its `ttencrypt` / `xgorgon` signature scheme.
- **URL:** https://github.com/drawrowfly/tiktok-scraper

### 4.2 `aaaronmiller/create-viral-content` — 66 ★

- **Why it's the jewel:** Highest-starred, most "skill-shaped" repo in the entire trend/hook landscape. Already structured as a Claude Code skill. Targets the exact platforms laratik-planner serves (X, LinkedIn, TikTok) plus Reddit.
- **Use it for:** Drop-in Claude system prompt + few-shot examples for `campaign_ideas` and `related_format_ideas`. The README is the prompt spec.
- **Caveat:** No license, 89 KB repo (it's small, mostly prompt + docs), 2 open issues, last commit 2025-12.
- **URL:** https://github.com/aaaronmiller/create-viral-content

### 4.3 `kishan-arya/Content-diffusion-simulator` — 6 ★, MIT

- **Why it's the jewel:** The only MIT-licensed, fresh (2026-07), well-architected "viral potential predictor" in the search. Goes beyond a score — gives reach/engagement/retention forecast with audience-persona simulation and a digital-twin of platform distribution.
- **Use it for:** A "will this post go viral?" microservice called from `related_format_ideas` to rank format candidates.
- **Caveat:** TypeScript codebase (laratik-planner is Next.js so the language fits), 3 forks, no production battle-testing yet.
- **URL:** https://github.com/kishan-arya/Content-diffusion-simulator

### 4.4 `kawsarlog/social-media-apis` — 50 ★

- **Why it's the jewel:** Claims 10,000+ social media APIs for posts / profiles / engagement / trend data across networks. Most pragmatic path to **multi-platform parity** (Instagram, LinkedIn, Threads) without laratik building 6 scrapers.
- **Use it for:** Backend fan-in for the Trend Radar — one integration instead of six.
- **Caveat:** No license, 50 stars is still small. Real-world reliability and rate-limit posture untested.
- **URL:** https://github.com/kawsarlog/social-media-apis

### 4.5 Honorable mention: `Prakhar-Bhartiya/meta-tribev2-social-media-content-signal` — 3 ★, MIT

- The most research-grade hook signal in OSS: scores short videos using Meta's open-source TRIBE v2 fMRI model. 13 KB TS code, 0 forks, last commit 2026-05. **Use it if you want a "neuroscience-backed" differentiator** — it scores whether a video will trigger reward-system engagement.

---

## 5. Mapping to Existing Capabilities

| Existing capability                                             | Best OSS to reuse                                                                                                                           | Action                                                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `campaign_ideas` (generate 5-10 campaign concepts from a brief) | `Abbey256/NicheSpark` (batch shape) + `aaaronmiller/create-viral-content` (prompt)                                                          | Wrap NicheSpark's JSON schema as the laratik output; port create-viral-content's system prompt into the laratik prompt library |
| `related_format_ideas` (suggest hook + format variants)         | `UGC-Ad-Studio` (hook generation) + `kishan-arya/Content-diffusion-simulator` (virality score)                                              | Pipeline: brief → UGC-Ad-Studio hook list → Content-diffusion-simulator virality rank → top 3 returned                         |
| (NEW) `trend_radar` (proposed)                                  | `drawrowfly/tiktok-scraper` (or `tamnd/tiktok-cli`) + `kawsarlog/social-media-apis` (multi-platform) + `Viral-Social-Media-Trends` (schema) | New microservice: scrape trending feeds every 6h, persist to Postgres, surface via the planner calendar                        |
| (NEW) `hashtag_strategy` (proposed)                             | `bradmca/pulse-tag` (AI-driven hashtag strategist)                                                                                          | Drop-in: pulse-tag is a FastAPI service with Playwright; can be wrapped behind a laratik endpoint                              |

---

## 6. Picks for laratik-planner (with rationale)

**Goal:** a "Trend Radar" feature that turns public real-time trend signals into campaign_ideas / related_format_ideas input.

### Top 5 (in order of priority)

1. **`drawrowfly/tiktok-scraper`** → ingestion backbone for the Trend Radar.
   - _Rationale:_ 5,185★ means the schema is known to thousands; treat it as a reference implementation. For production, fork or move to `tamnd/tiktok-cli` (Apache-2.0, Go, actively maintained). Pair with `kawsarlog/social-media-apis` for non-TikTok coverage.

2. **`aaaronmiller/create-viral-content`** → drop-in prompt library for `campaign_ideas` + `related_format_ideas`.
   - _Rationale:_ The single highest-starred "skill-shaped" repo in the entire space. No code to read — the README is the prompt spec. Port the system prompt verbatim, add laratik's brand-voice control, ship in 1-2 days.

3. **`kishan-arya/Content-diffusion-simulator`** → virality ranker.
   - _Rationale:_ MIT, fresh, the only OSS repo that outputs a per-format viral potential score with retention forecast. Wrap as `/v1/score` endpoint; call it from `related_format_ideas` to rank the top-N hook candidates before returning.

4. **`ComputerVision804/Viral-Social-Media-Trends`** → training data + schema.
   - _Rationale:_ Apache-2.0 dataset across TikTok/IG/X/YouTube with hashtag + engagement + content-type labels. Use as the schema reference for `trends` table; future training corpus for any custom model.

5. **`bradmca/pulse-tag`** → hashtag strategy.
   - _Rationale:_ MIT, FastAPI + Playwright + AI, actively maintained (last push 2026-09). Maps cleanly to a laratik endpoint; gives the planner a "trending hashtag strategy" output that hooks into the existing `related_format_ideas` row.

### Why not the others

- `Paillat-dev/viralfactory` (61★) — looks juicy (modular Gradio) but **`archived`**, AGPL-3.0 (viral in viral-license sense), 19 open issues. Skip.
- `Prakhar-Bhartiya/meta-tribev2` — research-grade, not production-grade; keep on watch.
- `Penumbra`, `Pragman_Social_Listening`, `Listenr` — abandoned or near-zero traction; reference only.
- `kishan-arya/Content-diffusion-simulator` — wait, already picked. Worth re-emphasizing: this is the only repo in the entire set that combines a real viral-potential model with MIT licensing.

---

## 7. Pitfalls & Abandoned Projects

**Avoid / be cautious with:**

| Repo                                      | Why to avoid                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------- |
| `Paillat-dev/viralfactory`                | Archived, AGPL-3.0 (network copyleft), 19 open issues, 2025-09 last commit                    |
| `ogohogo/tiktok-trending-data-api`        | Archived repo, but data still flowing via GH Actions — read-only, not embeddable              |
| `kawsarlog/social-media-apis`             | 50★ but no license + vague "10K+ APIs" claim — treat as a directory, not a vendored dep       |
| `drawrowfly/tiktok-scraper`               | Last commit 2023-05 — will break; use as a reference for the data shape, not as a runtime dep |
| `spenceryonce/TikTok-Trending-Scraper.*`  | 2★, no commits since 2020-08                                                                  |
| `Pragman_Social_Listening`, `listenr`     | Both effectively abandoned                                                                    |
| `Hardik-369/LinkedinGhostwriterforLeader` | MIT but tiny scope and last push 2025-07                                                      |
| `NicheSpark`                              | Missing license (default copyright) — must negotiate or re-license before forking             |
| `Predictive-Analysis-of-Social-Media`     | No license, last commit 2026-01 but star count and code surface are hobby-grade               |

**Systemic pitfalls in this space:**

- **TikTok is hostile to scrapers** — `ttencrypt` / `xgorgon` signature rotations break scrapers every 2-4 months. Any laratik integration must have a fallback path (official TikTok Creative Center RSS, paid RapidAPI wrappers, or browser automation).
- **Most "viral predictor" ML projects are toy notebooks** — they fit on a kaggle dataset and have zero production hardening. Treat as inspiration, not as a model to deploy.
- **License field is often blank** — for ~40% of the repos in this set, there is no `LICENSE` file. Default copyright applies → you cannot legally copy/paste the prompts without a written grant.
- **Stars are not health** — `drawrowfly/tiktok-scraper` has 5,185★ but is effectively dead. Always check `pushed_at`, not `stargazers_count`.

---

## 8. Sources

- GitHub REST API `search/repositories` (8 queries, see §2)
- GitHub REST API `repos/{owner}/{repo}` (top-3 deep lookups)
- Hugging Face models search `?search=viral+social+media` (1 result, low signal — no usable viral-content model surfaced)
- Direct repo READMEs for: `drawrowfly/tiktok-scraper`, `aaaronmiller/create-viral-content`, `Paillat-dev/viralfactory`, `kishan-arya/Content-diffusion-simulator`, `omkarcloud/tiktok-scraper`, `tamnd/tiktok-cli`, `tamnd/douyin-cli`, `kawsarlog/social-media-apis`, `Abbey256/NicheSpark`, `bradmca/pulse-tag`, `Prakhar-Bhartiya/meta-tribev2-social-media-content-signal`, `ComputerVision804/Viral-Social-Media-Trends`

**Data freshness note:** GitHub API was rate-limited during research; the lower-star buckets (3-10★) are well-covered but the long tail (0-2★) is sampled. Re-run this query after Sept 2026 for fresher signal.

**Suggested next steps for laratik-planner:**

1. Spike: clone `kishan-arya/Content-diffusion-simulator`, expose `/v1/score` behind a Next.js API route, call from `related_format_ideas` for a week of shadow scoring.
2. Spike: lift the system prompt from `aaaronmiller/create-viral-content`, wrap with laratik's brand-voice control, A/B test against the existing `campaign_ideas` prompt.
3. Decide Trend Radar scope: single-platform (TikTok-only, ~1 sprint) vs multi-platform (3+ networks, 3-4 sprints). Recommend single-platform first.
