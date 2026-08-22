# Authorization model

This document describes the runtime authorization model after **Milestone 1
(multi-agency tenancy and platform/admin separation)**. It is the source of
truth for the relationship between **platform authority** and **agency
authority**, and for how the active agency is resolved on every request.

The data-model side of Milestone 1 (the new `platform_administrator` table and
the removal of the `singleton_key` invariant) lives in
[`data-model.md`](./data-model.md). The system map and request path are in
[`overview.md`](./overview.md).

## 1. Two scopes of authority

There are two independent scopes of authority in the system. They do not
collide and they do not inherit from one another. A user must hold each scope
explicitly to act within it.

| Scope                  | Authoritative table                            | Granted by                                                                         | Who has it                                                                                                  | What it unlocks                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Platform authority** | `platform_administrator`                       | Another platform admin (or a SQL grant)                                            | A small set of operators who manage the platform itself. Not created through any product UI in Milestone 1. | `/app/platform/*` routes (M2): list/inspect/suspend agencies, view platform-level KPIs. **No tenant content access** — a platform admin who is not also an agency member cannot read or write any agency's data.      |
| **Agency authority**   | `agency_membership` (`is_agency_admin = true`) | The first agency admin (bootstrap), then any existing agency admin via invitation. | The first user to complete `/setup` for each agency, plus everyone they invite as `is_agency_admin = true`. | Agency admin surface: agency settings (incl. AI config), invitations, team, channels, brand kit, billing (M2), and (for the production agency today) the single agency row in the system. Tenant-scoped reads/writes. |

The two are deliberately disjoint so that:

- **A platform admin is not an automatic tenant admin.** They cannot see the
  contents of an agency just because they can manage the platform. Acting
  inside a tenant still requires an `agency_membership` row.
- **A tenant admin is not an automatic platform admin.** The product surface
  they can reach is bounded by their agency; they cannot see or manage other
  agencies. Cross-tenant reads return `404` (anti-IDOR; see §5).

Implementation:

- `src/lib/auth/platform-admin.ts` — `isPlatformAdmin(actor)`,
  `requirePlatformAdmin(actor)` (throws `PermissionDeniedError("platform-admin-required")`).
- `src/lib/auth/policy.ts` — `isAgencyAdmin(actor, agencyId)`,
  `isAgencyMember(actor, agencyId)`, `canAccessWorkspace(actor, workspaceId)`,
  `canAccessInternalWorkspace(actor, workspaceId)`,
  `canAccessClientWorkspace(actor, workspaceId)`. All are **agency-aware** and
  parameterized by `agencyId` — they never infer agency from a global.

The asymmetry: an actor with **no** platform role and **no** agency
membership can still sign in (the NextAuth flow runs before any tenant
check), but every request that hits an authorized route returns `404` (for
tenant routes) or `403` (for platform routes) — see §5.

## 2. The `Actor` shape

Every policy helper takes an `Actor` explicitly; the route layer is
responsible for producing it. The shape is:

```ts
type Actor = {
  id: string; // user.id
  // Future: role, appRole, sessionToken. For M1, only `id` is read.
};
```

A helper that takes `(actor, agencyId)` is **agency-scoped**; a helper that
takes only `(actor)` and a `workspaceId` is **workspace-scoped** and must
internally resolve the workspace's `agencyId` before checking membership. No
helper may read a global `activeAgencyId()`.

The pre-Milestone-1 global `activeAgencyId()` lookup is **gone** for
production code paths. It survives only inside the bootstrap
(`src/lib/auth/bootstrap.ts`) where it has a single, documented purpose:
finding the agency row when no user is yet a member, so the first admin can
be created. It is marked `@deprecated` and is not part of the public
authorization model.

## 3. Agency context resolution

Every request that touches tenant data needs a single, authoritative
`agencyId` for the duration of the request. That value is the **active agency
context**. It is **not** read from a global, **not** inferred from a URL
segment by itself, and **not** trusted from the client except as a hint.

The active agency is resolved once at the boundary (server action / route
handler / page server component) by
`resolveActiveAgencyContext({ actor, requestedAgencyId? })` in
`src/lib/auth/agency-context.ts`, then passed explicitly into every
agency-scoped helper.

### 3.1 Priority chain (highest wins)

The resolver is a strict three-step chain. Each step's result is
**fail-closed**: if the step cannot produce a valid, authorized agency, the
resolver returns `null` and the caller decides what to do. The chain does
**not** silently fall through on a denied or invalid result.

| Priority | Source              | When it is used                                                                                                                  | Behavior on failure                                                                                                                                      |
| -------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | `requestedAgencyId` | The caller supplies an explicit hint: `?agency=<id>`, a path param, or a server-action input.                                    | The actor is checked against `agency_membership` for that exact agency. **Denied → `null` (no fallthrough).**                                            |
| 2        | Signed cookie       | The actor's `laratik_active_agency` HttpOnly cookie, HMAC-SHA-256 signed with `AGENCY_COOKIE_SECRET`; payload includes `userId`. | The cookie is verified (format, signature, expiry), then the actor is re-checked against `agency_membership`. **Any failure → `null` (no fallthrough).** |
| 3        | Fallback            | The actor's **only** active agency membership (deterministic, ordered by `agency_membership.created_at ASC`).                    | If the actor has 0 or 2+ active agencies, the resolver returns `null`. The agency switcher is the user-facing path for 2+ memberships.                   |

The chain is encoded in `resolveActiveAgencyContext` and the
`ResolvedAgencyContext.source` field records which step produced the result:

- `"requested"` — the explicit hint was honored.
- `"cookie"` — the cookie was valid and authorized.
- `"fallback-single-agency"` — the actor has exactly one active agency and
  the resolver picked it for them (the pre-M1 single-agency UX path).

The caller can differentiate "user explicitly asked for this agency" from
"we picked for them" — useful for logging, audit, and for the agency
switcher (which knows the user is multi-membership and should be asked).

### 3.2 Fail-closed semantics

Every step that cannot produce a valid, authorized agency returns `null`.
The resolver **never** throws on application-level denial; it returns
`null` and lets the route layer decide. This is the same posture the
policy layer takes (`isAgencyAdmin` returns `boolean`, not throws).

Specifically:

- An explicit `requestedAgencyId` for an agency the actor is **not** an
  active member of returns `null` and does **not** fall through to the
  cookie or the fallback. Silently downgrading the explicit request would
  let a user land on data they have not been granted access to.
- A tampered, expired, or no-membership cookie returns `null` and does
  **not** fall through. A stale cookie must lose authority, not be
  replaced with the user's "older" default. The route layer can call
  `clearActiveAgencyCookie()` to drop it and re-prompt the user.
- The fallback returns `null` for 0 or 2+ active memberships; a 2+
  membership actor is sent to the agency switcher (M1.5).

DB errors in any step (cookie membership re-check, fallback lookup, explicit
check) are caught inside the resolver and treated as `null`. Authorization
checks must not crash the request that triggered them.

### 3.3 Cookie format and signing

The cookie value is the string:

```
<agency_id>.<expires_at_unix>.<base64url-HMAC-SHA256>
```

Where the HMAC payload is `<agency_id>.<expires_at_unix>.<user_id>` and the
key is `AGENCY_COOKIE_SECRET` (≥ 32 bytes; required in production). The
`userId` is mixed into the signature so a signed cookie for one user
cannot be replayed by another user. The actual authorization gate is the
`agency_membership` re-check on every decode — the binding is
defense-in-depth.

Cookie attributes:

- `HttpOnly` — XSS cannot read it.
- `Secure` — when `NODE_ENV === "production"`.
- `SameSite=Lax` — CSRF protection; "Lax" because the agency switcher
  may navigate cross-origin (OAuth callback → app).
- `Path=/` — applies to every route in the app.
- `Max-Age=8h` — a working session; revoked memberships are caught
  sooner by the membership re-check, not by expiry.

A missing or short `AGENCY_COOKIE_SECRET` in production is a hard
misconfiguration: the encoder returns the empty string and the decoder
returns `null` for every cookie. The route layer treats the empty string
as "refused" and surfaces a `500` / re-prompt. In dev/test, the encoder
falls back to a derived dev key so the unit suite can run with a fixed
env, but the configuration is still logged loudly.

The cookie is **stateless** — no server-side store, no DB write on every
page load. The membership check already hits the DB via
`agency_memberships`; a cookie store would be a second query with no
added guarantee. A revocation that lands in the DB is caught on the next
decode (no waiting for the cookie to expire).

### 3.4 Wiring at the boundary

The contract is: every server action, route handler, and server component
that touches tenant data calls the resolver once at the top and threads
`agencyId` into every downstream helper. The pattern is:

```ts
// at the boundary
const actor = await currentActor();
const resolved = await resolveActiveAgencyContext({ actor });
if (!resolved) {
  // surface 404 / redirect to /app / prompt agency switcher
  notFound();
}
const { agencyId, source } = resolved;

// downstream
const isAdmin = await isAgencyAdmin(actor, agencyId);
const ws = await findWorkspaceBySlug(actor, slug, agencyId);
```

The resolver is the **only** place the chain is encoded. Downstream
helpers do not re-resolve; they take `agencyId` as an argument.

## 4. Workspace lookup: `(agencyId, slug)`

Workspace identity is the pair `(agencyId, slug)`, never `slug` alone. The
unique constraint on workspaces is `uniqueIndex("workspace_agency_slug_unique")
.on(agencyId, lower(slug))` — two agencies can have a workspace named
`acme` without collision.

`src/lib/workspaces/context.ts` exposes three wrappers, all parameterized
by the resolved `agencyId`:

- `findWorkspaceBySlug(actor, slug, agencyId)` — by-actor lookup; rejects
  if `(actor, agencyId, slug)` does not match an active workspace the
  actor can access.
- `getAccessibleWorkspace(actor, slug, agencyId)` — internal-role gated.
- `getClientWorkspace(actor, slug, agencyId)` — client-role gated.

A workspace in agency B that shares its slug with a workspace in agency A
is invisible to an actor in agency A. Cross-agency slug collision is the
intentional case; cross-agency reads of the wrong workspace are blocked
at the policy layer.

## 5. Cross-tenant denial: 404, not 403

When an actor requests a workspace, channel, member, or any other tenant
resource via a path or id that exists **in a different agency**, the route
layer returns `404`, not `403`.

The reason is **anti-IDOR**: a `403` confirms the resource exists and is
in a different tenant; a `404` does not leak that information. The
existence of a workspace named `acme` in agency B must not be discoverable
by an actor in agency A. This is enforced at the policy layer
(`canAccessWorkspace` returns `false`; the route maps `false` to
`notFound()`) and is covered by the tenant-isolation tests (M1.9).

## 6. Platform admin separation

Platform routes (M2: `/app/platform/*`) gate on
`requirePlatformAdmin(actor)`. The layout renders a "Forbidden" message
in place — not a redirect — so the URL is preserved for the audit log.

A platform admin who is **not** an active member of any agency still
cannot read or write tenant data. The platform surface lists and manages
agencies, but never opens agency content without an explicit
agency-scoped action (which requires the corresponding `agency_membership`
row).

## 7. Bootstrap path (pre-membership)

The bootstrap path (`/setup`) is the **only** legitimate use of a global
agency lookup. It runs before any user is a member; there is no
`agency_membership` row to resolve against. The path looks up the (at most
one) bootstrappable agency and creates the first agency admin.

After the first `agency_membership` row is written, every subsequent
request uses the resolver chain. The bootstrap path is the documented
exception, not a general-purpose escape hatch — see
`src/lib/auth/bootstrap.ts` for the implementation and the `@deprecated`
note on the legacy global helper it wraps.
