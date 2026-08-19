# Architecture overview

## Runtime

```text
Browser
  → Traefik TLS and request correlation
    → Next.js 16 standalone application
      → typed domain commands and queries
        → Drizzle transaction boundary
          → PostgreSQL 16

Outbound: Google OAuth · Mailcow SMTP · MiniMax (optional) · Sentry (optional)
Delivery: GitHub Actions → immutable GHCR app + migrator images → VPS
```

The platform is one Next.js deployment for one agency. A workspace represents one brand. Agency administrators receive an explicit authorization override; every other read and command requires an active workspace membership and exact role.

## Boundaries

- Client components contain interaction state only; they never import database access.
- Server actions authenticate, validate a typed command, invoke a domain service, and map structured errors.
- Domain modules own authorization, workflow decisions, publication aggregation, and next-action calculation.
- Persistence modules use transactions and locking. Material workflow changes write activity/outbox/audit evidence in the same transaction.
- Client-review queries select a dedicated safe shape; internal comments, assignments, activity, notes, and approval gates never enter client results.
- Raw invitation tokens and provider credentials are never stored. Invitation acceptance binds a verified normalized identity to the invited email.
- Production configuration validates complete provider combinations before serving traffic.

## Workflow source of truth

`src/lib/content/workflow.ts` defines statuses, actions, permitted roles, required reasons, approval gates, and return targets. Delivery and publishing modules derive their outcomes through typed pure functions and then persist those outcomes transactionally. UI labels and actions must consume the same domain definitions.

## Deployment and data safety

The application and migrator are separate immutable image targets. Deployment is triggered only by successful CI for the exact commit. The VPS process verifies a backup and checksum before migration, never suppresses a migration failure, checks schema/application readiness after migration, and restores the previous application image when the new release is unhealthy.

Schema changes are additive and reversible by default. Any destructive change requires a backfill, compatibility window, verified backup, explicit rollback procedure, and separate approval. Production identifiers and records are preserved.

See [`../production-readiness/MIGRATION_DEPLOYMENT.md`](../production-readiness/MIGRATION_DEPLOYMENT.md) for evidence and unresolved operational gates.
