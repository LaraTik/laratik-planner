# Adding a new social provider

> Companion to `docs/decisions/0004-social-profile-analytics.md` (the Meta + TikTok contract) and `src/lib/social/types.ts` (the `SocialProviderAdapter` interface). The procedure below is the recipe for a third provider (LinkedIn, YouTube, Pinterest, Threads, etc.). M4.5 added TikTok as the second production provider; the third is a green-field effort that follows the same shape.

## 1. The `SocialProviderAdapter` contract

Every provider implements four methods on `SocialProviderAdapter` (see `src/lib/social/types.ts:87-150`):

1. **`provider: 'meta' | 'tiktok' | ...`** — the string key. The application's repository, sync worker, and UI resolve the right adapter from the connection's `provider` column.
2. **`discoverProfiles(credentials, appCredentials)`** — the OAuth-finalize path. Returns the token-free profile list and a (possibly rotated) credentials envelope. The application hands the picker the token-free list and reseals the credentials on the connection row.
3. **`refreshCredentials(credentials, appCredentials)`** — refresh the access token (and possibly the refresh token) before the snapshot call. The adapter must surface `SocialProviderError('auth_expired', false)` when the refresh token itself has expired.
4. **`fetchDailySnapshot(profile, credentials, appCredentials, observedAt)`** — the normalized daily snapshot. The adapter maps provider-specific metrics to the `ProfileSnapshot` shape (`followerCount`, `followingCount`, `mediaCount`, `likesCount`, `reach`, `views`, `engagedAccounts`, `interactions`, `providerApiVersion`, `providerRequestId`, `responseHash`, `sourceMetadata`).

The shared types in `src/lib/social/types.ts` are the contract:

- `ConnectedProfile` — token-free list handed to the picker.
- `ProfileSnapshot` — the exact shape persisted to `social_profile_daily_metric`.
- `RefreshedCredentials` — the new credentials envelope after a refresh.
- `SocialCredentials` — the AES-256-GCM-sealed envelope (see `src/lib/social/crypto.ts`).
- `AppCredentials` — the platform's app secret for the provider (e.g. `META_APP_SECRET`, `TIKTOK_CLIENT_SECRET`).

The adapter is the only file that knows the provider's wire format. The repository, sync worker, analytics engine, and UI are provider-agnostic.

## 2. Migration pattern (`<NNN>_<provider>.sql`)

A new provider's schema is **additive** per `docs/architecture/migrations.md:1`. The pattern is:

- The `social_connection` row's `provider` column is a CHECK-constrained text. To add a new provider, **widen the CHECK** in a new migration:

  ```sql
  ALTER TABLE "social_connection"
    DROP CONSTRAINT "social_connection_provider_valid";
  ALTER TABLE "social_connection"
    ADD CONSTRAINT "social_connection_provider_valid"
    CHECK (provider IN ('meta', 'tiktok', '<new_provider>'));
  ```

- Same for `social_oauth_state.provider`.
- Add a per-provider index only if the query plan needs it. The current `social_connection_workspace_idx` is provider-agnostic.
- No new tables are required. The `social_connection`, `social_oauth_state`, and `social_profile_daily_metric` tables are provider-neutral.

The migration filename follows the existing convention: `00NN_<provider>_enable.sql` (e.g. `0020_linkedin_enable.sql`). The SHA-256 and the journal tag are recorded in the per-migration section of `docs/production-readiness/MIGRATION_DEPLOYMENT.md` (see `docs/architecture/migrations.md:3`).

## 3. OAuth flow + scopes

The OAuth flow is the connect / callback surface. The pattern (see `src/app/api/social/meta/connect/route.ts` and `src/app/api/social/meta/callback/route.ts`):

1. **Connect route** — generates a CSRF `state`, inserts a `social_oauth_state` row (the `state_digest` is `sha256(state)`; the raw state is never persisted), builds the provider's authorization URL with the read-only scope set, and 302-redirects.
2. **Callback route** — receives the provider's redirect, verifies the `state` by recomputing `sha256(state)` and selecting the matching `social_oauth_state` row, consumes the row in the same transaction (sets `consumed_at = now()`), exchanges the `code` for the access + refresh tokens, seals the credentials envelope, and creates the `social_connection` row in `pending_selection` status.
3. **Account picker** — calls `discoverProfiles` on the adapter, hands the token-free list to the user, and on selection updates the connection to `active` and links the `social_channel` row.

The scope set is **read-only**. The current scope sets:

- Meta: `business_management`, `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `read_insights`.
- TikTok: `user.info.basic`, `user.info.stats`, `video.list`.

The new provider's scope set is added to the adapter's authorization URL builder. No publish / manage / ads scope ever appears in the URL. The scope is part of the adapter's `provider: '...'` key — adding a new provider is a new scope set, not a new route.

## 4. Cron worker integration

The cron worker is the bounded daily sync. The pattern (see `src/lib/social/sync.ts` and `src/app/api/cron/social-metrics/route.ts`):

1. **Authenticate** the cron request with the `CRON_SECRET` env var (timing-safe comparison).
2. **Claim** every `social_channel` row where `next_sync_at <= now()`, `connection_status = 'connected'`, and `archived_at IS NULL`, using `FOR UPDATE SKIP LOCKED` so concurrent workers do not double-fetch.
3. **Set `sync_lease_until`** to `now() + 60s` (the worker is bounded; the lease is the safety net if the worker crashes).
4. **Refresh credentials** via `refreshCredentials` if the access token expires within 5 minutes.
5. **Fetch the snapshot** via `fetchDailySnapshot`. The adapter returns a `ProfileSnapshot`; the repository upserts `social_profile_daily_metric` on the `(social_channel_id, metric_date)` unique index.
6. **Update `last_synced_at`**, advance `next_sync_at` (default 24h), and clear `sync_lease_until`.

A new provider's adapter participates automatically — the worker is provider-agnostic. The provider key is on the `social_connection` row; the worker resolves the adapter via the `provider` lookup in `src/lib/social/providers/index.ts`.

## 5. Per-provider flag (`SOCIAL_<PROVIDER>_ENABLED`)

The rollout gate is a per-provider env flag. The pattern (see `src/lib/validation/env.ts`):

- `SOCIAL_META_ENABLED` (default `true`) — gates the Meta connect / callback routes.
- `SOCIAL_TIKTOK_ENABLED` (default `false`) — gates the TikTok connect / callback routes; the flag is the 7-day observation window after M4.5.
- `SOCIAL_SYNC_ENABLED` (default `false`) — gates the daily sync worker globally. The provider-specific flag is independent: an agency on `SOCIAL_META_ENABLED=true` is not affected by `SOCIAL_TIKTOK_ENABLED=false`.

A new provider adds a new flag: `SOCIAL_<PROVIDER>_ENABLED` (default `false`). The flag is read at the connect / callback route entry; a `false` value returns `404` (the route is not exposed). The flag is the 7-day observation window for the new provider — see §7.

## 6. UAT rows in `EXTERNAL_SERVICES_UAT.md`

The new provider's UAT evidence lives in `docs/production-readiness/EXTERNAL_SERVICES_UAT.md`. The current rows are the Meta + TikTok tables; a new provider adds a new table. The columns:

- **Test case** — the OAuth flow, the profile discovery, the refresh-credentials path, the snapshot path, the disconnect path, the re-connect after revoke path.
- **Auto-check** — `code path exists` (the route + adapter + repository all wired), `integration test` (disposable Postgres), `browser test` (Playwright with the dev seed), `UAT walkthrough` (operator + date).
- **Owner-supplied evidence** — the OAuth app creation screenshot, the test account details, the daily snapshot evidence, the `EXTERNAL_SERVICES_UAT.md` row with the operator + date.

A new provider is not `Verified` until the UAT table is signed. The sign-off is the per-provider gate; the `READY FOR INDEPENDENT REVIEW` → `READY` verdict transition is the per-release gate.

## 7. Rollout gate (7-day observation)

The M4.5 precedent (see `docs/decisions/0004-social-profile-analytics.md:28`) is a **7-day observation window** for any new provider. The procedure is:

1. **Land the migration + adapter + routes** with `SOCIAL_<PROVIDER>_ENABLED=false`. The migration is in the journal; the adapter is wired; the routes return `404`.
2. **Run `pnpm verify` + `pnpm migration-drill` + `pnpm test:e2e:critical`** on `main`. The deploy is live with the provider gated off.
3. **Flip `SOCIAL_<PROVIDER>_ENABLED=true` for one internal workspace** by adding the workspace's `agencyId` to the `SOCIAL_<PROVIDER>_ALLOWED_AGENCIES` env var (comma-separated UUID list, optional). The flag is now a per-workspace gate.
4. **Run for 7 consecutive days** with one internal workspace. Each day: one snapshot fetch, no errors, the `social_profile_daily_metric` row is correct, the connection-status badge is `connected`, the `last_synced_at` advances, the `next_sync_at` advances.
5. **Review the 7 daily snapshots** for completeness, accuracy, and edge cases (e.g. a new follower spike, a media deletion, a token refresh). Document the review in `EXTERNAL_SERVICES_UAT.md`.
6. **Open the provider to all workspaces** by setting `SOCIAL_<PROVIDER>_ENABLED=true` (the env-var flip) and removing the `SOCIAL_<PROVIDER>_ALLOWED_AGENCIES` constraint. The provider is now production.
7. **Record the rollout** in `docs/operations/runbook.md` §"Social provider rollout log" (operator + date + the 7-day review).

A provider that fails any of the 7 daily snapshots rolls back. The flag flips to `false`; the provider is gated off; the daily snapshot rows for the failed day are retained for the postmortem.

## 8. Author checklist

Before opening the PR for a new social provider:

- [ ] The adapter implements all four `SocialProviderAdapter` methods per `src/lib/social/types.ts`.
- [ ] The migration is additive per `docs/architecture/migrations.md:1` and is recorded in `docs/production-readiness/MIGRATION_DEPLOYMENT.md` (per-migration section, SHA-256, journal tag).
- [ ] The OAuth scopes are read-only and documented in the adapter.
- [ ] The per-provider flag (`SOCIAL_<PROVIDER>_ENABLED`) is in `src/lib/validation/env.ts` with a default of `false`.
- [ ] The connect / callback routes are added under `src/app/api/social/<provider>/` and gate on the per-provider flag.
- [ ] The cron worker integration is verified end-to-end (one manual trigger, one daily snapshot, one token refresh).
- [ ] The UAT rows in `EXTERNAL_SERVICES_UAT.md` are added with the operator + date columns.
- [ ] The 7-day observation plan is in the PR description.
- [ ] `pnpm verify` is green (format, lint, typecheck, unit, build) and `pnpm test:integration` passes on disposable Postgres.
- [ ] The PR title references the M-tag and the gap audit ID (e.g. `M4.6 — linkedin (DOC-14, GAP-FULL-REVIEW-2026-08-25)`).

## 9. Common hazards

- **Widening the `provider` CHECK constraint without a migration** — the constraint is the only structural guard on the column. A new provider without a migration is a deploy-blocker.
- **Sending a non-read-only scope to the provider** — the scope set is the contract. A `publish` or `manage` scope is a security review-blocker; the adapter is the only file that builds the authorization URL.
- **Forgetting the `state_digest` ↔ raw state split** — the raw state is never persisted; only `sha256(state)` is in the `social_oauth_state` row. A CSRF guard that stores the raw state is a security review-blocker.
- **Setting `SOCIAL_<PROVIDER>_ENABLED=true` without the 7-day observation** — the observation window is the per-provider gate. Skipping it is the recipe for the next production incident.
- **Adding a new table for the new provider** — the schema is provider-neutral. A new table is a review-blocker; widen the CHECK constraint instead.
- **Forgetting the `providerRequest` timeout / retry / body-cap contract** — every adapter call goes through `providerRequest` (`src/lib/social/http.ts`) which enforces the 10s timeout, 1 MiB body cap, 2-retry cap on 429/502/503/504, and full-jitter 4s ceiling. A raw `fetch` in the adapter is a review-blocker.
- **Forgetting the Sentry alert** — the four alert rules (`5xx rate`, `latency p95`, `token refresh failure rate`, `connection status flip to needs_reauth`) are per-provider. A new provider is a new alert rule, or a confirmation that the existing rules cover the new surface.

## 10. Cross-references

- `src/lib/social/types.ts` — the `SocialProviderAdapter` interface and the shared types.
- `src/lib/social/providers/{meta,tiktok}.ts` — the two existing adapters (the third follows the same shape).
- `src/lib/social/repository.ts` — the provider-agnostic repository (`FOR UPDATE SKIP LOCKED` claim).
- `src/lib/social/sync.ts` — the provider-agnostic daily sync worker.
- `src/app/api/social/{meta,tiktok}/{connect,callback}/route.ts` — the OAuth routes (one pair per provider).
- `src/app/api/cron/social-metrics/route.ts` — the cron worker entry point.
- `docs/decisions/0004-social-profile-analytics.md` — the Meta + TikTok contract and the 7-day observation gate.
- `docs/production-readiness/EXTERNAL_SERVICES_UAT.md` — the per-provider UAT rows.
- `docs/operations/runbook.md` §"Social analytics" — the per-provider rollout log.
