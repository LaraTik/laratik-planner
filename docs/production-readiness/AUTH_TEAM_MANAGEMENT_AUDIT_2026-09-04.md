# Auth and Team Management Audit — 2026-09-04

## Scope

This audit covers the user-management surfaces and the reported failures:

- multi-role assignment in the workspace role matrix;
- direct user creation with workspace roles and Agency Admin access;
- invitation grant persistence and acceptance;
- Agency Admin promotion/demotion;
- workspace Team-page role editing and tenant/scope enforcement;
- user-visible failure handling for the related server actions.

The review used the StudioFlow role matrix, `docs/architecture/authorization.md`,
`docs/agency-setup.md`, the production-readiness tracker, the current source,
and the existing unit/integration tests. No production data or identifiers were
changed.

## Findings and disposition

### F-01 — Multi-role assignment could lose all but the last role

**Severity:** P0

The client contract now emits one `{ workspaceId, roles[] }` entry per
workspace. The server action accumulates roles when it receives either that
shape or the legacy one-entry-per-role shape, then replaces the target's role
rows atomically. The direct-create service now uses the canonical flattening
helper, which removes duplicate `(workspace, role)` pairs, and returns each
workspace once.

**Status:** Fixed and covered.

Evidence:

- `tests/unit/workspace-role-matrix.test.tsx` verifies the wire payload;
- `tests/unit/users-membership-actions.test.ts` verifies the action path;
- `tests/unit/auth/user-creation.test.ts` verifies direct-create persistence;
- `tests/integration/member-roles-update.test.ts` and
  `tests/integration/auth/user-creation.integration.test.ts` provide real
  Postgres coverage when the disposable test database is available.

### F-02 — Agency Admin assignment was represented by a tenant membership flag,

but the account badge read the obsolete global user role

**Severity:** P1

Agency Admin is agency-scoped by design. Both direct creation and the edit
action write `agency_membership.is_agency_admin`, and authorization/layout
checks read that membership flag. The account profile badge incorrectly read
`user.role`, which can remain `user` for a person who is an Agency Admin in one
agency and a regular member in another. That made a successful promotion look
like it had failed.

**Status:** Fixed. The account badge now reads the active agency membership;
the global `user.role` is not mutated because it is not the authority for
tenant-scoped access.

### F-03 — Workspace managers could view Team but could not edit team roles

**Severity:** P1

The role matrix grants Workspace Managers permission to manage team and roles,
but the action required an Agency Admin and the Team page exposed an edit
drawer without a usable save path for managers. The drawer also loaded every
agency workspace, which would have been too broad for a workspace-scoped
manager.

**Status:** Fixed. A workspace manager can now edit an active member in the
current workspace. The form carries a server-checked scope workspace, the
drawer shows only that workspace, and a tampered cross-workspace payload is
rejected. Agency Admins retain agency-wide editing and the Agency Admin toggle.
Users without either authority no longer receive the edit trigger.

### F-04 — Agency Admin database failures escaped the server action

**Severity:** P1

The role action already converted database failures into inline state, but the
Agency Admin action awaited its transaction without a catch. A trigger,
connection, or constraint error could therefore replace the page with an
unhandled server-action error instead of preserving the user's form context.

**Status:** Fixed. Infrastructure errors are captured and returned as inline
action state. Business safety errors remain specific.

### F-05 — Final-admin protection was not serialized across concurrent changes

**Severity:** P1

The old implementation counted active admins before its update transaction.
Two concurrent demotions could both observe a safe count and leave the agency
without an administrator.

**Status:** Fixed. Admin changes now take a transaction-scoped advisory lock per
agency, reread the target and admin count under that lock, enforce the safety
rule, update the membership, and write the audit event in one transaction.

## Confirmed controls

- Agency Admin access is checked from the active agency membership, not from a
  client-provided role or stale session badge.
- Cross-agency workspace IDs are rejected by the server action.
- Self role editing remains blocked; self Agency Admin changes remain blocked.
- The final active Agency Admin cannot be demoted.
- Role writes and audit events are transactional.
- Direct-create plaintext temporary passwords are not persisted.
- Existing invitation acceptance preserves an existing Agency Admin flag when a
  later invitation grants narrower access.
- Client checkbox serialization was reproduced in the component harness: a
  checked Agency Admin control reaches its alternate action as
  `isAgencyAdmin=on`.

## Verification record

Passed on the current working tree:

- focused auth/team suite: 19 tests passed;
- TypeScript strict typecheck;
- formatting check for all touched files;
- `git diff --check`.

Not yet evidenced in this environment:

- real Postgres integration and migration-drill execution;
- isolated Playwright/authenticated browser flows;
- full release verification and production deployment.

The local Docker daemon was unavailable, the disposable `planner_test`
database was not reachable, and the temporary development server returned 500
on its dev seed/sign-in probes before exiting. These are environment blockers,
not evidence that the application or database paths are green. The integration
and browser gates must be rerun against the disposable test database before
this audit can be marked independently Verified.
