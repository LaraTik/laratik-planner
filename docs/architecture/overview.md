# Architecture overview

## Runtime

```text
Browser
  → Traefik TLS and request correlation
    → Next.js 16 standalone application
      → agency-context resolver (requested → cookie → fallback)
        → typed domain commands and queries (agencyId-bound)
          → Drizzle transaction boundary
            → PostgreSQL 16

Outbound: Google OAuth · Mailcow SMTP · MiniMax (optional) · Sentry (optional)
Delivery: GitHub Actions → immutable GHCR app + migrator images → VPS
```

The platform is one Next.js deployment that hosts **many agencies** in a
shared Postgres database. Each agency owns its own users, workspaces,
content, channels, brand kit, AI configuration, and invitations. A
workspace represents one brand inside an agency and is uniquely identified
by the pair `(agencyId, slug)` — two agencies can both have a workspace
named `acme` without collision.

A second scope of authority sits **above** the agencies: **platform
administrators**. A platform admin manages the platform itself
(`/app/platform/*`: list, inspect, suspend agencies) without being a
member of any specific agency. Platform authority and agency authority
are disjoint in the data (`platform_administrator` and
`agency_membership` are separate tables); a platform admin does not
automatically read or write any agency's content. The active agency for
a request is resolved once at the boundary by
`resolveActiveAgencyContext(actor)` (priority chain: explicit request →
HMAC-signed `laratik_active_agency` cookie → single-membership fallback)
and is threaded explicitly into every agency-scoped helper. See
[`authorization.md`](./authorization.md) for the full model and
[`data-model.md`](./data-model.md) for the schema details.

## Boundaries

- Client components contain interaction state only; they never import database access.
- Server actions authenticate, resolve the active agency context, validate a typed command, invoke a domain service, and map structured errors.
- Domain modules own authorization, workflow decisions, publication aggregation, and next-action calculation. Agency-scoped helpers take `(actor, agencyId)`; no helper reads a global.
- Persistence modules use transactions and locking. Material workflow changes write activity/outbox/audit evidence in the same transaction.
- Client-review queries select a dedicated safe shape; internal comments, assignments, activity, notes, and approval gates never enter client results.
- Raw invitation tokens and provider credentials are never stored. Invitation acceptance binds a verified normalized identity to the invited email.
- Cross-tenant requests are denied with `404`, not `403`, to avoid leaking the existence of resources in other agencies (anti-IDOR).
- Platform routes gate console entry and every read/mutation with exact permissions from `platform-access.ts`; no platform role acquires tenant content without an explicit agency membership or approved active support grant.
- Agency plans resolve from a plan template plus per-agency replacement overrides. Live counters are separate from policy and are reserved transactionally with per-resource advisory locks.
- Agency lifecycle is soft and recoverable. Suspended/archived agencies are excluded by the central agency-context resolver; platform-only operators can still reach the platform console.
- Production configuration validates complete provider combinations before serving traffic.

## Workflow source of truth

`src/lib/content/workflow.ts` defines statuses, actions, permitted roles, required reasons, approval gates, and return targets. Delivery and publishing modules derive their outcomes through typed pure functions and then persist those outcomes transactionally. UI labels and actions must consume the same domain definitions.

## Deployment and data safety

The application and migrator are separate immutable image targets. Deployment is triggered only by successful CI for the exact commit. The VPS process verifies a backup and checksum before migration, never suppresses a migration failure, checks schema/application readiness after migration, and restores the previous application image when the new release is unhealthy.

Schema changes are additive and reversible by default. Any destructive change requires a backfill, compatibility window, verified backup, explicit rollback procedure, and separate approval. Production identifiers and records are preserved.

See [`../production-readiness/MIGRATION_DEPLOYMENT.md`](../production-readiness/MIGRATION_DEPLOYMENT.md) for evidence and unresolved operational gates.
