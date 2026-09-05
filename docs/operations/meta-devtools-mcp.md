# Meta Developer Tools MCP — local agent access to the Just Halal GmbH business

> **What this is:** a registered MCP server (`meta-devtools`, streamable HTTP) that
> gives the local agent read access to Meta's developer dashboard data for the
> Just Halal GmbH business — apps, security config, App Review status, API rate
> limits, webhook subscriptions, and Meta's own developer documentation.
>
> **Source:** `https://mcp.facebook.com/devtools` (Meta-hosted, beta).
>
> **When to use it:** any time an agent needs to query the live state of a Meta
> app, verify App Review progress, monitor rate limits, list webhook
> subscriptions, or pull canonical Meta developer docs. It is the scriptable
> companion to the browser dashboard at
> `https://developers.facebook.com/apps/<APP_ID>/dashboard/`.

This document is the local recipe. The Meta team owns the canonical MCP docs;
treat this file as the on-ramp + gotchas + Just Halal-specific anchors.

## Registered server

The MCP is registered on the active profile via `mavis mcp create`:

| Field        | Value                                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Name         | `meta-devtools`                                                                                                        |
| Transport    | `streamable-http`                                                                                                      |
| Endpoint     | `https://mcp.facebook.com/devtools`                                                                                    |
| Auth         | OAuth 2.0 (Meta developer account), no app id / secret required                                                        |
| Status       | `enabled`                                                                                                              |
| Tools loaded | Only after the first tool call in a session triggers the OAuth consent + session refresh — see [Auth flow](#auth-flow) |

Verify with:

```bash
mavis mcp get meta-devtools
```

Re-enable if it was disabled:

```bash
mavis mcp update meta-devtools --enabled true
```

## Auth flow

Meta's MCP uses OAuth on every fresh client session. There is no API key, app
id, or app secret to store in the MCP config — Meta binds access to the
developer's logged-in identity.

What happens when an agent calls any `mcp__meta-devtools__*` tool:

1. **Tool call dispatched** — the local runtime hits `https://mcp.facebook.com/devtools`
   with no token attached.
2. **MCP returns `401 Unauthorized` with a `consent_url`** — the runtime opens
   the consent screen in the right-side Browser (or a system browser, depending
   on the platform).
3. **User signs in to Meta** with the developer account that owns the
   Just Halal GmbH business. If the Browser already has a valid Meta session
   from a prior step, this is a one-click confirm.
4. **User picks which apps to grant access to** on the consent screen. Pick
   _Social Tracker_ (App ID `1046395264942070`). The pick is per-OAuth-grant,
   not per-tool-call.
5. **MCP returns the access token** to the runtime; tools become callable for
   the rest of the session.
6. **Session restart = re-auth.** Meta does not persist the OAuth token across
   client restarts. The next time the runtime boots, the first tool call
   triggers steps 1–5 again. There is no refresh-token path; every fresh
   session re-pops the consent.

### Why the tools "disappear" between turns

Tools registered on a profile are not injected into the function list until
their underlying MCP server is fully authorized _and_ the session has been
refreshed after the OAuth callback lands. Practical consequences:

- A freshly-registered MCP will not show up in the agent's tool list until at
  least one tool call has fired and the OAuth consent has been granted.
- After the desktop client restarts, expect the tool list to be empty for the
  meta-devtools server until the next tool call re-pops the consent.
- The agent cannot "preflight" the MCP connection from a session in which the
  tools are not yet visible. The verification recipe below is the workaround.

## Verification recipe (works without a tool call)

Until the MCP tools are loaded, two signals confirm the server is wired up
correctly:

1. **Registration present:** `mavis mcp get meta-devtools` returns the
   `streamable-http` config above.
2. **Endpoint reachable + auth-gated:** `HEAD https://mcp.facebook.com/devtools`
   returns `HTTP 401` (not a network error and not a 5xx). 401 is the
   expected response for an unauthenticated probe — Meta is telling you the
   wire is up and you need to OAuth.

If either signal fails, the registration is wrong. Re-run
`mavis mcp create` with the values in [Registered server](#registered-server).

## Tools (10)

The server exposes roughly ten tools clustered around five jobs. Exact names
appear in the function list only after the first successful OAuth round-trip
(per [Auth flow](#auth-flow)) — the categories below are stable.

| Job                                        | Tool(s) (illustrative names)                         | Use it for                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Search developer documentation**         | `search_docs`, `get_doc`                             | Pulling canonical Meta Graph / Marketing / Threads API answers with citations                                      |
| **Inspect app settings + security config** | `get_app`, `get_app_security`                        | Reading the live config of an app — bundle id, valid OAuth redirect URIs, app secret rotation, permissions, App ID |
| **Check App Review + compliance status**   | `get_app_review_status`, `list_submissions`          | Verifying what permissions are pending / approved / rejected and what the next required action is                  |
| **Monitor API usage + rate limits**        | `get_app_rate_limits`, `get_app_usage`               | Reading the dashboard-equivalent numbers: per-endpoint calls, headroom, throttled users                            |
| **List, subscribe to, and test webhooks**  | `list_webhooks`, `subscribe_webhook`, `test_webhook` | Auditing the active subscriptions on a Meta app, adding new ones, and firing a test event                          |

If a tool name is needed for a code path and the function list is still empty,
trigger one of the read-only tools first to force the OAuth round-trip.

## App context (Just Halal GmbH)

The only Meta app currently wired through this MCP is the Just Halal business's
production app. Keep these anchors close — they show up in every recipe below.

| Field         | Value                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| App name      | Social Tracker                                                                                               |
| App ID        | `1046395264942070`                                                                                           |
| Mode          | Live                                                                                                         |
| Business      | Just Halal GmbH (business_id `1816998589070650`)                                                             |
| App URL       | `https://developers.facebook.com/apps/1046395264942070/dashboard/`                                           |
| Owner account | The Meta developer account that owns the Just Halal business (the same one used to consent to the MCP OAuth) |
| Use cases     | "Manage messaging and content on Instagram", "Manage everything on your Page"                                |

There is no test/dev app parallel registered through this MCP. If a sandbox app
is needed for staging work, add it to the Just Halal business and re-consent
the MCP OAuth so it shows up in the consent-screen picker.

## Recipes

### Read live app config (bundle, redirect URIs, secret, permissions)

```text
mcp__meta-devtools__get_app({ app_id: "1046395264942070" })
```

Returns the dashboard-equivalent view: display name, namespace, contact email,
app domains, valid OAuth redirect URIs, the app secret's last-rotated timestamp,
the active permissions list, and the per-product flag set (Facebook Login for
Business, Instagram Business, Pages API, etc.).

### Check App Review status for a permission

```text
mcp__meta-devtools__get_app_review_status({ app_id: "1046395264942070" })
```

Returns the per-permission review state (`approved`, `pending`, `rejected`,
`not_submitted`) and the next required action. The dashboard's
"App Review > Permissions and Features" tab is the human-readable mirror.

### Read API rate-limit usage

```text
mcp__meta-devtools__get_app_rate_limits({ app_id: "1046395264942070" })
```

Returns the per-endpoint call counts, the per-user throttle state, and the
"Application Rate Limit" / "User Rate Limit" numbers the dashboard surfaces.
The dashboard's "App Rate Limit" card (0% used, 100% remaining) is a rolled-up
version of this.

### List active webhook subscriptions

```text
mcp__meta-devtools__list_webhooks({ app_id: "1046395264942070" })
```

Returns the active subscriptions, the callback URL, the subscribed fields, and
the last delivery timestamp. Pair with `get_app` to see which fields the app
itself declared as subscribed.

### Search Meta developer documentation

```text
mcp__meta-devtools__search_docs({ query: "instagram business messaging webhook" })
```

Returns the matching canonical doc pages with a snippet and the canonical URL.
Prefer this over web-search for anything covered by the official Meta docs —
the answers are current and the URL is a citation the agent can hand back.

## Gotchas

- **Tools may be absent from the function list on a fresh session.** A new turn
  or a client restart clears the in-memory tool binding until the next call
  re-runs the OAuth dance. Plan read-only MCP work in a single turn where
  possible, or warm the tools up with a one-line `get_app` call before the
  real query.
- **OAuth re-pops on every restart.** There is no refresh-token path. The
  browser consent screen reappears on the next runtime boot. The fix is to
  keep an active client session for the duration of a focused task; do not
  expect a 24/7 background MCP to be live.
- **The pick-list on the consent screen is per-OAuth-grant.** If the user
  signs in with a different Meta account than the one that owns the Just
  Halal business, the Social Tracker app will not appear in the picker, and
  every `mcp__meta-devtools__*` call will return an empty result. The fix is
  to revoke the prior grant in
  `https://www.facebook.com/settings/?tab=business_tools` and re-consent with
  the owner account.
- **The MCP is read-mostly.** Meta's MCP exposes read and webhook-management
  tools; there is no `update_app_settings` or `rotate_secret` tool exposed by
  the beta. Anything destructive still has to be done in the browser
  dashboard.
- **Do not paste the OAuth callback URL into logs or chat.** It is
  single-use; logging it is a no-op and may revoke the grant. If a tool call
  reports `redirect_uri_mismatch`, the URL is malformed — re-consent, do not
  retry.
- **Per-app rate limits on Meta's side are separate from MCP tool call
  limits.** The MCP server can answer `get_app_rate_limits` instantly; the
  underlying Meta Graph API may still throttle the source data feed. The
  MCP does not surface a separate quota for itself.

## When _not_ to use this MCP

- **Live OAuth flows / token rotation** — the MCP has no token-rotation tool.
  Use the browser dashboard's _Settings > Advanced_ to rotate the app secret,
  and the `src/lib/social/types.ts` adapter for production token refresh
  (see `docs/operations/adding-a-social-provider.md`).
- **Production social-data sync** — runtime token management and snapshot
  fetching goes through the `SocialProviderAdapter` (Meta + TikTok) and
  `src/lib/social/crypto.ts`. The MCP is for human/agent introspection, not
  for the daily sync worker.
- **Ads management** — the Marketing API (campaigns, ad sets, ads,
  audiences) is its own OAuth-gated surface and is _not_ covered by the
  DevTools MCP. If `get_app` shows Marketing API as a product enabled, the
  next step is to wire the Marketing API separately via the
  `MetaAdsProviderAdapter` (future work — not yet in this repo).

## Triage: App mode vs App Review vs per-tenant permissions

When the `analytics-probe-card` reports `error · metric_unavailable` for a
Page-level metric (`reach` = `page_impressions_unique` or `views` =
`page_views`) but `interactions` (`page_post_engagements`) is `available`,
the pipeline is correct — Meta is the gate. Three MCP calls isolate the
root cause in < 30 s:

```text
mcp__meta-devtools__get_app              ({ app_id: "1046395264942070" })
mcp__meta-devtools__get_app_review_status({ app_id: "1046395264942070" })
mcp__meta-devtools__get_app_rate_limits  ({ app_id: "1046395264942070" })
```

Then match the evidence to the fix:

| Evidence                                                                                                                           | Root cause                                                                                                        | Fix                                                                                                                                             | Time to enable      |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `get_app` says `Live` but `get_app_review_status` reports `page_impressions_unique` / `page_views` as `not_submitted` or `pending` | App Review Standard Access missing for the two metrics                                                            | Submit via App Review → Permissions and Features. Use the boilerplate from `docs/superpowers/plans/2026-08-24-meta-tiktok-social-analytics.md`. | 3–7 days (Meta SLA) |
| `get_app` says `In Development` and the connecting user is not in App → Roles                                                      | App is gated to role-holders only                                                                                 | Toggle to Live, then re-add the user as `Admin` (not just `Tester` — the dev-mode gate checks tier). Re-probe.                                  | ~2 min              |
| `get_app_rate_limits` shows `0% remaining` on `/insights`                                                                          | Throttling, not a config issue                                                                                    | Back off the cron worker (see `src/lib/social/sync.ts`); the probe will recover on the next tick.                                               | < 1 h               |
| All three are `Live` / `approved` / non-zero headroom and the probe still fails                                                    | Per-tenant — the connector's Page access token is missing a task, OR the IG account is unlinked from the Business | Reconnect the channel; if that fails, the channel is permanently degraded.                                                                      | Open a follow-up    |

**The probe will reflect any of these fixes automatically** — there is
no in-repo change required. The `metric_unavailable` row in
`agency_social_metric_probes` is the contractually correct degraded
state and will flip to `available` on the next probe tick after Meta
serves the metric. Do **not** add code-level fallbacks that mask the
error or substitute a different metric (e.g. `page_fans` for
`page_impressions_unique`) — the failure is contractual, the operator
needs to see it, and the snapshot is already wired to surface it.

If MCP access is unavailable (no OAuth grant yet), the same triage is
reachable in ~ 5 min via the browser dashboard — see
`developers.facebook.com/apps/1046395264942070/{dashboard,app-review/permissions,roles}`.
The MCP path is preferred because it captures the evidence in a
single grep-able call sequence.

## Related docs

- `docs/visual-parity/MCP.md` — the Stitch MCP, same pattern, different
  vendor. The two docs are the canonical recipes for "an MCP lives on the
  active profile, gets called from a chat turn, and dies on restart."
- `docs/operations/adding-a-social-provider.md` — production-side
  `SocialProviderAdapter` contract; the MCP is the _meta_ layer above it.
- `docs/operations/runbook.md` — general operator runbook; the MCP docs
  above are referenced from the "External services" section there.
- `docs/decisions/0004-social-profile-analytics.md` — the Meta + TikTok
  contract.
