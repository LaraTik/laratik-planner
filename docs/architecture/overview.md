# Architecture overview

## System map

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Browser (user)                              │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │ HTTPS
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Traefik (existing on laratik-vps)                   │
│   - Host: planner.laratik.com                                           │
│   - TLS: Let's Encrypt (HTTP-01)                                        │
│   - Headers: HSTS, security headers                                     │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  laratik-planner-app  (Next.js 16 standalone, Node 20-alpine)           │
│   - Server Components (default)                                         │
│   - Server Actions / Route Handlers for mutations                       │
│   - NextAuth v5 middleware (Goal 2)                                     │
│   - Drizzle ORM (node-postgres)                                         │
└──────┬───────────────────────────────────────────────┬─────────────────┘
       │                                               │
       │ (private internal network)                    │
       ▼                                               ▼
┌──────────────────────────┐                ┌──────────────────────────┐
│ laratik-planner-postgres │                │ laratik-planner-minio   │
│   (Postgres 16-alpine)   │                │  (only in Goal 13)       │
│   - 10k tables enums     │                └──────────────────────────┘
│   - RLS-equivalent pol.  │
│   - pgdata volume        │
└──────────────────────────┘

External (outbound only):
  - Mailcow SMTP (mail.laratik.com) for magic-link + notifications
  - Google OAuth (accounts.google.com) for sign-in
  - MiniMax (api.minimax.io/v1) for AI features (optional, Goal 11)
  - Sentry (o0.ingest.sentry.io) for errors (Goal 13)
  - GHCR (ghcr.io/laratik/laratik-planner) for image pulls
```

## Container layout on VPS

| Container                    | Image                                   | Network                       | Volume     | Healthcheck        |
| ---------------------------- | --------------------------------------- | ----------------------------- | ---------- | ------------------ |
| `laratik-planner-app-1`      | `ghcr.io/laratik/laratik-planner:<sha>` | `internal` + `traefik-public` | `app-data` | `wget /api/health` |
| `laratik-planner-postgres-1` | `postgres:16-alpine`                    | `internal` only               | `pgdata`   | `pg_isready`       |

Both autoheal via the `autoheal=true` label. Log rotation is `json-file` with 10 MB × 5 files per container.

## Process layout inside the app container

- **Port:** 3000 (Next.js `server.js` from `.next/standalone`)
- **User:** `nextjs` (uid 1001, non-root)
- **Env:** `NODE_ENV=production`, `NEXT_TELEMETRY_DISABLED=1`, `HOSTNAME=0.0.0.0`
- **Process model:** Single Node process serving HTTP. Background work runs in-process (defer BullMQ + Redis until needed).

## Data flow (request lifecycle)

1. Request hits Traefik on 443.
2. Traefik terminates TLS, adds request ID, forwards to the app container on 3000.
3. Next.js middleware (Goal 2) refreshes the session cookie, gates `(app)/*` routes.
4. The Server Component fetches data via Drizzle, scoped by `requireWorkspaceContext(userId, workspaceSlug)`.
5. Mutations go through Server Actions or Route Handlers, which re-validate the auth context, run the typed `TransitionCommand` or `Command`, and write to the DB inside a transaction.
6. The DB write emits an `outbox_events` row in the same transaction; a worker (Goal 8) picks it up to send notifications + email.
7. The response is rendered as RSC payload (or streamed for AI in Goal 11).
8. The Activity + Audit events are recorded (Goals 1, 7, 13).

## Key boundaries

- **Client never sees:** `DATABASE_URL`, `AUTH_SECRET`, `SMTP_PASSWORD`, `MINIMAX_API_KEY`, `SENTRY_AUTH_TOKEN`, `CRON_SECRET`, `BOOTSTRAP_SETUP_TOKEN`. Enforced by the split env schema (`src/lib/validation/env.ts`).
- **Browser never sees:** server actions' internal data — every Server Action returns a typed `Result<T, E>`.
- **DB never sees:** passwords in plaintext (argon2id via `@node-rs/argon2`), raw invitation tokens (only `token_hash` is stored), API keys (only `masked_key_suffix`).
- **No business logic in page components** (master prompt §0.10). All logic lives in `src/features/<feature>/service.ts` or `commands.ts`.
- **No automatic social publishing** (master prompt §0.13). All publication is manual + per-channel.
- **No permanent deletion** (master prompt §0.16). Archive, cancel, deactivate, revoke, restore.

## Why this is a single Next.js app, not microservices

Master prompt §4: "One Next.js deployment." We agree. The product is a B2B app with predictable scale (one agency, dozens of users, thousands of content items). The cost of splitting into services (operational overhead, network latency, deployment complexity) far outweighs the benefits at this scale. When the product needs to scale beyond a single VPS, the path is:

1. Add a managed Postgres (Neon, Supabase) for connection pooling + branching
2. Add Redis (BullMQ) for background jobs
3. Add a CDN (Cloudflare) in front of Traefik for static assets
4. Move file storage to S3-compatible (MinIO stays as a local cache)

None of these require a service split.
