# PORT_NOTES — laratik-planner

> Every deviation from `STUDIOFLOW_MASTER_PROMPT.md` and the reason for it.
> This file is the **contract** that keeps the spec and the implementation in sync. When a section of the master prompt is contradicted by this file, this file wins (for our deployment).

## Decision summary

| Section            | Master prompt says                      | We use                                                    | Reason                                                                                                |
| ------------------ | --------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| §4 (runtime)       | Node.js 24 LTS                          | Node.js 20 LTS                                            | Long-term stable, all deps support it, Next.js 16 fully tested on 20                                  |
| §4 (auth)          | Supabase Auth                           | NextAuth v5 (Auth.js) + Drizzle adapter                   | User data lives in our own Postgres; no per-MAU pricing                                               |
| §4 (DB)            | Supabase Postgres                       | Self-hosted Postgres 16 sidecar                           | Full data sovereignty; matches `laratik-social-platform` pattern; Drizzle's first-class dialect       |
| §4 (Storage)       | Supabase Storage                        | Local volume `app-data` (v1) → MinIO (Goal 13)            | Defer the S3-compatible layer until uploads are needed                                                |
| §4 (AI)            | `vercel-minimax-ai-provider`            | `ai` SDK + raw HTTP to MiniMax (OpenAI-compat)            | Portable, no Vercel-specific provider                                                                 |
| §4 (Email)         | Resend                                  | Nodemailer → Mailcow SMTP                                 | No new vendor; `mail.laratik.com` already running                                                     |
| §4 (Tests)         | pgTAP for SQL                           | Drizzle + a Postgres test container                       | pgTAP is Postgres-supabase-specific; Drizzle tests cover the same surface area with portable tooling  |
| §4 (Deploy)        | Vercel                                  | Self-hosted on `laratik-vps` via GHCR + Traefik           | Matches vps-ops pattern; one ops surface; cheaper at scale                                            |
| §4 (Observability) | Sentry                                  | Sentry (kept)                                             | No change, Goal 13                                                                                    |
| §6 (Setup)         | `pnpm create next-app studioflow`       | `pnpm create next-app@latest laratik-planner`             | Repo name; otherwise identical                                                                        |
| §7 (Env)           | Supabase URL + anon + service-role keys | DB URL + Auth secret + Google OAuth + SMTP                | Dropped Supabase, added SMTP and Google                                                               |
| §8 (Schema)        | Tables reference `auth.users(id)`       | Tables reference `users(id)` (our own)                    | No Supabase Auth                                                                                      |
| §9 (RLS)           | Postgres RLS policies                   | Drizzle policies + app-level scoping (Goals 1+ will port) | Same defense-in-depth goal; portable; no Supabase helpers needed                                      |
| §11 (Cron)         | Vercel cron                             | VPS `cron.d` + Route Handler `/api/cron/*`                | Standard for self-hosted                                                                              |
| Product tenancy    | Original prompt assumes one agency      | Multi-agency SaaS with a separate platform-admin console  | The owner requested agency provisioning, lifecycle controls, per-agency plans, and enforceable limits |

## Goal-by-goal port map

| Goal     | Files / sections affected                                                         | Port action                                                                                                                                         |
| -------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0**    | §5, §6, §7, §8 (env only), §17 (tokens), §20 (test config), §25 (response format) | Direct port with the env changes above                                                                                                              |
| **1**    | §8 (schema), §9 (RLS)                                                             | Port schema to Drizzle; replace `auth.users(id)` FKs with our own `users(id)`; replace RLS with Drizzle policies + app-level guards                 |
| **2**    | §13 (auth)                                                                        | Replace `supabase.auth.*` with NextAuth v5; bootstrap is a server-rendered form with `BOOTSTRAP_SETUP_TOKEN`; reset is email magic link via Mailcow |
| **3**    | §3 (Workspace Overview screen)                                                    | Direct port — no Supabase coupling in the UI layer                                                                                                  |
| **4**    | §8 (channels, brand_assets, brand_voice_rules) + §14 (admin commands)             | Direct port                                                                                                                                         |
| **5–10** | All content / planning / workflow / discussion / delivery / publishing logic      | Direct port. Storage references (§9) move from Supabase Storage to local `app-data` volume (or MinIO in Goal 13)                                    |
| **11**   | §15 (MiniMax integration)                                                         | Replace `vercel-minimax-ai-provider` with raw OpenAI-compat HTTP; gate by `AI_FEATURE_ENABLED` env                                                  |
| **12**   | §18 (a11y, perf)                                                                  | Direct port                                                                                                                                         |
| **13**   | §19 (observability) + §20 (CI)                                                    | Direct port; Sentry wiring is straightforward                                                                                                       |
| **14**   | §23, §24, §25 (acceptance, release gates, response format)                        | Direct port; "Vercel" becomes "GHCR + laratik-vps"                                                                                                  |

## What is NOT ported

- Supabase-specific CLI commands (`supabase start`, `supabase db reset`, `supabase gen types`) — replaced by `docker compose -f docker-compose.dev.yml up -d postgres` and `pnpm db:generate` / `pnpm db:migrate`
- `auth.users(id)` foreign keys — replaced by our own `users(id)` table (Drizzle `pgTable("user", ...)`)
- `pgTAP` test framework — replaced by Vitest with a Postgres test container (or Drizzle's own `db:push` for fast iteration)
- `vercel-minimax-ai-provider` — replaced by raw `fetch` to MiniMax (OpenAI-compat)

## What IS ported verbatim

- All product scope (§2): workspaces, invitations, planning, content workflow, two-stage creative review, manual per-channel publishing, notifications, activity, AI assistance
- All design tokens (§3): canvas, surfaces, primary, success/warning/danger, typography scale, spacing, radii, focus ring, reduced motion
- All enums (§8): agency_member_status, workspace_status, workspace_role, invitation_status, social_platform, content_format, content_status, review_gate, review_status, comment_visibility, comment_label, delivery_provider, publication_status, notification_kind, activity_kind
- All workflow state-machine rules (§10): primary lifecycle, supporting conditions, transition table, approval modes, material edit policy
- All KPI / coverage calculations (§11)
- All accessibility rules (§18): WCAG 2.2 AA, responsive breakpoints at 360/390/768/1024/1280/1440, focus ring, reduced motion, touch targets ≥ 44px
- All 234 release checks (§24)

## Why these deviations are safe

1. **Data layer is portable** — Drizzle + Postgres is the canonical "self-hosted Supabase" stack. The same tables, the same RLS-equivalent policies, the same migrations; we just own the infra.
2. **Email is portable** — Nodemailer works with any SMTP server. Mailcow is just our SMTP host of choice; switching to Resend or SES is a single env-var change.
3. **Deploy is portable** — the app is a Docker image; whether you run it on Vercel, Fly, Render, or our VPS is irrelevant to the code.
4. **AI is portable** — MiniMax exposes an OpenAI-compat API at `api.minimax.io/v1` (and an Anthropic-compat API at `api.minimax.io/anthropic`); the `ai` SDK handles both.
5. **No proprietary Supabase features are used** — RLS, Auth, and Storage are all standard Postgres + Node.js patterns.

## Multi-agency SaaS extension

The original StudioFlow prompt models one agency. Milestones M1–M2 extend it to many agencies in one deployment. Tenant content remains keyed by `agency_id`; platform authority lives in `platform_administrator` and grants no implicit tenant-content access. Plans and per-agency overrides are stored separately from live usage counters. Advisory transaction locks serialize capacity allocation, so concurrent creates cannot oversell a limit.

Security impact: every tenant lookup resolves an active agency and re-checks active membership plus agency lifecycle. Suspended and archived agencies are excluded centrally. Platform mutations require a non-revoked platform-administrator grant and write append-only audit evidence.

Data impact: migrations are additive. Existing agencies receive an Enterprise-compatible entitlement and reconciled counters; no production identifier or tenant row is replaced. Lowering limits never deletes existing data. `null` limits mean unlimited, while future creates are rejected only when a finite cap would be exceeded.

Operational approval: no Stripe or automated billing is introduced. Plan changes, overrides, suspension, archive, and restore remain explicit operator actions with a required reason.

## M4 — Social profile analytics (2026-08-24)

StudioFlow v1 (and M1–M3 of this port) treat `social_channel` as an informational profile only. M4 adds read-only provider connections and daily analytics for the channels the agency already tracks, with no change to manual publishing semantics. The connection lifecycle is fully non-destructive: disconnecting a profile clears the provider link but keeps its metrics, publications, and row ID. Publishing remains manual.

Out of scope for M4: direct/scheduled publishing, ads/spend, demographics, comments, messages, personal Facebook profiles, Instagram consumer accounts, hourly metrics, raw provider payload retention, and any provider other than Meta and TikTok. No `NEXT_PUBLIC_*` env var is added for providers.

The architecture decision and provider boundary are recorded in [ADR-0004](docs/decisions/0004-social-profile-analytics.md).

## Auth surface deviations (2026-08-24 re-validation)

| Master prompt       | Prompt says                                                                                      | We use                                                                                                                                                                                | Why                                                                                                                                                                                                                                                                                              | ADR                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| §13 lines 1396-1397 | `/setup` form collects password + password confirmation                                          | `/setup` collects `agencyName + agencySlug + token` only; user is signed in first via Google or magic link, then sets a password later via `/app/account` or the forgot-password flow | Bootstrap relies on the NextAuth session for `auth()`. Adding password fields to the form would require a parallel "create the user" path, expanding the bootstrap surface from a single atomic transaction to a multi-step wizard. Self-registration is out of scope by design.                 | [ADR-0003](docs/decisions/0003-setup-form-scope.md) |
| §22 lines 337-339   | Auth routes live under `src/app/(auth)/login`, `(auth)/forgot-password`, `(auth)/reset-password` | Auth routes live at flat paths: `/signin`, `/signin/forgot-password`, `/signin/set-password`, `/signin/verify`, `/setup`, `/accept-invitation`                                        | Next.js route groups are a nicety, not a functional requirement. The flat paths are shorter, more discoverable in the URL bar, and the proxy/middleware already differentiates auth-required from public paths by prefix match. The `(auth)` group would add a folder with no behavioral change. | _decision filed here, no separate ADR_              |

## When to add this file's decisions to ADRs

If a deviation becomes stable (e.g. we keep Mailcow long-term, or we add a second VPS), promote the relevant section to `docs/decisions/000N-*.md` and link it from `AGENTS.md`. For now, this single file is enough.
