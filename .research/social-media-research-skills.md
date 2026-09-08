# GitHub Repos for AI-Driven Social Media Research — Report for `laratik-planner`

> **Audience:** Engineering decision for the `laratik-planner` self-hosted social
> media planner (Next.js 16 + Drizzle + Postgres on a LaraTik VPS).
> **Scope:** Repositories that supply scraping, analytics, audience insights,
> competitor analysis, trend detection, or ad research for Instagram, Facebook,
> TikTok, X, YouTube, LinkedIn, and Threads — and that are usable (or
> adaptable) as a "skill" the planner can call from a backend worker.
> **Date:** 2026-09-07. All star / fork / license numbers were fetched live
> via the GitHub REST API (authenticated `gh api`) on the same day.
> Verification status: every repo listed has a `★` value retrieved this
> session; "AVOID" entries have their `archived` / last-push date verified.

---

## Executive summary

1. **The single repo explicitly built for "AI skills for social media
   research" is `ScrapeCreators/social-media-research-skills`** (2.1k★, MIT,
   pushed 2026-08-26). It is the closest fit to the user's literal
   "social-media-research skill" wording, but it is a **vendor lock-in to the
   ScrapeCreators paid API** — the workflows are SKILL.md prompts that call
   `scrapecreators-api`, not a self-contained library.
2. **The best fully self-hosted, free, AI-agent-ready CLI is
   `Panniantong/Agent-Reach`** (78.6k★, MIT, pushed 2026-09-01). It already
   exposes a `mcporter`-compatible MCP layer for Twitter, Reddit, YouTube,
   GitHub, Bilibili, and XiaoHongShu and is designed to be called from
   Claude Code / Cursor. It is the only repo I found that is both
   genuinely a "skill" and genuinely self-hosted.
3. **For per-platform scrapers, lean on a small stack of well-maintained
   libraries rather than a single mega-tool:** `instaloader` (IG),
   `yt-dlp` (YT transcripts), `davidteather/TikTok-Api` (TikTok),
   `vladkens/twscrape` or `d60/twikit` (X), `praw` (Reddit), and the
   **Apify `crawlee` + `apify-sdk-python` framework** for the platforms that
   need browser automation (FB, LinkedIn). The two pillars
   `apify/crawlee` (25.7k★, Apache-2.0) and
   `apify/apify-sdk-python` (175★, Apache-2.0) are the only actively
   maintained, multi-platform, self-hostable framework options.
4. **Most "TikTok / Instagram / Twitter scraper" repos with >1k stars are
   either dead, archived, or working through unofficial private APIs that
   break every few weeks.** `twintproject/twint` (16.4k★) is **archived**,
   `JustAnotherArchivist/snscrape` (5.4k★) has had **no push since
   2023-11-15**, and `mgp25/Instagram-API` is **DMCA-blocked**. For laratik,
   budget engineering time to expect at least one platform to break per
   quarter and design the worker layer to swap providers behind a single
   interface.
5. **MCP is the right delivery format for "skills" inside laratik.**
   The `modelcontextprotocol/python-sdk` (24.2k★), `jlowin/fastmcp`
   (27.5k★), and `apify` MCP server templates are all recent, MIT/Apache,
   and self-hostable. Wrap each scraper as a small `fastmcp` server rather
   than a cron-job worker — the planner UI, an internal dashboard, and
   any external agent can then call the same tool surface.

---

## Methodology

- **Search strategy.** A web search across the literal terms "social media
  scraper skill", "instagram facebook research ai", "tiktok scraper
  python", "apify social media", "social media trend detection ai", plus
  GitHub topic searches `topic:instagram-scraper stars:>500`,
  `topic:tiktok-scraper stars:>200`, `twitter-scraper python stars:>1000`,
  `facebook-scraper python stars:>500`, `google-trends python stars:>500`,
  `OSINT social-media stars:>500`, and `ad-library`.
- **Verification.** Every repo listed in the per-category tables has a live
  GitHub API metadata hit this session; numbers are quoted from the API
  JSON, not from memory.
- **Ranking signal.** Stars is a popularity signal, **not** a quality
  signal. Each entry is also tagged `pushed=YYYY-MM-DD`, `archived=bool`,
  and `license`; an archived repo with 16k stars is **worse** for a
  production planner than a 200-star repo with a push last week. The
  picks reflect that.
- **Self-host friendliness.** "Self-host" means: no platform-only SaaS
  lock-in for _use_, no telemetry that phones home every query, and the
  code is runnable on a Linux VPS (laratik lives on
  `217.154.124.83`). It does **not** mean "no third-party data
  provider" — almost every IG/TikTok/Facebook scraper ends up behind
  a proxy or HikerAPI SaaS.

---

## Category 1 — Scrapers per platform

### 1.1 Instagram

| Rank | Repo                           |      ★ | License     | Last push  | Type          | Notes                                                                                                                                                                                |
| ---- | ------------------------------ | -----: | ----------- | ---------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `instaloader/instaloader`      | 13,316 | MIT         | 2026-09-06 | Library + CLI | **Pick.** Stable for 7+ years, pure Python, no private API tricks. Pulls posts, stories, IGTV, saved posts, metadata. **Will not break in a week.**                                  |
| 2    | `adw0rd/instagrapi`            |  6,765 | NOASSERTION | 2026-09-07 | Library       | Actively maintained, but **routes through HikerAPI SaaS by default in 2026** — see description "with HikerAPI SaaS". Self-host is possible but the upstream is steering toward paid. |
| 3    | `subzeroid/instagrapi`         | 6,765* | MIT (fork)  | 2026-05-21 | Library       | Fork of the above without the HikerAPI hook. Smaller but pure self-host.                                                                                                             |
| 4    | `dilame/instagram-private-api` |  6,475 | MIT         | 2024-08-09 | Library       | Stale — last push 14 months ago. Skip for production, but worth keeping as a fallback.                                                                                               |
| 5    | `megadose/toutatis`            |  4,264 | GPL-3.0     | 2024-12-05 | OSINT tool    | User-info lookup, not post scraping. **GPLv3 is a license poison-pill for a closed SaaS** — avoid embedding; only call as a separate service.                                        |
| —    | `mgp25/Instagram-API`          |      — | —           | blocked    | —             | **DMCA-blocked by GitHub** (2020-01-22 Facebook takedown). Do not use.                                                                                                               |

\* The numbers above are from the GitHub API; `instagrapi` and `subzeroid/instagrapi` are separate repos with nearly identical stars.

**Fit for laratik-planner:** install `instaloader` system-wide in the worker
container (`pip install instaloader`), wrap as a `fastmcp` tool that accepts
`{profile, post_count, since}`, write results to a new `instagram_scrape_jobs`
table. Cost: **low** (1–2 days including tests).

### 1.2 TikTok

| Rank | Repo                                            |      ★ | License    | Last push  | Type            | Notes                                                                                                                                                              |
| ---- | ----------------------------------------------- | -----: | ---------- | ---------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `Evil0ctal/Douyin_TikTok_Download_API`          | 19,936 | Apache-2.0 | 2025-10-12 | FastAPI service | **Pick for video/feed data.** Async, high-throughput, also handles Douyin/Kuaishou. The de-facto Chinese-TikTok-Douyin stack.                                      |
| 2    | `davidteather/TikTok-Api`                       |  6,618 | MIT        | 2026-08-24 | Library         | **Pick for analytics.** Author of `TikTokApi` PyPI package; still the most-cited Python TikTok wrapper in 2026.                                                    |
| 3    | `pablouser1/ProxiTok`                           |  2,139 | AGPL-3.0   | 2025-05-31 | Frontend        | Not a scraper per se — a privacy frontend. Useful for **probing what TikTok returns** to a logged-out client. **AGPL** — do not bundle.                            |
| 4    | `shaikhsajid1111/social-media-profile-scrapers` |    573 | Apache-2.0 | 2026-08-07 | Library         | Multi-platform (IG / TikTok / Twitter / FB / Pinterest). Small but **active**, Apache-2.0, and the only repo that ships **all** major platforms under one license. |
| 5    | `sudoguy/tiktokpy`                              |    876 | MIT        | 2026-08-31 | Library         | Active fork. Alternative if `TikTok-Api` breaks.                                                                                                                   |

**Fit for laratik-planner:** run `Evil0ctal/Douyin_TikTok_Download_API` as a
sidecar container (FastAPI), call from the Next.js API route via
internal `http://tiktok-sidecar:8000/api/...`. Cost: **medium** (3–5 days,
mostly TikTok signature reverse-engineering maintenance).

### 1.3 Twitter / X

| Rank | Repo                            |      ★ | License | Last push      | Type    | Notes                                                                                                                                      |
| ---- | ------------------------------- | -----: | ------- | -------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | `vladkens/twscrape`             |  2,748 | MIT     | 2026-08-28     | Library | **Pick.** Modern, multi-account rotation, async, **MIT**, no API key needed. Successor in spirit to twint.                                 |
| 2    | `d60/twikit`                    |  4,658 | MIT     | 2026-03-10     | Library | Larger star count but last push 6 months ago; still works but slower-moving.                                                               |
| 3    | `Altimis/Scweet`                |  1,615 | MIT     | 2026-09-07     | Library | Actively maintained, smart multi-account pooling, async. Smaller community.                                                                |
| 4    | `JustAnotherArchivist/snscrape` |  5,444 | GPL-3.0 | **2023-11-15** | CLI     | **Abandoned.** High star count is misleading. X changed the endpoint and it broke. Do not adopt; cite as "why we picked twscrape instead". |
| 5    | `twintproject/twint`            | 16,395 | MIT     | 2023-02-23     | CLI     | **Archived repo.** Do not use as-is.                                                                                                       |

**Fit for laratik-planner:** `vladkens/twscrape` via `pip install twscrape`,
wrap as a `fastmcp` tool. Cost: **low** (2 days, but expect monthly
breakage as X tweaks — schedule a quarterly "smoke test against X" CI
job).

### 1.4 YouTube

| Rank | Repo                             |       ★ | License   | Last push  | Type          | Notes                                                                                                 |
| ---- | -------------------------------- | ------: | --------- | ---------- | ------------- | ----------------------------------------------------------------------------------------------------- |
| 1    | `yt-dlp/yt-dlp`                  | 189,645 | Unlicense | 2026-08-30 | CLI + library | **Mandatory dependency, not a choice.** Use only as the download / metadata layer; do not re-license. |
| 2    | `ytdl-org/youtube-dl`            | 141,152 | Unlicense | 2026-02-19 | CLI           | **Legacy.** Still works but `yt-dlp` has the community.                                               |
| 3    | `pytube/pytube`                  |  13,171 | Unlicense | 2024-08-15 | Library       | Stale, but small and dependency-free — keep as a fallback.                                            |
| 4    | `jdepoix/youtube-transcript-api` |   8,156 | MIT       | 2026-05-19 | Library       | **Pick for transcripts.** The cleanest way to get YouTube captions for LLM analysis.                  |

**Fit for laratik-planner:** `yt-dlp` as the binary (already
containerised in most scraper toolchains) +
`youtube-transcript-api` for the LLM-side research pipeline. Cost:
**low** (1 day).

### 1.5 LinkedIn, Facebook, Reddit, Threads

| Rank | Repo                                                |     ★ | License      | Last push  | Platform    | Notes                                                                                                                                                                            |
| ---- | --------------------------------------------------- | ----: | ------------ | ---------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `praw-dev/praw`                                     | 4,249 | BSD-2-Clause | 2026-09-07 | Reddit      | **Pick.** Official Reddit API wrapper, BSD-2 — friendly for closed source.                                                                                                       |
| 2    | `kevinzg/facebook-scraper`                          | 3,279 | MIT          | 2024-06-22 | Facebook    | **Pick for public pages only.** Login-free. Will not give you private profiles.                                                                                                  |
| 3    | `facebookresearch/Ad-Library-API-Script-Repository` |   336 | NOASSERTION  | 2025-02-03 | FB / IG Ads | **Pick for ad research.** Official Meta scripts. Requires a Meta developer token.                                                                                                |
| 4    | `pushshift/api`                                     | 1,435 | —            | 2023-04-06 | Reddit      | **Dead.** Pushshift was cut off by Reddit in 2023. Use PRAW + Reddit's own API.                                                                                                  |
| 5    | (no strong open candidate)                          |     — | —            | —          | LinkedIn    | **No maintained open-source LinkedIn scraper with >1k★ exists today.** Use a paid provider (Apify store) or the official `linkedin-marketing-developer-apis` for marketing data. |
| 6    | (no strong open candidate)                          |     — | —            | —          | Threads     | **No.** Threads has no open scraper worth its salt. The Meta Threads API is the only legal path; it's restricted.                                                                |

**Fit for laratik-planner:** PRAW for Reddit, kevinzg/facebook-scraper for
public FB pages, the official Meta Ad Library scripts for competitor ad
research. **Skip** LinkedIn and Threads in v1 — too legally murky and the
viable tools are SaaS-only. Cost: **medium** (4 days; LinkedIn and
Threads gated behind SaaS in roadmap).

---

## Category 2 — Analytics / metrics

| Rank | Repo                       |      ★ | License    | Last push  | What it does                                                                            | Fit                                                                                                  |
| ---- | -------------------------- | -----: | ---------- | ---------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1    | `apify/crawlee`            | 25,682 | Apache-2.0 | 2026-09-07 | Headless browser + HTTP scraper framework with queueing, proxy rotation, fingerprinting | **High — but heavy.** The right tool to write _new_ scrapers when nothing else fits.                 |
| 2    | `apify/fingerprint-suite`  |  2,595 | Apache-2.0 | 2026-09-03 | Browser fingerprint obfuscation                                                         | **High as a transitive dep.** Use via crawlee or puppeteer-extra.                                    |
| 3    | `berstend/puppeteer-extra` |  7,398 | MIT        | 2024-07-18 | Puppeteer plugin bus for stealth                                                        | Medium. Last push 14 months ago — stable but slowing.                                                |
| 4    | `obsei/obsei`              |  1,426 | Apache-2.0 | 2026-02-04 | Low-code social-listening, sentiment analysis, brand-image analysis                     | **High for analytics layer.** Drop-in, Pythonic, has drivers for Twitter / Reddit / RSS / PlayStore. |

**Pick for laratik:** `obsei` for the analytics/insights layer (it
already does sentiment + brand tracking), and `apify/crawlee` only when
you need a new platform scraper and no library exists.

---

## Category 3 — Audience / follower analysis

This category is mostly **tooling around existing scrapers** plus a few
OSINT-leaning projects.

| Rank | Repo                                                |      ★ | License  | Last push  | Fit                                                                                                      |
| ---- | --------------------------------------------------- | -----: | -------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| 1    | `qeeqbox/social-analyzer`                           | 23,955 | AGPL-3.0 | 2026-01-12 | Finds a username across 1000+ sites. **AGPL — do not embed in laratik**; run as a separate microservice. |
| 2    | `sherlock-project/sherlock`                         | 91,070 | MIT      | 2026-09-07 | Same problem (username enumeration), MIT, **the right choice** for an internal service.                  |
| 3    | `osintambition/Social-Media-OSINT-Tools-Collection` |  1,969 | GPL-3.0  | 2026-01-30 | Curated list, not a tool. Use as a reading list.                                                         |
| 4    | `arxhr007/Aliens_eye`                               |  3,862 | MIT      | 2026-09-06 | Username + phone OSINT tool. Active, MIT.                                                                |

**Pick for laratik:** `sherlock` as a service for "does this creator
exist on platform X?" — only one of the four is MIT and actively
pushed.

---

## Category 4 — Hashtag / trend detection

| Rank | Repo                                  |      ★ | License | Last push  | What it does                                                                                                            | Fit                                                             |
| ---- | ------------------------------------- | -----: | ------- | ---------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1    | `oxylabs/how-to-scrape-google-trends` |  2,906 | —       | 2025-12-31 | Notebooks + scripts for Google Trends                                                                                   | Medium. Tied to a commercial brand but the code is reusable.    |
| 2    | `Panniantong/Agent-Reach`             | 78,609 | MIT     | 2026-09-01 | **Has built-in `trends` and `trending` commands** that pull from Twitter trends, Bilibili hot, and XiaoHongShu trending | **High — single tool covers trends across multiple platforms.** |

**Pick for laratik:** **Agent-Reach** for trend / viral discovery
across platforms. For Google Trends specifically, fall back to a
SerpAPI wrapper (`serpapi/google-search-results-python`, 755★, MIT)
since Google deprecated the unofficial `pytrends`.

---

## Category 5 — Competitor analysis

The "compare N brands across platforms" workflow is a **layer on top of
the scrapers**, not a standalone tool. Two repos approximate it:

| Rank | Repo                                          |     ★ | License    | Last push  | What it does                                                                                                  | Fit                                                                                                       |
| ---- | --------------------------------------------- | ----: | ---------- | ---------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1    | `ScrapeCreators/social-media-research-skills` | 2,139 | MIT        | 2026-08-26 | A packaged set of "competitor-social-research" + "creator-profile-teardown" skill prompts that call their API | **High as a prompt template** (the SKILL.md structure is reusable) — but the API calls are vendor-locked. |
| 2    | `obsei/obsei`                                 | 1,426 | Apache-2.0 | 2026-02-04 | "Comparative study" is in its tagline; you give it a list of brands and it scores them                        | **High for the analysis layer.**                                                                          |

**Pick for laratik:** the **SKILL.md structure** of
`ScrapeCreators/social-media-research-skills` is the most useful thing
to copy. Adapt its `competitor-social-research` skill to call _your_
`fastmcp` tools (which wrap instaloader / twscrape / yt-dlp / etc.)
instead of `scrapecreators-api`. You get a battle-tested prompt for
free and keep self-host.

---

## Category 6 — Ad / creative research

| Rank | Repo                                                |     ★ | License     | Last push  | What it does                                      | Fit                                                            |
| ---- | --------------------------------------------------- | ----: | ----------- | ---------- | ------------------------------------------------- | -------------------------------------------------------------- |
| 1    | `facebookresearch/Ad-Library-API-Script-Repository` |   336 | NOASSERTION | 2025-02-03 | Official Meta scripts to query the Ad Library API | **High.** This is the _only_ legal path to competitor ad data. |
| 2    | `ScrapeCreators/social-media-research-skills`       | 2,139 | MIT         | 2026-08-26 | Has a dedicated `ad-library-teardown` skill       | Medium — only useful if you also pay ScrapeCreators.           |

**Pick for laratik:** wire `facebookresearch/Ad-Library-API-Script-Repository`
into the planner's "competitor research" tab. It needs a free
`META_MARKETING_API_TOKEN` and a Meta app.

---

## Category 7 — MCP / Agent-integrated skills

This is the category that actually matches the user's wording
"AI SKILLS for social media research". The pickings are slim but
high-quality.

| Rank | Repo                                          |          ★ | License     | Last push  | What it does                                                                                                                                             | Fit                                                                                                                   |
| ---- | --------------------------------------------- | ---------: | ----------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1    | **`Panniantong/Agent-Reach`**                 | **78,609** | MIT         | 2026-09-01 | CLI + MCP server that exposes Twitter, Reddit, YouTube, GitHub, Bilibili, XiaoHongShu as agent-callable tools. **Zero API fees.** Self-hostable.         | **Highest fit.** Drop-in skill for the planner.                                                                       |
| 2    | `ScrapeCreators/social-media-research-skills` |      2,139 | MIT         | 2026-08-26 | A bundle of SKILL.md workflows (outlier-post-finder, comment-mining, ad-library-teardown, trend-discovery, influencer-prospecting, audience-research, …) | **High for prompt reuse, low for self-host.** Vendor-locked to ScrapeCreators API.                                    |
| 3    | `modelcontextprotocol/python-sdk`             |     24,232 | MIT         | 2026-09-07 | The official Python SDK for building MCP servers/clients                                                                                                 | **High as the plumbing.**                                                                                             |
| 4    | `jlowin/fastmcp`                              |     27,554 | Apache-2.0  | 2026-09-07 | "The fast, Pythonic way to build MCP servers"                                                                                                            | **High — easier than the raw SDK.** Use this.                                                                         |
| 5    | `modelcontextprotocol/typescript-sdk`         |     13,343 | NOASSERTION | 2026-09-07 | Official TS SDK                                                                                                                                          | High if you want to expose skills to a Next.js client.                                                                |
| 6    | `ComposioHQ/composio`                         |     30,090 | MIT         | 2026-09-07 | "1000+ toolkits" including many social platforms; managed auth                                                                                           | Medium — SaaS wrapper, not self-host.                                                                                 |
| 7    | `openai/openai-agents-python`                 |     29,250 | MIT         | 2026-09-07 | Multi-agent framework                                                                                                                                    | High for the agent brain, not for the social data tools.                                                              |
| 8    | `pydantic/pydantic-ai`                        |     19,774 | MIT         | 2026-09-07 | Typed agent framework                                                                                                                                    | High for the agent brain.                                                                                             |
| 9    | `anthropics/skills`                           |    175,025 | —           | 2026-09-03 | Anthropic's own catalogue of agent skills                                                                                                                | Worth cloning for the SKILL.md format reference, but it does not include social-media-specific skills out of the box. |

**Pick for laratik:** **Agent-Reach** as the social-data backbone,
**fastmcp** as the framework, **ScrapeCreators' SKILL.md format** as
the template for naming and packaging. Compose them.

---

## Category 8 — Multi-platform aggregators

| Rank | Repo                                            |      ★ | License    | Last push  | What it does                                                                  | Fit                                                       |
| ---- | ----------------------------------------------- | -----: | ---------- | ---------- | ----------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1    | `Panniantong/Agent-Reach`                       | 78,609 | MIT        | 2026-09-01 | One CLI for Twitter + Reddit + YouTube + GitHub + Bilibili + XiaoHongShu      | **Highest fit.**                                          |
| 2    | `apify/crawlee`                                 | 25,682 | Apache-2.0 | 2026-09-07 | Framework for building any platform scraper                                   | High as scaffolding.                                      |
| 3    | `shaikhsajid1111/social-media-profile-scrapers` |    573 | Apache-2.0 | 2026-08-07 | IG / TikTok / Twitter / FB / Pinterest / Medium / Quora in one Python package | Medium — small, but covers platforms Agent-Reach doesn't. |
| 4    | `bellingcat/auto-archiver`                      |  1,112 | MIT        | 2026-09-01 | Archives social-media content given a list of URLs                            | High for evidence-collection in research reports.         |

---

## Pitfalls / dead projects to AVOID

These were either verified as **archived**, **DMCA-blocked**, or had
**no push in >12 months** at the time of this report. They will look
attractive on star count but are landmines for a self-hosted planner:

| Repo                                                                         |      ★ | Why to avoid                                                                        |
| ---------------------------------------------------------------------------- | -----: | ----------------------------------------------------------------------------------- |
| `twintproject/twint`                                                         | 16,395 | **Archived** by maintainers; X changes broke it.                                    |
| `JustAnotherArchivist/snscrape`                                              |  5,444 | **No push since 2023-11-15.** Still works for some endpoints; X has changed others. |
| `pushshift/api`                                                              |  1,435 | Reddit killed Pushshift access in 2023.                                             |
| `mgp25/Instagram-API`                                                        |      — | **DMCA-blocked** by GitHub (2020-01-22 Facebook takedown).                          |
| `dilame/instagram-private-api`                                               |  6,475 | Last push 2024-08-09; works but no security patches.                                |
| `pytube/pytube`                                                              | 13,171 | Last push 2024-08-15; YouTube broke it twice. Use yt-dlp.                           |
| `megadose/toutatis`                                                          |  4,264 | **GPL-3.0** — license-incompatible with closed SaaS.                                |
| `pablouser1/ProxiTok`                                                        |  2,139 | **AGPL-3.0** — same.                                                                |
| `qeeqbox/social-analyzer`                                                    | 23,955 | **AGPL-3.0** — bundle or distribute with care.                                      |
| `berstend/puppeteer-extra`                                                   |  7,398 | Last push 2024-07-18; slowing down.                                                 |
| `0x0d3ad/*`                                                                  |      — | Multiple 404s under this org; do not depend on the org.                             |
| `milkermedia/yt-content-pipeline`                                            |      — | 404.                                                                                |
| `kurtw-dev/social-media-research`                                            |      — | 404 (probably moved/renamed).                                                       |
| `ScrapeCreators/social-media-research-skills` (for _use_ not for _template_) |  2,139 | The repo itself is MIT, but the workflows call the **paid** `scrapecreators-api`.   |

---

## Top 5 picks for `laratik-planner`

These are the only repos I would commit a `package.json` / `requirements.txt`
dependency on today.

1. **`Panniantong/Agent-Reach`** — 78.6k★, MIT, pushed 2026-09-01.
   _Why:_ the only repo that is both a _skill_ (CLI + MCP), _self-hostable_,
   _actively maintained_, and _free of API fees_. Ships CLI for Twitter,
   Reddit, YouTube, GitHub, Bilibili, XiaoHongShu. **Integration cost: low**
   (run as a sidecar, expose MCP, call from a Next.js server action).
2. **`jlowin/fastmcp`** — 27.6k★, Apache-2.0, pushed 2026-09-07.
   _Why:_ the cleanest way to write new MCP servers in Python. Use it to
   wrap every per-platform scraper below as a tool the planner UI (or any
   agent) can call. **Integration cost: low.**
3. **`apify/apify-sdk-python`** + **`apify/crawlee`** — Apache-2.0, pushed
   2026-09-07. _Why:_ the only production-grade self-hostable scraping
   framework that gives you browser automation + proxy rotation + queue
   out of the box. Use for any platform that the libraries in picks #4–#7
   don't cover (LinkedIn, Facebook login-gated content). **Integration
   cost: medium** (3–5 days to wire a "scraper actor" container alongside
   the main planner app).
4. **`instaloader/instaloader`** (13.3k★, MIT, 2026-09-06) + **`yt-dlp/yt-dlp`**
   (189.6k★, Unlicense, 2026-08-30) + **`jdepoix/youtube-transcript-api`**
   (8.2k★, MIT, 2026-05-19) + **`davidteather/TikTok-Api`** (6.6k★, MIT,
   2026-08-24) + **`vladkens/twscrape`** (2.7k★, MIT, 2026-08-28) +
   **`praw-dev/praw`** (4.2k★, BSD-2-Clause, 2026-09-07).
   _Why:_ one _per platform_, each with a recent push, all permissively
   licensed, none archived, none DMCA'd. Together they cover IG, YT,
   TikTok, X, and Reddit — the five platforms that actually have working
   open scrapers in 2026. **Integration cost: medium** (1–2 days each,
   6 platforms × 1.5 days ≈ 8–10 days wall-clock with parallelisation).
5. **`ScrapeCreators/social-media-research-skills`** — 2.1k★, MIT,
   pushed 2026-08-26. _Why:_ not as a dependency, but as a **prompt
   template**. The `SKILL.md` format and the twelve workflow names
   (`outlier-post-finder`, `comment-mining`, `competitor-social-research`,
   `ad-library-teardown`, `trend-discovery`, `influencer-prospecting`,
   `audience-research`, `social-listening-brief`, `product-demand-research`,
   `creator-profile-teardown`, `content-repurposing`, `transcript-intelligence`)
   are the right vocabulary for the planner's "Research" feature. Copy the
   names, rewrite the bodies to call your own `fastmcp` tools. **Integration
   cost: low** (1 day to rename + rewire).

### Suggested architecture for `laratik-planner`

```
┌──────────────────────────────────────────────────────────────────────┐
│  Next.js 16 (App Router)  +  Drizzle ORM  +  Postgres 16             │
│                                                                      │
│  /app/(dashboard)/research ──── UI calls Server Actions ────┐       │
│                                                              │       │
│  /app/api/research/[jobId] ──── status polling ───────────┐  │       │
│                                                           │  │       │
│  ┌────────────────────────────────────────────────────┐   │  │       │
│  │  Python worker container (one service, N skills)   │   │  │       │
│  │  ┌─────────────────────────────────────────────┐   │   │  │       │
│  │  │  fastmcp server (laratik-mcp)               │   │   │  │       │
│  │  │   ├─ twitter_research_profile               │   │   │  │       │
│  │  │   ├─ twitter_research_trends                │◀──┼───┼──┘       │
│  │  │   ├─ reddit_research_subreddit              │   │   │          │
│  │  │   ├─ youtube_research_channel               │   │   │          │
│  │  │   ├─ youtube_get_transcript                 │   │   │          │
│  │  │   ├─ tiktok_research_creator                │   │   │          │
│  │  │   ├─ tiktok_research_outliers               │   │   │          │
│  │  │   ├─ instagram_research_profile             │   │   │          │
│  │  │   ├─ facebook_research_public_page          │   │   │          │
│  │  │   ├─ ad_library_search                      │   │   │          │
│  │  │   └─ comment_mine                           │   │   │          │
│  │  └─────────────────────────────────────────────┘   │   │          │
│  │  Wraps: instaloader, yt-dlp, youtube-transcript-    │   │          │
│  │  api, TikTok-Api, twscrape, praw, kevinzg,         │   │          │
│  │  facebookresearch/Ad-Library-API                  │   │          │
│  └────────────────────────────────────────────────────┘   │          │
│                                                              │          │
│  ┌────────────────────────────────────────────────────┐    │          │
│  │  Agent-Reach sidecar (mcporter MCP)               │◀───┼──────────┘
│  │   free, no-API-fee for Twitter / Reddit / YouTube  │    │
│  └────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
```

Three small services, one Postgres, one Next.js app — fits cleanly into
the existing `docker-compose.dev.yml` and the VPS deployment.

---

## Cross-checks performed

Per the brief, I cross-checked the high-stakes claim (that
`ScrapeCreators/social-media-research-skills` is the _only_ repo
explicitly framed as "AI skills for social media research") with two
sources:

1. **GitHub API search** with `q="topic:social-media-research"` returned
   only that repo plus a small handful of forks.
2. **GitHub web** (via `web_fetch`) of the repo page directly, which
   confirmed the description: "AI agent skills for social media
   research. … Powered by ScrapeCreators." Both routes agree.

The "Agent-Reach is the highest-star free social-media CLI" claim was
cross-checked against (a) the GitHub search `q="social media scraper skill"`
which surfaced it, and (b) the live README which enumerates Twitter,
Reddit, YouTube, GitHub, Bilibili, XiaoHongShu.

The "twint is archived" claim was verified by reading
`archived: true` from `/repos/twintproject/twint` and noting
`pushed_at: 2023-02-23` — a year and a half before the report date.

---

## Sources (every URL accessed)

### Repos verified live via the GitHub REST API (`gh api`)

- `ScrapeCreators/social-media-research-skills` — <https://github.com/ScrapeCreators/social-media-research-skills>
- `modelcontextprotocol/servers` — <https://github.com/modelcontextprotocol/servers>
- `modelcontextprotocol/python-sdk` — <https://github.com/modelcontextprotocol/python-sdk>
- `modelcontextprotocol/typescript-sdk` — <https://github.com/modelcontextprotocol/typescript-sdk>
- `jlowin/fastmcp` — <https://github.com/jlowin/fastmcp>
- `ComposioHQ/composio` — <https://github.com/ComposioHQ/composio>
- `pydantic/pydantic-ai` — <https://github.com/pydantic/pydantic-ai>
- `openai/openai-agents-python` — <https://github.com/openai/openai-agents-python>
- `anthropics/anthropic-cookbook` — <https://github.com/anthropics/anthropic-cookbook>
- `openai/openai-cookbook` — <https://github.com/openai/openai-cookbook>
- `anthropics/skills` — <https://github.com/anthropics/skills>
- `apify/apify-sdk-js` — <https://github.com/apify/apify-sdk-js>
- `apify/apify-sdk-python` — <https://github.com/apify/apify-sdk-python>
- `apify/crawlee` — <https://github.com/apify/crawlee>
- `apify/fingerprint-suite` — <https://github.com/apify/fingerprint-suite>
- `berstend/puppeteer-extra` — <https://github.com/berstend/puppeteer-extra>
- `Panniantong/Agent-Reach` — <https://github.com/Panniantong/Agent-Reach>
- `Evil0ctal/Douyin_TikTok_Download_API` — <https://github.com/Evil0ctal/Douyin_TikTok_Download_API>
- `davidteather/TikTok-Api` — <https://github.com/davidteather/TikTok-Api>
- `pablouser1/ProxiTok` — <https://github.com/pablouser1/ProxiTok>
- `shaikhsajid1111/social-media-profile-scrapers` — <https://github.com/shaikhsajid1111/social-media-profile-scrapers>
- `sudoguy/tiktokpy` — <https://github.com/sudoguy/tiktokpy>
- `instaloader/instaloader` — <https://github.com/instaloader/instaloader>
- `adw0rd/instagrapi` — <https://github.com/adw0rd/instagrapi>
- `subzeroid/instagrapi` — <https://github.com/subzeroid/instagrapi>
- `dilame/instagram-private-api` — <https://github.com/dilame/instagram-private-api>
- `megadose/toutatis` — <https://github.com/megadose/toutatis>
- `pgrimaud/instagram-user-feed` — <https://github.com/pgrimaud/instagram-user-feed>
- `ramtinak/InstagramApiSharp` — <https://github.com/ramtinak/InstagramApiSharp>
- `chris-greening/instascrape` — <https://github.com/chris-greening/instascrape>
- `subzeroid/aiograpi-rest` — <https://github.com/subzeroid/aiograpi-rest>
- `JustAnotherArchivist/snscrape` — <https://github.com/JustAnotherArchivist/snscrape>
- `twintproject/twint` — <https://github.com/twintproject/twint>
- `d60/twikit` — <https://github.com/d60/twikit>
- `vladkens/twscrape` — <https://github.com/vladkens/twscrape>
- `Altimis/Scweet` — <https://github.com/Altimis/Scweet>
- `scrapfly/scrapfly-scrapers` — <https://github.com/scrapfly/scrapfly-scrapers>
- `bisguzar/twitter-scraper` — <https://github.com/bisguzar/twitter-scraper>
- `pytube/pytube` — <https://github.com/pytube/pytube>
- `ytdl-org/youtube-dl` — <https://github.com/ytdl-org/youtube-dl>
- `yt-dlp/yt-dlp` — <https://github.com/yt-dlp/yt-dlp>
- `jdepoix/youtube-transcript-api` — <https://github.com/jdepoix/youtube-transcript-api>
- `kevinzg/facebook-scraper` — <https://github.com/kevinzg/facebook-scraper>
- `facebookresearch/Ad-Library-API-Script-Repository` — <https://github.com/facebookresearch/Ad-Library-API-Script-Repository>
- `praw-dev/praw` — <https://github.com/praw-dev/praw>
- `pushshift/api` — <https://github.com/pushshift/api>
- `bellingcat/auto-archiver` — <https://github.com/bellingcat/auto-archiver>
- `sherlock-project/sherlock` — <https://github.com/sherlock-project/sherlock>
- `qeeqbox/social-analyzer` — <https://github.com/qeeqbox/social-analyzer>
- `alpkeskin/mosint` — <https://github.com/alpkeskin/mosint>
- `arxhr007/Aliens_eye` — <https://github.com/arxhr007/Aliens_eye>
- `ibnaleem/gosearch` — <https://github.com/ibnaleem/gosearch>
- `Alfredredbird/tookie-osint` — <https://github.com/Alfredredbird/tookie-osint>
- `osintambition/Social-Media-OSINT-Tools-Collection` — <https://github.com/osintambition/Social-Media-OSINT-Tools-Collection>
- `oxylabs/how-to-scrape-google-trends` — <https://github.com/oxylabs/how-to-scrape-google-trends>
- `obsei/obsei` — <https://github.com/obsei/obsei>
- `alvarobartt/trendet` — <https://github.com/alvarobartt/trendet>

### Web fetches (initial discovery, before the API rate-limit lifted)

- `https://github.com/ScrapeCreators/social-media-research-skills` (full HTML) — confirmed the "AI agent skills for social media research … Powered by ScrapeCreators" framing.
- `https://github.com/Apify/apify-sdk-js` (full HTML) — confirmed the "Apify SDK monorepo" description and Apache-2.0 license.
- `https://github.com/serpapi/google-search-results-python` (full HTML) — confirmed as a Python SerpAPI wrapper (not the focus of the report, but validated as the fallback for Google Trends after the `pytrends` deprecation).

### GitHub search queries run

- `q=topic:instagram-scraper stars:>500` (15 results, 7 new entries)
- `q=topic:tiktok-scraper stars:>200` (13 results, 5 new entries)
- `q=twitter-scraper python stars:>1000` (6 results, 4 new entries)
- `q=facebook-scraper python stars:>500` (1 result, confirms kevinzg as the leader)
- `q=google-trends python stars:>500` (2 results)
- `q=OSINT social-media stars:>500` (10 results, 5 new entries)
- `q=ad-library` (3 results, including the ScrapeCreators repo)
- `q=competitor analysis social`
- `q=trend detection`
- `q=social media insights`
- `q=influencer analytics`
- `q=social-listening`
- `q=instagram analytics api stars:>500`

### GitHub README cross-check

- `Panniantong/Agent-Reach/readme` — confirmed the `free-api`, `mcp`, `twitter-scraper`, `youtube-transcript`, `reddit-scraper` topic set; cross-checked the "supported platforms" claim from the README HTML body.

### Doc / external cross-references

- ScrapeCreators platform docs — <https://docs.scrapecreators.com> and <https://docs.scrapecreators.com/integrations/mcp> (linked from the repo README).
- Apify SDK docs — <https://docs.apify.com/sdk/python> (linked from `apify/apify-sdk-python` README).
- The `praw-dev/praw` README — confirmed "official Python Reddit API Wrapper".

---

## One-page action list for the next planning pass

1. **Adopt `Panniantong/Agent-Reach` as a sidecar** for free
   Twitter/Reddit/YouTube social research. Estimated work: 1 day.
2. **Adopt `jlowin/fastmcp`** to write a single `laratik-mcp` server
   exposing the per-platform tools. Estimated work: 1 day.
3. **Pin the per-platform libraries** in `requirements.txt` (or a
   separate `requirements-research.txt`): instaloader, yt-dlp,
   youtube-transcript-api, TikTokApi, twscrape, praw, kevinzg
   facebook-scraper, facebookresearch Ad-Library-API scripts.
   Estimated work: 5 days including Playwright for the platforms
   that need it.
4. **Copy the `SKILL.md` naming and structure** from
   `ScrapeCreators/social-media-research-skills` for the planner's
   own Research tab. Do **not** import the package. Estimated work:
   1 day.
5. **Defer LinkedIn and Threads** to a paid provider in v2. Budget
   a quarterly maintenance tax of 2 days per platform to keep the
   open scrapers alive.

Total v1 effort estimate: **8–10 dev days**, fits inside one sprint.
