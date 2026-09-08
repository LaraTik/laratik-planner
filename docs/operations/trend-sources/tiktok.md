# TikTok — setup guide

> Source key: `tiktok_tamnd` (the tamnd CLI fallback) and `tiktok_research` (the official Research API). Both are 1.0 sources; new agencies get `tiktok_tamnd` enabled by default.

## What this source gives you

- **Hashtags** in the top 20 of the configured region, ranked by view count.
- **Sounds** that are gaining velocity in the last 24h.
- **Creators** (top 100 by followers × engagement) — used to surface "ride this creator's audio" suggestions.
- **Videos** surfaced via hashtag or sound (top 50 per cycle).

We normalise every TikTok signal into the planner's `trend_signal` table with the platform set to `tiktok`. The Fit score then ranks the signal against the workspace's primary vertical + audience topics.

## Free vs paid

| Path              | Free?                                             | Quota                                     | Notes                                                        |
| ----------------- | ------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| `tiktok_tamnd`    | Yes (community-maintained CLI)                    | rate-limited at the upstream's discretion | **unofficial** API; see "TOS class" below.                   |
| `tiktok_research` | First 1,000 requests/month free, then $0.0005/req | metered                                   | **Official** TikTok Research API; needs a developer account. |

**TOS class**: `tiktok_tamnd` is `grey` (uses an unofficial CLI). An admin must acknowledge the TOS warning before enabling it. `tiktok_research` is `clean` (official).

## How to get a key

For `tiktok_tamnd` (the default):

1. The sidecar image ships with the `tamnd/tiktok-cli` binary pre-installed at `/usr/local/bin/tt`.
2. You do **not** need a key. The CLI uses an unauthenticated tier that is rate-limited at TikTok's discretion.
3. The scheduler runs `tt trends --region={region} --limit=20` every 6h.

For `tiktok_research` (optional, paid):

1. Apply for a [TikTok Research API](https://developers.tiktok.com/products/research-api/) developer account.
2. Wait for approval (1–4 weeks). You will receive a `client_key` and `client_secret`.
3. In the Sources admin page, click "Configure" on the `tiktok_research` card, paste both keys, and save.
4. The sidecar exchanges the credentials for a short-lived bearer token on the first sync of each cycle.

## How to test

1. Open the Sources admin page.
2. Click "Test" on the TikTok card.
3. The test button runs a single 1-call fetch and reports `success: true|false`, `signals_count`, and up to 5 sample labels.
4. A successful test yields 5–20 sample signals and takes <3 seconds.

## Common errors

| Error                         | Cause                                                              | Fix                                                                        |
| ----------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `tamnd_not_found`             | The CLI binary is missing from the sidecar image                   | Rebuild the sidecar image; check the Dockerfile.                           |
| `tamnd_quota_exceeded`        | TikTok is rate-limiting the CLI                                    | Wait 1–6h; the breaker is your friend.                                     |
| `research_unauthorized`       | Invalid Research API key                                           | Rotate the key (see the operator manual).                                  |
| `research_quota_exceeded`     | The 1k free requests/month is spent                                | Either wait for the next billing cycle, or upgrade your Research API tier. |
| `research_region_unsupported` | The region you set in the config is not on TikTok's supported list | Pick a region from the admin dropdown.                                     |

## What to do when it breaks

1. **Open the Sources page.** The TikTok card will show `circuit_state=open` if the breaker tripped.
2. **Click "Retry now"** to force-close the breaker and try a one-off fetch. If it succeeds, the breaker stays closed and the next scheduled run will work.
3. **If the test still fails**, copy the `error` field from the response and search for it in the Sentry project. Look for breadcrumbs with `capability=trend_radar source=tiktok_tamnd` or `source=tiktok_research`.
4. **If only one workspace is broken**, check the workspace's opt-out list.
5. **If every workspace is broken**, the upstream is rate-limiting the sidecar's egress IP. Either wait for the cooldown (default 15m) or rotate the sidecar's egress IP if you are on a cloud with that capability.
