# ADR 0004: Social profile analytics (M4)

- Status: accepted
- Date: 2026-08-24
- Scope: M4 — Meta and TikTok social profile analytics on laratik-planner

## Context

StudioFlow v1 (and M1–M3 of the LaraTik Planner port) treat `social_channel` as an informational profile: a workspace manager can name and URL a brand's accounts, but the system never speaks to a social network. The product owner has now asked for _read-only_ analytics — daily follower totals, growth windows, and connection health — for the channels the agency already tracks. Publishing, ads, comments, and personal-profile analytics stay out of scope.

Two providers are in scope for the first release: Meta (Facebook Pages plus their linked Instagram professional accounts, accessed through Facebook Login for Business) and TikTok (authorizing account, accessed through TikTok Login Kit + Display API v2). Instagram-only login is explicitly excluded because it cannot reach a Facebook Page, and a Page link is required to read Instagram insights.

The deployment is a single LaraTik VPS running Next.js 16.3 + Drizzle + Postgres 16 with no Redis, no hosted queue, and no extra infrastructure. The daily snapshot must be collected deterministically, idempotently, and inside existing operational boundaries (VPS `cron.d` + an authenticated route handler, mirroring the existing M1 cron pattern).

## Decision

- **Storage shape.** Keep `social_channel` as the canonical profile row because planning, content, and publication records already reference its `id`. Add three new tables:
  - `social_connection` — one row per (workspace, provider, provider_subject_id), holding the encrypted OAuth grant and lifecycle status.
  - `social_oauth_state` — short-lived one-time CSRF bag for the OAuth start/callback round trip.
  - `social_profile_daily_metric` — one row per (channel, calendar day in workspace timezone), storing the normalized snapshot.
- **Credential envelope.** Credentials are sealed with AES-256-GCM. The 32-byte key is read from `SOCIAL_TOKEN_ENCRYPTION_KEY` (base64). Each seal uses a fresh 12-byte IV, binds `laratik-planner:social-credentials:v1` as additional authenticated data, and is versioned via `credentials_key_version`. Tokens never appear in cookies, redirects, React props, logs, audit payloads, or `social_channel.notes`.
- **Provider adapter contract.** A single `SocialProviderAdapter` interface owns `discoverProfiles`, `refreshCredentials`, `fetchSnapshot`, and `revoke`. The repository, sync worker, analytics engine, and UI never know which provider they are talking to. `meta.ts` and `tiktok.ts` are the two implementations.
- **Sync worker.** A single authenticated route handler at `/api/cron/social-metrics` claims at most 20 due profiles per tick using `FOR UPDATE SKIP LOCKED`, sets a 5-minute lease _before_ the transaction closes, calls the provider with the lease held, and upserts the daily metric on the unique `(social_channel_id, metric_date)` constraint so provider corrections silently replace prior values. The VPS script calls the route every 15 minutes using `CRON_SECRET` over `127.0.0.1`.
- **Growth calculation.** Observed totals are canonical. Growth is `latest_observed − earliest_observed` within the chosen window at query time. No delta accumulation, no reconstruction.
- **No raw provider payload retention.** Per snapshot we persist only the normalized columns, the `provider_api_version`, the `provider_request_id`, a `response_hash` (sha256 of the normalized body), and a small typed `source_metadata` bag (e.g. `{ partial: true, reason: 'below_provider_threshold' }`).
- **Connection lifecycle is non-destructive.** Disconnect clears the `social_connection_id` link and sets `connection_status='disconnected'`; metrics, publication history, and external IDs are preserved. Revoking a shared Meta grant requires explicit confirmation because it affects every channel attached to that grant.
- **Existing channel IDs are preserved.** A finalize may link to a matching manual `social_channel` row by updating `external_account_id`, `social_connection_id`, and `connection_status` without changing the row ID, because planning and publication records already reference the row.
- **Rollout.** `SOCIAL_SYNC_ENABLED=false` is the default. The cron route is a no-op when the flag is off. Meta ships first; TikTok is gated behind a per-provider `SOCIAL_TIKTOK_ENABLED=false` flag plus an operational requirement of seven consecutive clean daily snapshots in production before Meta is exposed to all workspaces.
- **Retention.** The cron worker deletes `social_oauth_state` rows older than 24 hours and `social_profile_daily_metric` rows older than 25 months at the end of each run. Both retention windows are covered by integration tests.
- **Non-goals.** Direct publishing, ads/spend, demographics, comments, messages, sentiment, personal Facebook profiles, Instagram consumer accounts, hourly metrics, and any provider other than Meta and TikTok. No `NEXT_PUBLIC_*` env var is added for providers.

## Consequences

- Workspace managers can connect one Meta grant, select one or more managed Pages plus their linked Instagram professional accounts, and see accessible 7/30/90-day growth without any new infrastructure on the VPS.
- The existing `social_profiles` entitlement is the only capacity gate. Linking to an existing manual channel does not reserve capacity; creating a new channel reserves it transactionally (same pattern as `createChannelAction`).
- A single leaked credential cannot decrypt another grant because each row has its own IV and AAD. Key rotation is a separate operational task that decrypts with the old key and re-encrypts with the new in one transaction.
- The TikTok provider code is present from the start but cannot be reached by end users until the seven-day observation window passes and the operator flips `SOCIAL_TIKTOK_ENABLED=true`.
- The plan adds one new dependency-free accessible SVG growth chart. No chart library is added.

## Migration, compatibility, and rollback

Migration `0013_social_profile_analytics` is additive. Every new column on `social_channel` is nullable; every new table is created with a forward-only DDL. Existing manual channels are valid with `connection_status='manual'` and `external_account_id` NULL. No existing row is modified.

Rollback: deploy the prior image while retaining the additive tables. The new columns on `social_channel` are nullable, so the old code path remains valid. Destructive rollback (dropping new tables) requires a verified backup because daily metrics are operational evidence.

## References

- Plan and acceptance criteria: `docs/superpowers/plans/2026-08-24-meta-tiktok-social-analytics.md` (canonical task-by-task spec)
- Existing channels schema: `src/lib/db/schema/channels.ts`
- Existing entitlement pattern: `src/lib/entitlements/`
- Existing cron pattern: `docs/operations/runbook.md` (M1 digest at 07:30 UTC)
- Stitch design system: project `5403097764334458790`, capture `45d945d7`
