# ADR 0001: Self-hosted port to LaraTik VPS (no Supabase, no Vercel)

- Status: accepted
- Date: 2026-08-18 (project inception)
- Scope: foundational — every subsequent decision inherits from this

## Context

The StudioFlow master prompt specifies a Supabase + Vercel stack. LaraTik
GmbH already operates `laratik-vps` (217.154.124.83) with Traefik, Mailcow
SMTP, a restic offsite-backup pattern, and the `laratik-social-platform`
app as a reference for self-hosted Next.js + Postgres. The owner
requested:

- One ops surface (the VPS, not Vercel + Supabase + separate SMTP vendor).
- Full data sovereignty — no per-MAU pricing, no third-party data residency.
- Portability — every choice must be one env-var or one config file away
  from switching to a different host.

## Decision

Port the entire StudioFlow stack to a self-hosted topology on
`laratik-vps`:

| Master prompt layer | We use                                                 |
| ------------------- | ------------------------------------------------------ |
| Auth                | NextAuth v5 (Auth.js) + Drizzle adapter                 |
| Database            | Self-hosted Postgres 16 sidecar (Drizzle dialect)       |
| Storage             | Local volume `app-data` (v1) → MinIO when uploads land |
| AI                  | `ai` SDK + raw HTTP to MiniMax (OpenAI-compat)         |
| Email               | Nodemailer → Mailcow SMTP                              |
| Tests               | Vitest + isolated Postgres test container              |
| Deploy              | GHCR + Traefik on the VPS                              |
| Observability       | Sentry (kept, no change)                               |

Every deviation is recorded in `PORT_NOTES.md` and the operational runbook
is `docs/operations/runbook.md`.

## Consequences

- **One ops surface.** Backup, deploy, log inspection, and incident
  response all live on the same VPS the agency already trusts.
- **No per-MAU pricing.** Supabase's MAU-based pricing was the single
  largest commercial risk; replacing it with a flat VPS removes it.
- **Data sovereignty.** Tenant data never leaves the VPS. Backups are
  restic-encrypted to a Backblaze B2 bucket the VPS owns.
- **Portability.** Every layer is a standard pattern (Drizzle + Postgres
  + NextAuth + Nodemailer + `ai` SDK + Docker). Switching the AI vendor,
  SMTP host, or even the entire deploy target is a config change, not a
  rewrite.
- **Loss of Supabase-specific helpers.** We hand-rolled equivalent
  patterns for RLS (Drizzle policies + app-level scoping), Auth (NextAuth
  callbacks), and Storage (local volume + signed URLs). These are
  standard Postgres + Node.js patterns; no proprietary Supabase feature
  is used.
- **Loss of Vercel-specific tooling.** No edge functions, no Vercel cron,
  no `vercel-minimax-ai-provider`. Equivalent capabilities are provided
  by VPS `cron.d` + Route Handlers under `/api/cron/*` + raw `fetch` to
  the AI endpoint.

## Why this is safe

1. **Data layer is portable.** Drizzle + Postgres is the canonical
   "self-hosted Supabase" stack. The same tables, the same
   RLS-equivalent policies, the same migrations; we just own the infra.
2. **Email is portable.** Nodemailer works with any SMTP server. Mailcow
   is just our SMTP host of choice; switching to Resend or SES is a
   single env-var change.
3. **Deploy is portable.** The app is a Docker image; whether you run
   it on Vercel, Fly, Render, or our VPS is irrelevant to the code.
4. **AI is portable.** MiniMax exposes an OpenAI-compat API and an
   Anthropic-compat API; the `ai` SDK handles both.
5. **No proprietary Supabase features are used.** RLS, Auth, and Storage
   are all standard Postgres + Node.js patterns.

## Migration, compatibility, and rollback

Migrations 0001–0017 are additive. Existing agencies and tenant
identifiers are preserved across every migration. The application is
compatible with all prior Drizzle schemas via additive-only DDL
(`src/lib/db/migrations/*.sql`). Rollback is application-first: deploy
the prior image while retaining the additive tables and columns.
Destructive schema rollback requires a verified backup and separate
operator approval because audit, entitlement, and usage history are
production evidence.

## Future triggers to revisit this decision

- The VPS becomes a single point of failure for more than one
  customer. → Re-evaluate managed Postgres (Neon, Supabase, RDS) and a
  multi-region deploy.
- Backup RPO/RTO exceeds the agreed numbers. → Add a managed Postgres
  mirror or a second VPS in a different region.
- Supabase or Vercel introduce a feature we actually need (e.g. native
  row-level security with row-level policies we cannot replicate cleanly
  in Drizzle). → Re-evaluate per feature, not per stack.

Until one of those triggers fires, the self-hosted port is the
foundational decision every other ADR inherits from.
