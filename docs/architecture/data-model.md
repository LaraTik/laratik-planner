# Data model — identity, tenancy, and platform authority

This document describes the **identity and tenancy** tables after **Milestone
1 (multi-agency tenancy and platform/admin separation)**. It covers the new
`platform_administrator` table, the removal of the `singleton_key` invariant
on `agency`, and the cross-agency slug uniqueness rule for workspaces.

For the runtime authorization model (how `agency_membership` and
`platform_administrator` are queried and combined), see
[`authorization.md`](./authorization.md). For the system map and request
path, see [`overview.md`](./overview.md).

All tables in this document live in `src/lib/db/schema/identity.ts` unless
noted. The Postgres dialect is Drizzle-flavored; `id` is the shared UUID
column from `src/lib/db/schema/_helpers.ts`.

## 1. `user` (NextAuth Drizzle adapter, M1 unchanged)

```ts
users = pgTable(
  "user",
  {
    id: idColumn(),
    email: text("email").notNull(),
    emailVerified: timestamp("email_verified", { withTimezone: true, mode: "date" }),
    name: text("name"),
    image: text("image"),
    displayName: text("display_name").notNull(),
    avatarPath: text("avatar_path"),
    locale: text("locale").notNull().default("en"),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true, mode: "date" }),
    role: text("role").notNull().default("user"), // app-level role
    passwordHash: text("password_hash"), // null for OAuth-only users
    ...timestamps,
  },
  (t) => [
    uniqueIndex("user_email_lower_unique").on(sql`lower(${t.email})`),
    check(
      "user_email_format",
      sql`${t.email} ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'`,
    ),
  ],
);
```

The `display_name` column is filled by a before-insert trigger (see
migration `0003`) from `name` (or the email local-part when `name` is
null), so the NextAuth Drizzle adapter — which does not supply
`display_name` on INSERT — never fails on the NOT NULL constraint.

`user.id` is the only actor identity referenced from `agency_membership`,
`platform_administrator`, and all tenant tables. There is no separate
"user per agency" row: a single user may be a member of many agencies
(and may be a platform admin in addition), and the `(agency_id, user_id)`
pair in `agency_membership` is what makes a membership unique.

## 2. `agency` (M1: no more singleton)

```ts
agencies = pgTable("agency", {
  id: idColumn(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  bootstrapCompletedAt: timestamp("bootstrap_completed_at", { withTimezone: true, mode: "date" }),
  settings: jsonb("settings"),
  ...timestamps,
}, (t) => [
  uniqueIndex("agency_slug_unique").on(sql`lower(${t.slug})`)),
]);
```

### 2.1 What changed in M1 (singleton removal)

Before M1, the table enforced a **DB-level singleton** with two
constraints:

```sql
-- pre-M1
singleton_key  boolean NOT NULL DEFAULT true
UNIQUE INDEX agency_singleton_unique (singleton_key)
CHECK agency_singleton_true (singleton_key = true)
```

That invariant — "production contains exactly one active agency row" —
was the foundation of the pre-M1 single-agency model. M1.7 drops it:

```sql
-- migration 0008_drop_agency_singleton_constraint.sql
ALTER TABLE agency DROP CONSTRAINT agency_singleton_true;
DROP INDEX agency_singleton_unique;
ALTER TABLE agency ALTER COLUMN singleton_key DROP NOT NULL;
ALTER TABLE agency ALTER COLUMN singleton_key DROP DEFAULT;
```

After migration `0008`, the `singleton_key` column is **gone** from the
Drizzle schema. The migration asserts that no code path still does
`WHERE singleton_key = true` and that the pre-flight count is consistent
before it executes.

### 2.2 What stayed: agency-slug uniqueness

`uniqueIndex("agency_slug_unique").on(sql\`lower(${t.slug})\`)`is
preserved. **Agency slugs are globally unique** (case-insensitive); they
are part of the public URL namespace (e.g.`/app/agencies/<slug>` in
later milestones) and colliding slugs would be confusing regardless of
tenancy. The invariant is "no two agencies can have the same slug", not
"only one agency exists".

### 2.3 `bootstrap_completed_at`

Records when the first agency admin finished `/setup` for this agency.
Used by the bootstrap path to gate re-bootstrapping and by the
`bootstrap_locks` table to record the one-time first-admin write.

`bootstrap_locks` is unchanged in M1 — it remains the canonical
"first-admin write" record per agency:

```ts
bootstrapLocks = pgTable("bootstrap_lock", {
  agencyId: uuid("agency_id")
    .primaryKey()
    .references(() => agencies.id, { onDelete: "cascade" }),
  completedBy: uuid("completed_by").references(() => users.id, { onDelete: "set null" }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" })
    .notNull()
    .default(sql`now()`),
});
```

The M1 documentation goal is not to remove `bootstrap_locks` — the
bootstrap is per-agency, so each agency still has its own lock row. The
singleton removal only changes the **count of agencies**, not the
per-agency bootstrap contract.

## 3. `agency_membership` (M1 unchanged, but re-read)

```ts
agencyMemberships = pgTable(
  "agency_membership",
  {
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: agencyMemberStatusEnum("status").notNull(),
    isAgencyAdmin: boolean("is_agency_admin").notNull().default(false),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true, mode: "date" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("agency_membership_pk").on(t.agencyId, t.userId),
    index("agency_membership_user_idx").on(t.userId),
  ],
);
```

A user is an **active member** of an agency iff
`status = 'active' AND deactivated_at IS NULL` (the `status` enum encodes
the active / deactivated / suspended states; the column is the source of
truth).

The pair `(agency_id, user_id)` is the **tenant boundary** for every
downstream authorization check:

- `isAgencyMember(actor, agencyId)` — checks for a single row in
  `agency_membership` with `status = 'active'`.
- `isAgencyAdmin(actor, agencyId)` — same, plus `is_agency_admin = true`.
- The agency-context resolver (M1.3) re-checks this row on every cookie
  decode and on every explicit `?agency=<id>` request.
- The cookie re-check (M1.2) is the _effective_ expiry for a revoked
  membership: revocation lands in the DB and the cookie is dead on its
  next decode.

`onDelete: "restrict"` on both FKs is deliberate: deleting an agency
or a user with active memberships is refused. Tenancy is preserved
across user and agency deletes — see
`docs/production-readiness/MIGRATION_DEPLOYMENT.md` for the
deactivate-then-archive path.

## 4. `platform_administrator` (M1.1, new)

```ts
platformAdministrators = pgTable(
  "platform_administrator",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    grantedBy: uuid("granted_by").references(() => users.id, { onDelete: "set null" }),
    grantedAt: timestamp("granted_at", { withTimezone: true, mode: "date" })
      .notNull()
      .default(sql`now()`),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    reason: text("reason"),
  },
  (t) => [index("platform_administrator_granted_at_idx").on(t.grantedAt)],
);
```

### 4.1 Why this is a separate table

Platform authority is **separate from** agency authority. A user can be:

- A platform admin without being a member of any agency (e.g. an operator
  who only runs `/app/platform/*`).
- A platform admin **and** an active member of one or more agencies.
- An active agency member without being a platform admin (the common
  case for every non-operator user).

Conflating platform authority with `is_agency_admin = true` would
collapse these cases and let an agency admin read other agencies' data
"because they're a platform admin". The separate table makes the
disjointness explicit in the data and trivial to audit ("who has ever
been a platform admin?").

### 4.2 Column-by-column

- `user_id` is the **primary key** — at most one live grant per user.
  A re-grant after a revoke is a new logical grant and may update the
  `granted_by` / `granted_at` / `reason` columns; the row identity does
  not change.
- `granted_by` is the platform admin who issued the grant. `null` for
  the initial SQL grants in M1.1 (the migration backfill), where there
  is no human grantor. `onDelete: "set null"` so deleting a user does
  not cascade-revoke a surviving grantee.
- `granted_at` records when the grant was issued.
- `revoked_at` is the **soft-revocation** timestamp — kept forever for
  the audit trail of "who was ever a platform admin". A revoked row is
  _not_ deleted; the `isPlatformAdmin` helper filters
  `revoked_at IS NULL` so revoked admins are no longer live admins.
  This is the same pattern as the soft-delete on `agency_membership`.
- `reason` is free text — required for any production grant
  (operator writes "vendor onboarding 2026-08" or similar). `null` is
  allowed for the SQL grants in the M1.1 backfill.

### 4.3 No `agency_id` column (intentional)

There is **no** `agency_id` on `platform_administrator`. Platform
authority is global, not per-agency. A platform admin's power applies
across the platform, not within a single tenant. The M1.1 plan calls
this out explicitly: "the absence is intentional".

If per-agency operator scopes are added in a later milestone (e.g.
"this platform admin may only inspect agency X"), they go in a
**new** table (`agency_operator_grant` or similar) — not by adding
`agency_id` to `platform_administrator` and breaking its primary-key
shape.

### 4.4 M1.1 backfill

The M1.1 migration `0007_platform_administrator.sql` does two things:

1. Creates the `platform_administrator` table with the shape above.
2. Backfills every existing user with `is_agency_admin = true` and
   `status = 'active'` in `agency_membership` as a platform admin
   (`granted_by = NULL`, `granted_at = now()`, `reason = 'M1.1 backfill:
existing agency admin'`).

The backfill is intentional and **only for the migration period**:
M1 has exactly one agency and a handful of users; the backfill ensures
the existing first-admins keep their authority over the platform
surface without manual SQL. The platform surface is for the migration
period only; the production-grade grant workflow is the SQL grant (and
later, a `platform_admin_grants` audit UI in M2).

## 5. `accounts`, `sessions`, `verificationTokens` (NextAuth, M1 unchanged)

Re-exported from `@auth/drizzle-adapter` and customized in
`src/lib/db/schema/identity.ts`. The shape is the standard NextAuth
Drizzle-adapter shape:

- `accounts` — OAuth provider linkage (`user_id` × `provider` ×
  `provider_account_id` unique).
- `sessions` — server-side session rows for the NextAuth database
  strategy.
- `verificationTokens` — magic-link and email-verification tokens.

These tables are **not** tenancy-scoped; they live above the tenant
boundary. A user has one set of `accounts` / `sessions` regardless of
how many agencies they belong to. Tenant context enters only at the
`agency_membership` (or `platform_administrator`) layer.

## 6. Workspace cross-agency slug uniqueness

Workspace identity is the pair `(agency_id, slug)`, enforced by:

```ts
uniqueIndex("workspace_agency_slug_unique").on(agencyId, lower(slug));
```

This is **per-agency** uniqueness, not global. Two agencies can each
have a workspace named `acme` without collision; an actor in agency A
who navigates to `/app/w/acme` lands in agency A's workspace, an actor
in agency B who navigates to the same path lands in agency B's
workspace. The pair is the lookup key in
`src/lib/workspaces/context.ts` (M1.4).

The same pair is also the **anti-IDOR** boundary: an actor who guesses
the slug of a workspace in another agency is denied with `404`, not
`403` (see `authorization.md` §5). The M1.9 tenant-isolation tests
assert this end-to-end.

## 7. Tenant boundary summary

After M1, every authorization check is parameterized by `agencyId`,
and there are exactly two sources of `agencyId`:

1. **The agency-context resolver** (`resolveActiveAgencyContext`) at the
   request boundary. It is the only place the priority chain
   (requested → cookie → fallback) lives.
2. **The workspace lookup** that re-derives `agencyId` from
   `(workspaceId)` when a request names a workspace but not an agency.
   This re-derivation is internal to the workspaces context module;
   the resulting `agencyId` is the value passed to downstream
   agency-scoped helpers.

There is no global `activeAgencyId()` for production code paths. The
bootstrap path is the documented exception. Tenant isolation is
tested at the service layer (M1.9 unit) and end-to-end (M1.9 Playwright
E2E).

## 8. Plans, entitlements, and usage

`platform_plan_template` stores reusable default policy. `agency_entitlement` binds exactly one plan to an agency and may hold a complete replacement override object. `agency_entitlement_change` is append-only and records before/after snapshots, actor, reason, and timestamp for every change.

`agency_usage_counter` stores current consumption independently from policy, keyed by `(agency_id, resource_key)`. Resources include workspaces, active users or pending invitations, total social profiles, each supported network, storage bytes, monthly AI requests/input/output tokens, and dynamic per-user daily AI requests. `agency_usage_threshold_event` records 80/90/100 percent crossings with a cycle key.

Capacity is reserved using a per-agency/per-resource advisory transaction lock. Multi-resource reservations validate every resource before writing any counter, which makes total plus per-network profile limits and bulk operations atomic. Releasing an archived/deactivated resource decrements the corresponding counter without going below zero.

`platform_audit_event` is the append-only operator trail for agency creation, lifecycle, and entitlement changes. Agency lifecycle uses typed `suspended_at` and `archived_at` columns; archive remains soft and restore clears both values.
