# Postgres Best-Practices Audit — `laratik-planner` (2026-08-20)

> **Author:** production-readiness Postgres audit, against the Supabase Postgres best-practices skill (categories 1–8).
> **Scope:** all 4 SQL migrations (`src/lib/db/migrations/0000`–`0003`), the Drizzle pool config (`src/lib/db/index.ts`), and the hot query paths in `src/lib/*` services (auth, content, deliveries, publishing, discussions, notifications, workspaces).
> **Method:** line-level read of every migration + service file, cross-referenced to the 8 categories of the skill.
> **Status legend:** ✅ matches best practice; 🟡 drift / improvement opportunity; ❌ missing; ⚠️ risk worth noting.

---

## 0. Verdict

The schema and query patterns are **mature and well-engineered** for a v1 single-agency deployment. The migrations are careful — every table has the right FK indexes, partial unique indexes for soft-delete + state combos, and rich CHECK constraints enforcing the state machine. Concurrency uses `pg_advisory_xact_lock` correctly in the three places it matters (bootstrap, rate-limit, invitation accept). The pool config is appropriate for a single VPS.

**No critical findings.** The main improvement opportunities are:

- Hot-path N+1 risk on `(app)/app/page.tsx` (My Work page joins 4 tables but uses `.limit(50)` without a covering index)
- Connection pool sizing for future horizontal scale (currently `max: 10` for a single VPS — fine now, needs PgBouncer before multi-instance)
- `outbox_event.attempt_count` and `last_error` should be queryable for monitoring (no index on `(attempt_count DESC) WHERE processed_at IS NULL` for failed-event alerts)
- `outbox_event.payload` is `text` storing `jsonb`-shaped data — works but loses GIN-indexability for future payload queries
- No `pg_stat_statements` extension enabled — leaves "find my slowest query" blind
- A few migrations use `gen_random_uuid()` for primary keys but don't have a `created_at` index paired with PK for "list newest" queries

No migration has a missing FK index. No service file uses an unsafe query pattern. No N+1 confirmed (the ones I traced are joined or pre-fetched). The audit's role is to point out _opportunities_, not _defects_.

---

## 1. Query Performance (CRITICAL)

### ✅ Indexes on FK columns

Every foreign key has a corresponding btree index. Confirmed by inspecting the migration tail and cross-referencing with `src/lib/db/schema/*.ts` (which Drizzle derives from the migration):

- `account.user_id` → `account_user_idx`
- `agency_membership.agency_id + user_id` (composite) → `agency_membership_pk` + secondary on `user_id`
- `invitation.agency_id, .email` → `invitation_agency_email_idx`
- `content_item.workspace_id, .planned_publish_at` (composite) → `content_item_workspace_planned_idx`
- `notification.user_id, .read_at, .created_at DESC` (composite) → `notification_user_read_created_idx`
- `delivery_version.content_item_id, .version_number` (composite) → `delivery_version_unique`
- `publication_record.content_item_channel_id` (unique) → `publication_record_channel_unique`

### ✅ Partial indexes for soft-delete + state combos

The migration uses `WHERE archived_at IS NULL` partial indexes where it matters:

- `social_channel_workspace_active_idx` — only active channels
- `content_item_designer_status_idx` and `_owner_status_idx` — only non-archived items
- `invitation_pending_unique` — only pending invites (per-agency email unique when pending)
- `pillar_active_name_unique` and `template_active_name_unique` — case-insensitive name uniqueness for non-archived rows
- `outbox_unprocessed_idx` — only unprocessed outbox events
- `approval_request_pending_unique` — only pending approval requests

This is the right pattern: partial indexes keep the index hot, the planner doesn't have to chase soft-deleted rows.

### 🟡 My Work query (hot path) — potential N+1 / missing covering index

`src/app/(app)/app/page.tsx:26-51` (read earlier in the session) does:

```ts
const myItems = await db
  .select({...9 columns...})
  .from(contentItems)
  .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId))
  .where(
    and(
      isNull(contentItems.archivedAt),
      or(
        eq(contentItems.contentOwnerId, userId),
        eq(contentItems.designerId, userId),
        eq(contentItems.contentReviewerId, userId),
        eq(contentItems.internalCreativeReviewerId, userId),
        eq(contentItems.clientReviewerId, userId),
      ),
    ),
  )
  .orderBy(desc(contentItems.plannedPublishAt))
  .limit(50);
```

- The existing `content_item_owner_status_idx` covers `content_owner_id, status WHERE archived_at IS NULL` — but the planner has to evaluate 5 OR'd equality checks on different columns. With `LIMIT 50 ORDER BY planned_publish_at DESC`, Postgres will likely choose to scan and sort, or use a bitmap-OR of 5 partial indexes.
- **Recommendation:** add a covering index that matches the actual filter pattern. Two viable shapes:
  1. **Five separate partial indexes** (one per assignee role) and let the planner bitmap-OR them — most flexible, most storage.
  2. **One composite btree on `(planned_publish_at DESC)` with an INCLUDE** of the assignee columns — best for the read pattern but big.
  3. **One covering index per role, but with the planner hint** to use them. The Drizzle code would need to express the OR as a UNION across 5 queries if you want to force the planner.
- **Severity:** 🟡 (not a bug — `LIMIT 50` is small enough that even a seq scan on a few hundred items is fine; only matters at scale).

### 🟡 Hot workspace queries — verify with EXPLAIN

`src/lib/auth/policy.ts` has several queries that are evaluated on **every request**:

- `activeAgencyId()` (line 210): `SELECT id FROM agencies WHERE singleton_key = true LIMIT 1` — singleton, fine
- `isAgencyAdmin(actor, agencyId)` (line 41): `SELECT is_agency_admin FROM agency_membership WHERE agency_id = ? AND user_id = ? AND status = 'active' LIMIT 1` — uses the `agency_membership_pk` (agency_id, user_id) index, fine
- `canAccessWorkspace(actor, workspaceId)` (line 90): 1 + 1 + 1 queries per call (resolve workspace, then isAgencyAdmin, then isWorkspaceMember) — **could collapse to 1 query** with a single SELECT + JOIN
- `canAccessInternalWorkspace` / `canAccessClientWorkspace` / `hasWorkspaceRole` (line 120): same 3-query pattern

The `(app)/app/page.tsx` layout calls `activeAgencyId`, `isAgencyAdmin`, `listNotificationsForUser`, `countUnreadNotifications` — that's 4 queries on every page load. The first 2 are O(1) with the right index; the notification queries are index-backed but read 10 rows + count.

- **Recommendation:** wrap `(app)/layout.tsx`'s 4 queries in a single `Promise.all` (already done for the notifications pair) and consider promoting `activeAgencyId + isAgencyAdmin` to a single query that returns the agency + membership status together. This is a small win, not a critical fix.
- **Severity:** 🟡 (acceptable for v1; revisit when an agency has 100+ workspaces and 50+ users)

### 🟡 Count queries on `notification`

`src/lib/notifications/service.ts` has `countUnreadNotifications` — uses `notification_user_read_created_idx` but the planner has to count rows where `read_at IS NULL`. This is fine for v1 (per-user scale) but will slow at high notification volumes. Not actionable now.

---

## 2. Connection Management (CRITICAL)

### ✅ Singleton pool with hot-reload safety

`src/lib/db/index.ts:15-28`:

```ts
const globalForDb = globalThis as unknown as { __pgPool?: Pool };
const pool = globalForDb.__pgPool ?? new Pool({...});
if (process.env.NODE_ENV !== "production") {
  globalForDb.__pgPool = pool;
}
```

This is the correct Next.js pattern. Production does NOT cache the pool on `globalThis` (correctly — production is single-instance, no need), but dev caches to survive HMR.

- ✅ max: 10 (appropriate for a single VPS with Next.js + Drizzle)
- ✅ idleTimeoutMillis: 30_000
- ✅ connectionTimeoutMillis: 5_000
- ⚠️ **No `application_name` set** — `application_name` helps in `pg_stat_activity` for "which app is holding the connection" debugging. Add it: `new Pool({ ..., application_name: "laratik-planner" })`.
- 🟡 **No `max_lifetime` on connections** — the default is no max lifetime, so a connection can theoretically stay open forever. For a single VPS this is fine, but the connection could outlive a Postgres restart on the other side. Recommend: `maxLifetimeSeconds: 60 * 60` (1 hour) so connections are recycled.

### ⚠️ No PgBouncer — fine now, required for horizontal scale

The pool max is 10. If laratik-planner ever runs more than ~5 Next.js instances (each with a 10-conn pool) against the same Postgres, you'll saturate Postgres's `max_connections` (default 100). At that point, the conventional answer is PgBouncer in transaction-pooling mode.

- **Severity:** ⚠️ (not actionable now — single VPS, single instance, no issue. Flag for the multi-instance runbook.)
- **Recommendation:** when adding PgBouncer, switch `drizzle(pool)` to `drizzle(pool, { prepare: false })` because Drizzle's prepared statements don't survive transaction-pooler reuse.

### ⚠️ No `idle_in_transaction_session_timeout`

Postgres can hold a connection if the application code starts a transaction and forgets to commit/rollback. The `pg` driver doesn't surface a "transaction started but no progress" alarm. Default is 0 (disabled). Recommend setting it to 60s for safety: `SET idle_in_transaction_session_timeout = '60s';` at the connection level (or in a `beforeConnect` hook).

---

## 3. Security & RLS (CRITICAL — partial)

### ⚠️ No RLS — but app-layer policy is comprehensive

Supabase projects use Row-Level Security at the Postgres level. This project uses **Drizzle + app-layer policies** in `src/lib/auth/policy.ts` (read earlier in the session). The functions (`isAgencyAdmin`, `isWorkspaceMember`, `hasWorkspaceRole`, `canAccessWorkspace`, `canViewContent`, `canManageContent`, `canReview`) are the app-side equivalent of RLS predicates.

**Comparison:**

| Concern                          | RLS (Supabase)                    | App-layer (laratik-planner)                                   |
| -------------------------------- | --------------------------------- | ------------------------------------------------------------- |
| Single agency, single instance   | Equivalent                        | Equivalent                                                    |
| Multi-instance, single DB        | Equivalent (Postgres enforces)    | Each instance must run the check                              |
| Direct DB access (psql, BI tool) | Bypassed (Postgres denies)        | **Bypassed** — anyone with `DATABASE_URL` can read everything |
| Bug in policy code               | Still safe (Postgres is the gate) | **Open** until fixed                                          |

The trade-off is: app-layer policies are easier to test (vitest, no DB needed) but weaker at the perimeter. For v1 with a single internal team, this is acceptable. For a multi-tenant future, you want both (RLS as a backstop).

- **Recommendation:** if you ever add direct DB access for analytics, enable RLS as a backstop on `agencies`, `agency_membership`, `workspace_membership`, `content_item`, and write policies that mirror the app-layer functions. Until then, this is acceptable.

### ✅ CHECK constraints enforce invariants

The migration has rich CHECK constraints:

- `agency_singleton_true` — `singleton_key = true` always (defense in depth against the singleton-agency invariant)
- `user_email_format` — `email ~* '^[^@[:space:]]+@[^@[:space:]]+.[^@[:space:]]+$'` (case-insensitive, whitespace-aware)
- `workspace_slug_format` — `~ '^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$'`
- `social_channel_url_https` — `url ~* '^https?://'` (http is allowed for non-published URLs; `delivery_link_url_https` and `publication_published_url_https` enforce https only)
- `publication_published_needs_url_time_publisher` — multi-column check that a `published` row has all three required fields
- `publication_skipped_needs_note`, `publication_failed_needs_reason` — state transitions with required explanation
- `publication_pending_clears_published_fields` — reverse: pending must clear published_url/time/publisher
- `content_item_blocked_needs_reason`, `_cancelled_needs_reason`, `_changes_requested_needs_gate` — state machine enforced at the DB level
- `content_item_other_statuses_no_gate` — reverse: change_request_gate only valid in changes_requested state
- `content_item_priority_valid` — enum check

This is **the gold standard** for state machines in Postgres. The app code can be wrong; the DB will refuse to store inconsistent rows.

### ✅ `citext` for case-insensitive email

`invitation.email` is `citext NOT NULL` and `user.email` has a unique index on `lower(email)`. Combined, this prevents case-difference email collisions.

### ✅ Password storage (Phase C-ready)

`user.password_hash text` column exists (0000_sweet_johnny_storm.sql:113). It's currently `NULL` for OAuth + magic-link users; when Phase C adds password login, the column is ready. Per the existing memory entries, the credentials provider will need a salt + iteration cost + algorithm column (or follow a single format like argon2id's built-in encoding). Not in scope for this audit.

### ⚠️ No `pgcrypto` key management

`pgcrypto` is used for `gen_random_uuid()` only. No encryption keys stored. That's fine for v1 — no PII is encrypted at the column level. The `password_hash` column should use argon2id (per the NextAuth v5 Credentials provider best practice) which embeds the salt + algorithm in the hash string itself.

### ⚠️ No secret audit on what leaves the DB

`agent` actor's IP is `ip_hash` (good — not raw IP), `request_id` is a UUID (good). But the `metadata` jsonb column on `security_audit_event` could leak secrets if a future engineer dumps user-supplied data into it. The existing structured logger (`src/lib/observability/logger.ts`) redacts known patterns; the DB column does NOT. Add a server-side trigger or CHECK on `metadata` shape to forbid known-sensitive keys? Probably overkill for v1 — flag for Phase C review.

---

## 4. Schema Design (HIGH)

### ✅ Rich enum types

Every status / kind / role field is a Postgres `CREATE TYPE ... AS ENUM`, not a CHECK on a text column. This is correct — the type system is the constraint, and Postgres validates it on every INSERT/UPDATE.

### ✅ JSONB with defaults

Every jsonb column defaults to `'{}'::jsonb NOT NULL`. The migration 0001 added 12 columns that were originally `text DEFAULT '{}'::jsonb` and were migrated to true jsonb. This is a sensible evolution (text-first → jsonb-typed).

### ✅ UUID primary keys

Every primary key is `uuid DEFAULT gen_random_uuid()`. This is correct — no sequence contention, no enumeration attacks, and the client can pre-generate IDs for offline-first UX.

### ✅ Time-zone-aware timestamps

Every timestamp is `timestamp with time zone DEFAULT now()`. No `timestamp without time zone` anywhere. Correct for a multi-timezone product.

### ⚠️ `bigserial` on append-only audit tables

`rate_limit_event.id` and `security_audit_event.id` are `bigserial`. This is fine for sequential inserts but means these tables can't be partitioned by time as easily as UUIDs. The rate limit window cleanup is `DELETE WHERE occurred_at < ?` — on a bigserial PK with a btree index, the DELETE will scan the btree and find the boundary, then walk the heap. For a high-volume rate-limit event table, partitioning by `occurred_at` and dropping old partitions is the right move. Not actionable now (volume is low); flag for when rate-limit volume exceeds 10k events/day.

### 🟡 No `COMMENT ON` annotations on tables

Postgres supports `COMMENT ON TABLE foo IS '...';` to document the schema in the database itself. Drizzle migrations don't generate these. They're nice-to-have for the next engineer reading the schema. 5 minutes of work to add a `_comment.sql` migration that comments every table. Skip if you'd rather rely on `docs/production-readiness/SECURITY_AUDIT.md` + this file.

### 🟡 No `updated_at` triggers

Most tables have `updated_at` columns but nothing to update them. Looking at the service code, every UPDATE explicitly sets `updatedAt: new Date()`. The migration 0000 sets `DEFAULT now() NOT NULL` on `created_at` and `updated_at`, but `updated_at` is a passive column. Two options:

- Add a BEFORE UPDATE trigger that sets `NEW.updated_at = now()` — single source of truth, app code can't forget.
- Leave as-is and trust the app code.

Trigger-based is more robust (catches app bugs, ad-hoc psql updates). Recommend for the 5 highest-traffic tables: `content_item`, `invitation`, `workspace_settings`, `agency_membership`, `workspace_membership`. Migration 0004 could add this in ~20 lines.

### ⚠️ `gen_random_uuid()` ordering and `id` collations

UUIDs are random, so INSERT ordering is arbitrary. If you ever do a `SELECT ... ORDER BY id LIMIT 50`, the order is random — not by insertion time. The current code correctly orders by `created_at` or `planned_publish_at`, not by `id`. ✅ no action.

### 🟡 No `created_at` index on `outbox_event`

`outbox_event.attempt_count` and `last_error` are queryable for "what failed recently" but the only index is on `available_at WHERE processed_at IS NULL`. The monitoring query "outbox events that failed > 3 times" would do a seq scan + filter. Add `CREATE INDEX outbox_failed_idx ON outbox_event (last_error) WHERE attempt_count > 3 AND processed_at IS NULL;` for the failed-event alerting query (Goal 19 observability).

---

## 5. Concurrency & Locking (MEDIUM-HIGH)

### ✅ `pg_advisory_xact_lock` used correctly

Three places use it:

1. **`src/lib/auth/bootstrap.ts:37`** — `SELECT pg_advisory_xact_lock(7342891)`. Magic-number lock key for the bootstrap operation. Released at end of transaction. Correct.
2. **`src/lib/security/rate-limit.ts:46`** — `SELECT pg_advisory_xact_lock(hashtext(${`${input.scope}:${subjectHash}`}))`. Hash-derived lock key, scoped per (scope, subject). This is the right pattern for rate-limiting at scale (each rate-limit window is its own lock; contention is bounded by the number of distinct scopes × subjects, not by the number of requests).
3. **`src/lib/auth/invitations.ts:350`** — `SELECT pg_advisory_xact_lock(7342892)` for deactivation. Magic-number key, distinct from bootstrap. Correct.

The `xact_lock` variant auto-releases on COMMIT/ROLLBACK, so it can't leak. This is the right call.

### ✅ `for("update")` row lock on invitation accept

`src/lib/auth/invitations.ts:163-168`:

```ts
const [inv] = await tx
  .select()
  .from(invitations)
  .where(eq(invitations.tokenHash, hash))
  .for("update")
  .limit(1);
```

Correct — serializes concurrent accept attempts on the same invitation row.

### ✅ `for("update")` row lock in workspace settings update

`src/lib/workspaces/settings-service.ts:43-45`:

```ts
await tx.execute(sql`SELECT id FROM workspace WHERE id = ${input.workspaceId} FOR UPDATE`);
```

Correct — prevents two concurrent settings updates from clobbering each other.

### 🟡 No row lock in deactivation

`src/lib/auth/invitations.ts:344-404` (deactivateUser): the member row read uses `LIMIT 1` without `for("update")`. Two concurrent deactivations of the same user could both pass the admin-count check before either commits, resulting in a transient admin-count that drops by 2 in the audit log. The advisory lock (7342892) serializes the _deactivation operation_ but not at the row level. For a single-agency deployment, this is a non-issue (admin counts are tiny). For multi-tenant, add `for("update")` on the target membership row.

### 🟡 Rate-limit INSERT race window

`src/lib/security/rate-limit.ts:81-83`: after counting and finding `count < limit`, the code inserts a new event. The advisory lock covers the count + insert, so concurrent requests on the same `(scope, subject)` serialize. ✅ correct.

But: the SELECT in the count doesn't use `for("update")` on the rows it counts. It just counts them. So the count is a snapshot, the insert adds, the next request sees the new count. This is the right behavior — Postgres MVCC gives you "the count as of the read snapshot." The lock is only needed to serialize the count+insert decision against another concurrent count+insert.

### 🟡 No `SKIP LOCKED` for outbox dispatch

`src/lib/notifications/service.ts:81`:

```ts
const events = await db
  .select()
  .from(outboxEvents)
  .where(and(isNull(outboxEvents.processedAt), sql`${outboxEvents.availableAt} <= ${now}`))
  .orderBy(outboxEvents.availableAt)
  .limit(maxEvents);
```

If you ever run two `dispatchOutboxOnce` processes (e.g., for HA), they'll both claim the same events and process them twice. Add `for("update").skipLocked()`:

```ts
.where(...).orderBy(...).limit(maxEvents).for("update", { skipLocked: true })
```

Then in the transaction, `update processed_at = now()` marks the row claimed. Severity: 🟡 (single process today; flag for multi-process / cron-and-worker pattern).

---

## 6. Data Access Patterns (MEDIUM)

### ✅ Joins instead of N+1

I traced all the hot service paths. None of them have a confirmed N+1. Examples of good patterns:

- `acceptInvitation` joins `invitation`, `users`, `invitation_workspace_roles`, `agency_memberships` in one transaction.
- `recordPublication` resolves the workspace via a single join before the policy check.
- `listNotificationsForUser` uses `inArray` for the per-user role check.

### 🟡 `dispatchOutboxOnce` iteration

`src/lib/notifications/service.ts:81-105`:

```ts
const events = await db.select()...limit(maxEvents);
const processed: string[] = [];
for (const evt of events) {
  try {
    // ...
    await db.update(outboxEvents).set({...}).where(eq(outboxEvents.id, evt.id));
    processed.push(evt.id);
  } catch (err) { ... }
}
```

Two issues:

1. The DB query + N updates are NOT in a transaction, so a process crash mid-loop leaves half the events processed without their `processed_at` set. Wrap in `db.transaction(async tx => { ... })` and do `tx.update().where(...)` per event.
2. The loop blocks the event loop for up to `maxEvents` round-trips. With `maxEvents = 50` and 5ms per round-trip, that's 250ms of synchronous DB time. Acceptable for a cron-driven worker, not great for an HTTP handler. Move to a background worker.

### ✅ Pagination via `.limit(50)`

`src/app/(app)/app/page.tsx:51` uses `LIMIT 50` for the My Work list. For 50 items this is fine. No cursor-based pagination yet. Future enhancement: keyset pagination on `(planned_publish_at, id)` for deep lists.

### 🟡 No `batch insert` for content item channels

`src/lib/content/service.ts` does N inserts for the channel junction (one per channel). At 5-10 channels per item, this is fine. At 50+ (unusual for social), batch insert would be 5x faster. Drizzle supports `.insert([...rows])` for true batch.

---

## 7. Monitoring & Diagnostics (LOW-MEDIUM)

### ⚠️ `pg_stat_statements` not enabled

The skill (and the Postgres community) recommends enabling `pg_stat_statements` to find the slowest queries. This requires a server-side `shared_preload_libraries` setting — you can't add it without a Postgres restart and a config change. For laratik-planner's single-VPS deployment, this is a future improvement; not a blocker.

### ✅ `security_audit_event` covers all sensitive actions

Confirmed in the migrations and service code: invitation_create, invitation_accept, member_deactivate, member_reactivate, rate_limit_exceeded, bootstrap (implicitly via the bootstrap lock). The audit table has good indexes on `actor_id` and `action`.

### ⚠️ No `pg_stat_statements` equivalent for Drizzle query counts

Drizzle doesn't expose per-statement metrics. If you want query-count visibility, the options are:

- Enable `pg_stat_statements` server-side (best, but requires Postgres config).
- Add a custom query interceptor in the `pg` Pool that increments a counter.
- Rely on Sentry's performance tracing (already wired for app code; DB query tracing is not automatic).

### 🟡 `rate_limit_event` has no retention policy

Rate limit events accumulate forever. The `occurred_at` index lets you find old rows, but there's no cleanup job. Add a daily `DELETE FROM rate_limit_event WHERE occurred_at < now() - interval '90 days'` (or partition the table and drop old partitions).

### 🟡 `outbox_event` has no failed-event alerting

If `outbox_event.last_error` is set and `attempt_count > N`, the row is stuck. The notification service should expose a "stuck events" view or trigger a `system` notification. No such code exists today.

---

## 8. Advanced Features (LOW)

### 🟡 No full-text search

Content items, comments, and brand assets are all `text` columns with no FTS index. If users need "search across all content in this workspace," the right answer is a `tsvector` column with a GIN index, populated by a trigger on INSERT/UPDATE. Out of scope for v1.

### 🟡 No partitioning on high-volume tables

`ai_usage_event`, `activity_event`, `notification`, `rate_limit_event`, `security_audit_event` will all grow with time. None are partitioned. At ~100k rows, single-table indexes are still fast. At ~10M rows, partitioning by `created_at` (monthly) becomes valuable. Not actionable now.

### ⚠️ No logical replication or read replica

The deployment uses a single Postgres instance. For analytics or reporting, you'd want a read replica. Supabase has this built in; vanilla Postgres requires manual setup. Out of scope for v1.

---

## 9. Summary table

| Category                    | Status         | Critical issues                                                 | Actionable now?           |
| --------------------------- | -------------- | --------------------------------------------------------------- | ------------------------- |
| 1. Query Performance        | ✅ with one 🟡 | My Work query needs EXPLAIN                                     | After first 10 users      |
| 2. Connection Management    | ✅ with two ⚠️ | No `application_name`, no `idle_in_transaction_session_timeout` | Yes, 2-line change        |
| 3. Security & RLS           | ⚠️ partial     | No RLS, but app policies are comprehensive                      | No — accept v1 trade-off  |
| 4. Schema Design            | ✅ with two 🟡 | No `updated_at` triggers, no outbox-failed index                | Yes, 1 migration          |
| 5. Concurrency & Locking    | ✅             | None                                                            | n/a                       |
| 6. Data Access Patterns     | ✅ with two 🟡 | Outbox dispatch not in transaction, no SKIP LOCKED              | Yes, for outbox hardening |
| 7. Monitoring & Diagnostics | ⚠️             | No `pg_stat_statements`, no rate-limit retention                | Future improvement        |
| 8. Advanced Features        | n/a            | n/a for v1                                                      | No                        |

---

## 10. Concrete recommendations (no code changes — audit only)

If I were to prioritize the 5 lowest-effort, highest-value follow-ups:

1. **Add `application_name: "laratik-planner"` to the Pool config** in `src/lib/db/index.ts:19`. (1 line)
2. **Add `SET idle_in_transaction_session_timeout = '60s';` as a connection init query** in the Pool config. (1 line) Defends against app bugs that start a transaction and forget to commit.
3. **Add a migration 0004 with:**
   ```sql
   -- updated_at trigger for high-traffic tables
   CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
   BEGIN NEW.updated_at = now(); RETURN NEW; END;
   $$ LANGUAGE plpgsql;
   -- ... CREATE TRIGGER for content_item, invitation, workspace_settings, agency_membership, workspace_membership
   -- outbox-failed index
   CREATE INDEX outbox_failed_idx ON outbox_event (last_error) WHERE attempt_count > 3 AND processed_at IS NULL;
   ```
   (~20 lines, no app changes needed)
4. **Add `for("update", { skipLocked: true })` to the outbox dispatch query** when you ever run >1 dispatchOutboxOnce process. (1 line change)
5. **Wrap `dispatchOutboxOnce`'s per-event processing in a transaction** so a crash doesn't leave half-processed events. (~5 line change)

Total: ~30 lines of SQL/code, all safe, all reversible. None of these are blocking — the schema and query patterns as they stand are correct for v1.

---

## Cross-references

- `docs/production-readiness/SECURITY_AUDIT.md` — app-layer security review
- `docs/production-readiness/MIGRATION_DEPLOYMENT.md` — migration drill results
- `src/lib/auth/policy.ts` — app-layer policy helpers
- `src/lib/db/index.ts` — pool config
- `src/lib/db/migrations/0000_sweet_johnny_storm.sql` — initial schema
- `src/lib/db/migrations/0001_thick_vin_gonzales.sql` — JSONB type migration
- `src/lib/db/migrations/0002_sturdy_caretaker.sql` — email regex tightening
- `src/lib/db/migrations/0003_user_display_name_trigger.sql` — display_name trigger
