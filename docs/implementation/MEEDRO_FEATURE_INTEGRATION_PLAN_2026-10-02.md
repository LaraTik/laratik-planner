# Meedro-informed Planner integration — full implementation plan

**Date:** 2026-10-02  
**Status:** M1 source-only UX, M2 named-watchlist management, M3 source-neutral observation seam, and M5 ranking/comparison tested; release evidence remains open
**Owner:** LaraTik Planner product/engineering  
**Source audits:** [Meedro feature audit](../audits/MEEDRO_FEATURE_AUDIT_2026-09-30.md), [workflow catalog](../audits/MEEDRO_WORKFLOW_CATALOG_2026-10-02.md), [MCP connection audit](../audits/MEEDRO_MCP_CONNECTION_2026-10-02.md), [Viral Finder audit](../audits/MEEDRO_VIRAL_FINDER_2026-10-02.md)  
**Current implementation context:** [Meedro refactor plan](MEEDRO_REFACTOR_PLAN.md)

## Implementation checkpoint — 2026-10-02

The first vertical slices are now present in the current worktree:

- Added workspace-scoped named watchlists and account membership tables in migration `0067_aberrant_bishop`.
- Added read/create watchlist routes and role-gated membership add/remove routes.
- Added a bilingual Research UI for creating named lists and assigning accounts with Radix keyboard-accessible checkboxes.
- Reused the existing source-only account registry; no provider calls, scraping, media copying, or AI credit usage were added.
- Added route/component tests and a database constraint/cascade integration test.
- Updated the migration drill so historical replay removes the new research tables before reapplying later migrations.
- Added a responsive evidence grid with keyboard-accessible search, platform
  filtering, transparent metric sorting, localized result counts, unavailable
  metric semantics, source links, collection assignment, and brief handoff.
- Added resilient client mutation handling for account and membership changes;
  optimistic membership state is restored when a network request fails.
- Added recoverable watchlist archive/restore, ordered member positions,
  keyboard up/down reordering, and explicit copy/move operations between active
  lists. Reorder requests must contain the complete current membership set.
- Extended the existing normalized post-observation table with a typed source
  discriminator, nullable research-account relationship, source-aware daily
  uniqueness, repository upserts, and workspace-scoped reads for connected or
  active research sources. Bookmark, MCP, and create-brief paths now preserve
  that source distinction.
- Added versioned, null-safe Planner-derived engagement and median-peer outlier
  metrics to the saved evidence grid. The formula is labeled `v1`, reach
  fallback is visibly partial, and fewer than two valid peer observations do
  not receive an outlier score.

Evidence captured so far: focused research unit tests 12/12, focused watchlist route/component tests 11/11, metric/evidence tests 10/10, research repository/source-seam integration 13/13, strict typecheck, lint, migration-journal validation, migration drill 5/5, full unit/build verification (460 files, 4331 tests), and a focused Chromium Research flow 3/3 including serious/critical axe checks. The full critical suite still has unrelated advisory failures. The multi-viewport/RTL visual matrix, archived-list restore UI, provider UAT, entitled AI, and independent review remain open.

## 1. Executive decision

Add the useful Meedro patterns to LaraTik Planner as a **research-to-planning loop**:

1. Discover or record competitor accounts.
2. Organize accounts into named watchlists.
3. Browse bounded, authorized post observations.
4. Filter and rank by transparent metrics.
5. Save evidence to collections.
6. Write a teardown or hand off a reviewed idea to a content brief.
7. Use optional AI for a reviewable insight, with existing agency capability and usage controls.

The first release is **source-only and manual-provider-safe**. It must work without scraping, without copying competitor media, and without assuming that a public handle is a verified provider identity. Provider-backed account discovery and post refresh are a later capability, enabled only after official API scope, token, rate-limit, retention, and UAT evidence exists.

This plan deliberately reuses the existing research shelf, collections, teardown flow, social analytics read model, AI governance, bilingual catalog, and remote Planner MCP. It does not introduce a second analytics product, a client-side scraper, or an automatic content publisher.

## 2. Outcomes and non-goals

### Outcomes

- Give a planner a fast route from competitor research to an actionable brief.
- Make the evidence behind a recommendation visible: source, observed time, sample size, freshness, and partial-data state.
- Support English and Arabic content and EN/AR application chrome with correct RTL behavior.
- Make Just Halal Supermarket the first concrete workspace use case, while allowing the same workflow for Dr Reem Reda Psychology.
- Preserve human review before anything changes a content item.
- Make provider limitations explicit instead of hiding unsupported metrics.
- Keep the feature compatible with current workspace roles, entitlements, and production-readiness evidence.

### Non-goals

- Scraping Instagram, TikTok, YouTube, or Facebook.
- Downloading or rehosting competitor videos.
- Treating an account handle as verified identity.
- Inferring missing views, likes, comments, engagement, or reach.
- Publishing directly to a social platform.
- Replacing the Command Center analytics model.
- Building a general-purpose social listening suite.
- Shipping a separate AI credit wallet for research.
- Auto-writing planner content without an explicit user action.

## 3. What is already present

| Capability                             | Existing Planner surface                                                               | Decision                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Workspace shell and grouped navigation | App shell, sidebar, topbar, Command Center                                             | Reuse. Add Research entry points only where they shorten the decision path.                                  |
| Research accounts                      | `research_watchlist_account`, `/api/research/watchlist`                                | Reuse as the canonical source-account registry. Extend additively.                                           |
| Evidence organization                  | `research_bookmark`, `research_collection`                                             | Reuse for saved posts and research themes.                                                                   |
| Teardowns                              | Notes-only teardown service and panel                                                  | Reuse. Add structured optional fields only when they improve the brief handoff.                              |
| Social observations                    | `social_post_observation`, `social_profile_daily_metric`                               | Extend the existing authorized read model for provider observations; do not create a second analytics store. |
| AI                                     | `AI_CAPABILITY_METADATA`, `loadEnabledCapabilities`, budget reservation/reconciliation | Reuse. Add a capability only with entitlement, UI, audit, tests, and docs together.                          |
| Planner MCP                            | `laratik_planner_list_research`                                                        | Reuse as read-only. Extend only with normalized, permission-filtered records.                                |
| Localization                           | `src/messages/{en,ar}/common.json`, locale resolver, direction-aware inputs            | Reuse. No hard-coded new user-facing copy.                                                                   |
| Readiness process                      | tracker, migration drill, bilingual/a11y/visual evidence                               | Required for every user-facing milestone.                                                                    |

## 4. Product architecture

### 4.1 The canonical research loop

```text
Account source
  -> Watchlist membership
  -> Authorized observation snapshot
  -> Filter / sort / compare
  -> Bookmark into collection
  -> Teardown with provenance
  -> Create brief proposal
  -> Human review
  -> Planner content item
```

The loop has two independent enrichment paths:

- **Scheduled observation refresh:** provider/API work. It updates bounded normalized snapshots and never spends AI credits.
- **AI insight generation:** optional interpretation of selected normalized evidence. It reserves and reconciles existing AI usage, returns a preview, and never writes automatically.

Keeping those paths separate prevents a weekly refresh from unexpectedly consuming AI budget and makes provider failures distinguishable from AI failures.

### 4.2 Product surfaces

Keep the existing route `/app/w/[slug]/research` as the primary surface. Add progressive sections rather than a second research application:

1. Research header: title, workspace scope, freshness, one primary action.
2. Watchlist summary: named lists, account status, stale/unsupported counts.
3. Observation toolbar: platform, source, date, metric, outlier, analyzed-only, search.
4. Result grid/list: provider evidence cards with metrics and provenance.
5. Evidence actions: bookmark, add to collection, teardown, create brief.
6. Account drawer/detail: identity, source URL, latest snapshot, capabilities, refresh state.
7. Collections and teardowns: existing surfaces, improved cross-links.

Do not add a second permanent page-local navigation rail. The sidebar remains application navigation; a compact in-page anchor strip is optional only when the page becomes long.

## 5. Recommended decisions from the grill-me review

These are the defaults to implement unless a product owner intentionally changes them.

| Decision                  | Recommendation                                                                                                                                    | Reason                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Provider data timing      | Ship source-only/manual mode first; add provider adapters after UAT                                                                               | Delivers useful workflow immediately and avoids unauthorized scraping or false data.                |
| Watchlists vs collections | Watchlists group accounts; collections group saved posts/evidence                                                                                 | They answer different questions and match the existing schema.                                      |
| Account identity          | Canonical key is `(platform, providerAccountId)` when available; `(workspace, platform, normalizedHandle)` only for manual source rows            | Handles can change or collide across providers.                                                     |
| Observation storage       | Extend `social_post_observation` with a bounded research-source relationship and source discriminator, after caller audit                         | Meets the “one authorized analytics read model” rule without polluting connected-channel semantics. |
| AI insight billing        | Use existing capability and reservation/reconciliation services; add `research_insights` only if product wants a separately toggleable capability | One budget system is safer than a second credit wallet.                                             |
| Trial/experimental media  | Model as nullable provider capability/status; never assume availability                                                                           | Trial Reels and similar products vary by account, endpoint, permission, and plan.                   |
| Manual review             | Create brief is a proposal/preview; user confirms before insert or update                                                                         | Protects existing planning data and satisfies the no-implicit-write contract.                       |
| Roles                     | Managers/planners manage accounts, lists, refreshes, and handoffs; reviewers can view/save/teardown where current research policy permits         | Matches current authorization and keeps destructive/provider actions restricted.                    |
| First business case       | Just Halal Supermarket                                                                                                                            | It has clear competitor, delivery, app-download, halal-trust, and local-discovery questions.        |
| Second business case      | Dr Reem Reda Psychology as a separate workspace collection/context                                                                                | Avoids mixing supermarket commerce signals with clinical/psychology communication.                  |
| Languages                 | EN/AR first, with content direction per field                                                                                                     | Arabic is an explicit user requirement; no partial German UI should be invented.                    |

## 6. Jobs to be done

### Just Halal Supermarket

- Find grocery and delivery accounts whose short-form videos outperform their audience size.
- Identify recurring hooks: price, freshness, convenience, family meals, Ramadan/Eid, local availability, and delivery speed.
- Compare English and Arabic content patterns without assuming identical audience behavior.
- Turn a winning pattern into a Just Halal brief without copying the competitor’s media or wording.
- Promote app download, delivery conversion, trust, and repeat order behavior.

### Dr Reem Reda Psychology

- Find educational formats that earn attention without sensationalizing mental-health topics.
- Separate qualified educational content from unsupported diagnosis or fear-based claims.
- Record evidence and create a reviewed, ethical brief with clear disclaimers where needed.
- Keep the psychology brand’s research collection and tone rules separate from supermarket content.

## 7. User flows

### Flow A — add an account

1. Planner opens Research.
2. Selects `Add account`.
3. Searches by handle or descriptive text if an authorized provider search exists; otherwise enters source URL and handle manually.
4. Sees identity confidence: source-only, provider-matched, unsupported, or error.
5. Confirms the account and selects one or more watchlists.
6. The account is saved with provenance and no provider claim unless verified.

Required safeguards:

- Normalize handle, preserve original source URL, and prevent active duplicates.
- Show platform and account identity together.
- Do not represent semantic search as category truth; a search for “halal” may return a relevant-looking but unverified result.

### Flow B — create and manage a watchlist

1. Planner creates a named list such as `UK halal grocery competitors` or `Delivery app references`.
2. Adds existing accounts to the list.
3. Reorders or moves members without changing the canonical account registry.
4. Archives a list or membership without deleting evidence.
5. Sees list freshness and provider coverage.

### Flow C — find a winning post

1. Planner selects a watchlist or all research accounts.
2. Applies platform, content type, date, views, engagement, likes, comments, and outlier filters.
3. Sorts by outlier, engagement, views, or latest.
4. Opens a result card to see metrics, source, observed time, missing fields, and sample caveats.
5. Saves it to a collection or opens a teardown.

### Flow D — teardown and brief handoff

1. Planner writes or requests a reviewable teardown.
2. Teardown stores only normalized evidence and planner-authored notes; raw provider bodies are not exposed.
3. Planner chooses `Create brief`.
4. A preview maps evidence to title, format, planned date, and short brief.
5. Planner edits the preview and confirms.
6. A normal content item is created through the existing service path.

### Flow E — scheduled refresh

1. A server-side job selects active watchlists that are due.
2. It checks provider capability, connection status, account identity, and rate budget.
3. It fetches only the bounded observation window allowed by the provider contract.
4. It writes idempotent snapshots and a refresh result.
5. It marks the account fresh, partial, stale, unsupported, or error.
6. It never runs client-side fetches and never spends AI credits.

### Flow F — AI insight

1. User selects one or more normalized observations.
2. Server checks role, capability, plan entitlement, daily budget, monthly counters, and input size.
3. Server sends a redacted context manifest and normalized evidence to the provider.
4. User receives a preview with evidence references and uncertainty labels.
5. User may accept into a teardown or brief; no automatic database write occurs.
6. Usage is recorded and reconciled through the existing governance path.

## 8. Data model plan

### 8.1 Existing tables to keep

- `research_watchlist_account`: canonical workspace-scoped account registry.
- `research_collection`: saved evidence grouping.
- `research_bookmark`: saved observation link.
- `research_teardown`: reviewable analysis artifact.
- `social_post_observation`: normalized provider post observations.
- `social_profile_daily_metric`: authorized profile snapshots.

### 8.2 Add named watchlists

The current account registry behaves as one implicit list. Meedro-style named lists need a separate entity because membership, ordering, and classification are not account identity.

Recommended tables:

```text
research_watchlist
  id, workspace_id, created_by, name, description,
  share_scope, archived_at, created_at, updated_at

research_watchlist_member
  watchlist_id, account_id, position, created_at, updated_at
```

Constraints:

- Both rows must belong to the same workspace; enforce in the service and migration constraints where practical.
- Unique active membership on `(watchlist_id, account_id)`.
- Non-negative `position`.
- Archive is recoverable; evidence remains intact.
- At most the plan-entitled number of active watchlists, enforced server-side with a transaction.

Use `research_collection` for posts/evidence, not as a substitute for account watchlists.

### 8.3 Extend account identity additively

Add nullable provider fields to `research_watchlist_account` only when a provider-backed account has been verified:

- `providerAccountId`
- `providerAccountName` if the provider distinguishes it from display name
- `identityVerifiedAt`
- `identitySource` / capability marker
- `lastDiscoveryAt`
- `lastRefreshAt`
- `freshnessStatus`

Do not put mutable follower/post counts on the canonical account row. They belong to snapshots.

Keep the current `(workspace, platform, normalized handle)` active uniqueness for manual rows. Add a provider identity uniqueness constraint scoped to the provider and active account records after duplicate reconciliation is designed.

### 8.4 Account snapshots

Add an immutable, bounded account snapshot table when provider-backed account discovery is approved:

```text
research_account_snapshot
  id, account_id, observed_at, provider, provider_account_id,
  display_name, biography, follower_count, following_count, post_count,
  provider_api_version, provider_request_id, response_hash,
  source_metadata, completeness, created_at
```

Rules:

- Counts are nullable and non-negative; unavailable is not zero.
- Store the provider request ID and response hash for audit, never the raw provider response body.
- Keep biography optional and retention-limited because it is mutable user-facing text.
- Do not store competitor media binaries.

### 8.5 Competitor post observations: resolve the schema seam first

The implementation now keeps `social_post_observation` as the single normalized
read model while allowing either a connected channel or a registered research
account as its source. A typed `source_kind` and database check prevent a row
from having zero or two sources. A competitor account in the research registry
is never treated as a connected publishing channel.

Recommended approach:

1. Audit every caller of `socialPostObservations` and every foreign key/query that assumes `socialChannelId` is non-null. **Done for the current caller set.**
2. Add a nullable `research_watchlist_account_id`. **Implemented in migration `0068_source_neutral_post_observations`.**
3. Add a source check requiring exactly one of `social_channel_id` or `research_watchlist_account_id`. **Implemented with `source_kind`.**
4. Keep the same normalized metric columns and provider constraints. **Preserved.**
5. Replace the current broad unique key with source-aware uniqueness:
   - connected source: `(social_channel_id, provider, external_post_id, observation_date)`;
   - research source: `(research_watchlist_account_id, provider, external_post_id, observation_date)`.
6. Preserve existing connected-channel behavior and indexes. **Connected sync upserts remain unchanged.**
7. Update all service reads to use a typed source discriminator. **Bookmark, MCP, and create-brief reads are source-aware.**

This is the key migration risk. Do not create a parallel `competitor_post` analytics table unless this audit proves that the existing model cannot be safely extended and the product owner explicitly approves a deviation from the current architecture rule.

### 8.6 Derived metrics

Keep raw provider metrics as the source of truth. Calculate the following in a read service or SQL view:

- `engagementRate`: only when denominator and numerator are known.
- `outlierScore`: defined formula, versioned, and labeled as Planner-derived.
- `viewsPerFollower`: only when follower snapshot and views are both present.
- `performanceBand`: a display label, not a provider fact.

Never turn `-1`, missing, private, or unsupported provider values into zero. Preserve `null` with a visible unavailable state.

## 9. Provider and refresh architecture

### 9.1 Capability contract

Create a small server-side capability registry, not a general abstraction framework:

```text
providerCapability(provider, operation)
  account_search
  account_snapshot
  post_observations
  post_metrics
  trial_or_experimental_media
  permalink_open
```

Each capability records whether it is:

- unavailable,
- configured but untested,
- authorized/read-only,
- temporarily rate-limited,
- unsupported for this account,
- disabled by product policy.

The UI must render the state and reason in user language. Provider error payloads and credentials stay server-side.

### 9.2 Adapter operations

Implement only the operations needed by the current slice:

- `discoverAccounts(query, provider)`
- `resolveAccount(handle, provider)`
- `fetchAccountSnapshot(account)`
- `fetchRecentPostObservations(account, window)`
- `probeCapabilities(account)`
- `refreshWatchlist(watchlistId)`

Each adapter must return normalized data plus provenance metadata. The adapter must not expose raw responses to UI, MCP, or AI context.

### 9.3 Refresh rules

- Server-side only.
- Idempotent by provider post ID and observation date.
- Bounded recent window and bounded rows per account.
- Exponential retry for transient failures, with a hard retry ceiling.
- Respect provider rate limits and connection status.
- Record partial completion per account; one bad account must not erase good results.
- Keep manual/source-only rows usable when no provider capability exists.
- Scheduled refresh is separate from AI usage.

### 9.4 What must be proved before provider rollout

- Official API terms and permitted competitor/public-account use case.
- App configuration and callback evidence.
- Exact scopes and least-privilege token behavior.
- Account discovery identity mapping.
- Read-only metrics semantics for each provider.
- Rate limits, retry behavior, and retention window.
- Trial/experimental content availability and plan restrictions.
- Revocation and re-auth behavior.
- Sanitized UAT evidence on the exact clean commit.

## 10. API and service plan

Keep the existing `/api/research/watchlist` endpoint compatible while adding narrowly scoped endpoints.

### Phase 1 endpoints

- Existing `GET/POST/DELETE /api/research/watchlist` remains source-only.
- `POST /api/research/watchlists` creates a named list.
- `GET /api/research/watchlists` lists accessible lists and freshness summary.
- `POST/DELETE /api/research/watchlists/[id]/members` changes membership.
- `GET /api/research/observations` reads normalized observations and derived metrics.
- `POST /api/research/bookmarks` reuses existing bookmark behavior.
- `POST /api/research/teardowns` reuses existing teardown behavior.
- `POST /api/research/brief-preview` returns a proposal only; it does not insert content.

### Phase 2 endpoints

- `GET /api/research/discovery` searches an enabled provider or returns explicit unsupported state.
- `POST /api/research/accounts/[id]/refresh` queues a server-side refresh for authorized roles.
- `GET /api/research/accounts/[id]/snapshots` reads normalized snapshots.
- `POST /api/research/watchlists/[id]/refresh` queues a bounded refresh.

### Phase 3 endpoint

- `POST /api/research/insights` performs an entitled, budgeted AI preview.

All endpoints must use workspace context resolution, role policy, Zod validation, mutating headers where relevant, structured stable error codes, and no raw provider/token fields.

## 11. AI integration

Start without a new AI capability if `trend_radar` can safely own the first research insight surface. Add a dedicated `research_insights` capability only if the product needs separate enablement, reporting, or plan limits.

If a new capability is approved, update all of these together:

- `AiCapabilityId` and metadata.
- Agency AI settings and plan allowlist.
- Server route allowlist and input/output schemas.
- `loadEnabledCapabilities` and governance tests.
- Usage event context manifest.
- EN/AR labels and hints.
- Workspace status and research UI.
- Documentation and MCP/security review.

AI context should contain only selected normalized evidence:

- account/platform identity,
- published date,
- available metrics,
- derived metric formula/version,
- source/provenance ID,
- planner-selected notes.

Do not send raw tokens, credentials, provider payloads, private planner notes outside the intended context, or copied competitor media.

## 12. UX and visual implementation plan

This section applies the requested UI/UX review constraints to the existing LaraTik design system.

### 12.1 Layout

- Keep the persistent sidebar and topbar ownership model.
- Use a page header with one dominant CTA, likely `Add account` or `Create watchlist` depending on empty state.
- Use a compact toolbar for source, platform, sort, search, date, and active-filter count.
- Use a responsive result grid on desktop and a single-column card stack on mobile.
- Use a filter drawer/bottom sheet on narrow screens; do not force a wide filter sidebar.
- Never introduce page-wide horizontal scrolling. A data table may use a local, labeled scroller only when a card layout cannot preserve the comparison.
- Virtualize or paginate result sets above 50 rows.

### 12.2 Result card anatomy

Each card should expose, in this order:

1. Account identity and platform, with `bdi` for handles.
2. Source freshness/status badge.
3. Media type and published date.
4. Primary metric and outlier/engagement label.
5. Secondary metrics with unavailable states.
6. Short evidence/provenance line.
7. Actions: Save, Teardown, Create brief, Open source.

Avoid autoplay. Reserve media aspect ratio before loading previews. If preview media is unavailable, show a meaningful fallback with source link.

### 12.3 States

Implement explicit states for:

- initial empty research shelf,
- no matching filters,
- loading account list,
- loading observations,
- stale data,
- partial refresh,
- unsupported provider,
- provider permission error,
- rate limited,
- unavailable metric,
- archived account/list,
- AI disabled or quota exhausted,
- brief preview awaiting confirmation.

Errors must be announced with `role="alert"` or `aria-live`; status colors must have text/icon meaning and not rely on color alone.

### 12.4 Accessibility and responsive acceptance

- Visible keyboard focus on every interactive control.
- 44px minimum touch targets.
- Keyboard alternative for reorder/move operations.
- Labels and descriptions for all filters and actions.
- Descriptive alt text for meaningful thumbnails; decorative icons hidden.
- No hover-only actions.
- Reduced-motion support.
- At least 4.5:1 text contrast.
- 16px or larger mobile body text.
- Test 375, 768, 1024, 1280, and 1440+ widths.
- Test EN/LTR and AR/RTL with long Arabic labels and mixed-direction handles/URLs.
- Use logical CSS properties and `DirAwareInput`/`DirAwareTextarea` where user text is editable.

### 12.5 Arabic content quality

Provide native Arabic UI labels and review the Just Halal content glossary. Keep hashtags, handles, URLs, IDs, and provider values direction-safe. Arabic marketing examples should not be literal word-for-word translations when a culturally natural version is better.

## 13. Just Halal content strategy built into the workflow

The research workflow should make the following brief templates easy to create:

- **Price/value:** weekly halal basket, family bundle, price comparison with verified current pricing.
- **Freshness/trust:** butcher counter, produce arrival, halal certification/process explanation without unsupported claims.
- **Convenience:** “what can arrive tonight?”, delivery radius, app order walkthrough, reorder routine.
- **Recipe/use case:** 15-minute family meal, lunchbox, Eid/Ramadan preparation, pantry restock.
- **Community:** local customer stories, neighborhood spotlight, bilingual staff/community moments with consent.
- **App conversion:** one problem, one in-app path, one download CTA, one delivery benefit.

Each generated brief should include a review prompt: verify price, availability, delivery area, halal claim, health claim, and image consent before publishing.

## 14. Dr Reem Reda guardrails

Use a separate collection or workspace context with stricter editorial fields:

- educational claim source,
- clinician review status,
- audience sensitivity,
- crisis/resource disclaimer requirement,
- prohibited sensational framing,
- no diagnosis or personalized treatment from a social trend.

The same observation UI can be reused, but templates, labels, and review checks must not mix with supermarket commerce defaults.

## 15. Entitlement and role matrix

| Action                          |          Workspace manager |            Content planner |                      Content reviewer | Client reviewer |
| ------------------------------- | -------------------------: | -------------------------: | ------------------------------------: | --------------: |
| View research                   |                        Yes |                        Yes |                   Current policy: yes |   No by default |
| Add/archive source account      |                        Yes |                        Yes |                                    No |              No |
| Create/archive named watchlist  |                        Yes |                        Yes |                                    No |              No |
| Add/remove watchlist membership |                        Yes |                        Yes |                                    No |              No |
| Trigger provider refresh        |                        Yes |                        Yes |                                    No |              No |
| Save/bookmark/collection        |                        Yes |                        Yes |                                   Yes |   No by default |
| Write teardown                  |                        Yes |                        Yes |          Yes if current policy allows |              No |
| Request AI insight              |                        Yes |                        Yes |           Policy decision; default no |              No |
| Preview/create brief            |                        Yes |                        Yes | Review-only unless explicitly granted |              No |
| Publish                         | Existing publishing policy | Existing publishing policy |                                    No |              No |

Any role change must update policy tests, route tests, page guards, and bilingual copy together.

## 16. Delivery milestones

### M0 — decision and contract lock

Deliverables:

- Confirm source-only first and named-watchlist model.
- Complete `social_post_observation` caller/schema seam audit.
- Define provider capability matrix and retention limits.
- Define acceptance fixtures for Just Halal and Dr Reem.

Exit criteria:

- No unresolved provider legality/scope blocker.
- Migration strategy accepted before schema changes.
- Product owner signs the recommendation table or records deviations.

### M1 — source-only research UX

Deliverables:

- Improve current Research page with search/filter/sort shell and explicit source-only states.
- Keep manual account add, bookmark, collections, teardown, and brief preview.
- Add account status/freshness fields only where they are meaningful without provider data.

Exit criteria:

- A planner can manually add a Just Halal competitor, save evidence, write a teardown, and preview a brief without provider credentials.
- EN/AR, RTL, keyboard, axe, visual, empty/loading/error evidence exists.

### M2 — named watchlists

Deliverables:

- Add `research_watchlist` and membership tables.
- Add transaction-safe entitlement checks.
- Add reorder/move/copy semantics with keyboard alternative.

Exit criteria:

- Workspace isolation, archive behavior, duplicate protection, and role matrix pass integration tests.
- Migration drill has forward, compatibility, rollback, from-zero, and upgrade evidence.

### M3 — observation read model and brief handoff

Deliverables:

- Complete the competitor-source seam audit.
- Extend the authorized observation read model if approved.
- Add transparent derived metric service and missing-value semantics.
- Add filter/sort/bookmark/collection/teardown/brief-preview paths.

Exit criteria:

- No raw provider bodies or guessed metrics reach UI/MCP.
- Metrics include period, source, freshness, sample size, and partial-data state.

### M4 — provider adapter and controlled refresh

Deliverables:

- Implement the first approved provider adapter.
- Add account discovery, account snapshot, bounded post refresh, capability probing, and server-side queue/job.
- Add provider error, stale, partial, unsupported, and re-auth states.

Exit criteria:

- Read-only UAT passes with sanitized evidence.
- No client-side scraping or media copying.
- Rate-limit and retry tests pass.

### M5 — ranking and comparison

Deliverables:

- Versioned outlier and engagement calculations.
- Sort/filter parity with Meedro-inspired controls.
- Compare selected observations without inventing unavailable values.

Exit criteria:

- Deterministic ranking fixtures cover nulls, ties, negative provider sentinel values, small audiences, and partial rows.

### M6 — entitled AI insight

Deliverables:

- Reuse `trend_radar` or add `research_insights` only if justified.
- Add preview/accept flow, budget reservation/reconciliation, audit context manifest, and failure handling.

Exit criteria:

- Disabled capability, plan limit, daily limit, provider error, and retry behavior are tested.
- Accepting an insight is explicit and auditable.

### M7 — MCP and release hardening

Deliverables:

- Extend `laratik_planner_list_research` only if consumers need named lists, observation summaries, or provenance links.
- Update `docs/api/mcp.md`, `docs/api/README.md`, `docs/api/mcp-evaluation.xml`, maintenance docs, tests, and evidence.
- Run full readiness gates.

Exit criteria:

- MCP remains read-only and permission-filtered.
- Exact clean commit is verified.
- Tracker and evidence bundle are updated.

## 17. File-level implementation map

Expected touch points, subject to M0 audits:

### Database and services

- `src/lib/db/schema/research.ts`
- `src/lib/db/schema/social-analytics.ts`
- `src/lib/db/schema/index.ts`
- `src/lib/db/migrations/` and migration journal
- `src/lib/research/` services, selectors, metrics, provenance, and refresh orchestration
- `src/lib/social/` provider capability and normalized adapter code
- `src/lib/entitlements/` only if a new resource/capability is required
- `src/lib/ai/` only if `research_insights` is approved

### Routes and UI

- `src/app/(app)/app/w/[slug]/research/page.tsx`
- `src/app/api/research/`
- `src/components/workspace/research-watchlist.tsx`
- `src/components/workspace/research-collections.tsx`
- `src/components/workspace/research-teardown-panel.tsx`
- new result/filter/account-detail components only where existing components cannot be reused
- `src/components/forms/` for direction-aware fields and accessible form patterns
- `src/components/app-shell/` only for a concise Research entry point or attention badge

### Localization and documentation

- `src/messages/en/common.json`
- `src/messages/ar/common.json`
- `docs/content/` for brief/format contract changes
- `docs/api/mcp.md`
- `docs/api/README.md`
- `docs/api/mcp-evaluation.xml`
- `docs/operations/mcp-maintenance.md`
- `docs/production-readiness/` evidence files
- `PRODUCTION_READINESS_TRACKER.md`
- `PORT_NOTES.md` for material deviations

### Tests

- unit: normalization, schemas, derived metrics, provider capability states, role/entitlement helpers
- integration: migrations, workspace isolation, watchlist membership, refresh idempotency, usage reservation
- e2e: research journeys in EN/AR, LTR/RTL, empty/partial/error states
- visual/a11y: the changed Research route at all required viewports and themes
- MCP contract/evaluation tests if the tool response changes

## 18. Test and evidence matrix

| Area          | Minimum evidence                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------- |
| Database      | `pnpm migration-drill`, from-zero and upgrade, rollback/compatibility notes, backup evidence            |
| Authorization | Every route and service tested with manager, planner, reviewer, client reviewer, other workspace        |
| Data quality  | Null metrics, provider sentinel values, stale/partial snapshots, duplicate identity, changed handle     |
| Refresh       | Idempotency, retry ceiling, rate limit, provider error, revoked connection, partial account failure     |
| AI            | Capability off, plan off, daily/monthly limit, reservation/reconciliation, explicit accept, audit event |
| UI            | EN/AR, LTR/RTL, 375/768/1024/1280/1440+, keyboard, focus, axe, light/dark/system, loading/empty/error   |
| MCP           | Permission filtering, stable schema, no raw bodies/tokens/notes, transport and scope regression         |
| Production    | `pnpm verify`, exact clean SHA evidence, tracker update, release-readiness bundle                       |

## 19. Rollout and rollback

1. Ship schema and services behind a disabled feature/capability.
2. Run migration drill and backup before production migration.
3. Enable source-only UI for internal workspace managers.
4. Seed no competitor rows automatically; add only user-confirmed source references.
5. Enable provider discovery for one approved provider/account set after UAT.
6. Monitor refresh failure, rate limits, latency, storage, and user-created brief handoffs.
7. Expand by workspace after evidence review.

Rollback requirements:

- Disable provider capability without deleting source rows or evidence.
- Stop refresh jobs safely and preserve last-known snapshots with stale status.
- Keep old read paths compatible with new nullable fields.
- Reverse schema only through a reviewed migration after backup and dependency audit; never delete research evidence as a rollback shortcut.

## 20. Risks and mitigations

| Risk                                                                        | Mitigation                                                                          |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Provider terms or permissions do not allow competitor research              | Keep source-only mode; do not ship provider adapter until approved.                 |
| Handle changes or identity collision                                        | Use provider IDs when verified; retain source URL and identity confidence.          |
| Existing analytics callers break when observations support research sources | Perform caller audit first; add typed source discriminator and compatibility tests. |
| Users read outlier scores as guarantees                                     | Show formula/version, sample size, period, and “Planner-derived” label.             |
| Missing provider values are interpreted as zero                             | Nullable schema, explicit unavailable UI, non-negative constraints.                 |
| AI leaks raw/private context                                                | Redacted context manifest, server-only provider call, contract tests.               |
| Arabic layout breaks dense filters/cards                                    | Mobile-first card layout, logical CSS, RTL visual evidence, native Arabic review.   |
| Watchlist sprawl increases storage/cost                                     | Plan limit, bounded refresh window, archive, retention policy.                      |
| Research feature becomes a publishing system                                | Keep Create brief as a reviewed proposal and reuse existing publishing gates.       |

## 21. Open decisions to confirm before coding M2+

These are the only product decisions that materially change the implementation. Recommended defaults are already stated above.

1. Should provider-backed competitor research be enabled for Meta/TikTok in v1, or remain source-only until external approval? **Recommended:** source-only first.
2. Should reviewers be allowed to create AI insights? **Recommended:** no by default; allow read/save/teardown only.
3. Should `trend_radar` own research AI, or should the product introduce `research_insights`? **Recommended:** reuse `trend_radar` until separate reporting/limits are required.
4. Which provider is the first controlled UAT target? **Recommended:** the provider with an approved read-only account/post-insights path, not the provider with the most attractive UI.
5. What is the retention window for competitor observations? **Recommended:** bounded recent window documented per provider and plan.
6. Are named watchlists plan-limited separately from collections? **Recommended:** yes, with a small explicit limit and archive path.

## 22. Definition of done

The feature is ready for release only when:

- A planner can complete the full manual research-to-brief loop for Just Halal.
- A separate Dr Reem collection/context demonstrates the ethical template and does not mix with supermarket copy.
- Every provider-backed metric has source, freshness, period, sample size, and missing-data semantics.
- No scraping, media copying, raw provider body, credential, or unapproved publishing path exists.
- EN/AR catalogs are equal in shape and the Research route works in LTR/RTL.
- Roles, workspace isolation, entitlements, AI governance, and MCP filtering are tested.
- Required migration, verification, browser, a11y, visual, and UAT evidence is attached to the exact clean commit.
- `PRODUCTION_READINESS_TRACKER.md` records what is complete, what remains open, and who may assign `Verified`.

## 23. First implementation slice

The smallest useful slice to code next is **M1 source-only research UX plus named-watchlist preparation**:

1. Improve the current Research page toolbar and empty/loading/error states.
2. Add named watchlist schema and membership service without provider refresh.
3. Keep the existing manual account endpoint as a compatibility path.
4. Add bookmark → teardown → brief-preview handoff using existing services.
5. Add Just Halal and Dr Reem fixture scenarios.
6. Verify EN/AR, RTL, keyboard, axe, visual, integration, and migration evidence.

Defer the `social_post_observation` source-extension migration until its caller audit is complete. That is the one place where a seemingly small competitor feature could damage connected-channel analytics if implemented prematurely.
