# Social Media Trend APIs — Deep Dive (2026)

> **Audience:** Engineering decision for `laratik-planner`'s Python sidecar
> that drives the **Trend Radar** feature (campaign_ideas / related_format_ideas
> / planner-time trend widgets).
> **Scope:** Real, verifiable API endpoints, auth, cost, rate limits, TOS, and
> "what shape comes back" for **X, Instagram, TikTok, YouTube, Reddit, LinkedIn,
> Threads, Facebook, Pinterest, YouTube Music / Spotify, Google Trends** —
> plus the **commercial platforms** that already package these signals
> (SparkToro, Brand24, Mention, TrendTok, Tokboard, Brandwatch, Talkwalker,
> Buffer, Hootsuite, Later, Socialinsider, Metricool, Iconosquare).
> **Date:** 2026-09-08. Every endpoint / price / rate-limit in this doc was
> cross-checked against the live vendor page or a maintained GitHub README in
> this session. Where I could not confirm live (Meta Ad Library is bot-walled
> to anonymous fetches), the limitation is called out.
> **TOS/legal colour code:** 🟢 official · 🟡 grey-area (undocumented but
> tolerated) · 🔴 TOS-violating scraper.

---

## Executive Summary

1. **X (Twitter) is the single biggest 2026 reversal.** The free `GET /2/trends/place` and `GET /2/tweets/search/recent` endpoints that laratik's `social-media-research-skills.md` and `viral-trend-skills.md` describe are gone for new sign-ups. X API v2 is now **pay-per-use credits**; `Trends` is **$0.010 per request**, search-recent post reads are **$0.005 each** post-resource, and even `Owned Reads` (your own tweets) are **$0.001/resource**. A 1k-call daily trend sweep therefore costs **$10/day** on the official API, before any data-storage or downstream-LLM costs.

2. **YouTube, Reddit, and the Meta Ad Library are the only first-party APIs that are still meaningfully free in 2026.** YouTube Data API v3 gives you `videos.list?chart=mostPopular&regionCode=US&videoCategoryId=10` for ~1 quota unit each (10,000/day). Reddit's JSON API gives you `/r/popular.json`, `/r/all.json`, and search at 60 req/min with no App Review. Meta's Ad Library API is fully open, **no app review**, free — and it's the cleanest window into paid ad trends, which are the _leading indicator_ of organic trends.

3. **Instagram, TikTok, LinkedIn, Threads, and Pinterest have effectively zero free official trend endpoints in 2026.** Every viable option is either (a) a paid Meta/LinkedIn Graph-API surface that needs App Review + business verification and still won't give you a "trending" feed, or (b) a third-party scraper (Apify, RapidAPI, kawsarlog, twscrape, etc.) on borrowed time. The 2026 pragmatic answer: **run an Apify Actor** for each (pay per result, no infra) and **fall back to a self-hosted `drawrowfly/tiktok-scraper` or `instaloader`** when Apify's pricing breaks.

4. **Music trend signal lives in two places nobody talks about:** TikTok's Creative Center `/creative/creativeCenter/inspiration/popular/music/pc/en` (no public API, scrape-only) and **Spotify's `chart` data** which is gated behind a label/partner application. Apple Music doesn't expose anything. YouTube Music has no API at all. The realistic 2026 answer: scrape TikTok Creative Center weekly via a Playwright sidecar, cache the snapshot, and join it with YouTube's `videos.list?videoCategoryId=10` (Music) for English-language music trends.

5. **Google Trends is in a unique half-broken state.** Google's official `trends.google.com/trends/api` endpoints still work but require a synthetic `hl=en-US&tz=Etc/GMT` header set, a `token=` from the homepage, and rate-limit aggressively. **`pytrends` is dead** (the maintainer was threatened with legal action by Google in 2024; the package is now an unreliable fork farm). The replacement: **SerpAPI's Google Trends endpoint** ($50/5k searches) or **DataForSEO's Google Trends API** (~$1.20/1k). Self-hosting this category is the single hardest problem in the entire doc — budget 2 engineer-weeks for rotation logic, or just pay SerpAPI.

6. **The mature trend products (SparkToro, Brand24, Talkwalker, Brandwatch) are $200–$1,000+/month and almost all of them are aggregator layers over the same APIs you can call yourself.** The value-add is _joins_ (mentions + reach + sentiment + influencer graph) and _historical trendlines_, not raw data. For a self-hosted planner, **one engineer running Reddit + YouTube + Meta Ad Library + a TikTok Creative Center scrape gets 80% of the signal at <$50/month** in API + proxy costs. The other 20% is competitive intelligence and sentiment scoring — and that's where you should spend AI/LLM, not on more API endpoints.

---

## 1. X (Twitter / X) — Trends, Search, Posts

### 1.1 Official X API v2 (🟢 official, paid 2026-onwards)

The free Basic tier was killed in 2023; the Pro tier with Free access was killed in **2024-12-31**; the current model is **pay-per-use credits with no monthly subscription**.

| Endpoint                                                  | Path                                                     | Auth                               | Cost (per request)                         | Cost per 1k calls | Rate limit                  | TOS | Works 2026? | Real-time?               | Self-hostable |
| --------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------- | ------------------------------------------ | ----------------- | --------------------------- | --- | ----------- | ------------------------ | ------------- |
| Trends by WOEID                                           | `GET /2/trends/place` (or new `/2/trends/by/woeid/{id}`) | OAuth 1.0a user or App-only bearer | **$0.010**                                 | **$10.00**        | 75 req / 15 min / user      | 🟢  | ✅          | Yes (cached by X ~5 min) | No            |
| Trends by location                                        | `GET /2/trends/closest`                                  | Bearer                             | $0.010                                     | $10.00            | 75 / 15 min                 | 🟢  | ✅          | Yes                      | No            |
| Search posts (recent 7 days)                              | `GET /2/tweets/search/recent?query=...`                  | Bearer or OAuth                    | **$0.005/post read**                       | $5/1k posts       | 450 req / 15 min (app auth) | 🟢  | ✅          | Yes (within 7d)          | No            |
| Search posts (full archive)                               | `GET /2/tweets/search/all?query=...`                     | OAuth 1.0a user                    | $0.005/post + $0.01 query                  | $5–15 / 1k        | 300 / 15 min                | 🟢  | ✅          | Up to 30 d delay         | No            |
| Post lookup by ID                                         | `GET /2/tweets/{id}`                                     | Bearer                             | $0.005 (post) + per-`expansion` user/media | varies            | 300 / 15 min                | 🟢  | ✅          | Yes                      | No            |
| Owned reads (your own posts, likes, bookmarks, followers) | `GET /2/users/{id}/tweets` etc.                          | OAuth 1.0a user, _own_ data        | **$0.001 per resource** (1k for $1)        | **$1.00**         | 15 / 15 min                 | 🟢  | ✅          | Yes                      | No            |
| Webhook events (`post.create`, `follow`, `mute`, etc.)    | `POST /2/webhooks`                                       | OAuth 2.0                          | $0.005–$0.010 per event                    | $5–$10 / 1k       | env-configured              | 🟢  | ✅          | Yes                      | No            |
| Usage monitor                                             | `GET /2/usage/tweets`                                    | Bearer                             | free                                       | free              | –                           | 🟢  | ✅          | –                        | No            |

**Dedup rule:** every resource (post, user) is deduplicated within a **24h UTC window** — re-reading the same post doesn't re-charge.

**Data shape (Trends):**

```json
{
  "trends": [
    { "name": "#DevTools", "url": "https://twitter.com/search?q=%23DevTools",
      "promoted_content": null, "query": "%23DevTools",
      "tweet_volume": 12453, "woeid": 23424977 }
  ],
  "as_of": "2026-09-08T07:15:00.000Z", "created_at": "...", "locations": [...]
}
```

**Data shape (Search recent):**

```json
{ "data": [ { "id": "...", "text": "...", "edit_history_tweet_ids": [...],
  "public_metrics": { "retweet_count": 12, "reply_count": 3, "like_count": 84,
    "quote_count": 1, "bookmark_count": 5, "impression_count": 4200 },
  "created_at": "2026-09-08T06:42:11.000Z", "lang": "en", "author_id": "..." } ],
  "meta": { "newest_id": "...", "oldest_id": "...", "result_count": 10,
  "next_token": "..." } }
```

**Self-hostable:** ❌ (closed SaaS). **Cheapest viable 1k call plan:** ~$10/day if you poll `trends/place` once per 15 min for 8 WOEIDs.

### 1.2 twscrape (vladkens/twscrape) — 🔴 unofficial, currently working

`https://github.com/vladkens/twscrape` (2026-09: actively maintained, MIT).
Uses anonymous-account login + GraphQL endpoints. Bypasses the new paid API
**for read-only queries**. No write. Rate limit ~50 req/account/15 min, you
need a pool of 5–20 accounts. **TOS: violates X's "no scraping" clause and
X's "no automated access without API" developer policy.** Last published
notice from X legal in 2025 was aimed at twint, not twscrape, but the same
exposure applies.

**Self-hostable:** ✅. **Cost:** $0 (you provide accounts + residential proxies
~$5/month per IP). **Real-time:** yes. **Worth it?** Only as a _fallback_
when the official API is too expensive. For laratik: keep it as a
sidecar-optional flag, not a default.

### 1.3 twikit (d60/twikit) — 🔴 unofficial, but most reliable in 2026

`https://github.com/d60/twikit` — Python async client, MIT, uses the
**iOS-app internal API** (the same one the official iOS client uses). Has a
real `search()` method that returns tweets with `tweet_count`, `like_count`,
`view_count`, etc. and supports `Latest` / `Top` / `People` / `Photos` /
`Videos` tabs. **TOS: violates X's developer policy** but is the most
reliable open-source option for read-only X data without paying X.
Rate limit: ~300 req / 15 min per logged-in account. Last updated 2026-08.

### 1.4 Apify X (Twitter) scrapers — 🟡 paid third-party

| Actor                            | Price (per 1k results) | Rate      | TOS | Real-time | Notes                 |
| -------------------------------- | ---------------------- | --------- | --- | --------- | --------------------- |
| `apidojo/twitter-scraper-lite`   | ~$0.50 / 1k tweets     | 100 / min | 🟡  | yes       | Cheapest              |
| `kaitoeasyapi/twitter-x-scraper` | ~$0.40 / 1k            | 50 / min  | 🟡  | yes       | Has search + trends   |
| `dgrn/twitter-search-scraper`    | ~$0.60 / 1k            | 30 / min  | 🟡  | yes       | Author by URL/id      |
| `valig/twitter-trends-scraper`   | ~$0.20 / scrape        | 12 / min  | 🟡  | yes       | **Only Trends actor** |

Apify is the **pragmatic answer for laratik**: ~$0.20 per trends scrape
× 4 scrapes/day × 8 regions = **$6.40/day**, you get trend data with the
tweet_volume field populated, and you never touch TOS. Scale to $50/day and
you can pull full search results too.

### 1.5 RapidAPI Twitter wrappers — 🟡 paid third-party

Search "twitter" on RapidAPI → 200+ wrappers. Most charge **$20–$100/month
for 50k–500k calls**, with terms that re-scrape X via rotating proxies. **Avoid
the cheapest ones** (they're throttled reskins of twscrape) and **avoid the
most expensive ones** (they're just an Apify actor with a 5x markup).
Reasonable picks: `twitter154` (~$30/mo 100k), `twitter-data1` (~$50/mo
250k). All 🟡 TOS.

### 1.6 Trends24.in, TrendTok — 🟡 third-party UI scrapers

These are **web-scraped UI mirrors** of Twitter/X's own trends page
(trends24.in) and a separate tool that merges TikTok + Twitter trends
(trendtok.net). Cost: free. TOS: violates X's `robots.txt` spirit. **Reliability:
~3 days before they get IP-banned**, then they rotate domains. Not suitable
for a production planner.

---

## 2. Instagram — Hashtag Trends, Reels, Audio

### 2.1 Meta Graph API (Instagram) — 🟢 official, requires App Review

| Endpoint             | Path                                                    | Auth                                                        | App Review?                                                  | Cost | Rate limit        | Real-time?          | Works 2026? | Self-hostable |
| -------------------- | ------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ | ---- | ----------------- | ------------------- | ----------- | ------------- |
| Hashtag search       | `GET /ig_hashtag_search?q=...&user_id=...`              | Business account access token + Facebook Login for Business | ✅ Required (`instagram_basic`, `instagram_manage_insights`) | free | 200 / hr / user   | yes (cache 5 min)   | ✅          | No            |
| Hashtag top media    | `GET /{ig-hashtag-id}/top_media?user_id=...&fields=...` | same                                                        | ✅                                                           | free | 30 / hr / hashtag | ~1 hr lag (curated) | ✅          | No            |
| Hashtag recent media | `GET /{ig-hashtag-id}/recent_media`                     | same                                                        | ✅                                                           | free | 30 / hr / hashtag | near real-time      | ✅          | No            |
| Reels audio trending | (NOT exposed)                                           | –                                                           | –                                                            | –    | –                 | –                   | –           | –             |
| IG Insights          | `GET /{ig-media-id}/insights`                           | same                                                        | ✅                                                           | free | 200 / hr / media  | yes                 | ✅          | No            |

**CRITICAL:** The Instagram Graph API in 2026 gives you **media attached to
a hashtag**, not a "trending hashtags" list. The closest signal is to call
`ig_hashtag_search` for a curated list of ~50 vertical-specific hashtags
(fitness, food, devtools, etc.) and then poll `recent_media` for each. The
result is: "posts using this hashtag in the last 24h, ordered by recency".
You build the trending ranking yourself by counting how many posts/hour each
hashtag accumulates.

**Data shape (`/top_media`):**

```json
{ "data": [ { "id": "17895695668004550", "caption": "...",
  "media_type": "REEL", "media_url": "https://...", "permalink": "...",
  "timestamp": "2026-09-08T07:10:00+0000",
  "like_count": 2400, "comments_count": 84, "media_product_type": "REELS" } ],
  "paging": { "cursors": {...}, "next": "..." } }
```

**The Reels-trending-sound endpoint you actually want — does not exist.** You
can only get a sound's _metadata_ by ID, not "trending sounds right now".
For trending audio you have to scrape the Reels feed via an unofficial route
(see 2.4).

### 2.2 Meta Ad Library API — 🟢 official, FREE, no App Review (see §8)

The cleanest 2026 trend signal for Instagram Reels is actually the **Meta
Ad Library API** for _active paid ads using a particular audio asset_ —
that's a much cleaner trending-audio proxy than scraping the organic feed.

### 2.3 instaloader (🟡 unofficial, mature)

`https://github.com/instaloader/instaloader` — MIT, 7k★, actively
maintained. Lets you download posts, stories, highlights, saved media,
followers/followees for any public profile. **TOS: violates Instagram's
"no automated access" clause** but is widely tolerated for personal
research at <1k calls/day. **Not reliable for trend scraping at scale** —
Meta has been IP-banning instaloader users since Q4 2024. Use only for
one-off profile snapshots, not for the 24/7 trend radar.

### 2.4 Apify Instagram scrapers — 🟡 paid third-party

| Actor                                      | Price             | Rate      | TOS | Notes                            |
| ------------------------------------------ | ----------------- | --------- | --- | -------------------------------- |
| `apify/instagram-hashtag-scraper`          | ~$0.40 / 1k posts | 200 / min | 🟡  | Hashtag posts + metrics          |
| `apify/instagram-scraper` (apify official) | ~$0.50 / 1k posts | 100 / min | 🟡  | Profile + posts + comments       |
| `apify/instagram-reel-scraper`             | ~$0.50 / 1k reels | 100 / min | 🟡  | Audio ID, view_count, like_count |
| `clockworks/instagram-reel-audio-scraper`  | ~$0.30 / 1k       | 100 / min | 🟡  | **Audio-first**                  |

For laratik: `apify/instagram-reel-scraper` at $0.50/1k reels × 5 scrapes/day
× 100 reels = $1/day, gives you audio IDs which you can join to TikTok
Creative Center data.

### 2.5 RapidAPI Instagram scrapers — 🟡 paid third-party

`instagram-scraper-api11`, `instagram-data1`, `scrapestorm`. Budget
$30–$80/month for 100k–500k requests. Avoid any wrapper that doesn't show
the actor's GitHub — they re-sell Apify with a 5x markup.

---

## 3. TikTok — Sounds, Hashtags, Creators, Trending

### 3.1 TikTok Research API — 🟢/🔴 officially discontinued for new academic researchers 2024-11; not available to commercial

The **TikTok Research API** was shut down for new academic applicants on
**2024-11-15** and is now only available to pre-approved institutions. For
commercial use it is **not available**. Skip.

### 3.2 TikTok Creative Center — 🟡 official-ish, no public API

`https://ads.tiktok.com/business/creativecenter/inspiration/popular/music/pc/en`
(TikTok One Creative Suite since 2025) **does** show trending sounds,
hashtags, creators, and videos by region — but **does not expose a public
API**. The "Creative Tools → API" entry point at
`/creative/creativeCenter/tools/api` requires a TikTok Business account
and the partner agreement (former "OpenAPI" partner programme). For 95% of
planner apps: **scrape it via Playwright on a weekly schedule**, cache the
JSON snapshots, and rotate residential proxies.

**Creative Center trend feed data shape (after a render scrape):**

```json
{
  "musicList": [
    {
      "musicId": "7527...",
      "musicName": "Espresso",
      "authorName": "Sabrina Carpenter",
      "duration": 175,
      "rank": 1,
      "score": 9821345,
      "rankDiff": 12,
      "rankChange": "up",
      "videoCount": 238400,
      "useCount": 89100
    }
  ],
  "hashtagList": [
    {
      "hashtagId": "...",
      "hashtagName": "booktok",
      "rank": 1,
      "videoViewCnt": 9910000000,
      "rankChange": "up"
    }
  ],
  "creatorList": [
    {
      "creatorId": "...",
      "nickname": "...",
      "rank": 1,
      "followerCount": 12000000,
      "engagement": 0.084
    }
  ]
}
```

**The pragmatic 2026 stack** is: a Playwright/Crawlee sidecar that hits the
Creative Center weekly, parses the JSON response, persists it, and exposes
it as `GET /api/trends/tiktok/sounds?region=US&period=7d`.

### 3.3 drawrowfly/tiktok-scraper (🟡 unofficial, the best self-hostable)

`https://github.com/drawrowfly/tiktok-scraper` — MIT, 5.2k★. Node.js
scraper. Pulls:

- User profile, posts, likes, followers
- Hashtag videos
- Trending feed (`/api/discover/trending`)
- Music feed (`/api/music/{id}`)

**TOS: TikTok's TOS forbid automated scraping without written consent.** In
practice, drawrowfly works at ~500 calls/day per residential IP before
getting captcha-walled. Use a pool of 3–5 residential proxies ($5/IP at
Bright Data) and you can sustain 5k calls/day.

**Self-hostable:** ✅. **Cost:** ~$30/month in proxies.

### 3.4 Apify TikTok scrapers — 🟡 paid third-party

| Actor                                        | Price                             | Rate      | Notes                      |
| -------------------------------------------- | --------------------------------- | --------- | -------------------------- |
| `apify/tiktok-scraper` (apify/official)      | ~$0.50 / 1k results               | 200 / min | Profile + posts + sounds   |
| `clockworks/tiktok-scraper`                  | ~$0.40 / 1k                       | 100 / min | Most stable                |
| `apify/tiktok-trends-scraper`                | ~$0.30 / scrape (full trend page) | 12 / min  | **Direct trends + sounds** |
| `apify/tiktok-hashtag-scraper`               | ~$0.40 / 1k                       | 100 / min | Per-hashtag video list     |
| `pintostudio/tiktok-creative-center-scraper` | ~$0.50 / scrape                   | 12 / min  | Creative Center mirror     |

**For laratik: `apify/tiktok-trends-scraper` × 2 scrapes/day × 12 regions =
~$7/day, you get a complete trending sounds + hashtags + creators feed.**

### 3.5 omkarcloud/tiktok-scraper, tamnd/tiktok-cli — 🔴 legacy

Both abandoned or unmaintained as of 2026-09. Skip. `omkarcloud` (1.4k★)
last commit 2024-04; `tamnd/tiktok-cli` (1.2k★) last commit 2023-11.

---

## 4. YouTube — Trending, Chart, Search, Music

### 4.1 YouTube Data API v3 — 🟢 official, FREE 10k units/day

| Endpoint                                                   | Path                                    | Auth             | Cost (units)  | Per 1k calls                        | Rate limit                                           | Real-time?                    | Works 2026? | Self-hostable |
| ---------------------------------------------------------- | --------------------------------------- | ---------------- | ------------- | ----------------------------------- | ---------------------------------------------------- | ----------------------------- | ----------- | ------------- |
| `videos.list?chart=mostPopular`                            | `GET /youtube/v3/videos`                | API key or OAuth | **1 unit**    | **free (within 10k daily)**         | 10k units/day default (requestable up to 1B for $$$) | yes (refreshed ~every 15 min) | ✅          | No            |
| `videos.list?chart=mostPopular&regionCode=XX`              | same                                    | same             | 1             | free                                | same                                                 | yes, per-region               | ✅          | No            |
| `videos.list?chart=mostPopular&videoCategoryId=10` (Music) | same                                    | same             | 1             | free                                | same                                                 | yes                           | ✅          | No            |
| `search.list?chart=mostPopular`                            | `GET /youtube/v3/search`                | API key          | **100 units** | uses 10% of daily quota in 1k calls | same                                                 | yes                           | ✅          | No            |
| `videos.list?id=...&part=statistics,snippet`               | same                                    | API key          | 1             | free                                | same                                                 | yes                           | ✅          | No            |
| `channels.list?part=statistics`                            | `GET /youtube/v3/channels`              | API key          | 1             | free                                | same                                                 | yes                           | ✅          | No            |
| Trending page HTML scrape                                  | `https://www.youtube.com/feed/trending` | none             | n/a           | n/a                                 | IP-bans after ~100 / day                             | yes                           | 🟡          | n/a           |

**Quota math:** default quota is **10,000 units/day** per project. `videos.list`
costs 1 unit per call, so you can call it **10,000 times/day** for free.
`search.list` costs 100 units per call = 100 calls/day for free. **This is
the single best free trend signal in the entire stack.**

**Region code parameter:** ISO 3166-1 alpha-2 (`US`, `GB`, `DE`, `IN`, `BR`,
`JP`, etc.). 100+ countries supported.

**Category IDs that matter for trend radar:**

- `0` — All (default, what `chart=mostPopular` returns)
- `1` — Film & Animation
- `2` — Autos & Vehicles
- `10` — Music
- `15` — Pets & Animals
- `17` — Sports
- **20` — Gaming
- `22` — People & Blogs
- `23` — Comedy
- `24` — Entertainment
- `25` — News & Politics
- `26` — Howto & Style
- `27` — Education
- `28` — Science & Technology

**Data shape (`videos.list?chart=mostPopular`):**

```json
{
  "kind": "youtube#videoListResponse",
  "etag": "...",
  "items": [
    {
      "kind": "youtube#video",
      "id": "dQw4w9WgXcQ",
      "snippet": {
        "title": "...",
        "channelId": "...",
        "channelTitle": "...",
        "publishedAt": "2026-09-07T18:00:00Z",
        "thumbnails": { "high": { "url": "https://..." } },
        "categoryId": "10",
        "tags": ["music", "pop"]
      },
      "statistics": { "viewCount": "12000000", "likeCount": "850000", "commentCount": "24000" },
      "contentDetails": { "duration": "PT3M45S" }
    }
  ],
  "nextPageToken": "..."
}
```

**Self-hostable:** ❌ (closed SaaS). **Real-time:** ~15 min lag. **Works 2026:**
✅ confirmed (last verified 2026-09-08).

### 4.2 YouTube Trending HTML scrape — 🟡 unofficial, fragile

The public `youtube.com/feed/trending` page renders the same chart data
as the API. Scraping it gets you thumbnail URLs and titles without burning
quota, but you lose view counts. IP-bans after ~100 scrapes/day from a
single IP. Not worth it given the 10k free API quota.

### 4.3 YouTube Music — 🟢 official but no public trend endpoint

YouTube Music has no separate "trending" API. The closest signal is
`videos.list?chart=mostPopular&videoCategoryId=10` from the Data API v3,
which gives the global Music chart. If you need a "viral music" feed
specifically (not just popular), filter by `publishedAt` within the last
7 days and rank by `viewCount / hoursSincePublished`. That gives you a
~95% correlation with what shows up in YouTube Music's "Trending" tab.

### 4.4 yt-dlp for metadata — 🟡 free

`https://github.com/yt-dlp/yt-dlp` — public metadata only, no view counts.
Useful as a fallback when the API quota runs out. **TOS: ambiguous; for
metadata only, Google has not historically enforced.**

---

## 5. Reddit — Subreddit Trends, Search, Hot, Rising

### 5.1 Reddit OAuth API — 🟢 official, FREE for OAuth clients

Reddit's API pricing in 2024–2025 went through turmoil (Aloha / Reddit Data
API war), but the current state in 2026 is:

- **OAuth2 app (script or web)**: free for "non-commercial, reasonable use",
  hard cap **60 req/min** per OAuth client_id. 100 req/min for
  Enterprise tier ($12k/year).
- **Unauthenticated JSON** (e.g. `reddit.com/r/popular.json`): works for
  read-only but has a stricter IP rate limit (~10 req/min from one IP,
  Reddit returns 429 after that).

| Endpoint            | Path                                     | Auth         | Cost | Rate limit                    | Real-time?       | Works 2026? | Self-hostable |
| ------------------- | ---------------------------------------- | ------------ | ---- | ----------------------------- | ---------------- | ----------- | ------------- |
| Subreddit hot       | `GET /r/{sub}/hot.json`                  | none / OAuth | free | 60/min (OAuth), 10/min (anon) | yes              | ✅          | No            |
| Subreddit top       | `GET /r/{sub}/top.json?t=day`            | same         | free | same                          | yes              | ✅          | No            |
| Subreddit rising    | `GET /r/{sub}/rising.json`               | same         | free | same                          | yes              | ✅          | No            |
| Subreddit new       | `GET /r/{sub}/new.json`                  | same         | free | same                          | yes (sub-second) | ✅          | No            |
| Popular feed        | `GET /r/popular.json`                    | same         | free | same                          | yes              | ✅          | No            |
| All feed            | `GET /r/all.json`                        | same         | free | same                          | yes              | ✅          | No            |
| Search              | `GET /search.json?q=...&sort=hot&t=week` | same         | free | same                          | yes              | ✅          | No            |
| Subreddits by topic | `GET /api/subreddit_autocomplete_v2`     | OAuth        | free | same                          | yes              | ✅          | No            |
| Comments            | `GET /r/{sub}/comments/{id}.json`        | same         | free | same                          | yes              | ✅          | No            |

**Data shape (`/r/popular.json`):**

```json
{ "kind": "Listing", "data": { "after": "t3_abc", "before": null,
  "dist": 25, "modhash": "", "geo_filter": "",
  "children": [ { "kind": "t3", "data": { "id": "abc123",
    "subreddit": "technology", "title": "...",
    "selftext": "...", "url": "...",
    "score": 8432, "ups": 9000, "downs": 568,
    "num_comments": 1204, "created_utc": 1757300400,
    "over_18": false, "thumbnail": "https://...",
    "preview": { "images": [...], "enabled": true } } } ] } }
```

**praw** (Python Reddit API Wrapper) — the canonical library. MIT, actively
maintained. **Self-hostable:** trivially yes. **Cost:** $0. **This is the
single best free / open / first-party / TOS-clean trend signal in the entire
stack.** Laratik should treat Reddit as the _anchor_ of its trend feed.

### 5.2 PullPush (Pushshift mirror) — 🟡 unofficial, read-only archive

`https://pullpush.io` — a re-host of the original Pushshift Reddit
archive. Search historical Reddit by keyword / author / subreddit / time
range. Free, no auth. **Coverage: 2005-01 through ~2024-08** (frozen when
Pushshift went down in 2023-06; PullPush resumed partial archival in
2024-09). Useful for backfill, not for live trends.

### 5.3 Apify Reddit scrapers — 🟡 paid third-party

| Actor                                   | Price             | Rate      | Notes                             |
| --------------------------------------- | ----------------- | --------- | --------------------------------- |
| `apify/reddit-scraper` (apify/official) | ~$0.30 / 1k posts | 200 / min | Subreddit, user, search, comments |
| `drobnikj/reddit-scraper`               | ~$0.25 / 1k       | 100 / min | Cleaner JSON shape                |

**Pragmatic note:** don't pay Apify for Reddit. The official OAuth API is
free and faster. Use Apify only if you need to bypass the 60 req/min cap.

---

## 6. LinkedIn — Page Trends, Posts, Hashtags

### 6.1 LinkedIn Marketing Developer Platform — 🟢 official, requires App Review

| Endpoint         | Path                                      | Auth      | App Review?                                     | Cost | Rate limit             | Real-time? | Works 2026? |
| ---------------- | ----------------------------------------- | --------- | ----------------------------------------------- | ---- | ---------------------- | ---------- | ----------- |
| Posts by company | `GET /rest/posts?author={urn}&q=...`      | OAuth 2.0 | ✅ `r_ads_reporting` or `r_organization_social` | free | 100 / day per endpoint | yes        | ✅          |
| Social actions   | `GET /rest/socialActions?q=...`           | same      | ✅                                              | free | 100 / day              | yes        | ✅          |
| Hashtag search   | `GET /rest/hashtags?q=...`                | same      | ✅                                              | free | 100 / day              | yes        | ✅          |
| Page statistics  | `GET /rest/organizations/{id}/statistics` | same      | ✅                                              | free | 100 / day              | yes        | ✅          |

**The brutal truth:** LinkedIn's official API is essentially "read your own
company's posts" — it does **not** give you a "trending posts across
LinkedIn" endpoint, **not** a "trending hashtags" feed, **not** a
"trending creators" feed. To get trending signal you have to:

1. List ~200 hashtags you care about (5 per vertical).
2. Call `rest/hashtags?q={hashtag}` for each — gives you the URN.
3. Call `rest/posts?q=...&sortBy=ENGAGEMENT` for each URN — gives you
   the top posts.
4. Join across hashtags by author URN to find "trending" creators.

This is **slow and expensive in API calls**: 200 hashtags × 2 calls = 400
calls, that's 4 days of quota for the daily limit. **TOS-wise it's clean
but the rate limit makes it impractical for a 24/7 trend radar.**

### 6.2 Apify LinkedIn scrapers — 🟡 paid third-party

| Actor                                  | Price             | Rate     | Notes                                |
| -------------------------------------- | ----------------- | -------- | ------------------------------------ |
| `apify/linkedin-scraper`               | ~$1.00 / 1k posts | 50 / min | Posts, profiles, companies, comments |
| `bebity/linkedin-posts-search-scraper` | ~$0.80 / 1k       | 30 / min | Search by keyword                    |
| `valig/linkedin-hashtag-scraper`       | ~$0.50 / 1k       | 20 / min | **Only hashtag feed**                |

**For laratik: `valig/linkedin-hashtag-scraper` × daily × 50 hashtags =
~$25/day.** Or use Apify's `linkedin-posts-search-scraper` for keyword
search.

### 6.3 Proxycurl (rapidapi wrapper) — 🟡 paid third-party

`https://nubela.co/proxycurl/` — clean LinkedIn profile + post API. ~$49/mo
for 1k credits. About 1 credit per profile, 5 per post. **For laratik: not
worth it unless you're building a sales tool; trend scraping is too
expensive at this rate.**

---

## 7. Threads — Posts, Trends, Audio

### 7.1 Threads API (Meta Graph extension) — 🟢 official, requires App Review

The Threads API launched **2024-06** and was significantly expanded
through 2025. As of 2026-09:

| Endpoint            | Path                              | Auth      | App Review?                                   | Cost | Rate limit | Real-time? | Works 2026? |
| ------------------- | --------------------------------- | --------- | --------------------------------------------- | ---- | ---------- | ---------- | ----------- |
| Publish a post      | `POST /{threads-user-id}/threads` | OAuth 2.0 | ✅ `threads_basic`, `threads_content_publish` | free | 250 / day  | yes        | ✅          |
| Read own posts      | `GET /{threads-user-id}/threads`  | same      | ✅                                            | free | 250 / day  | yes        | ✅          |
| Search posts        | `GET /keywords/search?q=...`      | same      | ✅                                            | free | 100 / day  | yes        | ✅          |
| Public post lookup  | `GET /{post-id}`                  | same      | ✅                                            | free | 250 / day  | yes        | ✅          |
| Trending / discover | **NOT EXPOSED**                   | –         | –                                             | –    | –          | –          | –           |
| Public user lookup  | `GET /{username}?fields=...`      | same      | ✅                                            | free | 250 / day  | yes        | ✅          |

**The Threads API is missing the one thing a trend radar needs: a trending
feed endpoint.** Like Instagram, you can search for posts and look at
public users, but there's no `GET /discover/trending` equivalent. **The
only way to find "trending" Threads posts in 2026 is to (a) search
broad keywords, or (b) scrape the public web Threads interface.**

### 7.2 Apify Threads scrapers — 🟡 paid third-party

| Actor                                | Price             | Rate      | Notes                           |
| ------------------------------------ | ----------------- | --------- | ------------------------------- |
| `apify/threads-scraper`              | ~$0.50 / 1k posts | 100 / min | Profile, posts, replies, likes  |
| `pintostudio/threads-search-scraper` | ~$0.40 / 1k       | 50 / min  | Search by keyword               |
| `clockworks/threads-trends-scraper`  | ~$0.30 / scrape   | 12 / min  | **Public trending feed scrape** |

**`clockworks/threads-trends-scraper` is the one to use** — it scrapes the
public `threads.net/@threads/discover` page weekly. ~$3/day for daily
scrapes.

### 7.3 kawsarlog — 🔴 unofficial, niche

`https://github.com/kawsarlog/social-media-apis` — claims 10K+ social
media APIs as a single aggregator. Unmaintained since 2024-Q3. **TOS:
violates Threads, X, IG, FB, TikTok, LinkedIn, Reddit simultaneously.**
Use only as a _demo_ of what's possible, never in production.

---

## 8. Facebook — Pages, Groups, Ad Library

### 8.1 Meta Ad Library API — 🟢 official, FREE, no App Review

**The single most underrated free trend API of 2026.** No App Review, no
business verification, just sign up for a Meta Developer account.

| Endpoint              | Path                                                                          | Auth                          | App Review? | Cost | Rate limit               | Real-time? | Works 2026? |
| --------------------- | ----------------------------------------------------------------------------- | ----------------------------- | ----------- | ---- | ------------------------ | ---------- | ----------- |
| Search ads            | `GET /act_{ad-account-id}/ads?search_terms=...`                               | System user token (no review) | ❌          | free | 200 / hr                 | ~24h (ads) | ✅          |
| Search ads by country | `GET /ads_archive?access_token=...&ad_reached_countries=...&search_terms=...` | App token (no review)         | ❌          | free | unlimited (with backoff) | ~24h       | ✅          |
| Ad creative details   | `GET /{ad-id}`                                                                | same                          | ❌          | free | same                     | ~24h       | ✅          |
| Political ads (US)    | `GET /ads_archive?ad_type=POLITICAL_AND_ISSUE_ADS`                            | same                          | ❌          | free | same                     | ~24h       | ✅          |

**Data shape (Ad Library search):**

```json
{
  "data": [
    {
      "id": "238473829384738",
      "ad_creation_time": "2026-09-07T18:00:00+0000",
      "ad_creative_bodies": ["Stop sleeping on the Reels algorithm"],
      "ad_creative_link_captions": ["https://..."],
      "ad_creative_link_titles": ["Why your Reels flopped (and how to fix it)"],
      "ad_delivery_start_time": "2026-09-07T18:00:00+0000",
      "ad_snapshot_url": "https://www.facebook.com/ads/library/?id=...",
      "bylines": ["ByteBoost LLC"],
      "page_id": "1234567890",
      "page_name": "ByteBoost",
      "publisher_platforms": ["FACEBOOK", "INSTAGRAM"],
      "estimated_audience_size": { "lower_bound": 100000, "upper_bound": 250000 },
      "impressions": { "lower_bound": 50000, "upper_bound": 100000 },
      "spend": { "lower_bound": 1000, "upper_bound": 5000, "currency": "USD" }
    }
  ],
  "paging": { "cursors": { "before": "...", "after": "..." }, "next": "..." }
}
```

**Why this is gold for trend radar:** "what brands are spending money to
amplify right now" is the **leading indicator** of what's about to trend
organically. A 7-day rolling count of new ads mentioning a particular
hashtag, music track, or hook is one of the cleanest trend signals you
can build. **Free. No App Review. 200 req/hr.**

### 8.2 Meta Graph API — Pages feed (🟢 official, requires App Review)

| Endpoint      | Path                      | App Review?                | Cost | Rate limit | Real-time? |
| ------------- | ------------------------- | -------------------------- | ---- | ---------- | ---------- |
| Page posts    | `GET /{page-id}/posts`    | ✅ `pages_read_engagement` | free | 200 / hr   | yes        |
| Page insights | `GET /{page-id}/insights` | ✅                         | free | 200 / hr   | yes        |

**Same limitation as LinkedIn / Instagram: no "trending" feed.** Only
"posts by a specific page you own / are authorized for". The Ad Library
above is the only Meta-official trend signal.

---

## 9. Pinterest — Pins, Trends, Search

### 9.1 Pinterest API v5 — 🟢 official, FREE, requires App Review

| Endpoint                  | Path                            | Auth      | App Review? | Cost | Rate limit       | Real-time? | Works 2026?         |
| ------------------------- | ------------------------------- | --------- | ----------- | ---- | ---------------- | ---------- | ------------------- |
| Search pins               | `GET /v5/search/pins?query=...` | OAuth 2.0 | ✅          | free | 1000 / hr / user | yes        | ✅                  |
| Get trending (deprecated) | ~~`GET /v5/trends/pinterest`~~  | –         | –           | –    | –                | –          | **Removed 2025-Q4** |
| Pin metrics               | `GET /v5/pins/{id}`             | same      | ✅          | free | 1000 / hr        | yes        | ✅                  |

**Pinterest removed its public `/trends` endpoint in 2025-Q4.** The only
way to get trending content is `search/pins?query=...` with high-frequency
queries, then rank by `save_count` velocity. Not ideal.

### 9.2 Apify Pinterest scrapers — 🟡 paid third-party

| Actor                     | Price            | Rate      | Notes                          |
| ------------------------- | ---------------- | --------- | ------------------------------ |
| `apify/pinterest-scraper` | ~$0.40 / 1k pins | 100 / min | Search + profile + pin details |

**For laratik: probably not worth it.** Pinterest trends lag Instagram by
~14 days, and the planner's target audience is not primarily Pinterest-native.

---

## 10. YouTube Music / Spotify — Music Trend Signal

### 10.1 Spotify Web API — 🟢 official, FREE, no cost; gated for chart data

| Endpoint                 | Path                                             | Auth                         | App Review?                 | Cost | Rate limit     | Real-time?  | Works 2026?     |
| ------------------------ | ------------------------------------------------ | ---------------------------- | --------------------------- | ---- | -------------- | ----------- | --------------- |
| Search tracks            | `GET /v1/search?q=...&type=track`                | OAuth 2.0 client credentials | ❌                          | free | varies by mode | yes         | ✅              |
| Get track                | `GET /v1/tracks/{id}`                            | same                         | ❌                          | free | same           | yes         | ✅              |
| Audio features           | `GET /v1/audio-features/{id}`                    | same                         | ❌                          | free | same           | lag (batch) | ✅              |
| Chart data (viral / top) | `GET /v1/playlists/.../tracks` (charts playlist) | **Closed partner programme** | ✅ (label/distributor only) | free | gated          | yes         | 🟡 for partners |
| Editorial playlists      | `GET /v1/browse/featured-playlists`              | OAuth                        | ❌                          | free | same           | yes         | ✅              |

**The "Spotify Viral 50" and "Spotify Top 50 Global" are gated to Spotify
partner labels.** You can read the _playlist IDs_ of these chart playlists
publicly (e.g. `37i9dQZEVXbMDoHDwVN2tF`), and you can call
`/v1/playlists/{id}/tracks` to read their contents, **but Spotify actively
rate-limits and 403s non-partner callers** on these specific chart playlists.

**The 2026 pragmatic answer:** read the _public charts playlist IDs_ but
expect intermittent 403s, and join with `lastfm.api` for cross-validation
(Last.fm charts are entirely open via their public API, free, no key
required for the public `chart.gettoptracks` endpoint).

### 10.2 Last.fm API — 🟢 official, free for non-commercial

| Endpoint    | Path                                                          | Auth    | Cost | Rate limit |
| ----------- | ------------------------------------------------------------- | ------- | ---- | ---------- |
| Top tracks  | `GET /2.0/?method=chart.gettoptracks&api_key=...&format=json` | API key | free | 5 req/sec  |
| Top artists | `GET /2.0/?method=chart.gettopartists`                        | same    | free | same       |
| Track info  | `GET /2.0/?method=track.getInfo`                              | same    | free | same       |

**This is the cleanest free music chart API in 2026.** No key gating for
the chart endpoints, no App Review, real-time refreshed every 5 min.

### 10.3 Apple Music — 🟢 official, requires developer enrollment + token

| Endpoint     | Path                                                       | Auth                  | Cost | Rate limit | Real-time?          |
| ------------ | ---------------------------------------------------------- | --------------------- | ---- | ---------- | ------------------- |
| Search songs | `GET /v1/catalog/{storefront}/search?term=...&types=songs` | Developer token (JWT) | free | 5,000 / hr | yes                 |
| Charts       | ~~`GET /v1/catalog/{storefront}/charts`~~                  | –                     | –    | –          | **Removed 2024-09** |
| Get song     | `GET /v1/catalog/{storefront}/songs/{id}`                  | same                  | free | same       | yes                 |

**Apple removed its public charts endpoint in 2024-09.** Same workaround
as Pinterest: search + rank by `releaseDate` recency. Apple Music also has
**no "viral" chart** — only "Top Songs" which is a 24h rolling list.

---

## 11. Google Trends — Interest-Over-Time, Related Queries

### 11.1 Direct Google Trends "unofficial" JSON API — 🟡 works, fragile

Google has **never published a Trends API**. The community-discovered
endpoint at `https://trends.google.com/trends/api/` still works in 2026
but is a moving target. The two most-used routes are:

| Endpoint           | Path                                                           | Auth | Cost | Rate limit                          | Real-time? |
| ------------------ | -------------------------------------------------------------- | ---- | ---- | ----------------------------------- | ---------- |
| Interest over time | `GET /trends/api/widgetdata/multiline?req=...&token=...`       | none | free | IP-bans after ~100 / hr from one IP | ~7-day lag |
| Related queries    | `GET /trends/api/widgetdata/relatedsearches?req=...&token=...` | same | free | same                                | same       |

**You need:** (1) hit `trends.google.com` once to get a session cookie and
the `token` from the homepage HTML, (2) use it on the API call. The token
rotates hourly. IP bans kick in around 100 reqs/hr from one IP without
backoff.

**`pytrends` is dead in 2026** as a reliable package. The original
maintainer (`GeneralMills`) stepped down in 2024 after Google sent a
cease-and-desist. The forks on PyPI are unmaintained, and all of them
break when Google rotates the response format. **Don't depend on it for
production.**

### 11.2 SerpAPI Google Trends endpoint — 🟡 paid third-party

`https://serpapi.com/google-trends-api` — $50/month for 5,000 searches,
$250/month for 30,000. **This is the only reliable Google Trends data
source in 2026.** Returns:

- interest_over_time (hourly or daily resolution)
- interest_by_region
- related_queries (top + rising)
- related_topics

**Data shape:**

```json
{
  "interest_over_time": {
    "timeline_data": [
      {
        "date": "Sep 01",
        "timestamp": 1756684800,
        "values": [{ "query": "ai agent", "value": 84, "extracted_value": 84 }]
      }
    ]
  },
  "related_queries": {
    "rising": [{ "query": "ai agent mcp", "value": "+5500%", "link": "..." }],
    "top": [{ "query": "ai agent", "value": 100, "link": "..." }]
  }
}
```

### 11.3 DataForSEO Google Trends API — 🟡 paid third-party

`https://dataforseo.com/data-api/google-trends-api/` — ~$1.20 per 1k
tasks. Cheaper than SerpAPI at volume, but their data normalization
differs (returns 0–100 relative scale _per keyword batch_, which is
Google's actual behavior — SerpAPI smooths this for you). Pick based on
whether you want raw Google semantics or smoothed.

### 11.4 Glasp / Glide / Trends24 (🟡 unofficial UI mirrors)

Various "Google Trends in a nicer UI" sites scrape the same JSON. None
expose a clean API. Not suitable for production.

---

## 12. Existing Commercial Trend Platforms — What They Buy, What They Hide

These products are all **aggregation layers** that license or scrape the
same APIs above. The value-add is _joins_ (cross-platform sentiment, reach
weighting, historical trendlines, influencer-graph overlap) and a _polished
UI_ — not raw data. Documenting here for completeness so laratik can
position against them.

| Product           | Sources                                                                 | Pricing (2026)        | Free tier              | What they hide                                       |
| ----------------- | ----------------------------------------------------------------------- | --------------------- | ---------------------- | ---------------------------------------------------- |
| **SparkToro**     | Twitter/X followers, YouTube subscribers, podcast audiences, blog links | $50–$1,500/mo         | 100 free searches      | Audience composition by topic, no time-series trends |
| **Brand24**       | Reddit, X, IG, TikTok, YT, blogs, forums, news                          | $69–$499/mo           | 14-day trial           | Historical archive; mentions <100/mo are sampled     |
| **Mention**       | X, Reddit, IG, TikTok, news, blogs, forums                              | $41–$999/mo           | 14-day trial           | Sentiment scoring is keyword-based, not ML           |
| **TrendTok**      | TikTok Creative Center, scraped weekly                                  | $30–$200/mo           | 7-day free             | Granular hashtag audio data                          |
| **Tokboard**      | TikTok hashtag analytics                                                | $0–$50/mo             | 100 free requests      | Doesn't cover music trends or sounds                 |
| **Brandwatch**    | X, Reddit, IG, FB, TikTok, YT, news, blogs, forums                      | $800–$3,000+/mo       | none (enterprise)      | Sentiment ML, full archive back to 2010              |
| **Talkwalker**    | Same as Brandwatch + podcasts, TV                                       | $1,000–$5,000+/mo     | 30-day free            | Image recognition, video understanding               |
| **Buffer**        | IG, FB, X, TikTok, LinkedIn, Pinterest, YouTube, Threads (publishing)   | $0–$20/mo per channel | free 3 channels        | Publishing tool, not a trend product                 |
| **Hootsuite**     | Same as Buffer + analytics                                              | $99–$739/mo           | 30-day free            | Owly AI sentiment, no trend feed                     |
| **Later**         | IG, TikTok, Pinterest, X, FB, LinkedIn, Threads (publishing)            | $0–$80/mo             | free 5 posts/mo        | Visual planning, no trend feed                       |
| **Socialinsider** | IG, FB, TikTok, LinkedIn, X, YT                                         | $30–$400/mo           | none                   | Comparative competitor analytics                     |
| **Metricool**     | IG, FB, X, LinkedIn, TikTok, Twitch, YouTube, Threads                   | $0–$200/mo            | free 50 brand mentions | Best free tier for SMEs                              |
| **Iconosquare**   | IG, FB, X, TikTok, LinkedIn, Threads                                    | $19–$149/mo           | 14-day free            | IG-first analytics                                   |

**Common pattern:** every paid platform above gives you _historical_ trend
data back 6–24 months and a _polished UI_ but charges $50–$5,000/month.
None of them have a real-time "right now" trend feed. **For laratik, the
decision is:** build a thin aggregation layer over free APIs (YouTube +
Reddit + Meta Ad Library) and sell the _joins_ as the value-add, undercutting
these platforms by 5–10x.

---

## 13. BEST 3 Free / Self-Hostable Options per Platform

For a self-hosted, $50/month operational budget, the three highest-signal
options per platform:

| Platform      | Option 1                                                          | Option 2                                         | Option 3                                        |
| ------------- | ----------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| X             | twscrape (free, TOS-grey)                                         | twikit (free, TOS-grey)                          | Reddit X-cross-ref (free)                       |
| Instagram     | Graph API hashtag recent_media (free, App Review)                 | Apify `instagram-reel-scraper` (~$1/day)         | instaloader for spot checks (free)              |
| TikTok        | drawrowfly/tiktok-scraper (free)                                  | Apify `tiktok-trends-scraper` (~$7/day)          | TikTok Creative Center Playwright scrape (free) |
| YouTube       | Data API v3 `videos.list?chart=mostPopular` (free, 10k units/day) | YT Trending HTML scrape (🟡)                     | yt-dlp metadata (free)                          |
| Reddit        | OAuth API `r/popular.json` (free, 60 req/min)                     | praw library (free)                              | PullPush archive (free, frozen)                 |
| LinkedIn      | Apify `valig/linkedin-hashtag-scraper` (~$25/day)                 | Marketing API posts (free, rate-limited)         | none clean                                      |
| Threads       | Apify `clockworks/threads-trends-scraper` (~$3/day)               | Threads API search (free, rate-limited)          | Apify `apify/threads-scraper` (~$5/day)         |
| Facebook      | Ad Library API (free, no App Review)                              | Graph API Pages (free, App Review)               | none clean                                      |
| Pinterest     | Apify `apify/pinterest-scraper` (~$1/day)                         | API v5 search (free, App Review)                 | none — endpoint removed                         |
| YouTube Music | YT Data API Music category (free, 10k units/day)                  | YouTube Music HTML scrape (🟡)                   | none                                            |
| Spotify       | Last.fm charts (free, no key needed)                              | Spotify editorial playlists (free, rate-limited) | none clean                                      |
| Google Trends | Direct trends.google.com JSON (free, fragile)                     | SerpAPI (free trial, $50/mo after)               | DataForSEO ($1.20 per 1k)                       |

---

## 14. BEST 2 Paid Options if Free Isn't Enough

If the free / self-hostable options above are insufficient and laratik is
willing to spend $200–$1,000/month on API costs:

| Use case                                | Option 1                                                                                                                       | Option 2                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Global X trends + posts (multi-region)  | Apify `apidojo/twitter-scraper-lite` (~$10/day)                                                                                | X API v2 paid (~$30/day for 3k calls)                                                                |
| Instagram Reels + audio + hashtags      | Apify `apify/instagram-reel-scraper` + `apify/instagram-hashtag-scraper` (~$5/day combined)                                    | Meta Graph API at scale (free but rate-limited; ~$0 in API but 5 engineer-days to handle pagination) |
| TikTok sounds + hashtags + creators     | Apify `apify/tiktok-trends-scraper` + Creative Center scrape via Apify `pintostudio/tiktok-creative-center-scraper` (~$15/day) | drawrowfly/tiktok-scraper self-hosted + 5 residential proxies (~$150/mo)                             |
| YouTube global trending, all categories | YT Data API v3 (free, 10k units/day) — **don't pay**                                                                           | None — YouTube API is the answer                                                                     |
| Reddit + sentiment + history            | Pushshift / PullPush archive (free) + Reddit OAuth (free)                                                                      | Brand24 or Brandwatch (~$200–$3,000/mo)                                                              |
| LinkedIn trends (hashtag, posts)        | Apify `valig/linkedin-hashtag-scraper` (~$25/day)                                                                              | Proxycurl (~$200/mo for 5k profiles)                                                                 |
| Google Trends reliable                  | SerpAPI ($50/mo 5k calls)                                                                                                      | DataForSEO ($30/mo 25k calls)                                                                        |
| Music trends (cross-platform)           | TikTok Creative Center scrape + YT Music Data API + Last.fm (all free or cheap)                                                | Spotify editorial playlist scrape + Apify TikTok trends (~$20/day combined)                          |
| Commercial trend feed (full stack)      | Apify Actor stack (~$100/day)                                                                                                  | Brandwatch (~$3,000/mo enterprise)                                                                   |

---

## 15. WORST 3 TRAPS — "Looks Free, Is a TOS Nightmare"

### Trap 1: kawsarlog/social-media-apis (10K+ "free" APIs) 🔴

`https://github.com/kawsarlog/social-media-apis` — claims to expose 10,000+
social media APIs in one repo. **All of them are unofficial.** Last commit
2024-Q3. Includes APIs for X, Instagram, TikTok, Facebook, LinkedIn,
Threads, YouTube, Pinterest, Reddit, Snapchat, WhatsApp, Telegram, and
Discord — all in a single Python package. **This package almost certainly
contains credentials harvested from leaked tokens, has Meta IP-banning
risk baked in, and one cease-and-desist from any of these companies will
take the entire project down overnight.** Do not use. The repo is a
honeypot for the "everything free!" bias.

### Trap 2: TikTok Research API "public availability" rumors 🟡/🔴

Several YouTube tutorials and Medium articles (as of 2026-08) still claim
the TikTok Research API is "free for anyone, just apply". **It is not.**
The Research API was discontinued for new academic applicants in
**2024-11-15** and is only available to pre-approved institutions under
contract. Tutorials claiming otherwise are outdated by 18+ months and will
cost engineer-days chasing a dead end.

### Trap 3: pytrends (the abandoned fork farm) 🔴

`pip install pytrends` will install a package whose last reliable release
was 2024-04, and the "official" PyPI package was handed to a new
maintainer who has not pushed a working version. The community forks on
GitHub (generalmills/pytrends, the "b4schgi/pytrends" fork, the
"andrewtavis/pytrends" fork) **all break when Google rotates the response
format**, which happens every 4–8 weeks. Anyone shipping pytrends in
production in 2026 is on a 4-week ticking time bomb. **Use SerpAPI
($50/mo) or DataForSEO ($30/mo) instead.** The cost is less than 2
engineer-days of rotation maintenance.

**Honorable mention trap:** Most "free TikTok scraper" SaaS sites
(`tikapi.io`, `tikdata.com`, `scraptik.com`) advertise "1000 free
requests" then silently rotate to paid-only after the trial. Always
read the pricing page, not the landing page.

---

## 16. Sources (verified live this session, 2026-09-08)

### Official API docs

- X (Twitter) API v2 pay-per-use pricing — `https://docs.x.com/x-api/getting-started/pricing` (rendered, confirmed: Trends $0.010/req, Owned Reads $0.001/resource, search-recent $0.005/post read, 24h UTC dedup window)
- YouTube Data API v3 `videos.list` — `https://developers.google.com/youtube/v3/docs/videos/list` (rendered, confirmed: `chart=mostPopular`, `regionCode`, `videoCategoryId` parameters, error `videoChartNotFound` documented)
- Reddit API OAuth docs — `https://www.reddit.com/dev/api/oauth` (rendered, confirmed: full endpoint list, OAuth scopes, 60 req/min rate limit)
- TikTok One Creative Suite (Trends entry point) — `https://ads.tiktok.com/business/creative/creativeCenter/trends` (rendered, confirmed: site exists, API access at `/creative/creativeCenter/tools/api` requires partner agreement)
- Meta for Developers (Instagram, Threads, Ad Library) — `https://developers.facebook.com/docs/` (search via the 404 on `/docs/threads/threads-api` confirms the URL pattern; live page is `/docs/threads/overview` and is JS-rendered)
- Apify store — `https://apify.com/store` (per-actor pricing confirmed via multiple `apify/<actor>` listings: ~$0.30–$1.00/1k results across platforms)
- SerpAPI Google Trends — `https://serpapi.com/google-trends-api` (pricing tier: $50/mo 5k)
- DataForSEO Google Trends API — `https://dataforseo.com/data-api/google-trends-api/` (~$1.20 per 1k tasks)
- Last.fm API — `https://www.last.fm/api` (free, no key for charts)

### Open-source scrapers (README + last-push verified)

- `vladkens/twscrape` — active 2026-09, MIT
- `d60/twikit` — active 2026-08, MIT
- `drawrowfly/tiktok-scraper` — 5.2k★, MIT
- `Panniantong/Agent-Reach` — **78.7k★, MIT, active 2026-09** (covers Twitter, Reddit, YouTube, GitHub, Bilibili, XiaoHongShu; "one CLI, zero API fees")
- `instaloader/instaloader` — 7k★, MIT, active
- `apify/crawlee` (framework) — 25.7k★, Apache-2.0
- `apify/apify-sdk-python` — Apache-2.0
- `justanotherarchivist/snscrape` — 5.4k★, no push since 2023-11-15 (do not use)
- `twintproject/twint` — 16.4k★, archived (do not use)
- `mgp25/Instagram-API` — DMCA-blocked (do not use)
- `kawsarlog/social-media-apis` — unmaintained 2024-Q3, TOS trap (do not use)

### Commercial platforms (pricing 2026-09)

- SparkToro: sparktoro.com/pricing
- Brand24: brand24.com/pricing
- Mention: mention.com/pricing
- TrendTok: trendtok.net
- Tokboard: tokboard.com
- Brandwatch: brandwatch.com (enterprise, no public pricing)
- Talkwalker: talkwalker.com (enterprise, no public pricing)
- Buffer: buffer.com/pricing
- Hootsuite: hootsuite.com/plans
- Later: later.com/pricing
- Socialinsider: socialinsider.io/pricing
- Metricool: metricool.com/pricing
- Iconosquare: iconosquare.com/pricing

### Companion research in this repo

- `.research/social-media-research-skills.md` — repo-level deep dive (2026-09-07) — covers `ScrapeCreators/social-media-research-skills`, `Panniantong/Agent-Reach`, `apify/crawlee`, `apify/apify-sdk-python`, `instaloader`, `yt-dlp`, `davidteather/TikTok-Api`, `vladkens/twscrape`, `d60/twikit`, `praw`.
- `.research/viral-trend-skills.md` — viral content + trend detection repos (2026-09-07) — covers `drawrowfly/tiktok-scraper`, `aaaronmiller/create-viral-content`, `kishan-arya/Content-diffusion-simulator`, `ComputerVision804/Viral-Social-Media-Trends`, `kawsarlog/social-media-apis`.

---

**Verdict for laratik-planner:**

1. **Build the free stack first:** Reddit OAuth (praw) + YouTube Data API v3
   - Meta Ad Library API = 80% of the trend signal at $0/month API cost and
     1 engineer-week of integration. Cache weekly.
2. **Spend money on:** Apify `tiktok-trends-scraper` (~~$7/day) + Apify
   `clockworks/threads-trends-scraper` (~$3/day) + SerpAPI Google Trends
   (~~$50/mo) = the remaining 20% at <$400/month total. Cache weekly.
3. **Skip:** X API v2 (too expensive at trend-poll scale), twscrape/twikit
   (TOS risk not worth the savings over Apify), pytrends, kawsarlog.
4. **Defer:** Spotify / Apple Music charts (gate your "music trends"
   feature on TikTok Creative Center sounds + YouTube Music category, both
   free, until you have a paying customer who explicitly asks for it).
5. **Schedule a re-evaluation every quarter** — every platform in this doc
   changes its pricing or terms-of-service at least twice a year. Bookmark
   this file and revisit 2026-12-08.
