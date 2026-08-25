# Platform Role Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace binary platform-admin access with four least-privilege roles, exact server-enforced permissions, safe Owner administration, and a clear responsive Platform Access UI while preserving tenant isolation and production rollback safety.

**Architecture:** Add an explicit role to the existing soft-revocable `platform_administrator` record, derive a closed permission set in a server-only authorization module, and require the exact permission inside every platform read or mutation service. Keep agency self-service and platform agency commands as separate authorization entry points that share private transactional mutation logic; platform roles never become agency memberships or tenant-content grants.

**Tech Stack:** Next.js 16.3 App Router, React 19 Server Actions, TypeScript strict, Drizzle ORM, PostgreSQL 16, Zod, Vitest, React Testing Library, Playwright, Tailwind 4, shadcn/Radix primitives.

**Design source:** `docs/superpowers/specs/2026-08-25-platform-role-permissions-design.md`

---

## File map

### Database and authorization

- Modify `src/lib/db/schema/identity.ts` — add typed role, updated timestamp, constraint, and active-role index.
- Create `src/lib/db/migrations/0018_platform_access_roles.sql` plus the Drizzle snapshot/journal entry — additive production migration.
- Create `src/lib/auth/platform-access-types.ts` — client-safe role identifiers, labels, and descriptions with no database imports.
- Create `src/lib/auth/platform-access.ts` — closed roles, permissions, permission bundles, principal lookup, fail-closed checks.
- Modify `src/lib/auth/platform-admin.ts` — compatibility re-exports only.
- Modify `src/lib/auth/platform-admin-gate.ts` — return the resolved principal, not only a boolean actor.
- Modify `src/app/(app)/layout.tsx` — load one platform principal and pass safe navigation capabilities to the shell.
- Modify `src/components/app-shell/app-shell.tsx`, `src/components/app-shell/sidebar.tsx`, and `src/components/app-shell/mobile-nav.tsx` — render platform links from safe capabilities.

### Platform services and actions

- Create `src/lib/platform/access.ts` — list/grant/change/revoke platform assignments with serialized last-Owner protection and atomic audit writes.
- Modify `src/lib/platform/admins.ts` — compatibility re-exports during route migration.
- Modify `src/lib/platform/agencies.ts` — exact create/lifecycle/archive permissions and distinct restore/unarchive transitions.
- Modify `src/lib/agencies/command.ts` — platform update entry point sharing one private transactional writer.
- Modify `src/lib/entitlements/change-agency-plan.ts` — require actor plus exact plan permission at the service boundary.
- Modify `src/lib/support/access.ts` — require support-request permission and limit third-party platform revocation to Owners.
- Modify platform Server Action modules — authenticate, validate, delegate to permission-enforcing services, and return minimal safe states.

### Platform UI

- Create `src/app/(app)/app/platform/access/page.tsx`, `actions.ts`, `grant-form.tsx`, `change-role-dialog.tsx`, and `revoke-dialog.tsx`.
- Replace `src/app/(app)/app/platform/admins/page.tsx` with a permanent redirect to `/app/platform/access`.
- Modify platform agencies list/detail/plan/support/security pages — page-level read gates and permission-aware presentation.
- Create `src/components/platform/permission-notice.tsx` — consistent accessible read-only/permission messaging.

### Tests, fixtures, and evidence

- Create/modify focused unit and integration tests named in each task.
- Modify `src/app/api/dev/seed/route.ts` and `tests/e2e/_helpers.ts` — explicit `platformRole` fixtures.
- Replace `tests/e2e/platform-admins.spec.ts` with `tests/e2e/platform-access.spec.ts`; expand agency E2E coverage.
- Modify authorization, setup, testing, readiness, and migration evidence documents.

---

### Task 1: Add the backward-compatible platform-role schema

**Files:**

- Modify: `tests/unit/migration-journal-order.test.ts`
- Create: `tests/unit/platform-access-migration.test.ts`
- Create: `src/lib/auth/platform-access-types.ts`
- Modify: `src/lib/db/schema/identity.ts:136-163`
- Create: `src/lib/db/migrations/0018_platform_access_roles.sql`
- Create: `src/lib/db/migrations/meta/0018_snapshot.json`
- Modify: `src/lib/db/migrations/meta/_journal.json`

- [ ] **Step 1: Write the failing migration-contract test**

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import journal from "@/lib/db/migrations/meta/_journal.json";

const TAG = "0018_platform_access_roles";
const sql = readFileSync(join(process.cwd(), "src/lib/db/migrations", `${TAG}.sql`), "utf8");

describe("platform access role migration", () => {
  it("is the newest strictly monotonic migration", () => {
    const entry = journal.entries.at(-1);
    expect(entry?.tag).toBe(TAG);
    expect(entry!.when).toBeGreaterThan(journal.entries.at(-2)!.when);
  });

  it("backfills existing rows to owner with a closed database constraint", () => {
    expect(sql).toContain('ADD COLUMN "role" text');
    expect(sql).toContain("DEFAULT 'platform_owner'");
    expect(sql).toContain("platform_administrator_role_check");
    for (const role of [
      "platform_owner",
      "agency_operator",
      "platform_auditor",
      "support_operator",
    ]) {
      expect(sql).toContain(`'${role}'`);
    }
  });

  it("keeps the migration additive for old application images", () => {
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
    expect(sql).toContain('ADD COLUMN "updated_at"');
    expect(sql).toContain("platform_administrator_active_role_idx");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `pnpm exec vitest run tests/unit/platform-access-migration.test.ts`

Expected: FAIL because migration `0018_platform_access_roles.sql` and its journal entry do not exist.

- [ ] **Step 3: Add the Drizzle schema fields and generate the migration artifacts**

Define the stable client-safe role values in `platform-access-types.ts`:

```ts
export const PLATFORM_ROLE_VALUES = [
  "platform_owner",
  "agency_operator",
  "platform_auditor",
  "support_operator",
] as const;
export type PlatformRole = (typeof PLATFORM_ROLE_VALUES)[number];

export const PLATFORM_ROLE_DETAILS: Record<
  PlatformRole,
  Readonly<{ label: string; description: string }>
> = {
  platform_owner: { label: "Platform Owner", description: "Full platform control" },
  agency_operator: { label: "Agency Operator", description: "Manage agencies" },
  platform_auditor: { label: "Platform Auditor", description: "Read-only oversight" },
  support_operator: {
    label: "Support Operator",
    description: "Request temporary support access",
  },
};
```

Import `PlatformRole` as a type into `identity.ts`; do not import the Drizzle schema from any Client Component.

Add to `platformAdministrators`:

```ts
role: text("role").$type<PlatformRole>().notNull().default("platform_owner"),
updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
  .notNull()
  .default(sql`now()`),
```

Add table constraints/indexes:

```ts
check(
  "platform_administrator_role_check",
  sql`${t.role} IN ('platform_owner', 'agency_operator', 'platform_auditor', 'support_operator')`,
),
index("platform_administrator_active_role_idx")
  .on(t.role, t.updatedAt)
  .where(sql`${t.revokedAt} IS NULL`),
```

Generate the snapshot, then normalize the generated SQL filename/tag to `0018_platform_access_roles` and add comments that document forward behavior, compatibility, backup, and non-destructive rollback. The SQL must add both columns, backfill every existing row to `platform_owner`, set `NOT NULL`/defaults, add the check, and add the partial index.

- [ ] **Step 4: Run migration tests and schema typecheck**

Run: `pnpm exec vitest run tests/unit/platform-access-migration.test.ts tests/unit/migration-journal-order.test.ts && pnpm typecheck`

Expected: PASS; the only historical journal inversion remains the documented 0012 incident, and 0018 is newer than 0017.

- [ ] **Step 5: Commit the additive schema milestone**

```bash
git add src/lib/auth/platform-access-types.ts src/lib/db/schema/identity.ts src/lib/db/migrations/0018_platform_access_roles.sql src/lib/db/migrations/meta/0018_snapshot.json src/lib/db/migrations/meta/_journal.json tests/unit/platform-access-migration.test.ts tests/unit/migration-journal-order.test.ts
git commit -m "feat(auth): add platform access roles"
```

---

### Task 2: Build the fail-closed platform permission DAL

**Files:**

- Create: `src/lib/auth/platform-access.ts`
- Modify: `src/lib/auth/platform-admin.ts`
- Modify: `src/lib/auth/platform-admin-gate.ts`
- Replace coverage in: `tests/unit/platform-admin.test.ts`
- Modify: `tests/unit/platform-layout-gate.test.ts`

- [ ] **Step 1: Write failing role-matrix and principal tests**

Cover the complete matrix with table-driven assertions:

```ts
const expected = {
  platform_owner: PLATFORM_PERMISSIONS,
  agency_operator: [
    "platform.console.read",
    "platform.agency.read",
    "platform.agency.create",
    "platform.agency.update",
    "platform.agency.plan.manage",
    "platform.agency.lifecycle.manage",
  ],
  platform_auditor: [
    "platform.console.read",
    "platform.agency.read",
    "platform.access.read",
    "platform.audit.read",
  ],
  support_operator: ["platform.console.read", "platform.agency.read", "platform.support.request"],
} as const;

it.each(Object.entries(expected))("derives %s permissions", (role, permissions) => {
  expect(permissionsForPlatformRole(role as PlatformRole)).toEqual(new Set(permissions));
});
```

Also prove that missing, revoked, invalid-role, and rejected DB reads return `null`/`false`; `requirePlatformPermission` throws `PermissionDeniedError("platform-permission:<permission>")`; and the compatibility `requirePlatformAdmin` accepts every active role only for console entry.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm exec vitest run tests/unit/platform-admin.test.ts tests/unit/platform-layout-gate.test.ts`

Expected: FAIL because the role/permission types and principal helpers do not exist.

- [ ] **Step 3: Implement the server-only platform-access module**

Use this public contract:

```ts
import "server-only";

export const PLATFORM_PERMISSIONS = [
  "platform.console.read",
  "platform.agency.read",
  "platform.agency.create",
  "platform.agency.update",
  "platform.agency.plan.manage",
  "platform.agency.lifecycle.manage",
  "platform.agency.archive",
  "platform.support.request",
  "platform.access.read",
  "platform.access.manage",
  "platform.audit.read",
] as const;

export type PlatformPermission = (typeof PLATFORM_PERMISSIONS)[number];
export type PlatformPrincipal = Readonly<{
  actor: Actor;
  role: PlatformRole;
  permissions: ReadonlySet<PlatformPermission>;
}>;

export function permissionsForPlatformRole(role: PlatformRole): ReadonlySet<PlatformPermission>;
export async function getPlatformPrincipal(actor: Actor): Promise<PlatformPrincipal | null>;
export async function hasPlatformPermission(
  actor: Actor,
  permission: PlatformPermission,
): Promise<boolean>;
export async function requirePlatformPermission(
  actor: Actor,
  permission: PlatformPermission,
): Promise<PlatformPrincipal>;
```

Select only `role`, filter `revoked_at IS NULL`, validate with `z.enum(PLATFORM_ROLE_VALUES)`, and catch database/parse failures as denial. Log a structured warning containing actor ID and requested permission for denied/failed checks, without resource content or secrets. Do not cache mutation checks across requests.

Keep `isPlatformAdmin` and `requirePlatformAdmin` in `platform-admin.ts` as compatibility wrappers for `platform.console.read`. Update the layout gate success shape to `{ status: "ok"; principal }`.

- [ ] **Step 4: Run focused authorization tests**

Run: `pnpm exec vitest run tests/unit/platform-admin.test.ts tests/unit/platform-layout-gate.test.ts`

Expected: PASS for every role-permission row and all fail-closed paths.

- [ ] **Step 5: Commit the authorization DAL**

```bash
git add src/lib/auth/platform-access.ts src/lib/auth/platform-admin.ts src/lib/auth/platform-admin-gate.ts tests/unit/platform-admin.test.ts tests/unit/platform-layout-gate.test.ts
git commit -m "feat(auth): enforce platform permissions"
```

---

### Task 3: Implement safe platform-access assignment administration

**Files:**

- Create: `src/lib/platform/access.ts`
- Modify: `src/lib/platform/admins.ts`
- Replace: `tests/unit/platform-admins.test.ts`
- Create: `tests/integration/platform-access.test.ts`

- [ ] **Step 1: Write failing service-schema and permission tests**

Define test expectations around these schemas:

```ts
export const GrantPlatformAccessSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(PLATFORM_ROLE_VALUES),
  reason: z.string().trim().min(3).max(500),
});

export const ChangePlatformRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(PLATFORM_ROLE_VALUES),
  reason: z.string().trim().min(3).max(500),
});

export const RevokePlatformAccessSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(3).max(500),
});
```

Assert that list requires `platform.access.read`; mutations require `platform.access.manage`; grant/reactivate always writes an explicit role; a same-role change is idempotent; and successful writes use `platform_access.grant`, `platform_access.role_change`, or `platform_access.revoke` with old/new role and reason metadata.

- [ ] **Step 2: Run unit tests and verify RED**

Run: `pnpm exec vitest run tests/unit/platform-admins.test.ts`

Expected: FAIL because the role-aware service and schemas do not exist.

- [ ] **Step 3: Implement the service with one serialized mutation helper**

Use a transaction-scoped PostgreSQL advisory lock before reading or changing assignments:

```ts
const PLATFORM_ACCESS_LOCK_KEY = 6_421_910_731;

async function lockPlatformAccess(tx: Transaction): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${PLATFORM_ACCESS_LOCK_KEY})`);
}
```

Within the same transaction:

1. Lock the administration domain.
2. Re-read the target assignment.
3. If revoking or downgrading an active Owner, count active Owners and reject when the count is `<= 1`.
4. Write the assignment and `security_audit_event` atomically.
5. Update `updated_at` and preserve soft-revoked history.

Return only `{ userId, role, unchanged }`, never a raw database row. Re-export old service names from `src/lib/platform/admins.ts` only where needed to keep untouched imports compiling during the UI transition.

- [ ] **Step 4: Write and run integration tests for concurrency and constraints**

The integration suite must seed two Owners and use two concurrent transactions to attempt downgrading/revoking both. Assert exactly one succeeds, one receives `LastOwner`, and one active Owner remains. Also assert the database rejects an unknown role and audit rows commit/rollback with their assignment mutation.

Run: `pnpm test:integration -- tests/integration/platform-access.test.ts`

Expected: PASS with the disposable integration database; no partial audit or assignment writes.

- [ ] **Step 5: Commit the platform-access service**

```bash
git add src/lib/platform/access.ts src/lib/platform/admins.ts tests/unit/platform-admins.test.ts tests/integration/platform-access.test.ts
git commit -m "feat(auth): manage platform role assignments"
```

---

### Task 4: Enforce exact permissions on agency and support commands

**Files:**

- Modify: `src/lib/platform/agencies.ts`
- Modify: `src/lib/agencies/command.ts`
- Modify: `src/lib/entitlements/change-agency-plan.ts`
- Modify: `src/lib/support/access.ts`
- Modify: `src/app/(app)/app/platform/agencies/actions.ts`
- Modify: `src/app/(app)/app/platform/agencies/[agencyId]/actions.ts`
- Modify: `src/app/(app)/app/platform/security/actions.ts`
- Modify: `tests/unit/agency-update.test.ts`
- Modify: `tests/unit/platform-agencies-service.test.ts`
- Modify: `tests/unit/support-access.test.ts`
- Modify: `tests/integration/platform-agencies.test.ts`
- Modify: `tests/integration/entitlement-service.test.ts`
- Modify: `tests/integration/support-access.test.ts`

- [ ] **Step 1: Write failing exact-permission tests**

Assert these service-level gates:

```ts
expectPermission(createAgency, "platform.agency.create");
expectPermission(updateAgencyAsPlatform, "platform.agency.update");
expectPermission(changeAgencyPlanAsPlatform, "platform.agency.plan.manage");
expectPermission(suspendOrRestoreAgency, "platform.agency.lifecycle.manage");
expectPermission(archiveOrUnarchiveAgency, "platform.agency.archive");
expectPermission(createSupportAccessRequest, "platform.support.request");
```

Add regression cases proving:

- `updateAgencyAsPlatform` succeeds with no agency membership.
- `updateAgency` still rejects a non-agency-admin.
- neither update path inserts an agency membership.
- `restore` clears only `suspended_at` and rejects an archived agency.
- only `unarchive` clears `archived_at`, and it requires archive permission.
- plan authorization happens inside the service wrapper, not only the Server Action.
- Support Operator may request but not approve support access.
- a non-requester platform user can revoke another operator’s grant only with Owner authority.

- [ ] **Step 2: Run the focused suites and verify RED**

Run: `pnpm exec vitest run tests/unit/agency-update.test.ts tests/unit/platform-agencies-service.test.ts tests/unit/support-access.test.ts`

Expected: FAIL on missing exact permission calls, missing platform update entry point, and unsafe restore behavior.

- [ ] **Step 3: Extract the shared agency identity transaction**

Keep two public functions:

```ts
export async function updateAgency(
  actor: Actor,
  agencyId: string,
  raw: UpdateAgencyInput,
): Promise<UpdateAgencyResult> {
  await requirePolicy(isAgencyAdmin(actor, agencyId), "update_agency");
  return updateAgencyIdentity(actor, agencyId, raw, "agency");
}

export async function updateAgencyAsPlatform(
  actor: Actor,
  agencyId: string,
  raw: UpdateAgencyInput,
): Promise<UpdateAgencyResult> {
  await requirePlatformPermission(actor, "platform.agency.update");
  return updateAgencyIdentity(actor, agencyId, raw, "platform");
}
```

The private `updateAgencyIdentity` contains the existing validation, `FOR UPDATE`, slug collision, update, audit, and revalidation. Add `authorityScope` to audit metadata.

- [ ] **Step 4: Split lifecycle transitions and put checks in services**

Change the lifecycle schema to `suspend | restore | archive | unarchive`. Enforce permission based on action inside `changeAgencyLifecycle`. For `restore`, throw a domain error when `archived_at` is non-null; for `unarchive`, clear both archive and suspension because archived rows are always suspended. Preserve before/after/reason audit snapshots.

Change the plan public boundary to accept the actor explicitly:

```ts
export async function changeAgencyPlanAsPlatform(
  actor: Actor,
  input: Omit<ChangeAgencyPlanInput, "actorUserId">,
): Promise<ChangeAgencyPlanResult> {
  await requirePlatformPermission(actor, "platform.agency.plan.manage");
  return changeAgencyPlan({ ...input, actorUserId: actor.id });
}
```

Keep `changeAgencyPlan` as the internal/testable entitlement transaction and make application actions call only the authorized wrapper.

- [ ] **Step 5: Update thin Server Actions and minimal return values**

Every action authenticates with `currentActor`, parses untrusted IDs and form fields with Zod, then delegates to a service that repeats authorization. Remove redundant generic platform-admin checks that could mask the exact service permission. Return `{ ok/success, error/code }` only.

- [ ] **Step 6: Run unit and integration regression suites**

Run: `pnpm exec vitest run tests/unit/agency-update.test.ts tests/unit/platform-agencies-service.test.ts tests/unit/support-access.test.ts && pnpm test:integration -- tests/integration/platform-agencies.test.ts tests/integration/entitlement-service.test.ts tests/integration/support-access.test.ts`

Expected: PASS; platform updates work without tenant membership, restore cannot unarchive, and all service mutations enforce exact permissions.

- [ ] **Step 7: Commit service-boundary enforcement**

```bash
git add src/lib/platform/agencies.ts src/lib/agencies/command.ts src/lib/entitlements/change-agency-plan.ts src/lib/support/access.ts 'src/app/(app)/app/platform/agencies/actions.ts' 'src/app/(app)/app/platform/agencies/[agencyId]/actions.ts' 'src/app/(app)/app/platform/security/actions.ts' tests/unit/agency-update.test.ts tests/unit/platform-agencies-service.test.ts tests/unit/support-access.test.ts tests/integration/platform-agencies.test.ts tests/integration/entitlement-service.test.ts tests/integration/support-access.test.ts
git commit -m "fix(auth): enforce agency operation permissions"
```

---

### Task 5: Make shell navigation and platform reads permission-aware

**Files:**

- Modify: `src/app/(app)/layout.tsx`
- Modify: `src/app/(app)/app/platform/layout.tsx`
- Modify: `src/components/app-shell/app-shell.tsx`
- Modify: `src/components/app-shell/sidebar.tsx`
- Modify: `src/components/app-shell/mobile-nav.tsx`
- Create: `src/components/platform/permission-notice.tsx`
- Modify: `src/app/(app)/app/platform/overview/page.tsx`
- Modify: `src/app/(app)/app/platform/agencies/page.tsx`
- Modify: `src/app/(app)/app/platform/agencies/[agencyId]/page.tsx`
- Modify: `src/app/(app)/app/platform/security/page.tsx`
- Modify: `tests/unit/app-shell/sidebar.test.tsx`
- Modify: `tests/unit/app-shell/mobile-nav.test.tsx`
- Modify: `tests/unit/platform-layout-gate.test.ts`
- Create: `tests/unit/platform/permission-notice.test.tsx`

- [ ] **Step 1: Write failing navigation and permission-state tests**

Pass a safe DTO, not the full principal, to client shell components:

```ts
type PlatformNavigationAccess = Readonly<{
  canEnter: boolean;
  canReadAgencies: boolean;
  canReadSecurity: boolean;
  canReadAccess: boolean;
}>;
```

Assert Owners see all links; Operators see overview/agencies but not security/access; Auditors see overview/agencies/access/security; Support Operators see overview/agencies/security; and non-platform users see none. Assert the mobile menu follows the same matrix.

- [ ] **Step 2: Run component tests and verify RED**

Run: `pnpm exec vitest run tests/unit/app-shell/sidebar.test.tsx tests/unit/app-shell/mobile-nav.test.tsx tests/unit/platform/permission-notice.test.tsx`

Expected: FAIL because shell components still accept one binary boolean.

- [ ] **Step 3: Resolve the principal once for shell presentation**

In the app layout, call `getPlatformPrincipal(actor)` and derive the four booleans with pure permission checks. Continue secure per-service checks close to every data source; the layout DTO controls presentation only.

The platform layout gates console entry and renders the current stable forbidden surface when no active principal exists. Page loaders explicitly require their read permission before querying platform-wide data because Next.js layouts are not a complete data security boundary.

Use these page-read rules:

- Overview and agency list/detail require `platform.agency.read`.
- Platform Access requires `platform.access.read`.
- Security & Support accepts a principal with either `platform.audit.read` or `platform.support.request`; Auditors receive platform-wide safe audit summaries, while Support Operators receive only their own grants/views plus request workflow data.
- Every loader returns a minimal DTO and does not pass a database assignment or principal object into a Client Component.

- [ ] **Step 4: Implement accessible read-only notices**

Create a server-safe component with `role="status"`, Lucide `LockKeyhole`, a visible title, and explanatory description. Use existing `warning-subtle`/border/focus tokens; no gradient, decorative shadow, or color-only meaning.

- [ ] **Step 5: Run shell/page tests and typecheck**

Run: `pnpm exec vitest run tests/unit/app-shell/sidebar.test.tsx tests/unit/app-shell/mobile-nav.test.tsx tests/unit/platform-layout-gate.test.ts tests/unit/platform/permission-notice.test.tsx && pnpm typecheck`

Expected: PASS with identical desktop/mobile permission matrices.

- [ ] **Step 6: Commit permission-aware reads and navigation**

```bash
git add 'src/app/(app)/layout.tsx' 'src/app/(app)/app/platform/layout.tsx' src/components/app-shell/app-shell.tsx src/components/app-shell/sidebar.tsx src/components/app-shell/mobile-nav.tsx src/components/platform/permission-notice.tsx 'src/app/(app)/app/platform/overview/page.tsx' 'src/app/(app)/app/platform/agencies/page.tsx' 'src/app/(app)/app/platform/agencies/[agencyId]/page.tsx' 'src/app/(app)/app/platform/security/page.tsx' tests/unit/app-shell/sidebar.test.tsx tests/unit/app-shell/mobile-nav.test.tsx tests/unit/platform-layout-gate.test.ts tests/unit/platform/permission-notice.test.tsx
git commit -m "feat(auth): render platform access by permission"
```

---

### Task 6: Build the Platform Access administration UI

**Files:**

- Create: `src/app/(app)/app/platform/access/page.tsx`
- Create: `src/app/(app)/app/platform/access/actions.ts`
- Create: `src/app/(app)/app/platform/access/grant-form.tsx`
- Create: `src/app/(app)/app/platform/access/change-role-dialog.tsx`
- Create: `src/app/(app)/app/platform/access/revoke-dialog.tsx`
- Modify: `src/app/(app)/app/platform/admins/page.tsx`
- Remove after imports migrate: `src/app/(app)/app/platform/admins/actions.ts`
- Remove after imports migrate: `src/app/(app)/app/platform/admins/grant-form.tsx`
- Remove after imports migrate: `src/app/(app)/app/platform/admins/revoke-dialog.tsx`
- Create: `tests/unit/platform/platform-access-actions.test.ts`
- Create: `tests/unit/platform/platform-access-forms.test.tsx`

- [ ] **Step 1: Write failing action and form tests**

Assert action schemas accept only the four roles, require a reason, re-authorize through the service, and return no raw records. Component tests assert:

- role select has four options with concise descriptions;
- pending submit buttons are disabled;
- validation errors use `role="alert"` and success uses `role="status"`;
- dialogs have accessible title/description;
- final-Owner downgrade/revoke controls expose the server error;
- Auditor view has no form/menu mutation controls;
- icon-only menu triggers have an accessible name and 44px compact target.

- [ ] **Step 2: Run UI tests and verify RED**

Run: `pnpm exec vitest run tests/unit/platform/platform-access-actions.test.ts tests/unit/platform/platform-access-forms.test.tsx`

Expected: FAIL because the `/platform/access` components and actions do not exist.

- [ ] **Step 3: Implement thin Server Actions**

Use `useActionState` compatible signatures and these state shapes:

```ts
export type PlatformAccessActionState = Readonly<{
  ok?: boolean;
  error?: string;
  code?: string;
  email?: string;
  role?: PlatformRole;
  unchanged?: boolean;
}>;
```

Authenticate, parse `FormData`, call the service, translate known domain errors, and revalidate `/app/platform/access`. Never return assignment or user database rows.

- [ ] **Step 4: Implement the responsive page from the approved mockup**

Use the existing `PageHeader`, `Card`, `Badge`, `DataTable`, `Dialog`, `Input`, `Label`, `Button`, and `FormSubmitButton`. Render:

- boundary-focused header and Owner-only “Add platform member” action;
- four summary tiles;
- responsive assignments table with role badges and plain-text permission summaries;
- role-change and revoke dialogs for Owners;
- visible read-only notice for Auditors;
- one-Owner warning recommending two Owners;
- recent access audit table.

Keep StudioFlow tokens from `globals.css`, no arbitrary design-system colors, no gradients, and no horizontal dependency for the primary mobile task.

- [ ] **Step 5: Add the compatibility redirect and delete obsolete UI files**

`/app/platform/admins` must call `permanentRedirect("/app/platform/access")`. Delete the old form/dialog/action files only after all imports and tests point at the new route.

- [ ] **Step 6: Run component tests, lint, and typecheck**

Run: `pnpm exec vitest run tests/unit/platform/platform-access-actions.test.ts tests/unit/platform/platform-access-forms.test.tsx && pnpm lint && pnpm typecheck`

Expected: PASS with no accessibility lint or server/client boundary error.

- [ ] **Step 7: Commit the access UI**

```bash
git add 'src/app/(app)/app/platform/access' 'src/app/(app)/app/platform/admins' tests/unit/platform/platform-access-actions.test.ts tests/unit/platform/platform-access-forms.test.tsx
git commit -m "feat(auth): add platform access management UI"
```

---

### Task 7: Render role-aware agency and support controls

**Files:**

- Modify: `src/app/(app)/app/platform/agencies/page.tsx`
- Modify: `src/app/(app)/app/platform/agencies/[agencyId]/page.tsx`
- Modify: `src/app/(app)/app/platform/agencies/[agencyId]/edit-agency-form.tsx`
- Modify: `src/app/(app)/app/platform/agencies/[agencyId]/plan-ai-sections.tsx`
- Modify: `src/app/(app)/app/platform/agencies/[agencyId]/support-section.tsx`
- Modify: `src/app/(app)/app/platform/security/page.tsx`
- Create: `src/app/(app)/app/platform/security/request-access-form.tsx`
- Create: `tests/unit/platform/agency-permission-ui.test.tsx`
- Create: `tests/unit/platform/support-request-form.test.tsx`

- [ ] **Step 1: Write failing permission-presentation tests**

Model page component props as booleans derived on the server, for example:

```ts
type AgencyDetailCapabilities = Readonly<{
  canUpdate: boolean;
  canManagePlan: boolean;
  canManageLifecycle: boolean;
  canArchive: boolean;
  canRequestSupport: boolean;
}>;
```

Assert Operator sees edit/plan/suspend/restore but not archive/unarchive/support request; Auditor sees data plus a read-only notice and no mutation forms; Support Operator sees request-support only; Owner sees every allowed control. Assert archived agencies show `Unarchive` only to Owners and never show normal `Restore` as an unarchive path.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm exec vitest run tests/unit/platform/agency-permission-ui.test.tsx tests/unit/platform/support-request-form.test.tsx`

Expected: FAIL because current pages always render all mutation controls and no request form exists.

- [ ] **Step 3: Implement server-derived capability props**

At each async page/leaf boundary, resolve the current actor and require the page read permission before data access. Derive only the boolean capabilities needed by client components. Omit unauthorized controls from the rendered tree.

- [ ] **Step 4: Improve lifecycle and support UX**

Render suspend/restore and Owner-only archive/unarchive in separate card regions. Use explicit confirmation dialogs with target name and mandatory reason for archive/unarchive. Add a support request form with ticket reference, duration, metadata-only scope, optional workspace scope, downloads request, and reason; show that only agency admins can approve and that approval is temporary. On Security & Support, render the Auditor’s bounded platform-wide audit DTO separately from the Support Operator’s own-view audit DTO so support access cannot become a general audit permission.

- [ ] **Step 5: Run focused UI and service regressions**

Run: `pnpm exec vitest run tests/unit/platform/agency-permission-ui.test.tsx tests/unit/platform/support-request-form.test.tsx tests/unit/agency-update.test.ts tests/unit/support-access.test.ts && pnpm typecheck`

Expected: PASS; no role can see or call a mutation beyond its permission bundle.

- [ ] **Step 6: Commit role-aware agency UX**

```bash
git add 'src/app/(app)/app/platform/agencies' 'src/app/(app)/app/platform/security' tests/unit/platform/agency-permission-ui.test.tsx tests/unit/platform/support-request-form.test.tsx tests/unit/agency-update.test.ts tests/unit/support-access.test.ts
git commit -m "feat(auth): add role-aware agency controls"
```

---

### Task 8: Extend fixtures and browser authorization coverage

**Files:**

- Modify: `src/app/api/dev/seed/route.ts`
- Modify: `tests/e2e/_helpers.ts`
- Create: `tests/e2e/platform-access.spec.ts`
- Create: `tests/e2e/platform-access-responsive.spec.ts`
- Modify: `tests/e2e/platform-overview.spec.ts`
- Modify: `tests/e2e/agency-edit.spec.ts`
- Delete: `tests/e2e/platform-admins.spec.ts`

- [ ] **Step 1: Write failing explicit-role seed and E2E cases**

Replace binary fixture input with a backward-compatible role field:

```ts
type PlatformRole = "platform_owner" | "agency_operator" | "platform_auditor" | "support_operator";

type SeedBody = {
  platformAdmin?: boolean;
  platformRole?: PlatformRole;
};
```

`platformAdmin: true` remains an alias for `platform_owner` so unrelated E2E tests do not break. New tests use `platformRole` explicitly.

Browser cases must prove:

1. Owner grants an Auditor, changes them to Operator, then revokes access.
2. Auditor can open Platform Access but sees no mutation controls.
3. Operator can edit agency identity without agency membership and cannot archive or open Platform Access.
4. Support Operator can file a request and cannot edit identity/plan/lifecycle.
5. Non-platform user receives the stable forbidden surface.
6. `/app/platform/admins` permanently redirects to `/app/platform/access`.

- [ ] **Step 2: Run the selected browser suite and verify RED**

Run: `pnpm test:e2e:isolated -- tests/e2e/platform-access.spec.ts tests/e2e/platform-access-responsive.spec.ts tests/e2e/platform-overview.spec.ts tests/e2e/agency-edit.spec.ts --project=chromium`

Expected: FAIL until fixtures and routes support explicit roles.

- [ ] **Step 3: Implement fixture compatibility and stable test IDs**

Validate `platformRole` with the same closed role values and write it explicitly when seeding. Keep test IDs semantic (`platform-access-*`) and avoid selectors tied to Tailwind classes.

- [ ] **Step 4: Run E2E and accessibility checks**

Run: `pnpm test:e2e:isolated -- tests/e2e/platform-access.spec.ts tests/e2e/platform-access-responsive.spec.ts tests/e2e/platform-overview.spec.ts tests/e2e/agency-edit.spec.ts --project=chromium && pnpm test:e2e:isolated -- --grep @a11y --project=chromium`

Expected: PASS for the role journeys and no serious/critical axe violations.

- [ ] **Step 5: Review six responsive viewports**

In `platform-access-responsive.spec.ts`, iterate 320×568, 390×844, 768×1024, 1024×768, 1280×800, and 1440×900. At each viewport, assert the person identity, role, and permitted primary action are visible, the document has no horizontal overflow, and the action trigger meets the 44px compact target requirement. Capture deterministic screenshots under `test-results/platform-access-responsive/` for manual review; do not add this non-Stitch route to the canonical Stitch parity manifest.

- [ ] **Step 6: Commit fixtures and browser coverage**

```bash
git add src/app/api/dev/seed/route.ts tests/e2e/_helpers.ts tests/e2e/platform-access.spec.ts tests/e2e/platform-access-responsive.spec.ts tests/e2e/platform-overview.spec.ts tests/e2e/agency-edit.spec.ts
git add -u tests/e2e/platform-admins.spec.ts
git commit -m "test(auth): cover platform roles end to end"
```

---

### Task 9: Document the security decision and operating procedures

**Files:**

- Create: `docs/decisions/0005-platform-role-permissions.md`
- Modify: `docs/agency-setup.md`
- Modify: `docs/architecture/authorization.md`
- Modify: `docs/testing/strategy.md`
- Modify: `docs/implementation/progress.md`
- Modify: `PRODUCTION_READINESS_TRACKER.md`

- [ ] **Step 1: Write the ADR and permission matrix**

Record context, decision, alternatives, consequences, tenant-boundary guarantee, one-role limitation, last-Owner invariant, and the explicit reason the existing table was extended instead of replaced.

- [ ] **Step 2: Update bootstrap, review, and recovery instructions**

The emergency SQL must grant `platform_owner` explicitly. Add a quarterly review procedure and the safe rollback sequence: maintenance mode, snapshot assignments, soft-revoke active non-Owners, roll back the app, and restore role-aware assignments only after the new image returns.

- [ ] **Step 3: Update architecture/testing/readiness records**

Document exact permission checks at the DAL/service boundary, page gates as presentation only, support JIT separation, required role-matrix tests, and the newly closed restore/unarchive vulnerability. Mark tracker items only to `Implemented`/`Tested` with exact evidence; do not self-assign independent `Verified` status.

- [ ] **Step 4: Check documentation format and contradictions**

Run: `pnpm exec prettier --check docs/decisions/0005-platform-role-permissions.md docs/agency-setup.md docs/architecture/authorization.md docs/testing/strategy.md docs/implementation/progress.md PRODUCTION_READINESS_TRACKER.md && rg -n "every platform admin|binary platform|Platform admins|restore.*archiv" docs src --glob '!docs/superpowers/plans/*'`

Expected: formatting PASS; every remaining binary-admin phrase is either historical/compatibility context or corrected.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/decisions/0005-platform-role-permissions.md docs/agency-setup.md docs/architecture/authorization.md docs/testing/strategy.md docs/implementation/progress.md PRODUCTION_READINESS_TRACKER.md
git commit -m "docs(auth): document platform access operations"
```

---

### Task 10: Drill migration, verify the release, deploy, and prove production behavior

**Files:**

- Modify: `docs/production-readiness/MIGRATION_DEPLOYMENT.md`
- Modify: `docs/production-readiness/SECURITY_AUDIT.md`
- Modify: `docs/production-readiness/TEST_EVIDENCE.md`
- Modify: `docs/production-readiness/UAT_RELEASE.md` only if the release verdict evidence changes

- [ ] **Step 1: Capture a pre-drill backup and run the forward migration drill**

Run: `pnpm migration-drill`

Expected: PASS on a disposable database for blank-schema migration, upgrade from the pre-0018 state, idempotent rerun, and application compatibility checks. Record date, exact SHA, command, exit code, masked backup location, and summarized row/constraint evidence.

- [ ] **Step 2: Prove rollback compatibility explicitly**

On the disposable drill database:

1. Seed one Owner and one non-Owner.
2. Verify the old binary query would see both active rows.
3. Apply the documented rollback preparation and verify only Owners remain active.
4. Verify role assignments can be restored from the snapshot after returning to the role-aware image.

Record row counts only; do not record production emails, user IDs, or secrets.

- [ ] **Step 3: Run the full local deploy gate with fresh output**

Run: `pnpm verify && pnpm test:integration`

Expected: format, lint, typecheck, unit, build, and all integration suites PASS. Compilation alone is not sufficient; both commands must be green.

- [ ] **Step 4: Run focused browser, accessibility, and visual checks**

Run: `pnpm test:e2e:isolated -- tests/e2e/platform-access.spec.ts tests/e2e/platform-access-responsive.spec.ts tests/e2e/platform-overview.spec.ts tests/e2e/agency-edit.spec.ts --project=chromium && pnpm test:e2e:isolated -- --grep @a11y --project=chromium`

Expected: PASS. Review responsive screenshots manually for clipping, focus visibility, dialog behavior, and mobile primary-task access.

- [ ] **Step 5: Perform the completion audit**

Map every acceptance criterion in the design spec to current evidence: schema/migration, unit matrix, service tests, concurrency integration, browser role journeys, tenant isolation, accessible UI, rollback drill, documentation, and clean worktree. Any missing or indirect evidence keeps the work incomplete.

- [ ] **Step 6: Record the evidence bundle and commit it**

Update the three evidence documents with exact date, SHA, commands, exit codes, and summarized results. Do not mark independent-review rows `Verified`.

```bash
git add docs/production-readiness/MIGRATION_DEPLOYMENT.md docs/production-readiness/SECURITY_AUDIT.md docs/production-readiness/TEST_EVIDENCE.md docs/production-readiness/UAT_RELEASE.md
git commit -m "docs(auth): record platform access release evidence"
```

- [ ] **Step 7: Push and watch authoritative CI**

Run: `git status --short && git log --oneline origin/main..main && git push origin main`

Expected: clean worktree before push; all atomic commits push to `main`; CI deploy gate starts for the exact head SHA. Do not deploy a different SHA.

- [ ] **Step 8: Verify deployment and production smoke behavior**

After CI and the SHA-pinned deploy succeed, verify:

- `/api/health` reports healthy app/database and the deployed version matches the pushed SHA;
- existing platform users still enter the console as Owners;
- Platform Access renders and role changes are audited;
- an Operator can edit an agency without tenant membership but cannot archive;
- an Auditor cannot mutate;
- a Support Operator can request JIT access but cannot edit agency administration;
- sign-in, My Work, and ordinary agency/workspace access still function;
- no new error references appear in deployment logs.

Record only masked/non-sensitive evidence. If any smoke check fails, stop role reduction, roll back using the documented compatibility procedure, and keep the goal active until corrected.
