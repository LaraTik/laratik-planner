# Meta Ads Library — setup guide

> Source key: `meta_ads_library`. A 1.0 source, **disabled** by default for new agencies (the workspace must opt in because the source is in the `experimental` tier).

## What this source gives you

- **Currently-active ads** in the configured region + vertical (top 100 per cycle).
- **Ad creative velocity** — how many new ads each advertiser is running, rolling 7d.
- **Landing-page trends** — the URLs being advertised (top 20, de-duped).

We normalise every Meta Ads Library signal into the planner's `trend_signal` table with the platform set to `facebook`. The Fit score then ranks the signal against the workspace's primary vertical + audience topics.

## Free vs paid

| Tier           | Free?                  | Quota                           | Notes                    |
| -------------- | ---------------------- | ------------------------------- | ------------------------ |
| `experimental` | Yes (Meta's free tier) | 200 requests/hour per app token | The free tier is plenty. |

Meta Ads Library API is **clean** (official, fully supported). It is classified as `experimental` in v1 because the planner UI surfaces it but does not yet embed it in the Fit score's primary rank.

## How to get a key

1. Create a developer account at [developers.facebook.com](https://developers.facebook.com/).
2. Create a "Business" type app.
3. Add the **Ads Library API** product.
4. Generate an **app token** (long-lived; no user OAuth needed for the public Ads Library endpoints).
5. In the Sources admin page, click "Configure" on the Meta Ads Library card, paste the token, and save.
6. The scheduler picks up the token on the next cycle.

## How to test

1. Open the Sources admin page.
2. Click "Test" on the Meta Ads Library card.
3. The test runs a single `/ads_archive` call.
4. A successful test returns 5–50 sample signals in <3s.

## Common errors

| Error                     | Cause                                                               | Fix                                       |
| ------------------------- | ------------------------------------------------------------------- | ----------------------------------------- |
| `meta_token_invalid`      | Wrong app token, or the Ads Library product is not added to the app | Re-check both.                            |
| `meta_rate_limited`       | The 200 req/hour cap is hit                                         | Wait for the hour to roll over.           |
| `meta_region_unsupported` | The region you set in the config is not on the supported list       | Pick a region from the admin dropdown.    |
| `meta_no_results`         | The configured region + vertical combo returned 0 ads               | Loosen the search; pick a wider vertical. |

## What to do when it breaks

1. **Open the Sources page.** The Meta Ads Library card will show `circuit_state=open` if the breaker tripped.
2. **Click "Retry now"** to force-close the breaker and try a one-off fetch.
3. **If the test fails with `meta_token_invalid`**, rotate the token.
4. **If the test fails with `meta_rate_limited`**, wait an hour and try again.
5. **If the test fails with `meta_no_results`**, the search is too narrow. Loosen the search criteria in the source config (wider vertical, no language filter, etc.).
