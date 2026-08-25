# ADR 0005: Platform role permissions

- Status: accepted
- Date: 2026-08-25
- Scope: platform console authorization and agency operations

## Context

`platform_administrator` originally represented one unrestricted, binary
Platform Admin flag. That was sufficient while the console was an operator-only
prototype, but it gave support, agency operations, audit, access management,
and destructive archive authority to the same identity. It also made the UI
answer “who can add, edit, or delete agencies?” with one overly broad role.

Platform authority must remain separate from agency and workspace membership.
In particular, a global role must never implicitly expose tenant content.
Support access already uses a separate ticket → agency-admin approval →
time-limited grant workflow and must stay separate.

## Decision

Extend `platform_administrator` with one closed `role` value per active
assignment:

| Role               | Intended responsibility                                             |
| ------------------ | ------------------------------------------------------------------- |
| `platform_owner`   | Full console, role management, archive and unarchive                |
| `agency_operator`  | Create/edit agencies, plans, suspend and restore; no archive        |
| `platform_auditor` | Read-only agencies, Platform Access, and bounded support audit data |
| `support_operator` | Read agencies and request temporary support access                  |

The server maps roles to exact permissions:

| Permission                         | Owner | Agency Operator | Auditor | Support Operator |
| ---------------------------------- | :---: | :-------------: | :-----: | :--------------: |
| `platform.console.read`            |  ✅   |       ✅        |   ✅    |        ✅        |
| `platform.agency.read`             |  ✅   |       ✅        |   ✅    |        ✅        |
| `platform.agency.create`           |  ✅   |       ✅        |   ❌    |        ❌        |
| `platform.agency.update`           |  ✅   |       ✅        |   ❌    |        ❌        |
| `platform.agency.plan.manage`      |  ✅   |       ✅        |   ❌    |        ❌        |
| `platform.agency.lifecycle.manage` |  ✅   |       ✅        |   ❌    |        ❌        |
| `platform.agency.archive`          |  ✅   |       ❌        |   ❌    |        ❌        |
| `platform.support.request`         |  ✅   |       ❌        |   ❌    |        ✅        |
| `platform.access.read`             |  ✅   |       ❌        |   ✅    |        ❌        |
| `platform.access.manage`           |  ✅   |       ❌        |   ❌    |        ❌        |
| `platform.audit.read`              |  ✅   |       ❌        |   ✅    |        ❌        |

`requirePlatformPermission(actor, permission)` is enforced at every service or
data-access boundary. Page and navigation checks only control presentation;
they are not the security boundary. Compatibility helpers may still answer
whether an actor can enter the console, but they cannot authorize a mutation.

Role grant/change/revoke operations serialize on a PostgreSQL advisory
transaction lock. At least one active `platform_owner` must remain, including
under concurrent downgrade/revoke requests. Every successful change and the
reason are written atomically to `security_audit_event`.

Agency deletion remains a soft archive. Archive and unarchive are Owner-only.
Normal `restore` can clear suspension only and rejects archived agencies; it is
not an alternate unarchive path.

The UI is `/app/platform/access`. `/app/platform/admins` is a permanent
compatibility redirect. Existing active rows migrate to `platform_owner`, so
deployment does not reduce production access unexpectedly.

## Tenant-boundary guarantee

No platform permission grants agency or workspace content access. Tenant data
still requires either an active `agency_membership` or an active, approved,
scoped, unexpired `support_access_grant`. A Support Operator may request a
grant but cannot approve it. An Auditor receives bounded audit DTOs without
tenant content or open-request workflow authority.

## Alternatives considered

- **Keep one Platform Admin flag.** Rejected because it violates least
  privilege and makes support work unnecessarily destructive.
- **Create four independent assignment tables.** Rejected because one person
  holding overlapping global roles would make last-Owner enforcement,
  navigation, audit, and revocation harder to reason about.
- **Replace the table with generic RBAC tables.** Rejected for the current
  four-role closed vocabulary; it adds policy-editing complexity without a
  product requirement for custom roles.
- **Reuse agency/workspace roles.** Rejected because it would collapse the
  platform/tenant boundary.

## Consequences

- One identity holds one platform role at a time. Combining responsibilities
  requires choosing the broader documented role; custom role composition is
  intentionally out of scope.
- Owners carry break-glass responsibility and should be few, individually
  assigned, and reviewed quarterly.
- Agency Operators handle normal agency operations without destructive archive
  authority.
- Auditor and Support Operator surfaces must remain useful while omitting all
  unauthorized mutation controls.
- New platform commands require an explicit permission and matrix test before
  they are exposed in navigation or UI.

## Migration, compatibility, and rollback

Migration `0018_platform_access_roles` is additive: it adds `role`,
`updated_at`, a closed-role check, and a partial Owner index. Existing rows
default to `platform_owner`; identifiers and audit history are preserved.

Application rollback is compatible only after preparing active assignments:

1. Enable maintenance mode and take a verified database backup.
2. Snapshot active platform assignments and their roles to a protected
   operational artifact.
3. Soft-revoke every active non-Owner assignment. The old binary application
   treats every active row as unrestricted, so this step is mandatory.
4. Deploy the prior application image while retaining the additive columns.
5. After returning to a role-aware image, restore assignments from the
   snapshot, validate the last-Owner invariant, and review the audit trail.

Destructive schema rollback requires separate approval and the verified backup.
