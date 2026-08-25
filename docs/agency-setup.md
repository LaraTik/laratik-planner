# Agency setup and authority scopes

> Canonical operating guide for platform roles, agency administration,
> workspace roles, bootstrap, access recovery, and review.

## 1. Independent authority scopes

Authority is explicit and non-inheriting. A person may hold a platform role,
agency membership, and workspace roles independently.

| Scope                    | Authoritative records                                 | What it controls                                                                                      |
| ------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Platform role**        | Active `platform_administrator` row with one `role`   | Global console and agency operations allowed by the role; never tenant content by itself              |
| **Agency administrator** | `agency_membership.is_agency_admin = true`            | Members, configuration, and all workspaces inside that agency                                         |
| **Workspace member**     | `workspace_membership` + `workspace_membership_roles` | Content and workflow commands allowed by the assigned workspace roles                                 |
| **Support grant**        | Active, approved, scoped `support_access_grant`       | Temporary tenant access for the approved scope; expires automatically and every supported view audits |

Anti-confusion rules:

- A platform role is not an agency membership.
- An Agency Admin cannot administer another agency or the platform.
- A Support Operator can request access but cannot approve the request.
- A Platform Auditor reads bounded platform/audit data, not tenant content.
- The first `/setup` user becomes an Agency Admin only. Platform authority is
  granted separately.

## 2. Platform role matrix

Use the narrowest role matching the person's ongoing responsibility.

| Capability                                  | Platform Owner | Agency Operator | Platform Auditor | Support Operator |
| ------------------------------------------- | :------------: | :-------------: | :--------------: | :--------------: |
| Enter platform console                      |       ✅       |       ✅        |        ✅        |        ✅        |
| Read agencies                               |       ✅       |       ✅        |        ✅        |        ✅        |
| Create and edit agency identity             |       ✅       |       ✅        |        ❌        |        ❌        |
| Manage plan                                 |       ✅       |       ✅        |        ❌        |        ❌        |
| Suspend and restore a suspended agency      |       ✅       |       ✅        |        ❌        |        ❌        |
| Archive and unarchive an agency             |       ✅       |       ❌        |        ❌        |        ❌        |
| Request ticketed temporary support access   |       ✅       |       ❌        |        ❌        |        ✅        |
| Read Platform Access and role-change audits |       ✅       |       ❌        |        ✅        |        ❌        |
| Grant, change, or revoke platform roles     |       ✅       |       ❌        |        ❌        |        ❌        |
| Read bounded platform-wide support audit    |       ✅       |       ❌        |        ✅        |        ❌        |

There is no hard delete for an agency. “Delete” in the operating workflow
means an Owner-only soft archive. Archived agencies can be returned only by
Owner-only **Unarchive**. **Restore** clears suspension and cannot unarchive.

## 3. Granting platform access

### 3.1 Product UI: `/app/platform/access`

Only a Platform Owner can add, change, or revoke assignments. The person must
have signed in once so their `user` row exists.

1. Open **Platform → Platform access**.
2. Select **Add platform member**.
3. Enter the existing user's email, choose the narrowest role, and give a
   concrete operational reason.
4. Confirm the assignment in **Current assignments**.

The server returns minimal mutation results, stores the reason, and writes the
role change atomically to `security_audit_event`. It refuses any action that
would remove the final active Platform Owner, including concurrent requests.

The former `/app/platform/admins` URL permanently redirects here.

### 3.2 Emergency SQL Owner recovery

Use this only when no active Owner can reach the UI. Back up first and record
the incident/change reference outside the database.

```sql
INSERT INTO platform_administrator
  (user_id, role, granted_by, granted_at, revoked_at, reason, updated_at)
VALUES
  ('<your-user-id>', 'platform_owner', NULL, now(), NULL,
   'break-glass Owner recovery: <change-reference>', now())
ON CONFLICT (user_id) DO UPDATE
  SET role = 'platform_owner',
      revoked_at = NULL,
      granted_by = EXCLUDED.granted_by,
      granted_at = now(),
      reason = EXCLUDED.reason,
      updated_at = now();
```

Find the user without copying other production identities:

```sql
SELECT id, email, display_name
FROM "user"
WHERE lower(email) = lower('<your-email>');
```

`granted_by = NULL` is permitted only for initial/break-glass recovery. After
access is restored, add a second Owner through the UI and review the audit log.

### 3.3 Development fixtures

`POST /api/dev/seed` accepts an explicit role:

```json
{ "platformRole": "platform_auditor" }
```

Allowed values are `platform_owner`, `agency_operator`, `platform_auditor`,
and `support_operator`. `platformAdmin: true` remains a compatibility alias for
`platform_owner`; new tests use `platformRole`. The endpoint returns `404` in
production.

## 4. Bootstrap: `/setup`

Bootstrap is a one-shot agency operation available only while no Agency Admin
exists anywhere. The signed-in user submits agency name, slug, and
`BOOTSTRAP_SETUP_TOKEN`.

The transaction takes a PostgreSQL advisory lock, creates the agency
membership with `is_agency_admin = true`, updates the user's application role,
and writes `bootstrap_lock`. Concurrent attempts serialize; only the first can
succeed.

Bootstrap does not create a platform assignment. Use §3 afterward if the user
also needs platform responsibility.

### Active agency selection

`resolveActiveAgencyContext(actor)` resolves, in order:

1. an explicit requested agency after membership validation;
2. the signed `laratik_active_agency` cookie after expiry/signature/membership
   validation;
3. a single active-membership fallback.

Invalid explicit or cookie context fails closed. Platform-only users can enter
`/app/platform/*` without an agency membership but cannot enter tenant content.

## 5. Who can add, edit, or archive agencies?

- **Add:** Platform Owner or Agency Operator.
- **Edit identity:** Platform Owner or Agency Operator. Platform authority is
  sufficient; they do not need tenant membership.
- **Change plan:** Platform Owner or Agency Operator.
- **Suspend/restore:** Platform Owner or Agency Operator. Restore applies only
  to suspended, non-archived agencies.
- **Archive/unarchive:** Platform Owner only.
- **Hard delete:** no product or routine operations path.

Agency Admins can edit their own agency identity, members, AI configuration,
social configuration, Brand Kit, channels, and workspace settings. They see
plan/usage but cannot change the platform-owned entitlement.

## 6. Temporary support access

Platform roles never reveal tenant content. When investigation requires tenant
access:

1. A Platform Owner or Support Operator files a ticketed request from the
   agency detail page.
2. The request specifies duration (maximum seven days), agency/workspace scope,
   metadata-only preference, download request, and reason.
3. An Agency Admin approves or rejects it. Downloads remain off unless the
   Agency Admin explicitly allows them.
4. An approved grant is scoped, time-limited, revocable, and audited.

Platform Auditors see bounded support audit summaries. They cannot file or
approve requests and do not receive open-request workflow data.

## 7. Quarterly access review

The system owner performs this review at least quarterly and after any
platform-team change:

1. Export or inspect active assignments from `/app/platform/access` without
   copying tenant data.
2. Confirm every person is individually identifiable and still needs the
   assigned responsibility.
3. Reduce broad roles where a narrower role now fits.
4. Confirm at least two active Owners before offboarding or role reduction.
5. Review recent grant/change/revoke audit rows and all active/expiring support
   grants.
6. Revoke stale assignments with a reason and record reviewer/date/change
   reference in the operational evidence bundle.

Shared accounts are not acceptable for platform roles.

## 8. Safe application rollback

The pre-role application treats every active `platform_administrator` row as
an unrestricted administrator. Before deploying that image:

1. Enable maintenance mode and take a verified backup.
2. Snapshot active assignment IDs, roles, and audit-safe metadata to a
   protected operational artifact.
3. Soft-revoke every active non-Owner assignment. Do not roll back while an
   Auditor, Agency Operator, or Support Operator remains active.
4. Deploy the prior image. Keep the additive `role`/`updated_at` columns.
5. When the role-aware image returns, restore assignments from the snapshot,
   confirm at least one Owner, and review audit rows.

Destructive migration rollback requires separate approval and the backup.

## 9. Cross-references

- `docs/decisions/0005-platform-role-permissions.md`
- `docs/architecture/authorization.md`
- `docs/architecture/ai-governance-and-support-access.md`
- `src/lib/auth/platform-access.ts`
- `src/lib/platform/access.ts`
- `src/lib/platform/agencies.ts`
- `src/lib/support/access.ts`
- `docs/operations/runbook.md`
