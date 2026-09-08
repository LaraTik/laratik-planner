# Facebook & Instagram AI Skills — GitHub Repository Research

> **Target project:** `laratik-planner` (Next.js / TypeScript).
> **Date:** September 2026.
> **Scope:** AI-driven skills, SDKs, and libraries for Facebook + Instagram content, posting, captions, hashtags, Reels, stories, comments, DMs, ads, and analytics.
> **Constraint note:** GitHub's anonymous web search and the unauthenticated REST API both hit secondary rate limits from this IP during research. Hard numbers below come from direct repo fetches (starter repos + known "crown jewels" via the REST API). Other repo rows are from direct fetches or widely-cited public knowledge and are clearly marked.

---

## Executive Summary

The Facebook + Instagram AI-skill landscape splits cleanly into **three layers**, and the right pick depends on which layer `laratik-planner` actually needs:

1. **Meta's own platform layer (crown jewels).** Two official SDKs — `facebook/facebook-python-business-sdk` (1.59k★) and `facebook/facebook-nodejs-business-sdk` (616★) — wrap the Marketing/Graph APIs. They're the only legal, long-term-stable way to run **Facebook + Instagram Ads**, **Pages**, and **Business** flows at scale. For Instagram specifically, the unofficial but de-facto standard is `subzeroid/instagrapi` (6.76k★), the only private-API client with active 2026 maintenance. For the Node.js/Next.js target, the official Node SDK is the cleanest path; for "post to a personal IG account from a server" you must use `instagrapi` (Python service) or `dilame/instagram-private-api` (TS, less active).

2. **Claude/agent skill bundles (the "starter repo" tier).** These are _prompt + workflow_ files for Claude Code / Cursor / Codex, not libraries. The three you flagged are representative: `ScrapeCreators/social-media-research-skills` (2.1k★, MIT) is the strongest for **research**; `sergebulaev/facebook-skills` (33★) + `sergebulaev/instagram-skills` (46★) are the strongest **content-engineering** pair for **posting** via the Publora SaaS; `minhnv0807/ai-business-skills` (571★) is the broadest **general marketing** bundle but is region/VN-biased.

3. **Long tail.** The middle is mostly abandoned Instagram private-API forks, broken `node-facebook` packages, and SaaS-only tools (Buffer, Hootsuite, Later, Publer) that don't ship open code. A handful of MCP servers and ad-creative repos exist but are young.

**Top recommendation for `laratik-planner`:**

- **Read-only research / analytics** → use `facebook/facebook-nodejs-business-sdk` for the Graph + Insights surface, optionally layer `ScrapeCreators` as a research supplement.
- **AI caption / hashtag / Reels scripts** → adopt `sergebulaev/instagram-skills` + `sergebulaev/facebook-skills` as Claude Code skills for content drafting. Pure-LLM (your own prompts) is a fine substitute.
- **Auto-posting to personal Instagram** → run a small Python sidecar using `subzeroid/instagrapi`; do not attempt this from Next.js.
- **Auto-posting to Facebook Pages / Instagram Business** → use the official Node Marketing SDK + the Pages API.
- **Ads** → only the official Node/Python Marketing SDKs. Everything else is unsafe.

---

## 1. The Three Starter Repos — Direct Evaluation

### 1.1 `ScrapeCreators/social-media-research-skills`

| Field                 | Value                                                                                                                                                                                                                                                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL                   | https://github.com/ScrapeCreators/social-media-research-skills                                                                                                                                                                                                                                                                                     |
| Stars / Forks / Watch | **2.1k / 22 / 5**                                                                                                                                                                                                                                                                                                                                  |
| License               | **MIT**                                                                                                                                                                                                                                                                                                                                            |
| Primary languages     | Markdown skill definitions, JSON schemas                                                                                                                                                                                                                                                                                                           |
| Last pushed           | active in 2026 (created Aug 2025)                                                                                                                                                                                                                                                                                                                  |
| Platforms             | Instagram, TikTok, YouTube, Reddit, X, LinkedIn, **Facebook ad library**                                                                                                                                                                                                                                                                           |
| What it does          | A bundle of 12 "workflow" skills (outlier-post-finder, comment-mining, competitor-research, ad-library-teardown, trend-discovery, influencer-prospecting, audience-research, social-listening, product-demand, creator-profile, content-repurposing) + a `scrapecreators-api` data-layer skill. Read-only public data via the ScrapeCreators SaaS. |
| Self-host?            | **No.** Requires a ScrapeCreators API key.                                                                                                                                                                                                                                                                                                         |
| LaraTik fit           | **High for research, low for posting.** Pair with the official Graph SDK for actual publishing.                                                                                                                                                                                                                                                    |

**Verdict:** the canonical _research_ skill bundle. The 2.1k★ signal is real and the design ("workflow-first, API-second; cited outputs; baseline-aware analysis") is mature. Use it for: audience research, competitor teardowns, ad-library scraping, comment mining, trend discovery. **Don't** use it for posting — it's a research-only stack by design ("public-data only, do not promise logged-in/private data").

### 1.2 `sergebulaev/facebook-skills`

| Field                 | Value                                                                                                                                                                                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| URL                   | https://github.com/sergebulaev/facebook-skills                                                                                                                                                                                                                                                                           |
| Stars / Forks / Watch | **33 / 5 / 0**                                                                                                                                                                                                                                                                                                           |
| License               | **MIT**                                                                                                                                                                                                                                                                                                                  |
| Languages             | Markdown / skill frontmatter, minimal JSON                                                                                                                                                                                                                                                                               |
| Last pushed           | active in 2026 (created mid-2026)                                                                                                                                                                                                                                                                                        |
| Platforms             | **Facebook Pages only** (not Instagram, not Ads)                                                                                                                                                                                                                                                                         |
| What it does          | 5 skills for Claude Code/Codex: `hook-generator`, `post-creator`, `engagement-drafter`, `weekly-planner`, `comments-guard`. Drafts posts, hooks, replies, weekly plan. Posts **via Publora SaaS**; comment replies are returned as copy-paste blocks (Publora's reply endpoint is LinkedIn-only at the time of writing). |
| Self-host?            | **Partial.** Skills run locally with Claude Code, but the actual publish call goes to Publora. You can replace the publish step with a direct `facebook-nodejs-business-sdk` call.                                                                                                                                       |
| LaraTik fit           | **High for content drafting.** Drop the skills into your repo's `.claude/skills/` and pair with your own Next.js action that calls the Graph Pages API.                                                                                                                                                                  |

**Verdict:** low stars but high signal — same author publishes a coordinated family (linkedin, x, instagram, youtube, threads, tiktok, facebook) with the same MIT/Claude-Code/Publora pattern. The `sergebulaev/instagram-skills` sister repo (46★) is the _Instagram_ companion and covers captions, carousels, hooks, hashtag strategy, weekly plan. **Recommended pair.**

### 1.3 `minhnv0807/ai-business-skills`

| Field                 | Value                                                                                                                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL                   | https://github.com/minhnv0807/ai-business-skills                                                                                                                                                                      |
| Stars / Forks / Watch | **571 / 226 / 4**                                                                                                                                                                                                     |
| License               | **MIT**                                                                                                                                                                                                               |
| Languages             | Markdown skills, JSON, some Python                                                                                                                                                                                    |
| Last pushed           | active in 2026                                                                                                                                                                                                        |
| Platforms             | Broad marketing (4 regions: US/EU/SEA/LATAM + Vietnam 2025-2026). **TikTok** is tagged in topics; Facebook/Instagram present but not the focus.                                                                       |
| What it does          | 138 bilingual (VN + Global) AI marketing skills organized as four role SOP packs (content, design, performance, leader ops) plus strategy, personal brand, AI avatar, dropshipping, design master, knowledge library. |
| Self-host?            | **Yes.** Drop into Claude Code / OpenCode / Codex / Cursor. No SaaS dependency.                                                                                                                                       |
| LaraTik fit           | **Medium.** Useful as a _library of marketing SOP prompts_ — pick a few (TikTok content, dropshipping funnel), not all 138. Heavy on Vietnamese region knowledge, lighter on Meta specifics.                          |

**Verdict:** broad and high-velocity, but **not Meta-focused**. Treat as a swag bag of marketing prompt patterns, not a Facebook/Instagram library.

---

## 2. Crown Jewels — The Canonical Maintained Libraries

These are the libraries every serious Meta-platform builder uses. They are not skills in the "agent skill" sense — they are **SDKs / clients** that any Next.js backend can import and call.

| #   | Repo                                                                                                |         Stars | Forks | License                       | Lang       | Last activity                         | What it is                                                                                                                                                                                                               | LaraTik role                                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------- | ------------: | ----: | ----------------------------- | ---------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [`subzeroid/instagrapi`](https://github.com/subzeroid/instagrapi)                                   |     **6,764** |   975 | Other (free use)              | Python     | **active 2026-09-07**                 | The de-facto standard for Instagram _private_ API: posting photos, videos, Reels, Stories, IGTV, DMs, comments, follows, insights. Now offers HikerAPI SaaS fallback for clients that don't want to manage session risk. | **Use for any "post to a personal IG account" feature.** Run as a small Python service (FastAPI / sidecar) called from Next.js. |
| 2   | [`facebook/facebook-python-business-sdk`](https://github.com/facebook/facebook-python-business-sdk) |     **1,589** |   672 | Meta Platform License (Other) | Python     | active 2026-09-04                     | Official Meta Marketing API SDK — campaigns, ad sets, ads, insights, audiences, creatives, page posts, IG business.                                                                                                      | The **only** sane way to manage Facebook + Instagram **Ads** programmatically.                                                  |
| 3   | [`facebook/facebook-nodejs-business-sdk`](https://github.com/facebook/facebook-nodejs-business-sdk) |       **616** |   250 | Meta Platform License (Other) | JS         | active 2026-08-25                     | Same surface as the Python SDK, official, **fits Next.js/TypeScript directly.**                                                                                                                                          | **Primary pick for laratik-planner.** TypeScript types included.                                                                |
| 4   | [`facebook/facebook-php-business-sdk`](https://github.com/facebook/facebook-php-business-sdk)       |          ~600 |  ~200 | Meta Platform License         | PHP        | maintained                            | PHP counterpart of #2/#3.                                                                                                                                                                                                | Skip — wrong stack for Next.js.                                                                                                 |
| 5   | [`dilame/instagram-private-api`](https://github.com/dilame/instagram-private-api)                   |         ~1.2k |  ~150 | MIT                           | TypeScript | last release 2022, low activity       | TypeScript port of an early Instagram private API. **Not actively maintained** — fork or replace with `instagrapi` + HTTP bridge.                                                                                        | Only as a reference. Use `instagrapi` instead.                                                                                  |
| 6   | [`mgp25/Instagram-API`](https://github.com/mgp25/Instagram-API)                                     | n/a (blocked) |   n/a | —                             | PHP        | **DMCA-blocked by Facebook Jan 2020** | Once the dominant PHP Instagram client (~7k★ before takedown). Removed for TOS breach.                                                                                                                                   | **Do not use.** Mention only as a cautionary tale.                                                                              |
| 7   | `facebookresearch/ParlAI` and similar                                                               |             — |     — | —                             | —          | —                                     | Not relevant to Meta-platform ops.                                                                                                                                                                                       | Skip.                                                                                                                           |

> **License nuance:** the official Meta "Business SDK" repos have no SPDX (`NOASSERTION`); they ship under the **Meta Platform License**, which is permissive for building apps that interact with Meta products but forbids building a competing product. For `laratik-planner` this is fine. `instagrapi` is `NOASSERTION` but freely usable for personal/automation work; the project now also offers **HikerAPI** as a paid, TOS-safe mirror.

---

## 3. Per-Category Ranking (Top 3)

### 3.1 Posting / Scheduling (Facebook Pages + Instagram Business)

| Rank | Repo                                                                                                | Stars | License | Self-host                      | Maintenance | LaraTik fit                                                |
| ---: | --------------------------------------------------------------------------------------------------- | ----: | ------- | ------------------------------ | ----------- | ---------------------------------------------------------- |
|    1 | [`facebook/facebook-nodejs-business-sdk`](https://github.com/facebook/facebook-nodejs-business-sdk) |   616 | Meta    | ✅                             | Active 2026 | **★★★★★** — use for Page posts + IG business posts         |
|    2 | [`sergebulaev/facebook-skills`](https://github.com/sergebulaev/facebook-skills) + Publora           |    33 | MIT     | partial (publish step is SaaS) | Active 2026 | ★★★★ — for AI-drafted posts, swap Publora for the Node SDK |
|    3 | [`subzeroid/instagrapi`](https://github.com/subzeroid/instagrapi)                                   | 6,764 | Other   | ✅ (Python service)            | Active 2026 | ★★★★ — for personal IG posting; riskier for production     |

**Caveat for Instagram:** Meta's Graph API for the Instagram Business/Creator account is the _only_ TOS-safe posting path. `instagrapi` posts to a _personal_ account and is reversible by Meta at any moment. Default to Graph for production; use `instagrapi` only when a user is on a personal account and accepts the risk (HikerAPI absorbs the session-management risk via SaaS).

### 3.2 Caption / Hashtag AI

| Rank | Repo                                                                                                            | Stars | License | Self-host                    | Maintenance | LaraTik fit                                                                                                                                                |
| ---: | --------------------------------------------------------------------------------------------------------------- | ----: | ------- | ---------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
|    1 | [`sergebulaev/instagram-skills`](https://github.com/sergebulaev/instagram-skills)                               |    46 | MIT     | ✅                           | Active 2026 | ★★★★★ — captions, carousels, hooks, hashtag strategy, weekly plan; drop into Claude Code                                                                   |
|    2 | [`ScrapeCreators/social-media-research-skills`](https://github.com/ScrapeCreators/social-media-research-skills) | 2,100 | MIT     | partial (ScrapeCreators API) | Active 2026 | ★★★★ — research-driven caption ideation + hashtag discovery, SaaS-backed                                                                                   |
|    3 | Your own LLM prompt + `instagrapi`/`facebook-nodejs-business-sdk` for posting                                   |     — | —       | ✅                           | n/a         | ★★★★ — for a planner product, baking your own voice-aware prompts into Next.js actions is usually the right move; the skill bundles are reference material |

### 3.3 Reels / Video

| Rank | Repo / Source                                                                                                                                                                                |  Stars | License | Self-host | LaraTik fit                                               |
| ---: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: | ------- | --------- | --------------------------------------------------------- |
|    1 | Meta's **Reels API** via `facebook/facebook-nodejs-business-sdk` (container upload + publish)                                                                                                |    616 | Meta    | ✅        | ★★★★★ — production path                                   |
|    2 | [`subzeroid/instagrapi`](https://github.com/subzeroid/instagrapi) clip_upload + story_video                                                                                                  |  6,764 | Other   | ✅        | ★★★ — for personal accounts                               |
|    3 | Open-source video gen: [`THUDM/CogVideo`](https://github.com/THUDM/CogVideo) / [`Stability-AI/generative-models`](https://github.com/Stability-AI/generative-models) / Luma / Runway via MCP | varies | varies  | partial   | ★★★ — for AI-generated reels; offload via your own worker |

**The honest picture:** the open-source ecosystem is _thin_ on Meta-Reels AI generation. Most creators use **commercial** tools (Captions.ai, Opus Clip, Submagic, Descript) for clipping and subtitles, and only do _posting + scheduling_ from open-source code. For `laratik-planner` lean on: Graph API for upload + publish; LLM for script writing; leave generation to a separate service.

### 3.4 Story generation (text/image)

Same trio as Reels, but more accessible: `instagrapi` exposes `story_upload` for both photo and video; the Graph API supports Stories via the `media_type=STORY` enum. There's **no dominant open-source story-AI repo** — use your own LLM for text + SDXL/Flux for images, then upload via either path above.

### 3.5 Comment / DM / Community

| Rank | Repo                                                                                                                | Stars | License | Notes                                                       |
| ---: | ------------------------------------------------------------------------------------------------------------------- | ----: | ------- | ----------------------------------------------------------- |
|    1 | **Meta Graph API + Messenger + Instagram Messaging webhooks** (no library needed; the official Node SDK covers it)  |   616 | Meta    | Production path; webhooks + reply via Send API              |
|    2 | [`subzeroid/instagrapi`](https://github.com/subzeroid/instagrapi) `direct_message`, `media_comment`, `comment_like` | 6,764 | Other   | Personal-IG DM/comment automation; same TOS risk as posting |
|    3 | AI-drafted replies via `sergebulaev/facebook-skills` `engagement-drafter`                                           |    33 | MIT     | Returns a copy-paste block; you decide who/what to publish  |

**Heads-up:** any DM automation that pretends to be the user on Messenger must comply with Meta's 24-hour-window + tag rules. Use the **official Send API** for production.

### 3.6 Ad creative + ad optimization

Only one realistic answer here for open-source:

1. **`facebook/facebook-nodejs-business-sdk`** (or Python) — the only library that touches the Ads API, Dynamic Creative, Advantage+ campaigns, and the Insights surface. The Meta docs are the spec.
2. **Your own LLM layer** on top — generate ad copy variants, pull `get_ad_creatives()` and `get_insights()`, write a `creative-evaluator` skill that scores them. No open-source repo owns this niche well.
3. **ScrapeCreators** (commercial API) for _competitor_ ad research via Meta's Ad Library.

There is **no healthy open-source Facebook-ads AI repo** beyond the SDK itself. The market is dominated by Smartly, Madgicx, Motion, AdCreative.ai, and Revealbot — all SaaS, none open-source.

### 3.7 Analytics (engagement, reach, demographics)

1. **`facebook/facebook-nodejs-business-sdk`** — `Page Insights` + `Instagram Insights` + `Ads Insights` are all there. This is the only sane source of truth.
2. **ScrapeCreators** — supplements with public post-level data not surfaced by Graph (e.g., third-party page benchmarks).
3. **Build your own** — once you have a Postgres/Snowflake warehouse, copy the Graph Insights rows into it and compute deltas. No open-source pipeline dominates this niche for Meta.

### 3.8 Cross-posting (FB + IG + Threads + X + LinkedIn + TikTok)

| Rank | Repo | Stars | License | Notes |
|---:|---|---:|---|---|---|
| 1 | `sergebulaev/{facebook,instagram,linkedin,x,threads,youtube,tiktok}-skills` family | 33–60 each | MIT | Same author, same pattern; the most coherent open-source family for cross-platform Claude Code skills |
| 2 | `ScrapeCreators/social-media-research-skills` | 2,100 | MIT | Research across all 6, not posting |
| 3 | Your own **scheduler microservice** that calls each platform's official SDK / Graph API | — | — | For production reliability, write the queue + retry + idempotency yourself; this is where commercial tools (Buffer, Publer, Hootsuite) earn their keep |

### 3.9 MCP / Agent Skills

| Rank | Repo / Source                                                                                                                             |  Stars | Notes                                               |
| ---: | ----------------------------------------------------------------------------------------------------------------------------------------- | -----: | --------------------------------------------------- |
|    1 | `ScrapeCreators/social-media-research-skills` ships an MCP integration (`docs.scrapecreators.com/integrations/mcp`)                       |  2,100 | Most concrete MCP surface in the research tier      |
|    2 | `sergebulaev/*-skills` family (Claude Code skills, not MCP, but the same agent-skill pattern)                                             |  33–60 | Use Claude's `Skill` loader; no MCP server required |
|    3 | The **Anthropic `skills` repo** (`anthropics/skills`) is a reference for _general_ skills (canvas-design, docx, pptx) — not Meta-specific | varies | Use as a template, not a drop-in                    |

---

## 4. Picks for `laratik-planner`

Given the project is **Next.js / TypeScript**, target users are likely solo creators or small marketing teams, and the storage is local-first, here's the recommended stack:

### Tier 1 — adopt now

| Need                                                     | Pick                                                           | Why                                                            |
| -------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------- |
| Facebook Ads + Page posts + IG Business posts            | `facebook/facebook-nodejs-business-sdk`                        | Official, TypeScript, maintained, legal                        |
| AI-drafted captions, hooks, hashtag plans, weekly plan   | `sergebulaev/instagram-skills` + `sergebulaev/facebook-skills` | MIT, drop into `.claude/skills/`, works in Claude Code + Codex |
| Instagram analytics (engagement, reach)                  | `facebook-nodejs-business-sdk` Insights endpoints              | Authoritative; same auth as posting                            |
| Public-content research (outliers, comments, ad library) | `ScrapeCreators/social-media-research-skills` (optional)       | Adds breadth Graph doesn't expose                              |

### Tier 2 — adopt if the use case demands

| Need                                   | Pick                                                                           | Why                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Post to a _personal_ Instagram account | `subzeroid/instagrapi` as a Python sidecar                                     | Only realistic option; pin a session-rotation policy and budget for ban risk |
| Cross-platform drafts                  | The full `sergebulaev/*-skills` family (linkedin, x, threads, youtube, tiktok) | Same shape, same MIT license                                                 |
| Video/clipping for Reels               | Commercial tool (Opus Clip / Submagic) + Graph upload                          | Open-source is thin here                                                     |

### Tier 3 — skip

- `mgp25/Instagram-API` — DMCA-removed.
- `dilame/instagram-private-api` — unmaintained TS private API.
- Any "facebook-graph-api-node" wrapper with <500★ — most are stale or thin wrappers.
- `minhnv0807/ai-business-skills` — useful as a prompt reference, but heavy on Vietnam region and not Meta-specific.

---

## 5. What to AVOID

| Repo / Pattern                                                   | Why                                                                                                                                                |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`mgp25/Instagram-API`** (and any fork of it)                   | DMCA'd by Facebook in Jan 2020. Facebook has shown it will go after private-API clients.                                                           |
| **`dilame/instagram-private-api`**                               | Last meaningful release 2022; the IG private API has shifted signature schemes several times since. Don't depend on it.                            |
| **Random `<user>/facebook-graph-api-node` wrappers (<100★)**     | Almost all are abandoned, missing types, and break when Meta ships Graph v18+. Use the official SDK.                                               |
| **Storing long-lived user access tokens in your DB**             | Use the System User token + Business App pattern, or short-lived User tokens with refresh. Never commit a Page Access Token to git.                |
| **Using personal-account private APIs for paid customers**       | If a paying user logs in via `instagrapi` and gets their account restricted, that's a trust-destroying event. Default to Graph + Business account. |
| **Auto-DM that ignores the 24-hour Messenger window**            | Meta policy + spam classifiers will ban you.                                                                                                       |
| **Repos that promise "post to any account without permissions"** | Scam-or-broken. There is no such path.                                                                                                             |

---

## 6. Decision Matrix for `laratik-planner` (Quick)

| Question                                                | Answer  | Repo                                                                     |
| ------------------------------------------------------- | ------- | ------------------------------------------------------------------------ |
| I need to create / schedule a Facebook Page post.       | ✅      | `facebook/facebook-nodejs-business-sdk`                                  |
| I need to create / schedule an Instagram Business post. | ✅      | `facebook/facebook-nodejs-business-sdk` (IG media container + publish)   |
| I need to create / schedule an Instagram personal post. | ⚠️      | `subzeroid/instagrapi` (Python sidecar, ban risk)                        |
| I need to generate captions, hooks, hashtag plans.      | ✅      | `sergebulaev/instagram-skills` + your own LLM                            |
| I need competitor / ad-library research.                | ✅      | `ScrapeCreators/social-media-research-skills` (paid API)                 |
| I need to run a Facebook ad campaign.                   | ✅      | `facebook/facebook-nodejs-business-sdk`                                  |
| I need to generate video Reels.                         | partial | LLM for script; video gen offload to commercial tool; upload via Graph   |
| I need to read page/IG insights.                        | ✅      | `facebook/facebook-nodejs-business-sdk`                                  |
| I need to handle DMs / comments.                        | ✅      | Graph Send API (Messenger/IG) for production; `instagrapi` for personal  |
| I need an MCP server.                                   | partial | `ScrapeCreators` MCP; otherwise wrap the Node SDK in your own MCP server |
| I need a TikTok/LinkedIn/X/Threads companion.           | ✅      | `sergebulaev/{tiktok,linkedin,x,threads}-skills`                         |

---

## 7. Sources

- `https://github.com/ScrapeCreators/social-media-research-skills` — direct fetch, Sep 7 2026
- `https://github.com/sergebulaev/facebook-skills` — direct fetch, Sep 7 2026
- `https://github.com/sergebulaev/instagram-skills` — GitHub REST API direct fetch, Sep 7 2026
- `https://github.com/minhnv0807/ai-business-skills` — direct fetch, Sep 7 2026
- `https://github.com/subzeroid/instagrapi` — GitHub REST API direct fetch, Sep 7 2026
- `https://github.com/facebook/facebook-python-business-sdk` — GitHub REST API direct fetch, Sep 7 2026
- `https://github.com/facebook/facebook-nodejs-business-sdk` — GitHub REST API direct fetch, Sep 7 2026
- `https://github.com/mgp25/Instagram-API` — DMCA block notice, Jan 2020
- `https://developers.facebook.com/docs/business-sdk` — Meta Marketing SDK docs
- `https://developers.facebook.com/docs/pages-api/` — Meta Pages API docs
- `https://subzeroid.github.io/instagrapi/` — instagrapi docs
- `https://cccrafts.ai` + `https://publora.com` — sergebulaev content-engineering stack
- `https://scrapecreators.com` + `https://docs.scrapecreators.com/integrations/mcp` — ScrapeCreators
- `https://github.com/dmca/blob/master/2020/01/2020-01-22-facebook.md` — Facebook DMCA notice against mgp25

### Research-method notes

- The user's original task asked for full search across 10 specific GitHub search queries. From the IP in this session both `github.com/search` (web) and the unauthenticated `api.github.com/search` endpoints returned secondary rate-limit errors within minutes of starting. The unauthenticated REST API _did_ succeed on direct-repo lookups for the 7 highest-value targets above, giving hard numbers.
- For the long-tail "Top 3 per category" rankings, the rankings reflect the canonical landscape as of Sep 2026 (drawn from each repo's README + the citations above), not a fresh star-crawl. The categories where this matters most are 3.3 (Reels) and 3.6 (Ad creative) where the open-source ecosystem is genuinely thin and the top-3 answer is "official SDK + commercial SaaS + your own code."
- The companion `sergebulaev/{linkedin,x,youtube,threads,tiktok}-skills` repos follow the exact same pattern as `facebook-skills` / `instagram-skills` and were verified to exist via the GitHub REST API.
