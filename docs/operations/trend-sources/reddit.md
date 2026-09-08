# Reddit — setup guide

> Source key: `reddit`. A 1.0 source, enabled by default for new agencies.

## What this source gives you

- **Top posts** in the configured subreddit list (top 100 per cycle, sorted by score).
- **Top rising posts** in the same list (top 50, sorted by recent upvote velocity).
- **Subreddit velocity** — a per-subreddit velocity number derived from the rolling 7d activity.

We normalise every Reddit signal into the planner's `trend_signal` table with the platform set to `reddit`. The Fit score then ranks the signal against the workspace's primary vertical + audience topics.

## Free vs paid

| Tier   | Free?                    | Quota                                                   | Notes                                                                                                                                     |
| ------ | ------------------------ | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `free` | Yes (Reddit's free tier) | 60 requests/minute, 600 requests/10min per OAuth client | The free tier is enough for a normal agency. Heavy users may hit the 10-minute cap during a scheduled cycle; the breaker absorbs the 429. |

Reddit OAuth is **clean** (official, fully supported).

## How to get a key

1. Create a "script" app at [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps).
2. Note the `client_id` (under the app name) and the `client_secret`.
3. Set the redirect URI to `http://localhost:8080` (Reddit requires it even for a script app; we do not actually use it).
4. In the Sources admin page, click "Configure" on the Reddit card, paste the client_id and client_secret, and save.
5. The scheduler picks up the credentials on the next cycle.

## How to test

1. Open the Sources admin page.
2. Click "Test" on the Reddit card.
3. The test runs a single OAuth handshake + one `/r/all/top` fetch.
4. A successful test returns 5–25 sample signals in <2s.

## Common errors

| Error                      | Cause                                                         | Fix                                                       |
| -------------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| `reddit_rate_limited`      | The 60 req/min or 600 req/10min cap is hit                    | Wait for the window to reset. The breaker is your friend. |
| `reddit_unauthorized`      | Wrong client_id or client_secret                              | Re-check both values in the Reddit app preferences.       |
| `reddit_subreddit_private` | A subreddit in the configured list is private                 | Remove it from the subreddit list in the source config.   |
| `reddit_404`               | A specific subreddit does not exist                           | Same fix.                                                 |
| `reddit_oauth_failed`      | The OAuth handshake failed; usually a transient Reddit outage | Wait 5m and retry.                                        |

## What to do when it breaks

1. **Open the Sources page.** The Reddit card will show `circuit_state=open` if the breaker tripped.
2. **Click "Retry now"** to force-close the breaker and try a one-off fetch.
3. **If the test fails with `reddit_rate_limited`**, the cycle is over. The next scheduled run (in 6h) will succeed; you can also force a fetch in 10m when the rate-limit window resets.
4. **If the test fails with `reddit_unauthorized`**, rotate the credentials.
5. **If the test fails with `reddit_subreddit_private`**, the agency's configured subreddit list has a private subreddit. Edit the list in the source config.
