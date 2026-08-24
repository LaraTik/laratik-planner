# Agency setup & authority scopes

> **What this file is:** the single canonical reference for the three authority scopes in laratik-planner, the bootstrap path, the platform-admin grant path, and the agency admin's CRUD surface.
>
> **Read this when:** you (the operator) need to figure out who controls what, especially around the "superadmin / who can manage agencies" question, or when an agency admin needs to know what they can and cannot edit.

---

## 1. Three independent authority scopes

There are **three disjoint scopes** of authority. A user holds each scope explicitly — there is no inheritance. A user can hold one, two, or all three (and a user can hold the same scope against multiple agencies).

| Scope                | Authoritative table                                   | Code helper                                              | What it unlocks                                                                                                                                                                                                                                                                 | Where in the UI                                                                                                                                  |
| -------------------- | ----------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Platform Admin**   | `platform_administrator`                              | `isPlatformAdmin(actor)` / `requirePlatformAdmin(actor)` | List, create, suspend, archive, restore, change plan, file / revoke support-access requests for **any** agency. **No tenant content access by itself** — must hold an `agency_membership` row to read tenant data, or an active `support_access_grant` for the targeted agency. | `/app/platform/*` (gated by `(app)/app/platform/layout.tsx`). The sidebar shows a `Platform` section only for these users.                       |
| **Agency Admin**     | `agency_membership` (`is_agency_admin = true`)        | `isAgencyAdmin(actor, agencyId)`                         | Manage members, AI configuration, plan (read-only), brand kit, channels of **their own agency**. Implies full access to every workspace inside the agency (master prompt §9).                                                                                                   | `/app/agency-settings/*`, `/app/users`, and **everything inside the agency's workspaces** (via `canAccessWorkspace` → `isAgencyAdmin` shortcut). |
| **Workspace member** | `workspace_membership` + `workspace_membership_roles` | `hasWorkspaceRole(actor, workspaceId, roles)`            | Edit content, comment, do work — at the level of the role (`workspace_manager`, `content_planner`, `designer`, `internal_reviewer`, `publisher`, `viewer`, `client_reviewer`).                                                                                                  | `/app/w/[slug]/*`.                                                                                                                               |

**The "superadmin who controls agencies (not their workspaces)" is the Platform Admin.** The Agency Admin controls the workspaces _inside_ their own agency; the Platform Admin controls the agencies themselves but cannot read tenant content without an `agency_membership` row or an active `support_access_grant`.

### 1.1 Anti-confusion checks

- **A Platform Admin is not automatically an Agency Admin.** They cannot see the contents of an agency just because they can manage the platform. Acting inside a tenant still requires an `agency_membership` row (or an active `support_access_grant`).
- **An Agency Admin is not automatically a Platform Admin.** The product surface they can reach is bounded by their agency; they cannot see or manage other agencies. Cross-tenant reads return `404` (anti-IDOR; see `docs/architecture/authorization.md §5`).
- **The first user to bootstrap the system is only an Agency Admin.** They have zero Platform Admin authority. To become a Platform Admin, they must be granted (or run the SQL fallback in §3.3 below).

---

## 2. "Who am I?" — the four buckets

A user running the app today lands in exactly one of these four buckets, identified by what the sidebar shows:

1. **Signed-out** → `/signin`. The login screen offers Google OAuth + email magic link. In dev, `/dev/signin` is available.
2. **Signed-in, no agency** → `/setup`. The user is the first to arrive at this deployment. They fill in the bootstrap form with `BOOTSTRAP_SETUP_TOKEN` and become the Agency Admin of the new agency.
3. **Signed-in, has agency membership, not a Platform Admin** → sidebar shows `Workspace` (a switcher that lists every workspace in the active agency) + `Admin` (which contains `User Management` and `Agency Settings`, with the `AI configuration` sub-link). The `Platform` section is **not** in the sidebar.
4. **Signed-in, has agency membership, is also a Platform Admin** → same as (3) + an additional `Platform` section: `Platform overview`, `Agencies`, `Security & support`, `Platform admins`.

A user can be a Platform Admin without any agency membership at all (e.g., an operator on the LaraTik side). Such a user can reach `/app/platform/*` and nothing else — they have no tenant context, so the (app) layout sends them to `/app/platform/overview` directly.

---

## 3. How a Platform Admin is granted

Three paths exist. The product UI is the preferred path; the SQL and dev-seed paths are operational escape hatches.

### 3.1 The product UI: `/app/platform/admins`

- **Who can use it:** an existing Platform Admin. The page is gated by the same `requirePlatformAdmin` as the rest of `/app/platform/*`.
- **What it does:** lists every user with a non-revoked `platform_administrator` row, plus the grant timestamp and the grantor. The "Add Platform Admin" form accepts an email; if the user already exists, a row is upserted; if not, the form returns a clear "user not found — they must sign in at least once first" message. The "Revoke" action soft-revokes (sets `revoked_at`) and requires a reason; every grant / revoke appends an audit row to `security_audit_events`.
- **Where the service lives:** `src/lib/platform/admins.ts`. The service is the only writer; the route is the only reader.

### 3.2 The SQL fallback (production)

When the platform has zero Platform Admins (e.g., the bootstrap user is the only account and they are not yet a Platform Admin), the UI is unreachable. Recover with a one-line SQL:

```sql
INSERT INTO platform_administrator (user_id, granted_by, reason)
VALUES ('<your-user-id>', NULL, 'initial seed')
ON CONFLICT (user_id) DO UPDATE
  SET revoked_at = NULL,
      granted_by = EXCLUDED.granted_by,
      granted_at = now(),
      reason = EXCLUDED.reason;
```

To find your `user_id`:

```sql
SELECT id, email, display_name FROM "user" WHERE lower(email) = '<your-email>';
```

`granted_by` is allowed to be `NULL` for the very first grant. Every subsequent grant should reference an existing platform admin's `user_id`. The `reason` column is a free-text field; capture the operational context.

### 3.3 The dev seed (dev / test only)

`POST /api/dev/seed` accepts `platformAdmin: true` in the body. The route is gated by `NODE_ENV !== "production"`, so the endpoint returns `404` in production builds. The seed is the only place tests can flip platform-admin state. See `src/app/api/dev/seed/route.ts:230-243` for the exact logic.

---

## 4. The bootstrap path: `/setup` + `BOOTSTRAP_SETUP_TOKEN`

The bootstrap path is a **one-shot** path that runs only when **no `is_agency_admin = true` row exists anywhere on the platform**. After it lands:

1. The user is marked `users.role = "agency_admin"`.
2. An `agency_membership` row is written with `is_agency_admin = true`.
3. A `bootstrap_lock` row is written (idempotency marker).

The bootstrap admin is **only an Agency Admin**, not a Platform Admin. The contract is: **bootstrap = agency scope**. Platform authority must be granted separately, per §3.

### 4.1 What the form does

`/setup` (the page) renders a form with three fields: `agencyName`, `agencySlug`, and `token`. The token is the value of `BOOTSTRAP_SETUP_TOKEN` from the server environment. The form `POST`s to `/api/bootstrap/admin`, which calls `bootstrapFirstAdmin(...)`. The transaction takes a Postgres advisory lock (`pg_advisory_xact_lock(7342891)`) so concurrent bootstrap calls serialize; the first wins, the rest return `409 Already configured`.

### 4.2 If the token is lost

A lost `BOOTSTRAP_SETUP_TOKEN` does not block the system — it only blocks new agencies from being bootstrapped via `/setup`. The agency admin can still sign in, manage their agency, and (with another platform admin's grant) manage the platform.

To recover the token on the VPS, read the value directly from the running container's environment:

```bash
# from the VPS host
cd /opt/laratik-planner
docker compose exec -T app env | grep BOOTSTRAP_SETUP_TOKEN
```

Rotate the token by editing `.env` on the VPS and restarting the app container. There is no automated rotation; the token is a low-privilege secret that only unlocks the bootstrap path.

### 4.3 Multi-agency in production

The same user can be a member of two agencies (e.g., a LaraTik operator who is both the platform admin and an agency admin for two tenants). The active agency is resolved on every request by `resolveActiveAgencyContext(actor)` (`src/lib/auth/agency-context.ts:376`), with this priority chain:

1. **Explicit override** — `?agency=<id>` (or path param). Membership-checked; fail-closed.
2. **Signed cookie** — `laratik_active_agency`, HMAC-SHA-256, mixed with the user id. Membership-re-checked on every decode; fail-closed.
3. **Single-membership fallback** — if the actor has exactly one active membership, pick it. 0 or 2+ active memberships return `null` and the route layer prompts the user.

The agency switcher (`src/components/app-shell/agency-switcher.tsx`) calls `switchActiveAgency(agencyId)` (`src/lib/auth/agency-actions.ts:49`), which re-issues the cookie after a membership re-check.

---

## 5. What the agency admin can edit

The agency admin can change the agency's own identity, members, AI configuration, and (via the workspace admin surfaces inside each workspace) the workspace settings. The full CRUD matrix:

| Surface                                          | Read | Create                   | Update                                                                 | Delete / archive        |
| ------------------------------------------------ | ---- | ------------------------ | ---------------------------------------------------------------------- | ----------------------- |
| **Agency identity** (`/app/agency-settings`)     | ✅   | n/a                      | ✅ name, slug, locale, timezone                                        | n/a                     |
| **Plan and usage** (`/app/agency-settings/plan`) | ✅   | n/a                      | ❌ read-only — the platform admin owns the plan                        | n/a                     |
| **AI configuration** (`/app/agency-settings/ai`) | ✅   | ✅ first save            | ✅ master switch, model, capabilities, managed secret, test connection | n/a                     |
| **Members** (`/app/users`)                       | ✅   | ✅ invite by email       | ✅ role per workspace, deactivate                                      | ✅ deactivate           |
| **Invitations**                                  | ✅   | (from send-invite)       | n/a                                                                    | ✅ revoke               |
| **Workspaces** (`/app/w/[slug]/*`)               | ✅   | ✅ `/app/workspaces/new` | ✅ settings (lifecycle / lead times / approval / defaults)             | n/a (no archive UI yet) |
| **Brand Kit** (`/app/w/[slug]/brand-kit`)        | ✅   | ✅ per section           | ✅ per section                                                         | ✅ archive              |

A non-admin member of the agency sees the same surfaces in read-only mode. The agency identity card on `/app/agency-settings` becomes an `<EditAgencyForm>` only when the actor is an Agency Admin.

---

## 6. What the platform admin can do

In addition to the agency admin's surface (for any agency they belong to), the platform admin reaches the `/app/platform/*` console:

- **`/app/platform/overview`** — platform-wide KPIs and the five most recently created agencies.
- **`/app/platform/agencies`** — list, search, create, suspend, archive, change plan. Row actions on the table.
- **`/app/platform/agencies/[id]`** — agency detail with tabs (Overview / Workspaces / Plan & usage / AI / Security). Editable identity; lifecycle (suspend / restore / archive) is here.
- **`/app/platform/security`** — "my active grants" (time-limited support access), "my recent views" (audit log), "open requests" (per-agency pending support requests).
- **`/app/platform/admins`** — list, grant, revoke Platform Admins.

All `/app/platform/*` routes gate on `requirePlatformAdmin(actor)` and never acquire tenant content access without an explicit `agency_membership` row or an active `support_access_grant`.

---

## 7. How to recover from "I have no Platform Admin"

This is the most common operational situation after a fresh bootstrap. The user has run `/setup`, they are an Agency Admin, and they cannot reach `/app/platform/*`. Two recovery paths:

1. **If you can sign in as someone who is already a Platform Admin** — open `/app/platform/admins`, fill in the email of the user you want to elevate, save. (Most common when the LaraTik operator has a separate user; grant them via the UI.)
2. **If no one is a Platform Admin** — run the SQL in §3.2 above. The migration scripts on the VPS have a `psql` shortcut:

   ```bash
   # from the VPS host
   cd /opt/laratik-planner
   scripts/vps/exec-sql.sh "INSERT INTO platform_administrator (user_id, granted_by, reason) VALUES ('<uuid>', NULL, 'recovery from bootstrap') ON CONFLICT (user_id) DO UPDATE SET revoked_at = NULL;"
   ```

3. **If the user has not yet signed in** — they must sign in at least once (Google OAuth or magic link) so a `user` row exists. The Platform Admin grant form will refuse with "user not found" if the email is unknown.

---

## 8. Cross-references

- `docs/architecture/authorization.md` — the full authorization model (two scopes of authority, agency context resolution, cookie format).
- `docs/architecture/overview.md` — the runtime map and how the platform / agency / workspace layers fit together.
- `docs/architecture/ai-governance-and-support-access.md` — the AI configuration flow (master switch, capability allowlist, per-user daily budget, support access workflow).
- `src/lib/auth/policy.ts` — the policy helpers (`isPlatformAdmin`, `isAgencyAdmin`, `isAgencyMember`, `hasWorkspaceRole`, `canAccessWorkspace`, etc.).
- `src/lib/auth/agency-context.ts` — the agency context resolver (the priority chain).
- `src/lib/auth/bootstrap.ts` — the bootstrap-first-admin service.
- `src/lib/platform/agencies.ts` — agency CRUD at the platform level.
- `src/lib/agencies/command.ts` — agency CRUD at the agency-admin level (UpdateAgencySchema, updateAgency).
- `src/lib/platform/admins.ts` — Platform Admin grant / revoke / list.
- `src/lib/ai/provider-secret.ts` — the managed-secret service for AI provider keys.
- `docs/operations/runbook.md` — operational runbook (deploys, backups, key rotation, recovery).
