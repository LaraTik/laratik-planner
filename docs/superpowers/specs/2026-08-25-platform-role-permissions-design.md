# Platform Role Permissions Design

**Date:** 2026-08-25  
**Status:** Proposed for document review  
**Scope:** `/app/platform/*`, platform-level agency operations, and support-access requests

## Context

The platform console currently treats every active row in `platform_administrator` as one unrestricted global role. Any platform administrator can list, create, suspend, restore, archive, and change plans for agencies, and can grant or revoke the same unrestricted role for another user.

The binary model is broader than the operating need and creates two concrete problems:

1. It does not provide least-privilege roles for operations, audit, or support staff.
2. Platform agency identity edits pass the platform-admin gate and then call the tenant-scoped `updateAgency` command, which independently requires an agency-admin membership. A legitimate platform administrator therefore cannot edit an agency unless they are also a tenant administrator. Granting tenant membership to work around this would violate the intended boundary between platform authority and tenant content access.

The design keeps the existing separation described by ADR 0002: platform authority controls the SaaS platform and agency records; agency membership controls tenant content; temporary support grants are the only scoped path across that boundary.

## Goals

- Replace the binary platform-admin capability with explicit, understandable roles.
- Enforce every permission at the server boundary with deny-by-default behavior.
- Keep platform roles separate from agency membership and tenant-content access.
- Allow authorized platform operators to update agency identity without becoming agency admins.
- Restrict platform-role administration and agency archiving to Platform Owners.
- Preserve recoverable archive behavior; do not introduce hard deletion.
- Preserve production data and prevent administrator lockout during migration and rollback.
- Make read-only and restricted states clear, accessible, and responsive in the UI.
- Audit every privileged mutation with actor, target, reason, outcome, and relevant before/after data.

## Non-goals

- Platform roles do not replace agency or workspace roles.
- Platform roles do not grant campaign, content, asset, discussion, or workspace access.
- This change does not add permanent support impersonation.
- This change does not add hard deletion for agencies or platform-access records.
- This version does not support arbitrary per-user permission overrides or multiple simultaneous platform roles.
- This version does not build a general external policy engine.

## Chosen approach

Add one typed `role` column to the existing `platform_administrator` table and map each role to a fixed permission bundle in server code.

This is preferred over replacing the table because it is additive, keeps existing identifiers and revocation history, and lets the pre-deployment application continue to interpret active rows safely during a rolling or rollback window. It is preferred over raw per-user permissions because the current operating model is small and stable, while named roles are easier to understand, review, test, and audit.

The design leaves a future normalization path open if multiple simultaneous roles or organization-defined roles become necessary.

## Role model

Each active platform-access record has exactly one role.

| Role               | Purpose                      | Effective access                                                           |
| ------------------ | ---------------------------- | -------------------------------------------------------------------------- |
| `platform_owner`   | Accountable platform owner   | All platform permissions, including role administration and agency archive |
| `agency_operator`  | Day-to-day agency operations | Read, create, edit, change plan, suspend, and restore agencies             |
| `platform_auditor` | Oversight and investigation  | Read-only agency, platform-access, security, usage, and audit views        |
| `support_operator` | Customer support workflow    | Read agency metadata and request temporary, agency-approved support access |

Role display labels are “Platform Owner”, “Agency Operator”, “Platform Auditor”, and “Support Operator”. Identifiers are stable lowercase values used only by the server, database, tests, and audit metadata.

## Permission vocabulary

The authorization layer uses a closed TypeScript union, not free-form strings supplied by clients.

| Permission                         | Owner | Agency operator | Auditor | Support operator |
| ---------------------------------- | :---: | :-------------: | :-----: | :--------------: |
| `platform.console.read`            |  Yes  |       Yes       |   Yes   |       Yes        |
| `platform.agency.read`             |  Yes  |       Yes       |   Yes   |       Yes        |
| `platform.agency.create`           |  Yes  |       Yes       |   No    |        No        |
| `platform.agency.update`           |  Yes  |       Yes       |   No    |        No        |
| `platform.agency.plan.manage`      |  Yes  |       Yes       |   No    |        No        |
| `platform.agency.lifecycle.manage` |  Yes  |       Yes       |   No    |        No        |
| `platform.agency.archive`          |  Yes  |       No        |   No    |        No        |
| `platform.support.request`         |  Yes  |       No        |   No    |       Yes        |
| `platform.access.read`             |  Yes  |       No        |   Yes   |        No        |
| `platform.access.manage`           |  Yes  |       No        |   No    |        No        |
| `platform.audit.read`              |  Yes  |       No        |   Yes   |        No        |

`platform.agency.lifecycle.manage` covers suspension and restoration of a suspended agency only. Archive and unarchive are deliberately separate because they remove an agency from, or return it to, normal operation and require a higher level of authority. A normal `restore` operation must never clear `archived_at`.

Platform Owners receive the complete closed permission set. Other roles receive explicitly enumerated bundles. A newly added permission is therefore Owner-only until deliberately assigned to another role, which is the safe default.

## Server authorization design

`src/lib/auth/platform-access.ts` becomes the central platform authorization module and exposes:

- `getPlatformPrincipal(actor)` → active role and derived permissions, or `null`.
- `hasPlatformPermission(actor, permission)` → fail-closed boolean helper.
- `requirePlatformPermission(actor, permission)` → returns the principal or throws `PermissionDeniedError` with a permission-specific action code.
- `requirePlatformAdmin(actor)` → temporary compatibility alias for `requirePlatformPermission(actor, "platform.console.read")` while callers are migrated.

The existing `src/lib/auth/platform-admin.ts` module re-exports the compatibility helpers so current imports continue to work during incremental implementation. New code imports the explicit platform-access API.

Database errors continue to fail closed. They must not be interpreted as authorization success.

The platform layout checks `platform.console.read` and passes the resolved principal to platform navigation and page-level presentation. This layout check is an entry gate only. Every server action and service command repeats the exact permission required for the mutation.

The client never submits or chooses an effective permission. It may submit a requested role to an Owner-only action; the server validates that role against the closed schema and derives permissions internally.

## Agency command boundary

Agency self-service and platform operations remain two distinct authorization paths:

- `updateAgency(actor, agencyId, input)` remains the agency-admin command used by agency settings.
- A platform-scoped command, `updateAgencyAsPlatform(actor, agencyId, input)`, requires `platform.agency.update`.
- Both commands call one private transactional mutation function after their respective authorization checks.

The shared private mutation owns validation, row locking, slug-conflict handling, the database update, cache revalidation, and audit persistence. This removes duplicated write logic without conflating platform authority with agency membership.

The platform audit entry for an identity edit includes `authorityScope: "platform"`; the agency self-service entry includes `authorityScope: "agency"`. Neither path grants or creates tenant membership.

The same exact-permission rule applies to all existing platform commands:

| Operation                                | Required permission                |
| ---------------------------------------- | ---------------------------------- |
| List/open agencies                       | `platform.agency.read`             |
| Create agency                            | `platform.agency.create`           |
| Edit agency identity                     | `platform.agency.update`           |
| Change plan or overrides                 | `platform.agency.plan.manage`      |
| Suspend or restore a suspended agency    | `platform.agency.lifecycle.manage` |
| Archive or unarchive                     | `platform.agency.archive`          |
| Create support-access request            | `platform.support.request`         |
| View platform-access assignments         | `platform.access.read`             |
| Grant, change, or revoke a platform role | `platform.access.manage`           |
| View platform-wide audit/security data   | `platform.audit.read`              |

## Platform-access administration

The existing `/app/platform/admins` route remains as a compatibility redirect to `/app/platform/access`. The sidebar label changes from “Admins” to “Platform access”. Stable redirects avoid breaking bookmarks while removing the implication that every platform user is an unrestricted administrator.

Only Platform Owners can add, change, reactivate, or revoke platform access. Platform Auditors can view the page and audit trail but receive an explicit read-only banner and no mutation controls. Agency and Support Operators do not see the navigation item and receive a permission-denied result if they navigate directly.

Mutations are:

- **Grant:** email, role, and reason are required. The user must already exist.
- **Change role:** target user, new role, and reason are required. A no-op is idempotent.
- **Revoke:** target user and reason are required. Revocation remains soft and recoverable.

Every successful mutation writes a `security_audit_event` using the action names:

- `platform_access.grant`
- `platform_access.role_change`
- `platform_access.revoke`

Audit metadata includes the target email, previous role when present, new role when present, and the submitted reason. The table continues to retain the current row and revocation history.

## Owner lockout and concurrency safety

The system must always retain at least one active Platform Owner.

Before revoking or downgrading an Owner, the mutation transaction obtains a transaction-scoped advisory lock for platform-access administration, then re-reads the active Owner count. The mutation is rejected if the target is the final active Owner.

The same serialization is used for grant, role-change, reactivation, and revoke operations so concurrent requests cannot both pass a stale count. The UI recommends maintaining two Owners but the hard invariant is one.

The last-Owner rule is enforced only on the server and in the transaction. Button state and confirmation copy are additional guidance, not the protection mechanism.

## Data model and migration

The migration is additive:

- Add `role text NOT NULL DEFAULT 'platform_owner'`.
- Add a database check constraint containing the four supported role identifiers.
- Add `updated_at timestamptz NOT NULL DEFAULT now()` for current-assignment display and operational review.
- Add an index supporting active-role counts and filtered access listings.

All existing active and revoked rows backfill to `platform_owner`. This preserves the authority every existing record had before deployment and prevents a production lockout. After deployment, an Owner can safely reduce access through the audited UI.

New application code always writes an explicit role. The database default exists for compatibility with the previous application version during deployment and rollback, not as the normal creation path.

### Deployment compatibility

1. Take and verify a database backup.
2. Apply the additive migration.
3. Verify all existing records have a valid role and at least one active Owner exists.
4. Deploy application code that reads and enforces roles.
5. Run authorization smoke checks for each role.
6. Review and reduce migrated Owner roles only after the new UI is verified.

The previous application version ignores the added columns and interprets every active row as a full administrator. That makes the schema backward-compatible, but a blind application rollback would temporarily over-privilege any active non-Owner assignment created after this release.

A safe application rollback therefore places the platform console in maintenance mode, snapshots current assignments, and soft-revokes active non-Owner rows before the previous application is reopened. Owners remain available for recovery. When the role-aware version is restored, the snapshotted assignments are reactivated with their explicit roles and an emergency-change audit reason.

Schema rollback is deferred until the previous application is stable again and requires confirming no role-dependent records would be lost. Dropping the new columns is never part of an automatic application rollback.

## Support-access boundary

`support_operator` can create a scoped support-access request but cannot approve it. Approval remains exclusive to an active administrator of the target agency. The requester, approving agency administrator, or a Platform Owner can revoke an active grant; the requester retains the existing ability to revoke their own grant.

An approved support grant remains scoped by agency, optional workspace, metadata-only mode, download approval, and hard expiry. It does not change the operator’s platform role or create an agency membership.

Agency Operators do not receive support-request permission by default. This keeps commercial/operational agency management separate from content-support access.

## User experience

### Platform access page

The page uses the existing StudioFlow tokens, app shell, cards, badges, tables, dialogs, and focus treatment.

- Header: “Platform access” with a concise tenant-boundary explanation.
- Summary: active members, Owner count, operator count, and active/expiring support access.
- Assignment list: person, role badge, access summary, last changed, and an action menu.
- Add-member action: Owner-only drawer or dialog with email, role description, and mandatory reason.
- Change-role action: shows the old and new access summaries before confirmation.
- Revoke action: destructive confirmation with mandatory reason and lockout messaging.
- Read-only state: Auditors see a visible banner explaining that only Owners can change access.
- Lockout state: a warning is shown when only one Owner remains; the protected action is unavailable and the server still rejects it.

Desktop uses a compact table. At narrow widths, lower-value audit columns collapse and each person remains identifiable by name, email, role, and an accessible action menu. No horizontal interaction is required for the primary task.

### Agency list and detail pages

- Create and mutation controls render only when the principal has the corresponding permission.
- Auditors see a read-only banner instead of unexplained missing controls.
- Support Operators see the support-request surface but no identity, plan, lifecycle, or archive controls.
- Archive and unarchive are visually separated from suspend/restore and are Owner-only. Restoring a suspension never unarchives an agency.
- Every destructive or access-changing dialog places initial focus safely, names the target, requires a reason, and returns focus to the trigger when closed.

Unauthorized controls are not merely hidden with CSS; they are omitted from the server-rendered tree, and direct action calls are rejected by the server.

## Error behavior

- Anonymous platform requests retain the existing sign-in handling.
- Authenticated users without `platform.console.read` receive a stable forbidden page rather than a redirect loop.
- Users who can enter the console but lack a page permission receive a specific read-only or forbidden state appropriate to that page.
- Mutation denials return a safe permission message and never expose whether an unrelated tenant resource exists.
- Validation and domain conflicts remain inline and preserve submitted non-secret values.
- Unexpected failures use the existing error boundary and reference mechanism; audit/log data must not contain secrets or tenant content.

## Accessibility and responsive requirements

- Meet WCAG 2.2 AA contrast and existing focus-ring conventions.
- Every icon-only action has an accessible name.
- Role badges are supplemented by text; color is not the only indicator.
- Dialogs have programmatic titles/descriptions, keyboard trapping, Escape handling, and focus restoration.
- Permission summaries use semantic lists or tables with headers.
- Status and error updates use the project’s existing live-region patterns.
- Touch targets remain at least 44 by 44 CSS pixels on compact layouts.
- The page remains usable at the six responsive viewports already covered by the visual-regression suite.

## Testing strategy

Implementation follows red-green-refactor in these layers:

1. **Unit authorization tests** cover every role-permission pair, unknown/invalid roles, revoked records, database failure, and compatibility behavior.
2. **Unit action tests** prove each action requests its exact permission and that UI state never substitutes for server authorization.
3. **Agency-update tests** prove the platform path works without agency membership, the agency path still requires agency-admin membership, both paths share validation/audit semantics, and neither creates membership.
4. **Integration tests** cover migration/backfill, database constraints, all grant/change/revoke transitions, serialized last-Owner protection, role-specific agency operations, and audit records.
5. **Component tests** cover Owner controls, Auditor read-only presentation, Operator and Support views, dialogs, validation, keyboard behavior, and responsive content priorities.
6. **End-to-end tests** cover one representative journey per role plus direct unauthorized server-action attempts.
7. **Regression tests** retain the existing closed-auth, tenant isolation, support grant, lifecycle, and platform route coverage.

Compilation alone is not completion. The final evidence must include focused tests, full `pnpm verify`, production build, migration forward/compatibility/rollback drill evidence, the relevant Playwright and accessibility checks, and post-deployment production smoke verification.

## Documentation and operational evidence

Implementation updates:

- ADR 0002 or a new focused ADR for the platform role decision.
- `docs/agency-setup.md` for bootstrap, role review, and recovery.
- Authorization and testing documentation for the new permission matrix.
- Production-readiness tracker and evidence bundle.
- Migration backup, forward, compatibility, and rollback records.

The SQL bootstrap escape hatch grants `platform_owner` explicitly. Recovery instructions emphasize restoring at least one active Owner and auditing any emergency change immediately afterward.

## Acceptance criteria

- Existing platform administrators retain access immediately after migration.
- A Platform Owner can grant, change, and revoke all supported platform roles.
- The final active Platform Owner cannot be revoked or downgraded, including under concurrent requests.
- An Agency Operator can perform allowed agency operations but cannot archive an agency or manage platform access.
- An Agency Operator cannot unarchive an agency indirectly through the normal restore action.
- A Platform Auditor can inspect permitted views but cannot mutate platform or agency state.
- A Support Operator can request scoped support access but cannot mutate agency administration data or approve their own request.
- Platform agency identity edits succeed for an authorized platform role without agency membership.
- Platform roles never expose tenant content without a separate active support grant or agency membership.
- All successful privileged state changes are validated, authorized, and audited atomically at the server boundary; denied and failed attempts are captured by security logging without exposing tenant data.
- UI states are clear, accessible, responsive, and consistent with the existing StudioFlow design system.
- Migration and rollback procedures preserve production identifiers, records, and recoverability.
