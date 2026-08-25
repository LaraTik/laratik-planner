# Adding a new role (workspace or platform)

> Companion to `docs/agency-setup.md:17` (existing role list) and `tests/e2e/role-authorization.spec.ts` (the role-by-route matrix). A new role is a cross-cutting change that touches the schema enum, the policy helpers, the role-by-route matrix, the sidebar visibility, the UAT row, and the e2e test. This file is the recipe for every step.

## 1. The two role scopes

The system has two parallel role surfaces (see `docs/agency-setup.md:1-20` for the conceptual model):

- **Workspace roles** — seven roles (`workspace_manager`, `content_planner`, `designer`, `internal_reviewer`, `client_reviewer`, `publisher`, `viewer`) defined in the `workspace_role` Postgres enum (`src/lib/db/schema/enums.ts:47-55`). A user holds zero or more workspace roles in `workspace_membership_role` (`src/lib/db/schema/workspaces.ts:113-125`).
- **Platform roles** — four roles (`platform_owner`, `agency_operator`, `platform_auditor`, `support_operator`) defined in the `platform_administrator` table's `role` column. A user holds at most one platform role. The matrix is in `docs/architecture/authorization.md:54-68`.

A new role is either a workspace role (e.g. `finance_reviewer`) or a platform role (e.g. `PlatformOwner` → `PlatformOwnerPlus`). The two surfaces have different recipes.

## 2. Schema enum (workspace role)

The workspace role enum is the first place a new role lands. The pattern is in `src/lib/db/schema/enums.ts:47-55`:

```ts
export const workspaceRoleEnum = pgEnum("workspace_role", [
  "workspace_manager",
  "content_planner",
  "designer",
  "internal_reviewer",
  "client_reviewer",
  "publisher",
  "viewer",
  // NEW: "finance_reviewer",
]);
```

A new value is a **new migration** (the enum is in the database, not just in TypeScript). The migration is additive per `docs/architecture/migrations.md:1`:

```sql
ALTER TYPE workspace_role ADD VALUE 'finance_reviewer';
```

Postgres enums are append-only. Removing a value requires a new enum type and a column migration — that is a destructive change and needs an ADR per `docs/architecture/migrations.md:1`.

The TypeScript enum value is the source of truth for the application code. The migration adds the value to the database; the `pgEnum` declaration must be updated in the same commit so the TypeScript and Postgres values match.

## 3. Policy helpers

The policy helpers in `src/lib/auth/policy.ts` are the per-role capability surface. The pattern is the four-helper shape:

- `INTERNAL_WORKSPACE_ROLES` — the set of roles that satisfy `canAccessInternalWorkspace`. A new internal role (e.g. `finance_reviewer` for an internal-only surface) is added here.
- `CLIENT_WORKSPACE_ROLES` — the set of roles that satisfy `canAccessClientWorkspace`. A new client role (e.g. `finance_reviewer_client`) is added here.
- `canManageContent(actor, workspaceId)` — Quick Create + planning edits. A new role with content-management capability is added here.
- `canReview(actor, workspaceId, gate)` — the review-gate helper. A new role with review capability on a specific gate is added here.

Each helper is a typed set membership check; the unit test in `tests/unit/auth-policy.test.ts` covers the matrix. A new role is a new unit test row in the matrix; the helper is the only place the role's capability is encoded.

The policy helpers are the boundary. A new role that grants a capability must update the helper; a new role that does not grant a capability does not need a helper change. A new role that needs a brand-new capability (e.g. `canApproveFinancials`) gets a new helper in the same commit.

## 4. Role-by-route matrix (e2e)

The role-by-route matrix in `tests/e2e/role-authorization.spec.ts` is the per-role / per-route contract. The pattern is a `RoleCase` per role, with `can` (positive routes) and `cannot` (negative routes) entries:

```ts
type RoleCase = {
  role: Exclude<FixtureRole, "agency_admin">;
  can: { route: string; testid: string }[];
  cannot: { route: string; heading: RegExp }[];
};

const ROLE_MATRIX: RoleCase[] = [
  // ... existing roles ...
  {
    role: "finance_reviewer",
    can: [{ route: "/app/w/acme/finance", testid: "finance-overview" }],
    cannot: [{ route: "/app/w/acme/planning/new", heading: /Creation access required/i }],
  },
];
```

The `FixtureRole` type in `tests/e2e/_helpers.ts:200-206` is the source of truth for the e2e role list. A new role is added to `FixtureRole` and to the `ROLE_MATRIX` in the same commit. The matrix is run on every PR; a missing row for a new role is a CI-blocker.

The matrix is **not** exhaustive. The contract is: every new role has at least one positive and one negative assertion. A matrix row that exercises a representative surface is the per-role gate; the per-route exhaustive matrix is in `PRODUCTION_READINESS_TRACKER.md SEC-003` and is updated separately.

## 5. Sidebar visibility

The sidebar surfaces in `src/components/app-shell/sidebar.tsx` are role-gated. A new role's surfaces are added to the sidebar's role-aware filter. The pattern:

- The sidebar reads the actor's workspace roles and platform role from the session.
- Each `SidebarSubLink` is gated by a `requiredRoles` prop (a `WorkspaceRole[]` for workspace surfaces, a `PlatformRole` for platform surfaces).
- A new role's surfaces are added to the `requiredRoles` array of the relevant `SidebarSubLink` entries.

A role that is **read-only** across the workspace (`viewer`) does not need new sidebar entries; a role that is **write-capable** on a surface needs the entry in the `requiredRoles` of the surfaces it can write to.

The sidebar is the user-facing surface; the server is the source of truth (see `docs/contributing/conventions.md:2`). A sidebar entry that is wrong is a UX bug, not a security bug; a server route that is wrong is a security review-blocker.

## 6. `UAT_RELEASE.md` row

The new role's UAT evidence lives in `docs/production-readiness/UAT_RELEASE.md`. The row uses the `PASS / PARTIAL / OUT OF SCOPE` convention from `docs/testing/conventions.md:4` and references:

- The §23 step ID(s) the role exercises.
- The M-tag and the goal number.
- The role-by-route matrix evidence (the e2e test file + the Playwright run).
- The policy helper evidence (the unit test file + the Vitest run).
- The operator + date.

A new role is not `Verified` until the UAT row is signed. The sign-off is the per-role gate; the `READY FOR INDEPENDENT REVIEW` → `READY` verdict transition is the per-release gate.

## 7. Platform role variant (e.g. splitting `PlatformOwner`)

A platform role variant (e.g. `PlatformOwner` → `PlatformOwner` + `PlatformOwnerPlus`) is a different surface. The platform role is a single column on `platform_administrator.role`, so a new platform role is a `CHECK` constraint widening (per `docs/architecture/migrations.md:1`):

```sql
ALTER TABLE "platform_administrator"
  DROP CONSTRAINT "platform_administrator_role_valid";
ALTER TABLE "platform_administrator"
  ADD CONSTRAINT "platform_administrator_role_valid"
  CHECK (role IN ('platform_owner', 'agency_operator', 'platform_auditor', 'support_operator', '<new>'));
```

The platform role matrix in `docs/architecture/authorization.md:54-68` is the contract. A new role is a new column row per capability; the matrix is the source of truth for what the role can do.

The platform role does not have a `FixtureRole` entry (the dev seed creates a single platform admin at a time). The platform role is exercised by `tests/integration/platform-access.test.ts` (the direct command-call matrix) and `tests/e2e/role-authorization.spec.ts` (the browser surface for the platform console).

## 8. Author checklist

Before opening the PR for a new role:

- [ ] The Postgres enum is widened in a new migration (additive per `docs/architecture/migrations.md:1`).
- [ ] The TypeScript `pgEnum` is updated in the same commit.
- [ ] The policy helpers in `src/lib/auth/policy.ts` are updated if the role grants a capability.
- [ ] The unit test in `tests/unit/auth-policy.test.ts` is updated with the new role row.
- [ ] The `FixtureRole` type in `tests/e2e/_helpers.ts` is updated.
- [ ] The `ROLE_MATRIX` in `tests/e2e/role-authorization.spec.ts` is updated with at least one positive and one negative assertion.
- [ ] The sidebar entries in `src/components/app-shell/sidebar.tsx` are updated with the new role in the `requiredRoles` arrays of the relevant surfaces.
- [ ] The `UAT_RELEASE.md` row is added with the §23 step ID(s), the M-tag, the e2e + unit test evidence, the operator + date.
- [ ] `pnpm verify` is green (format, lint, typecheck, unit, build) and `pnpm test:integration` passes on disposable Postgres.
- [ ] The PR title references the M-tag and the gap audit ID (e.g. `M4.7 — finance_reviewer (DOC-15, GAP-FULL-REVIEW-2026-08-25)`).

## 9. Common hazards

- **Adding a value to the Postgres enum without updating TypeScript** — the type and the database drift, and a write that uses the new value fails at the database layer. The `pgEnum` declaration must be in the same commit.
- **Removing a value from the Postgres enum** — Postgres enums are append-only at the SQL level. A removal is a new enum type + a column migration; that is a destructive change and needs an ADR per `docs/architecture/migrations.md:1`.
- **Adding the role to the sidebar but not the policy helper** — the sidebar is the UX; the helper is the source of truth. A user who URL-hops to a forbidden route must still get a `403` / `404` from the server. The sidebar is optional; the helper is mandatory.
- **Adding the role to the policy helper but not the e2e matrix** — the e2e matrix is the per-role / per-route contract. A role without a matrix row is unverified.
- **Granting a capability through a new helper but forgetting the unit test** — `tests/unit/auth-policy.test.ts` is the matrix. A new helper without a unit test row is a coverage gap.
- **Adding a platform role as a workspace role (or vice versa)** — the two surfaces are independent. A `finance_reviewer` workspace role is different from a `PlatformFinance` platform role; the capability surface is different.
- **Forgetting the migration drill** — `pnpm migration-drill` must pass drills 1–5 with the new enum value included. The drill result is the evidence attached to the PR per `docs/architecture/migrations.md:5`.

## 10. Cross-references

- `docs/agency-setup.md` — the role matrix and the per-scope authority model.
- `docs/architecture/authorization.md` — the platform role matrix and the `(actor, agencyId)` pattern.
- `src/lib/db/schema/enums.ts:47-55` — the `workspace_role` enum.
- `src/lib/db/schema/workspaces.ts:113-125` — the `workspace_membership_role` table.
- `src/lib/auth/policy.ts` — the policy helpers and the per-role capability surface.
- `tests/unit/auth-policy.test.ts` — the unit matrix.
- `tests/e2e/role-authorization.spec.ts` — the e2e role-by-route matrix.
- `tests/e2e/_helpers.ts:200-206` — the `FixtureRole` type.
- `src/components/app-shell/sidebar.tsx` — the sidebar surfaces and the `requiredRoles` arrays.
- `docs/production-readiness/UAT_RELEASE.md` — the per-role UAT rows.
- `docs/architecture/migrations.md` — the migration author conventions.
