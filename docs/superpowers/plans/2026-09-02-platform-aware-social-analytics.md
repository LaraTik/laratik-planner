# Platform-Aware Social Analytics Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make social analytics resilient to provider metric differences, preserve valid partial data, remove misleading universal metrics from the UI, and ship an accessible bilingual analytics experience with production evidence.

**Architecture:** Keep the normalized `social_profile_daily_metric` columns and provider-neutral `ProfileSnapshot` contract, but add a shared platform capability registry and typed metric-status metadata. Providers collect supported metrics independently so one unavailable Meta metric cannot discard successful metrics. The analytics page uses four cross-platform metrics, keeps `engagedAccounts` in Instagram-specific insight areas, and calculates engagement rate from `interactions / reach` with a documented follower fallback.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Drizzle/Postgres JSONB metadata, Zod-compatible typed boundaries, React server components, Tailwind 4/shadcn primitives, Vitest, Playwright, axe-core, existing StudioFlow tokens, English/Arabic catalogs.

---

## Scope and non-negotiable outcomes

The implementation must satisfy all of these outcomes:

1. The Rice n Spices provider fix is merged or proven already present as an isolated change before analytics UX work begins.
2. A supported metric that succeeds is persisted even when another metric is unsupported, empty, or fails.
3. Facebook exposes followers, reach, views, and interactions; it never shows `engagedAccounts` as a permanent blank column.
4. Instagram exposes the same four shared metrics and keeps `engagedAccounts` as an Instagram-specific insight.
5. TikTok exposes only metrics supported by its provider contract and does not render misleading empty analytics columns.
6. Engagement rate uses `interactions / reach * 100` when both values exist, otherwise `interactions / followers * 100` with an explicit fallback label; it does not depend on `engagedAccounts`.
7. Partial data explains the count and missing reason, for example `Partial data · 3/4 metrics available` and `Missing: Views`.
8. The UI does not expose raw Meta errors to normal workspace users. Operators retain typed codes, request IDs, logs, and Sentry diagnostics.
9. Existing rows written before the refinement remain readable without a destructive backfill or required downtime.
10. English/LTR and Arabic/RTL, responsive, keyboard, accessibility, loading, empty, error, authorization, and visual checks pass at one exact clean commit.

## Current repository baseline

The following facts are part of the implementation preflight:

- `src/lib/social/analytics.ts` currently defines five global metrics and calculates engagement from `engagedAccounts / followers`.
- `src/app/(app)/app/w/[slug]/analytics/social/page.tsx` currently uses one global five-metric selector and passes all five columns to each channel card.
- `src/app/(app)/app/w/[slug]/analytics/social/social-metrics-table.tsx` currently includes `engagedAccounts` in the shared table.
- `src/lib/social/providers/meta.ts` currently groups Meta insights into one request per platform branch, so a provider-level metric error can null the entire insights result.
- `social_profile_daily_metric.source_metadata` is already JSONB and can carry a versioned status map without a table migration.
- `tests/e2e/social-analytics.spec.ts` currently covers empty/auth states but has no deterministic connected Facebook + Instagram data fixture.
- The existing design-system search recommends a data-dense dashboard, WCAG AA contrast, visible focus, 44px interaction targets, reduced motion, and responsive checkpoints at 375, 768, 1024, and 1440px. Existing StudioFlow tokens remain the source of truth; do not replace them with a new palette.
- At the time this plan is written, `fix/rice-n-spices-metrics` points to an ancestor already reachable from `main` and has no unique diff against current `main`. The merge preflight below must confirm this rather than creating an empty merge.
- The current worktree contains generated `next-env.d.ts` and `tsconfig.json` changes from E2E execution. They are not part of this feature and must remain uncommitted unless separately confirmed by the owner.

## File map before implementation

### Provider and domain contracts

- Create `src/lib/social/metrics.ts` for metric names, platform capabilities, metric status, metadata parsing, and user-safe missing-data summaries.
- Modify `src/lib/social/types.ts` to use the JSON-safe source metadata contract and expose metric status data on snapshots.
- Modify `src/lib/social/providers/meta.ts` to collect supported metrics independently and record per-metric outcomes.
- Modify `src/lib/social/providers/tiktok.ts` to emit explicit unsupported statuses for metrics not available through Display API v2.
- Modify `src/lib/social/sync.ts` to save partial snapshots as successful syncs and reserve channel failure for base/profile failures.
- Modify `src/lib/social/repository.ts` only where snapshot metadata typing or workspace-local metric-date handling requires it.

### Analytics calculations and UI

- Modify `src/lib/social/analytics.ts` to import the capability registry, expose universal metrics, and calculate reach-first engagement rate.
- Modify `src/app/(app)/app/w/[slug]/analytics/social/page.tsx` to use platform-aware controls, card metrics, status summaries, and localized methodology copy.
- Modify `src/app/(app)/app/w/[slug]/analytics/social/social-metrics-table.tsx` to receive a platform and render only supported table columns.
- Modify `src/app/(app)/app/w/[slug]/analytics/social/social-engagement-rate.tsx` to show the calculation basis and unavailable state without misleading dashes.
- Modify `src/app/(app)/app/w/[slug]/analytics/social/social-csv-export.tsx` to export universal columns for every platform and `engagedAccounts` only for Instagram exports.
- Create `src/app/(app)/app/w/[slug]/analytics/social/social-partial-data.tsx` for accessible count/missing-reason presentation.
- Modify `src/app/(app)/app/w/[slug]/analytics/social/social-growth-chart.tsx` to keep selected metric labels, chart descriptions, and the table alternative accurate after the metric registry changes.
- Add or modify `src/app/(app)/app/w/[slug]/analytics/social/loading.tsx` and `error.tsx` for stable loading and recoverable error states.
- Modify `src/messages/en/analytics.json` and `src/messages/ar/analytics.json` for all new labels, methodology, statuses, and recovery copy.

### Tests and evidence

- Create `tests/unit/social-metrics.test.ts`.
- Modify `tests/unit/social-analytics.test.ts`.
- Modify `tests/unit/social-analytics-feel.test.tsx`.
- Modify `tests/unit/social-meta-provider.test.ts`.
- Modify `tests/unit/social-sync.test.ts`.
- Modify `tests/integration/social-repository.test.ts` and `tests/integration/social-analytics.test.ts`.
- Modify `tests/e2e/social-analytics.spec.ts` and add a deterministic analytics fixture helper under `tests/e2e/`.
- Modify `tests/e2e/a11y-routes.spec.ts` and the visual route manifest/baselines when the analytics layout changes.

### Documentation and release evidence

- Create `docs/decisions/0005-platform-aware-social-metrics.md`.
- Modify `docs/operations/runbook.md` under Social analytics.
- Modify `docs/production-readiness/EXTERNAL_SERVICES_UAT.md`, `docs/production-readiness/TEST_EVIDENCE.md`, and the relevant M4 row/sub-rows in `PRODUCTION_READINESS_TRACKER.md`.
- Record the exact clean SHA and command results in the evidence bundle; do not mark any row `Verified` without independent review.

---

## Milestone 0 — Baseline and Rice n Spices merge gate

### Task 0: Establish the exact provider-fix delta

**Files:** No product files. Read-only Git and test inspection.

- [ ] **Step 1: Capture the baseline without deleting owner changes.**

Run:

```bash
git status --short --branch
git diff -- next-env.d.ts tsconfig.json
git log --oneline --decorate --all --max-count=30
```

Expected: generated config changes are identified separately; the current main SHA and provider branch SHA are recorded.

- [ ] **Step 2: Prove whether the branch contains unique work.**

Run:

```bash
git merge-base main fix/rice-n-spices-metrics
git diff --stat main...fix/rice-n-spices-metrics
git log --oneline main..fix/rice-n-spices-metrics
git log --oneline fix/rice-n-spices-metrics..main -- src/lib/social/providers src/lib/social/sync.ts tests/unit/social-meta-provider.test.ts
```

Expected: either the exact provider-fix commit is listed for merge, or the branch is proven to be already included/empty. Do not create a no-op merge commit.

- [ ] **Step 3: Verify the provider behavior before any UI work.**

Run:

```bash
pnpm test:unit -- tests/unit/social-meta-provider.test.ts tests/unit/social-sync.test.ts
```

Expected: the test suite proves that valid metrics remain populated when one metric is unavailable, the row is marked partial, and the failed metric is recorded.

- [ ] **Step 4: Merge only the unique provider fix.**

When Step 2 identifies a real unique commit, merge that branch with the repository’s normal atomic commit policy and preserve the provider fix as its own commit. When the branch has no unique commit, record “already contained in main” in the plan/evidence and continue without manufacturing a merge.

- [ ] **Step 5: Run the provider integration checks.**

Run:

```bash
TEST_DATABASE_URL=postgresql://planner:planner_dev_only@127.0.0.1:5432/planner_test pnpm test:integration -- tests/integration/social-analytics.test.ts tests/integration/social-repository.test.ts
```

Expected: schema, repository upsert, metadata persistence, and retention behavior pass against `planner_test` only.

### Task 1: Freeze the acceptance examples

**Files:** Create `docs/decisions/0005-platform-aware-social-metrics.md`.

- [ ] **Step 1: Document the platform matrix.**

The ADR must contain this contract:

| Platform  | Followers |       Reach |       Views | Interactions | Engaged accounts |                         Engagement rate |
| --------- | --------: | ----------: | ----------: | -----------: | ---------------: | --------------------------------------: |
| Facebook  | supported |   supported |   supported |    supported |      unsupported | interactions / reach, follower fallback |
| Instagram | supported |   supported |   supported |    supported |        supported | interactions / reach, follower fallback |
| TikTok    | supported | unsupported | unsupported |  unsupported |      unsupported |                             unavailable |

- [ ] **Step 2: Document null semantics.**

State that `null` is not sufficient to explain a missing metric. Every new snapshot writes `metricStatuses`; legacy rows are interpreted from non-null values plus platform capabilities. The statuses are:

```ts
type MetricAvailability = "available" | "unsupported" | "error" | "no_data";
```

- [ ] **Step 3: Document compatibility and rollback.**

State that no table migration is required because `source_metadata` is already JSONB. Old application images can read rows because normalized columns remain unchanged. Rollback is an application-image rollback; do not drop the JSON metadata or normalized columns.

- [ ] **Step 4: Commit the contract separately.**

Run:

```bash
git add docs/decisions/0005-platform-aware-social-metrics.md
git commit -m "docs(analytics): define platform metric capabilities"
```

---

## Milestone 1 — Capability and metric-status contracts

### Task 2: Add the platform capability registry

**Files:** Create `src/lib/social/metrics.ts`; modify `src/lib/social/types.ts` and `src/lib/social/analytics.ts`; test `tests/unit/social-metrics.test.ts`.

- [ ] **Step 1: Write failing registry tests.**

Tests must assert:

```ts
expect(getSupportedSocialMetrics("facebook")).toEqual([
  "followerCount",
  "reach",
  "views",
  "interactions",
]);
expect(getSupportedSocialMetrics("instagram")).toContain("engagedAccounts");
expect(getSupportedSocialMetrics("tiktok")).toEqual(["followerCount"]);
expect(getUniversalSocialMetrics()).toEqual(["followerCount", "reach", "views", "interactions"]);
```

Also test that a malformed/unsupported URL metric falls back to the first metric supported by the current platform, and that `engagedAccounts` is never returned for Facebook.

- [ ] **Step 2: Implement one canonical registry.**

Use one source of truth rather than repeating arrays in providers, page components, table columns, and CSV code. The implementation shape should be equivalent to:

```ts
export const UNIVERSAL_SOCIAL_METRICS = [
  "followerCount",
  "reach",
  "views",
  "interactions",
] as const;

export const SOCIAL_METRIC_CAPABILITIES = {
  facebook: UNIVERSAL_SOCIAL_METRICS,
  instagram: [...UNIVERSAL_SOCIAL_METRICS, "engagedAccounts"],
  tiktok: ["followerCount"],
} as const;
```

Expose typed helpers for `getSupportedSocialMetrics`, `isMetricSupported`, `parseSocialMetricForPlatform`, and `metricLabelKey`. Keep the current five-field normalized snapshot shape; the registry controls what is meaningful for each platform.

- [ ] **Step 3: Add JSON-safe metric status types.**

Define a recursive JSON-safe metadata value and a typed status shape. The persisted contract must support this shape without storing provider payloads:

```ts
type MetricStatus = {
  status: "available" | "unsupported" | "error" | "no_data";
  providerErrorCode?: string;
};

type SocialSourceMetadata = {
  schemaVersion: 2;
  partial: boolean;
  failedMetrics: SocialMetric[];
  metricStatuses: Partial<Record<SocialMetric, MetricStatus>>;
  [key: string]: JsonValue;
};
```

Preserve existing usage fields, `reason`, `providerErrorCode`, request IDs, and latest-post metadata. Do not store access tokens, raw URLs with tokens, or full provider payloads.

- [ ] **Step 4: Update `ProfileSnapshot` and legacy parsing.**

Change `ProfileSnapshot.sourceMetadata` to the shared JSON-safe type. Add a parser that:

1. accepts missing/legacy metadata;
2. infers `available` for non-null normalized values;
3. marks platform-disallowed metrics `unsupported`;
4. marks null supported metrics `no_data` when there is no provider error;
5. preserves typed `providerErrorCode` only for operator diagnostics.

- [ ] **Step 5: Run the focused unit tests.**

Run:

```bash
pnpm test:unit -- tests/unit/social-metrics.test.ts
```

Expected: registry, fallback, legacy metadata, and status serialization tests pass.

- [ ] **Step 6: Commit the contract.**

```bash
git add src/lib/social/metrics.ts src/lib/social/types.ts src/lib/social/analytics.ts tests/unit/social-metrics.test.ts
git commit -m "feat(analytics): add platform metric capabilities"
```

### Task 3: Refactor engagement-rate calculations

**Files:** Modify `src/lib/social/analytics.ts`; test `tests/unit/social-analytics.test.ts`.

- [ ] **Step 1: Replace the old calculation tests.**

Add tests using complete `MetricSeriesPoint` fixtures:

```ts
const completePoint = {
  metricDate: "2026-09-01",
  followerCount: 500,
  reach: 1000,
  views: 2500,
  engagedAccounts: null,
  interactions: 25,
  partial: false,
};
expect(calculateEngagementRate([completePoint])).toEqual({
  percent: 2.5,
  denominator: "reach",
  partial: false,
});
expect(calculateEngagementRate([{ ...completePoint, reach: null }])).toEqual({
  percent: 5,
  denominator: "followers",
  partial: true,
});
expect(calculateEngagementRate([{ ...completePoint, interactions: null }]).percent).toBeNull();
```

Cover zero denominators, negative corrections, sparse days, a partial metric status, TikTok unsupported status, and latest non-null values from different observation days. Keep tests deterministic with explicit dates.

- [ ] **Step 2: Implement the reach-first result type.**

Return `denominator: "reach" | "followers" | null` in addition to `percent` and `partial`. Select the latest non-null interactions. Prefer the latest non-null reach; only use followers when reach is unavailable. Return `percent: null` for missing numerator or zero denominator. Mark the result partial when the selected values came from a partial/status-incomplete series or when the fallback was required.

- [ ] **Step 3: Keep universal growth calculations platform-safe.**

Ensure `calculateGrowth`, `chartSeries`, and `parseSocialMetric` accept only registry-supported metrics at their public boundary. A direct `?metric=engagedAccounts` request must resolve to a universal metric on the shared dashboard rather than rendering an Instagram-only metric for Facebook cards.

- [ ] **Step 4: Verify the domain suite.**

```bash
pnpm test:unit -- tests/unit/social-analytics.test.ts
```

Expected: all prior growth/CSV/window tests remain green and the new formula tests pass.

---

## Milestone 2 — Provider-resilient collection and persistence

### Task 4: Make Meta metric collection independent

**Files:** Modify `src/lib/social/providers/meta.ts`; test `tests/unit/social-meta-provider.test.ts`.

- [ ] **Step 1: Add failing provider fixtures.**

Create controlled fake responses for a Facebook Page where:

- follower fields succeed;
- reach succeeds;
- views returns a metric-unavailable error;
- interactions succeeds.

Assert that the normalized snapshot contains follower, reach, and interactions; `views` is `null`; `sourceMetadata.partial` is true; `failedMetrics` contains `views`; and the metric status identifies the reason without leaking a token.

Create the equivalent Instagram fixture with one unavailable insight and assert the other supported insights remain populated. Add a test proving a transient provider error is `error`, while a metric-not-available response is `unsupported`.

- [ ] **Step 2: Implement per-metric collection.**

Split Meta insight collection into metric-compatible calls or independently settled metric requests. Do not issue one all-or-nothing request containing metrics that Meta may reject as a group. For every requested metric:

```ts
const result = await Promise.allSettled(requestedMetrics.map((metric) => fetchMetric(metric)));
```

Map each result to `available`, `unsupported`, `error`, or `no_data`. Only base profile identity/follower failures should reject the entire snapshot. Insight failures must produce a partial snapshot so valid values can be saved.

- [ ] **Step 3: Preserve operator diagnostics safely.**

Keep `providerErrorCode` and `providerRequestId` in the relevant metric status and existing top-level metadata. Keep the existing log/Sentry events, but ensure tokens and full provider responses are absent from logs and metadata. Map raw provider codes to user-safe copy in the UI layer only.

- [ ] **Step 4: Make provider capability declarations explicit.**

Use the shared registry so Facebook never requests `engagedAccounts`, Instagram requests it, and TikTok declares unsupported metrics without fake zero values. Keep the provider adapter boundary provider-neutral.

- [ ] **Step 5: Run provider tests.**

```bash
pnpm test:unit -- tests/unit/social-meta-provider.test.ts
```

Expected: all existing Meta response-shape, token-acquisition, rate-limit, error-safety, and new independent-metric tests pass.

- [ ] **Step 6: Commit the provider refinement separately.**

```bash
git add src/lib/social/providers/meta.ts src/lib/social/providers/tiktok.ts tests/unit/social-meta-provider.test.ts
git commit -m "fix(analytics): preserve valid metrics on partial provider responses"
```

### Task 5: Persist partial snapshots as usable sync results

**Files:** Modify `src/lib/social/sync.ts` and `src/lib/social/repository.ts`; test `tests/unit/social-sync.test.ts` and `tests/integration/social-repository.test.ts`.

- [ ] **Step 1: Add sync behavior tests.**

Assert that a `ProfileSnapshot` with three available metrics and one failed metric:

1. is written through `saveSnapshot`;
2. updates `lastSyncedAt` and schedules the next sync;
3. returns `outcome: "ok"`;
4. does not increment the channel failure counter;
5. retains `metricStatuses` and `failedMetrics` through the repository round trip.

Also assert that a base profile/auth failure still returns a failed/reauth result and does not write a misleading all-null snapshot.

- [ ] **Step 2: Implement the success boundary.**

Keep the existing `runChannelSyncCore` flow, but treat a returned snapshot as successful when the provider returned a valid normalized profile and any metric values or explicit statuses. Do not reinterpret `sourceMetadata.partial` as a channel failure. Reserve `markSyncFailure` for provider/auth/config failures that prevent a valid snapshot.

- [ ] **Step 3: Preserve backward compatibility.**

`saveSnapshot` must accept legacy metadata and new schema-versioned metadata. Existing rows remain queryable. No delete/backfill job is allowed in this milestone.

- [ ] **Step 4: Verify repository and sync tests.**

```bash
pnpm test:unit -- tests/unit/social-sync.test.ts
```

```bash
TEST_DATABASE_URL=postgresql://planner:planner_dev_only@127.0.0.1:5432/planner_test pnpm test:integration -- tests/integration/social-repository.test.ts
```

Expected: partial snapshots are useful data, not failed channel syncs.

- [ ] **Step 5: Commit the persistence boundary.**

```bash
git add src/lib/social/sync.ts src/lib/social/repository.ts tests/unit/social-sync.test.ts tests/integration/social-repository.test.ts
git commit -m "feat(analytics): persist partial metric snapshots"
```

### Task 6: Verify database compatibility without a migration

**Files:** Modify `tests/integration/social-analytics.test.ts` only if coverage needs an explicit legacy/new metadata case; update `docs/decisions/0005-platform-aware-social-metrics.md` if the final JSON contract changes.

- [ ] **Step 1: Test legacy rows.**

Insert a row with the existing `{ partial: true, reason: "ig_insights_unavailable" }` metadata and assert that the analytics loader renders available normalized values and derives safe statuses from platform capabilities.

- [ ] **Step 2: Test new rows.**

Insert a row with `schemaVersion: 2`, `metricStatuses`, and `failedMetrics`, then assert that the loader preserves the status detail and does not mutate the row.

- [ ] **Step 3: Run migration safety checks.**

```bash
pnpm migration-drill
```

Expected: no new migration is generated, existing from-zero and upgrade paths remain green, and the plan explicitly records “no schema migration required.”

- [ ] **Step 4: Commit compatibility evidence.**

```bash
git add tests/integration/social-analytics.test.ts docs/decisions/0005-platform-aware-social-metrics.md
git commit -m "test(analytics): verify legacy metric metadata compatibility"
```

---

## Milestone 3 — Analytics information architecture and UI

### Task 7: Remove the misleading universal metric model

**Files:** Modify `src/app/(app)/app/w/[slug]/analytics/social/page.tsx`, `social-metrics-table.tsx`, and `social-csv-export.tsx`; test `tests/unit/social-analytics-feel.test.tsx` and create `tests/unit/social-metrics-table.test.tsx`.

- [ ] **Step 1: Add UI contract tests before changing components.**

Assert that:

- Facebook’s table headers are Date, Followers, Reach, Views, Interactions;
- Facebook has no `Engaged accounts` header;
- Instagram’s detail surface includes Engaged accounts;
- the global metric selector contains only the four universal metrics;
- a legacy `?metric=engagedAccounts` request resolves safely to a universal metric;
- TikTok renders only its supported metric columns;
- CSV export includes `engagedAccounts` only for Instagram.

- [ ] **Step 2: Make the page platform-aware.**

Pass each card’s `platform` and parsed per-row metric statuses to the table and partial-data component. Use `UNIVERSAL_SOCIAL_METRICS` for the shared metric selector. Use `getSupportedSocialMetrics(platform)` for per-card summary/detail rendering. Do not render one global selector option that only applies to one card in a mixed-platform workspace.

- [ ] **Step 3: Make tables truthful and responsive.**

Render only supported columns for the current card. Keep Date and Followers as priority columns. On narrow screens use the existing accessible table pattern with an explicit overflow region or priority layout; do not silently hide the only selected metric. The table must have a human-readable accessible name, a caption or heading relationship, and a visible keyboard focus path.

- [ ] **Step 4: Separate Instagram insight presentation.**

Add an Instagram-only insight tile or secondary metric row for `Engaged accounts`, labeled as an Instagram-specific metric. Explain that it is not part of the cross-platform table. Keep the value as `—` only when Instagram data is genuinely absent, with a nearby status reason.

- [ ] **Step 5: Align CSV output with the UI.**

Keep the common CSV columns stable: date, followers, reach, views, interactions, partial/status summary. Add `engagedAccounts` only in an Instagram export and include a metadata/status column that distinguishes unsupported, no-data, and error. Do not add raw provider error text to downloads intended for workspace users.

- [ ] **Step 6: Run component tests.**

```bash
pnpm test:unit -- tests/unit/social-analytics-feel.test.tsx tests/unit/social-analytics.test.ts
```

Expected: the old universal engaged-account assertions are replaced with platform-aware assertions; no valid Instagram coverage is lost.

- [ ] **Step 7: Commit the information-architecture change.**

```bash
git add src/app/'(app)'/app/w/'[slug]'/analytics/social/page.tsx src/app/'(app)'/app/w/'[slug]'/analytics/social/social-metrics-table.tsx src/app/'(app)'/app/w/'[slug]'/analytics/social/social-csv-export.tsx tests/unit/social-analytics-feel.test.tsx tests/unit/social-analytics.test.ts
git commit -m "refactor(analytics): separate universal and platform metrics"
```

### Task 8: Refine engagement rate and partial-data communication

**Files:** Modify `social-engagement-rate.tsx`; create `social-partial-data.tsx`; modify `page.tsx`; test `tests/unit/social-analytics-feel.test.tsx`.

- [ ] **Step 1: Add presentation tests.**

Test these states:

1. `2.5%` with the sublabel `interactions / reach`;
2. `5.0%` with the sublabel `interactions / followers · fallback`;
3. unavailable when the platform has no engagement-rate capability;
4. partial data with a translated `3/4 metrics available` summary;
5. missing Views with a user-safe reason;
6. raw provider error codes are not present in rendered text.

- [ ] **Step 2: Implement the engagement card contract.**

Pass the calculation result and platform capability into the card. Display the denominator used, not a generic `engaged / followers` label. For unsupported platforms show a concise localized “Not available for this platform” state or omit the card consistently; never show a permanent unexplained em dash.

- [ ] **Step 3: Implement the partial-data notice.**

Compute available/expected counts from the platform registry and parsed statuses. Render:

```text
Partial data · 3/4 metrics available
Missing: Views
Meta could not provide this metric for this account.
```

Use a semantic status region, a visible indicator that is not color-only, and an optional details disclosure. Only show raw provider code/request ID in an operator-only diagnostic surface if an existing authorization path supports that distinction.

- [ ] **Step 4: Run focused UI tests.**

```bash
pnpm test:unit -- tests/unit/social-analytics-feel.test.tsx
```

Expected: all states pass in English fallback rendering and translated component rendering.

### Task 9: Localize and make the route resilient

**Files:** Modify `src/messages/en/analytics.json`, `src/messages/ar/analytics.json`, `loading.tsx`, `error.tsx`, `page.tsx`, `social-growth-chart.tsx`, and relevant UI components.

- [ ] **Step 1: Add catalog keys with identical shape.**

Add keys for universal/platform metrics, engagement-rate formulas, fallback explanation, partial counts, missing reasons, unsupported/no-data/error statuses, CSV headers, loading text, retry text, and the Instagram-only insight label. Use adjacent singular/many keys where counts are pluralized. Keep English and Arabic key shape identical.

- [ ] **Step 2: Remove hard-coded user-visible copy.**

Every new label, chart title, table caption, status sentence, and error message must come from `tForActive()`/`useLocaleT()`. Provider diagnostics remain technical and are translated only at the UI boundary.

- [ ] **Step 3: Verify LTR/RTL layout rules.**

Use logical spacing/alignment utilities, `text-start`/`text-end`, `ms`/`me`, `ps`/`pe`, and direction isolation for account handles, dates, URLs, IDs, and CSV values. Ensure chart labels and status disclosures remain readable in Arabic without forcing Latin metrics into RTL order.

- [ ] **Step 4: Add loading/error states.**

The loading state must reserve the page’s card/table geometry to avoid layout shift. The error state must provide a localized retry/reload action, a stable test ID, and no raw exception content. Respect reduced-motion preferences in any loading animation.

- [ ] **Step 5: Run catalog and route checks.**

```bash
pnpm test:unit -- tests/unit/i18n/catalogs.test.ts tests/unit/social-analytics-feel.test.tsx
```

Expected: catalog parity, translated UI, and fallback rendering pass.

- [ ] **Step 6: Commit the localized/resilient surface.**

```bash
git add src/messages/en/analytics.json src/messages/ar/analytics.json src/app/'(app)'/app/w/'[slug]'/analytics/social
git commit -m "feat(analytics): explain platform metric availability"
```

---

## Milestone 4 — Deterministic browser, accessibility, and visual coverage

### Task 10: Add connected analytics E2E fixtures

**Files:** Modify `src/app/api/dev/seed/route.ts` only with a test/dev-guarded option; create `tests/e2e/social-analytics-fixture.ts`; modify `tests/e2e/social-analytics.spec.ts`.

- [ ] **Step 1: Define a deterministic fixture contract.**

The fixture must create a disposable workspace state containing:

- one connected Facebook channel with follower/reach/views/interactions data and one missing metric;
- one connected Instagram channel with all four universal metrics plus engaged accounts;
- one connected TikTok channel with follower data only;
- at least three dated metric rows per channel so growth and partial states are visible.

The fixture must use fake normalized rows only. It must not create OAuth credentials, contact Meta/TikTok, or store secrets.

- [ ] **Step 2: Keep the seed route safe.**

Accept the fixture option only in the existing development/test environment guard. Return IDs and the workspace slug, never tokens or raw metadata. Make the operation idempotent and scoped to a test-specific workspace slug/email so normal E2E tests remain isolated.

- [ ] **Step 3: Add browser assertions.**

Cover:

- Facebook table excludes Engaged accounts and shows partial count/missing Views;
- Instagram shows the Instagram-only engaged-account insight;
- engagement rate shows reach basis for Facebook/Instagram and fallback basis when reach is null;
- TikTok does not show unsupported metric columns;
- the universal metric selector has exactly four choices;
- CSV download uses the platform-aware headers;
- the page is accessible to internal roles and still returns the existing denial surface for `client_reviewer`;
- loading/error/empty states remain stable.

- [ ] **Step 4: Run focused E2E.**

```bash
TEST_DATABASE_URL=postgresql://planner:planner_dev_only@127.0.0.1:5432/planner_test NODE_ENV=test pnpm test:e2e:isolated -- tests/e2e/social-analytics.spec.ts --project=chromium
```

Expected: the existing empty/auth cases and new connected-platform cases pass without conditional skips.

### Task 11: Prove responsive, keyboard, bilingual, and accessibility behavior

**Files:** Modify `tests/e2e/a11y-routes.spec.ts`, the visual route manifest/baselines, and `tests/e2e/social-analytics.spec.ts`.

- [ ] **Step 1: Add responsive checks.**

Run the route at 375, 768, 1024, and 1440px. Assert no document-level horizontal overflow, no clipped table headings, visible primary metric/filter controls, 44px minimum interactive targets, and readable body text at mobile width.

- [ ] **Step 2: Add keyboard checks.**

Tab through window/metric controls, CSV export, table links/details, and partial-data disclosure. Assert visible focus, logical order, no keyboard trap, and correct activation with Enter/Space.

- [ ] **Step 3: Add bilingual direction checks.**

Render the same fixture with English/LTR and Arabic/RTL. Assert `<html lang>`/`dir`, translated headings/statuses, correct logical alignment, isolated handles/URLs, and no clipped Arabic text.

- [ ] **Step 4: Add axe checks.**

Run the route in the existing a11y suite for Chromium, Firefox, WebKit, mobile Chrome, and mobile Safari. Assert no serious/critical violations, correct table names, chart/table relationship, status announcements, and focus-visible behavior.

- [ ] **Step 5: Update visual evidence.**

Capture deterministic desktop/mobile English and Arabic states with timestamps, IDs, and dynamic values masked according to the existing visual harness. Review the diff manually for card density, status hierarchy, table readability, chart labels, and RTL mirroring.

- [ ] **Step 6: Run browser gates.**

```bash
pnpm test:a11y
```

```bash
pnpm test:visual
```

```bash
TEST_DATABASE_URL=postgresql://planner:planner_dev_only@127.0.0.1:5432/planner_test NODE_ENV=test pnpm test:e2e:isolated -- tests/e2e/social-analytics.spec.ts
```

Expected: all required browser projects pass with no skipped required cases. Generated `next-env.d.ts`/`tsconfig.json` changes must be excluded from the feature commit.

- [ ] **Step 7: Commit browser coverage and reviewed baselines.**

```bash
git add tests/e2e/social-analytics.spec.ts tests/e2e/a11y-routes.spec.ts tests/e2e/social-analytics-fixture.ts tests/e2e/stitch-cases.ts
git commit -m "test(analytics): cover platform-aware dashboard states"
```

---

## Milestone 5 — Operations, evidence, and release

### Task 12: Update operator documentation

**Files:** Modify `docs/operations/runbook.md`, `docs/production-readiness/EXTERNAL_SERVICES_UAT.md`, and `docs/production-readiness/TEST_EVIDENCE.md`.

- [ ] **Step 1: Document the new partial-data interpretation.**

Explain:

- `unsupported`: provider/platform does not expose the metric;
- `error`: the request failed and should be investigated/retried;
- `no_data`: the provider returned no value for the selected period;
- `available`: a numeric value was persisted.

Document where operators find `failedMetrics`, `metricStatuses`, `providerErrorCode`, request IDs, logs, and Sentry events. State that raw provider error payloads are never shown to normal workspace users.

- [ ] **Step 2: Add the Rice n Spices verification procedure.**

Document the exact safe check: run one controlled sync, query only normalized metrics and sanitized `source_metadata`, confirm valid metrics persisted, confirm the failed metric is null/statused, and confirm the channel remains synced rather than being marked failed.

- [ ] **Step 3: Record evidence conventions.**

Add rows for provider partial success, Facebook/Instagram capability rendering, engagement-rate methodology, legacy metadata compatibility, and bilingual responsive/a11y checks. Leave independent-reviewer fields empty until actually performed.

- [ ] **Step 4: Commit documentation.**

```bash
git add docs/operations/runbook.md docs/production-readiness/EXTERNAL_SERVICES_UAT.md docs/production-readiness/TEST_EVIDENCE.md
git commit -m "docs(analytics): document metric availability diagnostics"
```

### Task 13: Run the complete production gate

**Files:** No product changes unless a failing gate identifies a defect; update evidence files with the exact clean SHA only after all gates pass.

- [ ] **Step 1: Remove only confirmed generated test artifacts.**

Review `git diff` for `next-env.d.ts` and `tsconfig.json`. Restore them using the repository’s normal patch workflow only when their changes are confirmed to be generated by the test runner and unrelated to the feature. Preserve any owner-authored changes.

- [ ] **Step 2: Run formatting, lint, and type checks.**

```bash
pnpm format:check
```

```bash
pnpm lint
```

```bash
pnpm typecheck
```

- [ ] **Step 3: Run unit, integration, migration, coverage, and audit gates.**

```bash
pnpm test:unit
```

```bash
TEST_DATABASE_URL=postgresql://planner:planner_dev_only@127.0.0.1:5432/planner_test pnpm test:integration
```

```bash
pnpm migration-drill
```

```bash
pnpm test:coverage
```

```bash
pnpm audit --prod
```

Expected: zero required skips, no critical/high production advisories, and applicable coverage thresholds remain green.

- [ ] **Step 4: Run the production build and browser gates.**

```bash
pnpm build
```

```bash
pnpm test:e2e:critical
```

```bash
pnpm test:e2e:isolated
```

```bash
pnpm test:visual
```

```bash
pnpm test:a11y
```

- [ ] **Step 5: Verify the exact clean commit.**

Run:

```bash
git diff --check
git status --short --branch
git rev-parse HEAD
```

Expected: the worktree is clean, the evidence records the exact HEAD SHA, and no generated file or unrelated change is included.

- [ ] **Step 6: Commit the evidence update.**

```bash
git add PRODUCTION_READINESS_TRACKER.md docs/production-readiness/TEST_EVIDENCE.md docs/production-readiness/EXTERNAL_SERVICES_UAT.md docs/operations/runbook.md
git commit -m "docs(analytics): record platform-aware release evidence"
```

### Task 14: Staged production rollout and observation

**Files:** No code changes; use deployment/runbook controls.

- [ ] **Step 1: Create a verified backup before deployment.**

Run the repository’s documented production backup procedure and record the backup ID, date, operator, and retention location without exposing credentials.

- [ ] **Step 2: Deploy the exact verified SHA.**

Use `scripts/deploy.sh <sha>` only after CI is green. Verify `/api/health`, schema readiness, container health, and logs.

- [ ] **Step 3: Observe one internal workspace first.**

For the Rice n Spices connection, perform one controlled sync. Confirm:

- valid metrics are non-null in normalized columns;
- unavailable metrics are null with `metricStatuses` and `failedMetrics`;
- `source_metadata.partial` is true when metadata reports any unsupported, error, or no-data field;
- `lastSyncedAt` advances and the connection is not incorrectly marked failed;
- the UI shows the safe explanation and does not expose the raw Meta error.

- [ ] **Step 4: Observe seven consecutive daily snapshots.**

Use the existing M4 operational observation window. Compare provider logs, Sentry events, database status, and UI output. A failed observation pauses expansion and uses the documented rollback/forward-fix path.

- [ ] **Step 5: Expand and close the release.**

After clean observation, enable the refined analytics surface for all workspaces through the normal deployment path. An independent reviewer then signs the accessibility, visual, UAT, and production evidence rows; only that reviewer can move the tracker status from `Tested` to `Verified`.

---

## Acceptance matrix

| Requirement                           | Implementation proof                                      | Test/evidence                            |
| ------------------------------------- | --------------------------------------------------------- | ---------------------------------------- |
| Rice n Spices fix isolated            | Provider commit or proof it is already in `main`          | Provider unit + integration results      |
| Valid metrics survive one failure     | Independent metric collection + partial snapshot save     | Meta provider, sync, repository tests    |
| Platform-aware capabilities           | Canonical registry used by provider, calculation, UI, CSV | `social-metrics.test.ts` + connected E2E |
| No Facebook engaged blank             | Platform table columns exclude metric                     | Component + browser assertion            |
| Instagram engaged accounts retained   | Instagram insight tile/export only                        | Component + browser assertion            |
| Reach-first engagement rate           | `denominator` returned and labeled                        | Calculation + presentation tests         |
| Partial is informative                | Count, missing metric, safe reason                        | Component + E2E + runbook                |
| Unsupported/error/no-data distinction | Typed metadata statuses                                   | Provider + integration tests             |
| Legacy compatibility                  | Parser handles old metadata                               | Integration test + no migration drill    |
| EN/AR and LTR/RTL                     | Catalog parity and logical layout                         | i18n, a11y, E2E, visual matrix           |
| Production readiness                  | Exact SHA, clean tree, all gates, staged observation      | Evidence bundle + independent sign-off   |

## Self-review of plan coverage

- Provider fix and isolated merge requirement: Tasks 0 and 4.
- Platform capability model: Tasks 1 and 2.
- Universal table cleanup and Instagram preservation: Task 7.
- Reach-first engagement rate: Tasks 3 and 8.
- Partial status improvement and safe diagnostics: Tasks 2, 4, 5, 8, and 12.
- No destructive database migration and legacy compatibility: Task 6.
- Responsive, accessible, bilingual UI: Tasks 9 and 11.
- Browser fixture and platform-specific E2E coverage: Task 10.
- Production gates, evidence, backup, staged rollout, and independent review: Tasks 12–14.
- No step relies on a new provider secret, raw production payload, unconditional test skip, or destructive database operation.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-02-platform-aware-social-analytics.md`. Two execution options:

1. **Subagent-Driven (recommended):** dispatch a fresh worker per task and review between milestones.
2. **Inline Execution:** execute the plan in this session with checkpoints after each atomic commit.
