# Meta Command Center setup worksheet

Status: prepared from a read-only inspection on 2026-09-30. No Meta app,
permission, callback, or credential was changed by the inspection.

This worksheet enables the read-only Command Center path. It does not enable
publishing and it does not require copying a secret into chat, source control,
screenshots, or tickets.

## 2026-10-01 read-only account recheck

The logged-in Meta Business Suite session currently opens a Just Halal-branded
business asset. Its entity selector exposes that asset's Facebook and
Instagram surfaces, and the visible Insights content is Just Halal content.
No separate LaraTik-owned test Page with a linked Instagram professional
profile was visible in this session. No Meta setting, permission, credential,
or asset connection was changed.

This confirms the safety boundary: keep the Just Halal asset disconnected and
complete UAT only after a disposable LaraTik-owned test asset is available.

The LaraTik-associated Ads Manager app was also checked in Meta Developers. It
is still unpublished/in development; Facebook Login for Business and the
testing-requirements step are present, while business/access verification and
App Review remain incomplete. The next safe setup sequence is therefore:

1. Add or confirm a LaraTik-owned disposable Page and linked Instagram
   professional profile in the LaraTik business portfolio.
2. Add only the minimum LaraTik team/test users to the app roles.
3. Complete the app's Facebook Login for Business configuration and callback
   verification without enabling publishing.
4. Run one read-only Page/Instagram profile probe, then one controlled insight
   sync against that disposable asset.
5. Record freshness, partial/error handling, and removal/rotation evidence
   before considering provider-backed Command Center data release-ready.

The Meta portfolio selector confirms that `LaraTik GmbH` is a business
portfolio with one development app. That confirms app ownership, not Page or
Instagram-asset readiness; the linked Business Suite settings view was not
treated as evidence when Chrome's extension UI obscured it.

## 1. Select the canonical app

The inspected Meta developer account currently shows:

| App            | App ID             | Business / state              | Finding                                                                 |
| -------------- | ------------------ | ----------------------------- | ----------------------------------------------------------------------- |
| Ads Manager    | `1461007649218379` | LaraTik GmbH / in development | Preferred candidate because it is associated with the LaraTik business. |
| Ads Manager    | `1233977312086669` | in development                | Alternate candidate; no Login for Business configuration was visible.   |
| Social Tracker | `1046395264942070` | Just Halal GmbH / live        | Do not use for LaraTik.                                                 |

Owner decision:

- [ ] Confirm the LaraTik GmbH-associated Ads Manager app as the canonical
      read-only analytics app.
- [ ] Keep `META_PUBLISHING_ENABLED=false`.
- [ ] Do not create a second app unless the canonical candidate cannot pass the
      staged UAT.

### Read-only Business Suite capability checkpoint — 2026-09-30

The currently authenticated Meta Business Suite surface was inspected without
changing settings, assets, permissions, or credentials. It belongs to the
Just Halal business and is therefore **not LaraTik UAT** and must not be
connected to Planner. Its Insights surface confirms a useful source metric
shape for the Command Center: Views, Follows, Facebook visits, content
interactions, 3-second views, and watch time, each with a period and change
indicator. It also exposes recent content, weekly publishing-plan progress,
and reach recommendations.

The production Planner route inspected alongside it (`dr-reem-reda`) rendered
`Workspace unavailable`. A fresh read-only visit to `/app` also showed no
active agency/workspace and offered “Create your first workspace”, so no
LaraTik workspace connection or sync was claimed from this checkpoint. The
evidence is limited to field mapping and UX comparison; an active LaraTik
agency/workspace plus a canonical Page/Instagram test profile are still
required for controlled UAT.

## 2. Configure Meta Login for Business

In the selected app, open **Facebook Login for Business → Configurations** and
create one configuration for the Planner read-only flow. Request only:

```text
pages_show_list
pages_read_engagement
pages_read_user_content
instagram_basic
instagram_manage_insights
```

Do not add publishing, ads-management, messaging, or other mutation scopes for
this milestone.

In the agency-admin Planner screen at
`/app/agency-settings/social/providers`:

1. Copy the generated Meta callback URL for the agency.
2. Add it to **Valid OAuth Redirect URIs** in the selected Meta app.
3. Confirm Client OAuth Login and Web OAuth Login are enabled.
4. Confirm `planner.laratik.com` is present in App Domains.
5. Save the configuration and record its ID in the agency provider form.

The callback is agency-specific and has this shape:

```text
https://planner.laratik.com/api/social/meta/callback/<agency-slug>
```

Use the exact URL rendered by Planner; do not reconstruct it from memory.

## 3. Configure Planner

An agency administrator enters the following at
`/app/agency-settings/social/providers`:

| Field                        | Value                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------ |
| Meta app ID                  | Selected canonical app ID                                                      |
| App secret                   | Enter directly in the password field; never paste into chat or files           |
| Login for Business config ID | Newly created read-only configuration                                          |
| Graph API version            | `v25.0` unless the controlled upgrade review selects another supported version |
| Enabled                      | On only after the callback and credential test are ready                       |

Then run, in order:

1. **Test credentials** — proves the app row can be resolved and called.
2. **Connect Meta** from a disposable/test workspace — proves OAuth state,
   callback routing, token sealing, and profile selection.
3. **Run analytics probe** — proves the connected Page/Instagram scopes and
   classifies unsupported or unavailable metrics without mutating stored data.
4. **Run one controlled sync tick** — proves freshness, partial-data handling,
   retry/backoff, and Command Center observations.

## 4. UAT evidence and stop gates

Record only sanitized evidence: timestamps, profile type, metric status,
provider error code, request ID, and the visible Planner result. Never record
access tokens, app secrets, raw provider bodies, or user credentials.

- [ ] Callback reaches the correct agency and rejects a mismatched state.
- [ ] Page discovery returns only an owned/test Page with an analytics task.
- [ ] Instagram professional profile is discovered when linked to the Page.
- [ ] Credential test passes without logging secret material.
- [ ] Probe returns explicit `available`, `unsupported`, `no_data`, or `error`
      states for each metric.
- [ ] One sync creates fresh account/post observations or a classified,
      retryable provider result.
- [ ] Command Center shows period, source account, freshness, partial state,
      sample size, and a useful Planning/Research action.
- [ ] No publishing control or mutation scope is enabled.

Stop and correct the provider configuration if any of these occur:

- the app is the Just Halal `Social Tracker` app;
- the callback points to another agency slug;
- Meta asks for a mutation scope not listed above;
- the probe presents an unavailable metric as zero or as a recommendation;
- a token, secret, or raw provider response appears in logs or UI.

## 5. Rollout

Keep the rollout deliberately staged:

1. configured, callback saved, sync off;
2. credentials tested, sync off;
3. one test profile connected, probe passed;
4. one controlled sync and Command Center review;
5. enable scheduled sync for the intended agency after UAT sign-off.

The application already stores provider secrets per agency and keeps the global
sync switch in the environment. Do not add provider credentials to `.env` to
shorten this sequence.

## 2026-10-01 Food Game pilot checkpoint

Food Game is the selected LaraTik pilot. A read-only Meta Business Suite
check confirms that the `LaraTik GmbH` portfolio owns the Facebook Page
`Food Game` and the Instagram professional account `@__foodgame`; the
Instagram account's Connected assets view lists the Food Game Facebook Page.

The production Planner workspace `/app/w/food-game/channels` already shows
both profiles as **Connected**, last synced about four hours earlier, with
publishing disabled. `/app/w/food-game/analytics/social` shows two selected
channels and 496 combined current followers (+11, +2.3% over seven days):
Instagram is healthy at 358 followers (+8), while Facebook is 138 followers
(+3) with provider data limited. The sync diagnostic is 1/2 healthy, 1
degraded, 0 stalled; the degraded result is the explicit provider error
`metric_unavailable`, not a zero value.

This is controlled read-only production evidence, not a claim that all Meta
metrics are available. No OAuth flow, permission, credential, asset, or
publishing setting was changed during the checkpoint. Use Food Game for the
pilot report and keep Just Halal out of scope.
