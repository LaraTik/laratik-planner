# YouTube — setup guide

> Source key: `youtube`. A 1.0 source, enabled by default for new agencies.

## What this source gives you

- **Trending videos** in the configured region (top 50 per cycle).
- **Trending topics** extracted from the trending videos' titles + tags (BART-MNLI zero-shot).
- **Channel velocity** for the top 200 creators in the agency's primary region (gated by quota).

We normalise every YouTube signal into the planner's `trend_signal` table with the platform set to `youtube`. The Fit score then ranks the signal against the workspace's primary vertical + audience topics.

## Free vs paid

| Tier   | Free?                    | Quota            | Notes                                                                                                                                                                |
| ------ | ------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `free` | Yes (Google's free tier) | 10,000 units/day | The YouTube Data API v3 free tier is generous. Each `videos.list` call costs 1 unit; `search.list` costs 100. We stay well within the free tier for a normal agency. |

YouTube Data API is **clean** (official, fully supported).

## How to get a key

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **YouTube Data API v3**.
3. Create an **API key** (no OAuth needed for the public, read-only endpoints we use).
4. In the Sources admin page, click "Configure" on the YouTube card, paste the key, and save.
5. The scheduler picks up the key on the next cycle (within 6h; click "Test" to confirm immediately).

## How to test

1. Open the Sources admin page.
2. Click "Test" on the YouTube card.
3. The test runs a single `videos.list?chart=mostPopular&regionCode={region}` call.
4. A successful test returns 5–50 sample signals in <1s.

## Common errors

| Error                        | Cause                                                               | Fix                                                                                                |
| ---------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `youtube_quota_exceeded`     | The 10k unit/day free quota is spent                                | Wait until midnight Pacific (the quota reset). Upgrade to a paid quota if you need >10k units/day. |
| `youtube_key_invalid`        | Wrong key, or the API is not enabled in the Google Cloud project    | Re-check the key in the Cloud Console.                                                             |
| `youtube_region_unsupported` | The region you set in the config is not on YouTube's supported list | Pick a region from the admin dropdown.                                                             |
| `youtube_video_not_found`    | A specific video is missing; usually a transient error              | The breaker absorbs this; no action needed.                                                        |

## What to do when it breaks

1. **Open the Sources page.** The YouTube card will show `circuit_state=open` if the breaker tripped.
2. **Click "Retry now"** to force-close the breaker and try a one-off fetch.
3. **If the test fails with `youtube_quota_exceeded`**, the day is over (in Pacific time). Either wait or upgrade the Google Cloud project to a paid quota.
4. **If the test fails with `youtube_key_invalid`**, rotate the key. The action is in the [operator manual](../TREND_RADAR.md#rotate-an-api-key).
5. **If every workspace is broken and the test is intermittent**, the Google API is having an outage. Check [Google Cloud Status](https://status.cloud.google.com/) — there is nothing we can do but wait.
