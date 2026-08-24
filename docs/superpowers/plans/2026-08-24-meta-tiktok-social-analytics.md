# Meta and TikTok Social Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect Facebook Pages and linked Instagram professional accounts first, collect reliable daily profile/follower snapshots, present accessible growth analytics, and add TikTok through the same provider-neutral foundation only after Meta is production-proven.

**Architecture:** Keep `social_channel` as the canonical workspace profile because planning and publishing already reference it. Add a separate encrypted OAuth-grant table so one Meta authorization can serve several Facebook Pages and linked Instagram accounts, plus a provider-neutral daily metric table and bounded database-leased sync worker triggered by the existing VPS cron model. TikTok uses its own OAuth grant and adapter without changing the storage or analytics UI.

**Tech Stack:** Next.js 16.3 App Router route handlers, React 19 Server Components and server actions, TypeScript strict, Drizzle ORM, PostgreSQL 16, Node `crypto` AES-256-GCM, Vitest, Playwright, VPS `cron.d`, Meta Graph API, TikTok Login Kit and Display API v2.

---

## Product and provider decisions

1. **Meta is one connection, two profile types.** Use Facebook Login for Business to obtain Pages the actor manages and each Page's linked Instagram professional account. A selected Facebook Page and its Instagram account become separate `social_channel` rows sharing one `social_connection`.
2. **Instagram-only login is excluded from this release.** It would create a second Meta token lifecycle and would not connect a Facebook Page. Add it only if customer research finds meaningful Instagram professional accounts that cannot be linked to a Page.
3. **Read-only analytics first.** This release does not publish, delete, comment, message, or manage ads through provider APIs. Existing manual publishing remains unchanged.
4. **Only Instagram, Facebook, and TikTok are in scope.** Do not add LinkedIn, YouTube, X, Pinterest, Snapchat, or Threads provider adapters.
5. **Professional/managed accounts only.** Instagram consumer accounts are unsupported. Facebook integration targets Pages, not personal profiles. TikTok tracks the authorizing account.
6. **Observed totals are canonical.** Store each provider's observed total for a day. Calculate growth with the preceding observation at query time; never reconstruct totals from accumulated daily deltas.
7. **No raw provider payload retention.** Persist normalized metrics, a response hash, request ID, and provider API version. This limits privacy exposure while preserving traceability.
8. **No external queue vendor.** The single-VPS deployment uses PostgreSQL leases with `FOR UPDATE SKIP LOCKED`, bounded batches, retries, and the existing authenticated cron pattern.
9. **Preserve existing channel IDs.** Connecting a provider account may link to a matching manual `social_channel`; it must not replace the row because content and publication records already reference it.
10. **Disconnect is non-destructive.** Preserve profile metadata, publication history, and daily metrics. Clear the grant link and mark the profile disconnected. Revoking a shared Meta grant requires explicit confirmation because it affects every profile using that grant.

## Current provider constraints to design around

- Meta's official Instagram collection supports both Instagram Login and Facebook Login for Business. The latter requires a Facebook Page linked to an Instagram professional account and uses `instagram_basic`, `instagram_manage_insights`, and `pages_read_engagement`; Advanced Access is required when serving accounts not owned by app-role users. Instagram account insights can be unavailable below 100 followers, are retained by Meta for up to 90 days, and may return an empty dataset rather than zero. Source: [Meta Instagram Insights](https://www.postman.com/meta/instagram/folder/23987686-f659d7d1-d74c-44e4-9192-9b1e8694c511).
- Meta's official token example discovers managed Pages with `/me/accounts` and returns Page access tokens, tasks, and the linked `instagram_business_account`. Source: [Meta managed Page tokens](https://www.postman.com/meta/instagram/request/lpx8lul/get-access-tokens-of-pages-you-manage).
- TikTok Login Kit for Web uses OAuth 2.0 with an HTTPS registered redirect URI and server-side state validation. Additional user information scopes require provider approval. Source: [TikTok Login Kit for Web](https://developers.tiktok.com/doc/login-kit-web?enter_method=left_navigation&from_seo_redirect=1).
- TikTok's v2 User Info endpoint exposes follower, following, likes, and video totals through `user.info.stats`. Source: [TikTok Get User Info](https://developers.tiktok.com/docs/en/tiktok-api-v2-get-user-info).
- TikTok access tokens expire after 24 hours and refresh tokens after 365 days; refresh responses can rotate the refresh token and the newly returned value must replace the old one. Source: [TikTok token management](https://developers.tiktok.com/docs/en/oauth-user-access-token-management).

## User experience

```text
Social Channels
├── Connect Meta
│   ├── Facebook consent
│   ├── Select managed Pages
│   ├── Include linked Instagram accounts
│   └── Link to an existing manual channel or create a new channel
├── Connect TikTok                         [enabled after Meta release gate]
├── Connection health per channel
│   ├── Connected / Reconnect / Disconnected
│   ├── Last successful sync
│   └── Sync now
└── Social Analytics
    ├── Instagram and Facebook first
    ├── 7 / 30 / 90 day growth
    ├── Accessible chart + exact-value table
    ├── Data freshness and partial-data notices
    └── TikTok appears after its adapter is enabled
```

## File map

### Create

- `docs/decisions/0002-social-profile-analytics.md` — records the additive post-v1 scope and Meta-first architecture.
- `src/lib/db/schema/social-analytics.ts` — OAuth grants, one-time OAuth states, daily normalized metrics, and profile sync leases.
- `src/lib/db/migrations/0013_social_profile_analytics.sql` — forward migration with compatibility-safe nullable channel additions.
- `src/lib/social/crypto.ts` — versioned AES-256-GCM credential envelopes.
- `src/lib/social/types.ts` — provider-neutral contracts and normalized snapshot types.
- `src/lib/social/http.ts` — timeout, retry, response-size limit, error normalization, and request-ID capture.
- `src/lib/social/repository.ts` — tenant-scoped connection/profile/metric persistence.
- `src/lib/social/sync.ts` — due-profile leasing, refresh, snapshot upsert, backoff, and next-run calculation.
- `src/lib/social/analytics.ts` — 7/30/90-day series and growth calculations using observed totals.
- `src/lib/social/providers/meta.ts` — Meta token exchange, Page discovery, linked Instagram discovery, and snapshots.
- `src/lib/social/providers/tiktok.ts` — TikTok exchange, refresh, revoke, profile discovery, and snapshots.
- `src/app/api/social/meta/connect/route.ts` — starts Meta OAuth.
- `src/app/api/social/meta/callback/route.ts` — consumes Meta OAuth state and stores a pending encrypted grant.
- `src/app/api/social/tiktok/connect/route.ts` — starts TikTok OAuth.
- `src/app/api/social/tiktok/callback/route.ts` — consumes TikTok state and connects its single profile.
- `src/app/api/cron/social-metrics/route.ts` — authenticated bounded sync worker.
- `src/app/(app)/app/w/[slug]/channels/meta-account-picker.tsx` — selects Pages and linked Instagram profiles.
- `src/app/(app)/app/w/[slug]/channels/connection-actions.tsx` — sync, disconnect, reconnect, and shared-grant warnings.
- `src/app/(app)/app/w/[slug]/analytics/social/page.tsx` — social analytics Server Component.
- `src/app/(app)/app/w/[slug]/analytics/social/social-growth-chart.tsx` — dependency-free accessible SVG chart.
- `src/app/(app)/app/w/[slug]/analytics/social/social-metrics-table.tsx` — exact-value table and CSV-friendly representation.
- `scripts/vps/social-metrics-sync.sh` — calls the cron route without logging the secret.
- `tests/unit/social-crypto.test.ts`
- `tests/unit/social-analytics.test.ts`
- `tests/unit/social-meta-provider.test.ts`
- `tests/unit/social-tiktok-provider.test.ts`
- `tests/unit/social-sync.test.ts`
- `tests/integration/social-analytics.test.ts`
- `tests/e2e/social-connections.spec.ts`
- `tests/e2e/social-analytics.spec.ts`

### Modify

- `src/lib/db/schema/channels.ts` — add nullable connection/external-ID/sync columns to the canonical profile row.
- `src/lib/db/schema/index.ts` — export the new schema module.
- `src/lib/validation/env.ts`, `.env.example`, `docs/operations/environment.md` — server-only provider and encryption settings.
- `src/app/(app)/app/w/[slug]/channels/page.tsx` — connection status, provider actions, and Meta account picker.
- `src/app/(app)/app/w/[slug]/channels/actions.ts` — finalize selected accounts, link existing channels, sync now, disconnect, and revoke.
- `src/components/app-shell/sidebar.tsx` — add Social Analytics for non-client workspace roles.
- `scripts/vps/install-cron.sh` — install the bounded sync call every 15 minutes.
- `docs/operations/runbook.md` — app-review, rotation, reconnect, manual sync, and incident procedures.
- `PORT_NOTES.md`, `docs/implementation/progress.md`, `PRODUCTION_READINESS_TRACKER.md` — record additive scope and evidence status without assigning `Verified`.

## Milestone 1 — Contract, data model, and security foundation

### Task 1: Record the architecture decision and provider boundary

**Files:**

- Create: `docs/decisions/0002-social-profile-analytics.md`
- Modify: `PORT_NOTES.md`
- Modify: `docs/implementation/progress.md`

- [ ] **Step 1: Write the ADR with the settled decision**

The ADR must state:

```markdown
Decision: use one Facebook Login for Business grant per workspace/Meta subject.
Mapping: one grant may back multiple Facebook and Instagram social_channel rows.
TikTok: separate Login Kit grant, same normalized metric interface.
Credentials: AES-256-GCM encrypted server-side; never Auth.js accounts, browser storage, logs, audit payloads, or social_channel notes.
Scheduling: PostgreSQL leases + VPS cron; no Redis or hosted queue.
Retention: daily normalized metrics retained for 25 months; OAuth state retained at most 24 hours; operational error text sanitized.
Non-goals: direct publishing, personal Facebook profiles, Instagram consumer accounts, ads analytics, audience demographics, competitor analytics, and providers other than Meta/TikTok.
```

- [ ] **Step 2: Record the additive scope in `PORT_NOTES.md`**

Add a dated entry explaining that StudioFlow v1 treated channels as informational, while this milestone adds read-only provider connections and analytics without changing manual publishing semantics.

- [ ] **Step 3: Add a post-v1 milestone checklist**

Add `Social profile analytics — Meta first, TikTok second` with statuses `Planned → Implemented → Tested → independently Verified`; do not pre-check implementation or verification.

- [ ] **Step 4: Commit the decision documents**

Run: `git add docs/decisions/0002-social-profile-analytics.md PORT_NOTES.md docs/implementation/progress.md && git commit -m "docs(analytics): define Meta-first social profile architecture"`

Expected: one documentation-only atomic commit.

### Task 2: Add the compatibility-safe database model

**Files:**

- Create: `src/lib/db/schema/social-analytics.ts`
- Create: `src/lib/db/migrations/0013_social_profile_analytics.sql`
- Modify: `src/lib/db/schema/channels.ts`
- Modify: `src/lib/db/schema/index.ts`
- Test: `tests/integration/social-analytics.test.ts`
- Test: `tests/integration/schema.test.ts`

- [ ] **Step 1: Write failing integration assertions**

Assert these invariants against PostgreSQL:

```typescript
expect(await tableExists("social_connection")).toBe(true);
expect(await tableExists("social_oauth_state")).toBe(true);
expect(await tableExists("social_profile_daily_metric")).toBe(true);
expect(await uniqueConstraintExists("social_profile_metric_channel_date_unique")).toBe(true);
expect(await columnIsNullable("social_channel", "social_connection_id")).toBe(true);
expect(await checkConstraintExists("social_connection_provider_valid")).toBe(true);
expect(await checkConstraintExists("social_connection_status_valid")).toBe(true);
```

- [ ] **Step 2: Run the focused integration test and confirm red**

Run: `pnpm test:integration -- tests/integration/social-analytics.test.ts`

Expected: FAIL because the tables do not exist.

- [ ] **Step 3: Create the SQL migration**

Use the following database contract:

```sql
CREATE TABLE "social_connection" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspace_id" uuid NOT NULL REFERENCES "workspace"("id") ON DELETE RESTRICT,
  "provider" text NOT NULL,
  "provider_subject_id" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending_selection',
  "scopes" text[] NOT NULL DEFAULT '{}',
  "credentials_ciphertext" text NOT NULL,
  "credentials_iv" text NOT NULL,
  "credentials_tag" text NOT NULL,
  "credentials_key_version" integer NOT NULL DEFAULT 1,
  "access_token_expires_at" timestamptz,
  "refresh_token_expires_at" timestamptz,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "connected_by" uuid NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "connected_at" timestamptz NOT NULL DEFAULT now(),
  "last_refreshed_at" timestamptz,
  "revoked_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "social_connection_provider_valid" CHECK (provider IN ('meta', 'tiktok')),
  CONSTRAINT "social_connection_status_valid" CHECK (status IN ('pending_selection', 'active', 'needs_reauth', 'error', 'revoked'))
);
CREATE UNIQUE INDEX "social_connection_active_subject_unique"
  ON "social_connection" ("workspace_id", "provider", "provider_subject_id")
  WHERE "revoked_at" IS NULL;

CREATE TABLE "social_oauth_state" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "state_digest" text NOT NULL UNIQUE,
  "provider" text NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspace"("id") ON DELETE CASCADE,
  "actor_id" uuid NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "return_path" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "consumed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "social_oauth_state_provider_valid" CHECK (provider IN ('meta', 'tiktok')),
  CONSTRAINT "social_oauth_state_return_path_safe" CHECK (return_path ~ '^/app/w/[a-z0-9-]+/channels$')
);

ALTER TABLE "social_channel"
  ADD COLUMN "social_connection_id" uuid REFERENCES "social_connection"("id") ON DELETE SET NULL,
  ADD COLUMN "external_account_id" text,
  ADD COLUMN "avatar_url" text,
  ADD COLUMN "connection_status" text NOT NULL DEFAULT 'manual',
  ADD COLUMN "last_synced_at" timestamptz,
  ADD COLUMN "next_sync_at" timestamptz,
  ADD COLUMN "sync_lease_until" timestamptz,
  ADD COLUMN "sync_failure_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN "last_sync_error_code" text,
  ADD COLUMN "last_sync_error_at" timestamptz;
ALTER TABLE "social_channel" ADD CONSTRAINT "social_channel_connection_status_valid"
  CHECK (connection_status IN ('manual', 'connected', 'needs_reauth', 'sync_error', 'disconnected'));
CREATE UNIQUE INDEX "social_channel_external_account_unique"
  ON "social_channel" ("workspace_id", "platform", "external_account_id")
  WHERE "external_account_id" IS NOT NULL AND "archived_at" IS NULL;
CREATE INDEX "social_channel_sync_due_idx"
  ON "social_channel" ("next_sync_at")
  WHERE "connection_status" = 'connected' AND "archived_at" IS NULL;

CREATE TABLE "social_profile_daily_metric" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "social_channel_id" uuid NOT NULL REFERENCES "social_channel"("id") ON DELETE CASCADE,
  "metric_date" date NOT NULL,
  "observed_at" timestamptz NOT NULL,
  "follower_count" bigint,
  "following_count" bigint,
  "media_count" bigint,
  "likes_count" bigint,
  "reach" bigint,
  "views" bigint,
  "engaged_accounts" bigint,
  "interactions" bigint,
  "provider_api_version" text NOT NULL,
  "provider_request_id" text,
  "response_hash" text NOT NULL,
  "source_metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "social_profile_metric_counts_non_negative" CHECK (
    follower_count >= 0 AND (following_count IS NULL OR following_count >= 0)
    AND (media_count IS NULL OR media_count >= 0) AND (likes_count IS NULL OR likes_count >= 0)
    AND (reach IS NULL OR reach >= 0) AND (views IS NULL OR views >= 0)
    AND (engaged_accounts IS NULL OR engaged_accounts >= 0)
    AND (interactions IS NULL OR interactions >= 0)
  )
);
CREATE UNIQUE INDEX "social_profile_metric_channel_date_unique"
  ON "social_profile_daily_metric" ("social_channel_id", "metric_date");
CREATE INDEX "social_profile_metric_channel_observed_idx"
  ON "social_profile_daily_metric" ("social_channel_id", "observed_at" DESC);
```

- [ ] **Step 4: Map the same contract in Drizzle**

Use `text[]` for scopes, `bigint(..., { mode: "number" })` for normalized counts, `date(..., { mode: "string" })` for `metricDate`, and nullable columns for every provider-dependent metric. Export the tables from `src/lib/db/schema/index.ts`.

- [ ] **Step 5: Prove forward and compatibility behavior**

Run: `pnpm db:migrate && pnpm test:integration -- tests/integration/social-analytics.test.ts tests/integration/schema.test.ts && pnpm migration-drill`

Expected: focused integration tests PASS and all four migration drills PASS. Existing manual channels remain valid with `connection_status='manual'`.

- [ ] **Step 6: Commit the schema atomically**

Run: `git add src/lib/db/schema src/lib/db/migrations tests/integration && git commit -m "feat(db): add social profile analytics foundation"`

### Task 3: Add credential encryption and environment validation

**Files:**

- Create: `src/lib/social/crypto.ts`
- Create: `tests/unit/social-crypto.test.ts`
- Modify: `src/lib/validation/env.ts`
- Modify: `src/lib/validation/env-server.test.ts`
- Modify: `.env.example`
- Modify: `docs/operations/environment.md`

- [ ] **Step 1: Write crypto tests before implementation**

```typescript
it("round-trips a provider credential envelope", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const sealed = sealCredentials({ accessToken: "access", refreshToken: "refresh" }, key);
  expect(openCredentials(sealed, key)).toEqual({ accessToken: "access", refreshToken: "refresh" });
  expect(JSON.stringify(sealed)).not.toContain("access");
});

it("fails closed when ciphertext or authentication tag changes", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const sealed = sealCredentials({ accessToken: "access" }, key);
  expect(() => openCredentials({ ...sealed, tag: `${sealed.tag}AA` }, key)).toThrow(
    "Unable to decrypt social credentials",
  );
});
```

- [ ] **Step 2: Implement versioned AES-256-GCM envelopes**

```typescript
export type SocialCredentials = {
  accessToken: string;
  refreshToken?: string;
  profileAccessTokens?: Record<string, string>;
};

export type SealedCredentials = {
  ciphertext: string;
  iv: string;
  tag: string;
  keyVersion: 1;
};
```

Derive the 32-byte key by base64-decoding `SOCIAL_TOKEN_ENCRYPTION_KEY`; reject any decoded length other than 32 bytes. Use a fresh 12-byte IV for every seal operation and bind `laratik-planner:social-credentials:v1` as GCM additional authenticated data.

- [ ] **Step 3: Add server-only environment fields**

```text
SOCIAL_TOKEN_ENCRYPTION_KEY=   # openssl rand -base64 32
META_APP_ID=
META_APP_SECRET=
META_LOGIN_CONFIG_ID=
META_GRAPH_API_VERSION=v25.0
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
SOCIAL_SYNC_ENABLED=false
```

Production validation must require the encryption key whenever `SOCIAL_SYNC_ENABLED=true`. Meta is considered configured only when all four Meta values exist; TikTok is considered configured only when both TikTok values exist. None may use `NEXT_PUBLIC_`.

- [ ] **Step 4: Run focused tests**

Run: `pnpm test:unit -- tests/unit/social-crypto.test.ts src/lib/validation/env-server.test.ts`

Expected: PASS, including invalid key length and incomplete provider configuration cases.

- [ ] **Step 5: Commit**

Run: `git add src/lib/social/crypto.ts tests/unit/social-crypto.test.ts src/lib/validation .env.example docs/operations/environment.md && git commit -m "feat(analytics): encrypt social provider credentials"`

### Task 4: Define provider-neutral contracts and safe HTTP behavior

**Files:**

- Create: `src/lib/social/types.ts`
- Create: `src/lib/social/http.ts`
- Create: `src/lib/social/repository.ts`
- Test: `tests/unit/social-sync.test.ts`

- [ ] **Step 1: Define normalized contracts**

```typescript
export type ConnectedProfile = {
  providerAccountId: string;
  platform: "instagram" | "facebook" | "tiktok";
  accountName: string;
  handle: string | null;
  profileUrl: string | null;
  avatarUrl: string | null;
  parentProviderAccountId: string | null;
};

export type ProfileSnapshot = {
  observedAt: Date;
  followerCount: number | null;
  followingCount: number | null;
  mediaCount: number | null;
  likesCount: number | null;
  reach: number | null;
  views: number | null;
  engagedAccounts: number | null;
  interactions: number | null;
  providerApiVersion: string;
  providerRequestId: string | null;
  responseHash: string;
  sourceMetadata: Record<string, string | number | boolean | null>;
};

export type ConnectedProfileRef = Pick<
  ConnectedProfile,
  "providerAccountId" | "platform" | "parentProviderAccountId"
>;

export type RefreshedCredentials = {
  credentials: SocialCredentials;
  accessTokenExpiresAt: Date | null;
  refreshTokenExpiresAt: Date | null;
};

export interface SocialProviderAdapter {
  discoverProfiles(credentials: SocialCredentials): Promise<{
    profiles: ConnectedProfile[];
    credentials: SocialCredentials;
  }>;
  refreshCredentials(credentials: SocialCredentials): Promise<RefreshedCredentials>;
  fetchSnapshot(
    profile: ConnectedProfileRef,
    credentials: SocialCredentials,
  ): Promise<ProfileSnapshot>;
  revoke(credentials: SocialCredentials): Promise<void>;
}
```

- [ ] **Step 2: Implement a safe provider HTTP client**

Enforce a 10-second timeout, maximum 1 MiB response body, two retries only for `429`, `502`, `503`, and `504`, full-jitter delay capped at 4 seconds, and sanitized errors shaped as:

```typescript
export class SocialProviderError extends Error {
  constructor(
    public readonly code:
      | "rate_limited"
      | "auth_expired"
      | "permission_denied"
      | "not_found"
      | "provider_unavailable"
      | "invalid_response",
    public readonly retryable: boolean,
    public readonly requestId: string | null,
  ) {
    super(code);
  }
}
```

Never include URLs with query strings, authorization headers, access tokens, refresh tokens, provider response bodies, or account metadata in error messages.

- [ ] **Step 3: Implement tenant-scoped repository functions**

Every connection/profile query must accept both `workspaceId` and record ID. Expose `createPendingConnection`, `linkProfile`, `claimDueProfiles`, `saveSnapshot`, `markSyncFailure`, `disconnectProfile`, and `revokeConnection`. `linkProfile` must lock the channel row and reserve `social_profiles` entitlement capacity only when creating a new channel.

- [ ] **Step 4: Run unit and tenant-isolation tests**

Run: `pnpm test:unit -- tests/unit/social-sync.test.ts tests/unit/workspace-context-isolation.test.ts`

Expected: PASS with explicit cross-workspace denial cases.

- [ ] **Step 5: Commit**

Run: `git add src/lib/social tests/unit/social-sync.test.ts && git commit -m "feat(analytics): add provider-neutral social services"`

## Milestone 2 — Meta connection and daily tracking

### Task 5: Implement Meta OAuth and account discovery

**Files:**

- Create: `src/lib/social/providers/meta.ts`
- Create: `src/app/api/social/meta/connect/route.ts`
- Create: `src/app/api/social/meta/callback/route.ts`
- Test: `tests/unit/social-meta-provider.test.ts`

- [ ] **Step 1: Write provider tests with intercepted HTTP**

Cover short-lived token exchange, long-lived token exchange, `/me/accounts` pagination, Page task filtering, linked `instagram_business_account`, missing scopes, expired tokens, `429`, and malformed JSON. Assert authorization headers and tokens never appear in captured logger calls.

- [ ] **Step 2: Build the authorization request**

Request only:

```typescript
const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "read_insights",
  "instagram_basic",
  "instagram_manage_insights",
] as const;
```

Generate 32 random bytes for `state`, persist only `sha256(state)` with actor/workspace/10-minute expiry, and redirect through Facebook Login for Business using `META_LOGIN_CONFIG_ID`. The route must require an authenticated workspace manager and construct its callback from `NEXT_PUBLIC_APP_URL` server-side.

- [ ] **Step 3: Consume state exactly once in the callback**

Within one transaction: lock the state row, reject expired/consumed/mismatched state, set `consumed_at`, then exchange the code. Store the encrypted long-lived credential envelope as `pending_selection`; never put tokens in redirects, cookies, React props, or audit data.

- [ ] **Step 4: Discover Pages and linked Instagram profiles**

Call the pinned Graph API version with:

```text
/me/accounts?fields=id,name,access_token,tasks,picture,link,followers_count,fan_count,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}
```

Normalize one Facebook `ConnectedProfile` per Page with `PROFILE_PLUS_ANALYZE` or full-control tasks and one Instagram `ConnectedProfile` when `instagram_business_account` is present. Follow cursor pagination with a hard maximum of 100 Pages. Put every returned Page token in `SocialCredentials.profileAccessTokens`, keyed by both the Page external ID and its linked Instagram external ID, then immediately reseal the connection credentials. Only the token-free `ConnectedProfile[]` may reach the account-picker Server Component.

- [ ] **Step 5: Test and commit**

Run: `pnpm test:unit -- tests/unit/social-meta-provider.test.ts`

Expected: PASS.

Run: `git add src/lib/social/providers/meta.ts src/app/api/social/meta tests/unit/social-meta-provider.test.ts && git commit -m "feat(analytics): connect Meta business profiles"`

### Task 6: Add Meta profile selection without duplicating manual channels

**Files:**

- Create: `src/app/(app)/app/w/[slug]/channels/meta-account-picker.tsx`
- Modify: `src/app/(app)/app/w/[slug]/channels/actions.ts`
- Modify: `src/app/(app)/app/w/[slug]/channels/page.tsx`
- Test: `tests/unit/channels/meta-account-picker.test.tsx`
- Test: `tests/integration/social-analytics.test.ts`

- [ ] **Step 1: Write selection and merge tests**

Test Page-only, Page+Instagram, multiple Pages, exact external-ID replay, handle-based existing-channel suggestion, explicit create-new choice, entitlement limit, a connection belonging to another workspace, and a connection finalized by a different actor without workspace-manager access.

- [ ] **Step 2: Render an accessible account picker**

Each Page is a fieldset. Its linked Instagram account appears as a nested checkbox, not an automatically hidden selection. For every discovered profile, display platform, name, handle, avatar, and one of:

```text
Create a new channel
Link to existing channel: <account name>
Already connected
Unavailable: missing analytics permission
```

The submit button must report pending state, errors through `role="alert"`, and success through `role="status"`.

- [ ] **Step 3: Finalize selected profiles transactionally**

Lock the pending connection and candidate channel rows. For existing rows, update external ID, connection ID, provider metadata, and `connection_status='connected'` without changing the row ID. For new rows, reserve entitlement capacity before insertion. Set the connection active only after at least one profile is linked.

- [ ] **Step 4: Add connection status to the channels table**

Replace the current generic State presentation with distinct content status and provider status. Show `Connected`, `Needs reconnect`, `Sync delayed`, `Disconnected`, or `Manual`; include last successful sync and a non-color icon/text combination.

- [ ] **Step 5: Test and commit**

Run: `pnpm test:unit -- tests/unit/channels/meta-account-picker.test.tsx && pnpm test:integration -- tests/integration/social-analytics.test.ts`

Expected: PASS.

Run: `git add src/app/'(app)'/app/w/'[slug]'/channels tests/unit/channels tests/integration/social-analytics.test.ts && git commit -m "feat(analytics): select and link Meta profiles"`

### Task 7: Implement bounded daily synchronization

**Files:**

- Create: `src/lib/social/sync.ts`
- Create: `src/app/api/cron/social-metrics/route.ts`
- Create: `scripts/vps/social-metrics-sync.sh`
- Modify: `scripts/vps/install-cron.sh`
- Test: `tests/unit/social-sync.test.ts`
- Test: `tests/integration/social-analytics.test.ts`

- [ ] **Step 1: Write lease, retry, and idempotency tests**

Cover two concurrent workers claiming different rows, expired lease recovery, same-day upsert, provider correction replacing the observed total, auth expiry marking reconnect, retryable failure backoff, non-retryable permission failure, and one profile failure not aborting the batch.

- [ ] **Step 2: Claim due profiles safely**

Use a short transaction with `FOR UPDATE SKIP LOCKED`, maximum batch size 20, and a five-minute lease. Do not make provider requests while a database transaction is open.

```sql
SELECT id
FROM social_channel
WHERE connection_status = 'connected'
  AND archived_at IS NULL
  AND next_sync_at <= now()
  AND (sync_lease_until IS NULL OR sync_lease_until < now())
ORDER BY next_sync_at
FOR UPDATE SKIP LOCKED
LIMIT 20;
```

- [ ] **Step 3: Normalize Meta snapshots**

For Facebook, persist Page follower total and available Page-level daily views/reach/engagement metrics. For Instagram, persist `followers_count`, `media_count`, and available account insights for views, reach, engaged accounts, and interactions. Missing/empty insight datasets become `null`, never zero. Store `source_metadata.partial=true` with a reason such as `below_provider_threshold` or `metric_unavailable`.

- [ ] **Step 4: Schedule the next local-day snapshot**

After success, set `next_sync_at` to 03:15 in the workspace timezone on the next calendar day, converted to UTC. On retryable failure use full-jitter backoff of approximately 15 minutes, 1 hour, 6 hours, then the next daily slot. After three consecutive auth/permission failures, set `needs_reauth` and stop automatic calls.

- [ ] **Step 5: Protect the cron route and install the caller**

Require `Authorization: Bearer <CRON_SECRET>` with timing-safe comparison, reject when `SOCIAL_SYNC_ENABLED=false`, process at most 20 profiles, and return counts only:

```json
{ "claimed": 4, "succeeded": 3, "failed": 1, "needsReauth": 0 }
```

Install `scripts/vps/social-metrics-sync.sh` every 15 minutes. The script reads `CRON_SECRET` from `/opt/laratik-planner/.env`, calls `http://127.0.0.1:3100/api/cron/social-metrics`, uses a 60-second timeout, and never echoes the secret.

- [ ] **Step 6: Test and commit**

Run: `pnpm test:unit -- tests/unit/social-sync.test.ts && pnpm test:integration -- tests/integration/social-analytics.test.ts && shellcheck scripts/vps/social-metrics-sync.sh scripts/vps/install-cron.sh`

Expected: PASS.

Run: `git add src/lib/social/sync.ts src/app/api/cron/social-metrics scripts/vps tests && git commit -m "feat(analytics): collect daily Meta profile metrics"`

## Milestone 3 — Analytics UI and operational controls

### Task 8: Build the social growth dashboard

**Files:**

- Create: `src/lib/social/analytics.ts`
- Create: `src/app/(app)/app/w/[slug]/analytics/social/page.tsx`
- Create: `src/app/(app)/app/w/[slug]/analytics/social/social-growth-chart.tsx`
- Create: `src/app/(app)/app/w/[slug]/analytics/social/social-metrics-table.tsx`
- Modify: `src/components/app-shell/sidebar.tsx`
- Test: `tests/unit/social-analytics.test.ts`
- Test: `tests/e2e/social-analytics.spec.ts`

- [ ] **Step 1: Test growth calculations**

```typescript
expect(calculateGrowth([100, 104, 103])).toEqual({ absolute: 3, percent: 3 });
expect(calculateGrowth([null, 104])).toEqual({ absolute: null, percent: null });
expect(calculateGrowth([0, 5])).toEqual({ absolute: 5, percent: null });
```

Also test missing days, provider corrections, 7/30/90-day windows, workspace timezone boundaries, and mixed platforms.

- [ ] **Step 2: Add a dedicated route and sidebar item**

Add `Social Analytics` immediately after `Social Channels` for authenticated non-client workspace users. Require accessible workspace membership; allow workspace managers, content planners, publishers, internal reviewers, designers, and viewers to read. Client reviewers remain confined to client routes.

- [ ] **Step 3: Build summary cards**

For each connected profile show current followers, 7-day change, 30-day change, last successful sync, and connection health. Use `—` plus an explanatory label for unavailable data. Do not label missing metrics as zero.

- [ ] **Step 4: Build an accessible dependency-free chart**

Use a responsive SVG with one series at a time, visible focusable data points, platform/name text labels, `aria-describedby`, reduced-motion support, and an adjacent exact-value table. Avoid adding a chart package during this milestone.

- [ ] **Step 5: Add filters and empty states**

Support profile selection and `7 days`, `30 days`, `90 days`. Empty states must distinguish no connected profiles, waiting for first snapshot, provider threshold restrictions, reconnect required, and temporary sync delay.

- [ ] **Step 6: Test and commit**

Run: `pnpm test:unit -- tests/unit/social-analytics.test.ts && pnpm test:e2e:isolated -- tests/e2e/social-analytics.spec.ts --project=chromium`

Expected: unit tests and the authenticated dashboard journey PASS with no critical axe findings.

Run: `git add src/lib/social/analytics.ts src/app/'(app)'/app/w/'[slug]'/analytics src/components/app-shell/sidebar.tsx tests && git commit -m "feat(analytics): add accessible social growth dashboard"`

### Task 9: Add sync, disconnect, reconnect, and revoke controls

**Files:**

- Create: `src/app/(app)/app/w/[slug]/channels/connection-actions.tsx`
- Modify: `src/app/(app)/app/w/[slug]/channels/actions.ts`
- Test: `tests/e2e/social-connections.spec.ts`

- [ ] **Step 1: Write authorization and lifecycle tests**

Verify only workspace managers can sync/disconnect/reconnect/revoke; syncing cannot bypass a live lease; disconnect preserves metrics and channel ID; revoking Meta affects all attached profiles; TikTok revoke affects its single profile; cross-workspace IDs are denied.

- [ ] **Step 2: Implement `Sync now`**

Set `next_sync_at=now()` only when no active lease exists. Do not call the provider inside the server action; the cron worker remains the sole sync executor.

- [ ] **Step 3: Implement profile disconnect**

Set `social_connection_id=NULL`, `connection_status='disconnected'`, clear lease/next-run/error fields, and retain external ID, manual metadata, publications, and daily metrics.

- [ ] **Step 4: Implement shared-grant revoke**

Use a focus-managed confirmation dialog listing every Facebook/Instagram channel affected. Revoke with the provider, mark the grant revoked, disconnect attached channels transactionally, and retain their historical data.

- [ ] **Step 5: Test and commit**

Run: `pnpm test:e2e:isolated -- tests/e2e/social-connections.spec.ts --project=chromium`

Expected: connection lifecycle and axe checks PASS.

Run: `git add src/app/'(app)'/app/w/'[slug]'/channels tests/e2e/social-connections.spec.ts && git commit -m "feat(analytics): manage social connection lifecycle"`

## Milestone 4 — TikTok on the proven foundation

### Task 10: Implement TikTok Login Kit and profile snapshots

**Dependency:** Start only after Meta connection, daily sync, reconnect, and dashboard journeys have passed production smoke for seven consecutive days.

**Files:**

- Create: `src/lib/social/providers/tiktok.ts`
- Create: `src/app/api/social/tiktok/connect/route.ts`
- Create: `src/app/api/social/tiktok/callback/route.ts`
- Test: `tests/unit/social-tiktok-provider.test.ts`
- Modify: `src/app/(app)/app/w/[slug]/channels/page.tsx`

- [ ] **Step 1: Write token and profile tests**

Cover authorization-code exchange, a 24-hour access token, refresh-token rotation, partial scope grant, `user.info.stats` denial, revoke, malformed responses, and an expired 365-day refresh token requiring reconnect.

- [ ] **Step 2: Start TikTok web OAuth**

Use `https://www.tiktok.com/v2/auth/authorize/`, an HTTPS callback registered exactly as `https://planner.laratik.com/api/social/tiktok/callback`, a one-time database state, and these scopes:

```typescript
const TIKTOK_SCOPES = ["user.info.basic", "user.info.profile", "user.info.stats"] as const;
```

The web confidential-client flow uses state validation and server-side client secret. Do not add desktop/mobile PKCE behavior to this web route.

- [ ] **Step 3: Exchange and store rotating credentials**

POST form data to `https://open.tiktokapis.com/v2/oauth/token/`. Encrypt access and refresh tokens together. Persist both expiration timestamps. On every refresh, atomically replace both tokens because TikTok may rotate the refresh token.

- [ ] **Step 4: Fetch and normalize the profile**

Call:

```text
GET https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username,profile_deep_link,is_verified,follower_count,following_count,likes_count,video_count
```

Map totals to the existing normalized snapshot. TikTok reach/views/engaged/interactions remain `null` in this milestone because the selected Display API profile endpoint does not provide them.

- [ ] **Step 5: Add TikTok to the existing connection UI**

The TikTok callback connects its single profile directly or offers to link a matching manual TikTok channel. Reuse the same status, daily chart, sync, disconnect, reconnect, and revoke vocabulary.

- [ ] **Step 6: Test and commit**

Run: `pnpm test:unit -- tests/unit/social-tiktok-provider.test.ts tests/unit/social-sync.test.ts && pnpm test:e2e:isolated -- tests/e2e/social-connections.spec.ts tests/e2e/social-analytics.spec.ts --project=chromium`

Expected: Meta regressions and TikTok journeys PASS.

Run: `git add src/lib/social/providers/tiktok.ts src/app/api/social/tiktok src/app/'(app)'/app/w/'[slug]'/channels tests && git commit -m "feat(analytics): add TikTok profile tracking"`

## Milestone 5 — Production approval, evidence, and rollout

### Task 11: Complete provider review and operations documentation

**Files:**

- Modify: `docs/operations/runbook.md`
- Modify: `docs/operations/environment.md`
- Modify: `docs/production-readiness/EXTERNAL_SERVICES_UAT.md`
- Modify: `docs/production-readiness/TEST_EVIDENCE.md`

- [ ] **Step 1: Prepare Meta App Review evidence**

Document the exact user journey, screencast script, test workspace, data-use explanation, privacy-policy URL, data-deletion URL, and justification for `pages_show_list`, `pages_read_engagement`, `read_insights`, `instagram_basic`, and `instagram_manage_insights`. Request Advanced Access only for these read scopes.

- [ ] **Step 2: Prepare TikTok review evidence**

Document Login Kit, Display API, and `user.info.stats` use. Explain that follower/following/likes/video totals are stored as daily workspace-owned analytics and deleted/exported under the workspace data policy.

- [ ] **Step 3: Add operational procedures**

Include credential-key rotation using decrypt-with-old/re-encrypt-with-new, provider app-secret rotation, reconnect diagnosis, forced one-profile sync, cron verification, rate-limit response, revoked-app handling, and historical metric export/delete.

- [ ] **Step 4: Define retention jobs**

The cron worker must delete consumed/expired OAuth states older than 24 hours and metrics older than 25 months. This retention is explicit, deterministic, and covered by integration tests.

- [ ] **Step 5: Commit**

Run: `git add docs && git commit -m "docs(analytics): add provider review and operations evidence"`

### Task 12: Run the release gates and staged rollout

**Files:**

- Modify: `PRODUCTION_READINESS_TRACKER.md`
- Modify: `docs/production-readiness/TEST_EVIDENCE.md`
- Modify: `tests/e2e/a11y-routes.spec.ts`
- Modify: `tests/e2e/visual-regression.spec.ts`

- [ ] **Step 1: Run all local gates**

Run:

```bash
pnpm verify
pnpm test:coverage
pnpm test:integration
pnpm migration-drill
pnpm audit --prod
pnpm test:e2e:isolated -- tests/e2e/social-connections.spec.ts tests/e2e/social-analytics.spec.ts --project=chromium
```

Expected: all commands PASS; no test is skipped or weakened.

- [ ] **Step 2: Add visual and accessibility coverage**

Add the channels connection states and social analytics route at desktop/mobile widths. Run axe against no-data, connected, partial-data, reconnect-required, and sync-error states. Generate visual baselines on the Linux CI host.

- [ ] **Step 3: Roll out Meta behind the server flag**

Deploy schema and code with `SOCIAL_SYNC_ENABLED=false`. Configure Meta credentials, complete app review, connect one internal LaraTik workspace, run a manual snapshot, then set the flag true. Observe seven consecutive daily snapshots before enabling Meta for all workspaces.

- [ ] **Step 4: Roll out TikTok separately**

Keep TikTok hidden until its provider approval and focused UAT pass. Enable it after Meta's seven-day observation window; do not couple TikTok approval to the Meta production flag.

- [ ] **Step 5: Independent review**

An independent reviewer verifies OAuth CSRF/replay protection, tenant isolation, ciphertext-at-rest evidence, provider scope minimization, missing-data semantics, keyboard/screen-reader behavior, cron idempotency, disconnect/revoke behavior, and production health. The implementation agent may mark `Tested`; only the independent reviewer marks `Verified`.

- [ ] **Step 6: Commit, push, and confirm production**

Run: `git add PRODUCTION_READINESS_TRACKER.md docs/production-readiness tests/e2e && git commit -m "test(analytics): record Meta and TikTok release evidence" && git push origin main`

Expected: authoritative CI passes, deployment uses the exact commit SHA, and `/api/health` reports that SHA with `db=up` and `schema=ready`.

## Acceptance criteria

- A workspace manager can connect one Meta grant, select a Facebook Page and its linked Instagram professional account, and link either to an existing manual channel without changing its ID.
- Tokens and refresh tokens are encrypted with AES-256-GCM, server-only, redacted from logs/errors/audits, and never sent to the browser.
- A daily snapshot is idempotently stored for each connected profile according to workspace timezone.
- Growth is calculated from observed totals and remains correct with missing days and provider corrections.
- Missing provider data is displayed as unavailable/partial, not zero.
- The sync worker uses bounded batches, leases, rate-limit backoff, and per-profile failure isolation.
- Disconnect/revoke preserves historical metrics and publication relationships.
- TikTok refresh-token rotation is atomic and `user.info.stats` is required before the profile is labeled connected.
- Client reviewers cannot reach the analytics route; cross-workspace IDs are denied server-side.
- All release, accessibility, migration, security, and independent-review evidence is recorded without self-assigning `Verified`.

## Explicitly deferred

- Instagram Login for Instagram-only professional accounts.
- Direct/scheduled provider publishing and publication-status callbacks.
- Facebook personal profiles and Instagram consumer accounts.
- Ads, spend, conversion, demographic, competitor, hashtag, comment, message, or sentiment analytics.
- Hourly metrics or lifetime raw provider payload storage.
- Providers other than Instagram, Facebook, and TikTok.
