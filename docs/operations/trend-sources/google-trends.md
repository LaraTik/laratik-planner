# Google Trends — setup guide

> Source key: `google_trends`. A 1.0 source, enabled by default for new agencies. Routes through [SerpAPI](https://serpapi.com/) because the official Google Trends API does not exist.

## What this source gives you

- **Interest-over-time** for the configured keyword set (top 50 per cycle, region-scoped).
- **Related queries** — the "rise" / "top" lists that Google Trends shows.
- **Trending now** — Google's daily trending searches, region-scoped.

We normalise every Google Trends signal into the planner's `trend_signal` table with the platform set to `google_trends`. The Fit score then ranks the signal against the workspace's primary vertical + audience topics.

## Free vs paid

| Tier                 | Free?                                      | Quota   | Notes                                                                                                                        |
| -------------------- | ------------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `paid` (via SerpAPI) | 100 searches/month free, then $0.01/search | metered | SerpAPI is the de-facto unofficial API. We do not pay Google's free `pytrends` route because it is brittle and gets blocked. |

**TOS class**: Google Trends via SerpAPI is `grey` (third-party scraping). The admin must acknowledge the TOS warning before enabling it.

## How to get a key

1. Create an account at [serpapi.com](https://serpapi.com/).
2. The free tier is 100 searches/month; paid is $0.01 per search.
3. Copy your API key from the SerpAPI dashboard.
4. In the Sources admin page, click "Configure" on the Google Trends card, paste the key, and save.
5. The scheduler picks up the key on the next cycle.

## How to test

1. Open the Sources admin page.
2. Click "Test" on the Google Trends card.
3. The test runs a single `trends` search.
4. A successful test returns 1–5 sample signals in <2s (one per keyword).

## Common errors

| Error                    | Cause                                                            | Fix                                                                    |
| ------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `serpapi_quota_exceeded` | 100/month free quota is spent, or the daily search budget is hit | Either wait for the next billing cycle, or top up the SerpAPI balance. |
| `serpapi_key_invalid`    | Wrong key                                                        | Re-check the key in the SerpAPI dashboard.                             |
| `google_trends_no_data`  | The configured region has no data for the configured keyword     | Loosen the keyword set or change the region.                           |
| `google_trends_blocked`  | Google blocked SerpAPI's egress IP for this region               | Wait 1h; SerpAPI rotates their IPs.                                    |

## What to do when it breaks

1. **Open the Sources page.** The Google Trends card will show `circuit_state=open` if the breaker tripped.
2. **Click "Retry now"** to force-close the breaker and try a one-off fetch.
3. **If the test fails with `serpapi_quota_exceeded`**, the day is over (or the month, if you are on the free tier). Either top up the balance or wait for the reset.
4. **If the test fails with `google_trends_blocked`**, SerpAPI's IP pool is having a bad day. Wait an hour and try again. If the issue persists for >6h, file a support ticket with SerpAPI.
5. **If the test fails with `google_trends_no_data`**, the search is too narrow. Loosen the search criteria in the source config.
