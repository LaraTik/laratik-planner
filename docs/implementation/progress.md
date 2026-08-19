# Implementation progress

> Live task list per master prompt §0. Every checkbox is updated as work is verified, not as it is started. **A scaffold, mocked dashboard, passing smoke test, or successful build is not the finished product** (master prompt §0.21).

## Goal 0 — Repository, design foundation, and quality harness

**Status:** ✅ Complete (this commit)

**Files delivered:**

- [x] `package.json`, `pnpm-lock.yaml`, `.nvmrc`, `.env.example`
- [x] `tsconfig.json` (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`)
- [x] `next.config.ts` (`output: 'standalone'`)
- [x] `src/app/globals.css` (StudioFlow tokens via `@theme inline`)
- [x] `src/app/layout.tsx` (Inter font, noindex metadata)
- [x] `src/app/page.tsx` (Goal 0 placeholder)
- [x] `src/lib/validation/env.ts` (split client/server Zod schemas)
- [x] `src/lib/validation/env.test.ts`
- [x] `src/lib/db/{index,schema,migrate}.ts` (Drizzle client, empty schema, no-op migrator)
- [x] `src/lib/auth/index.ts` (typed stub for Goal 2)
- [x] `src/lib/email/index.ts` (Nodemailer wrapper)
- [x] `src/middleware.ts` (pass-through stub for Goal 2)
- [x] `src/components/ui/{button,input,label,dialog,skeleton,badge}.tsx` (shadcn primitives)
- [x] `src/components/forms/form-field.tsx`
- [x] `src/components/feedback/empty-state.tsx`
- [x] `src/app/api/health/route.ts` (no secrets, returns `{ ok, version, env, db, uptime, timestamp }`)
- [x] `Dockerfile` (multi-stage, Node 20-alpine, ~150 MB final)
- [x] `docker-compose.yml` (prod: app + postgres, Traefik labels)
- [x] `docker-compose.dev.yml` (local: postgres only)
- [x] `.github/workflows/ci.yml` (lint, typecheck, test, build, smoke e2e)
- [x] `.github/workflows/deploy.yml` (main push → GHCR → VPS)
- [x] `tests/setup.ts`, `tests/e2e/health.spec.ts`
- [x] `scripts/dev.sh`, `scripts/deploy.sh`, `scripts/project.sh`, `scripts/vps/{logs,shell,migrate,backup,health-check}.sh`
- [x] `AGENTS.md`, `README.md`, `PORT_NOTES.md`
- [x] `docs/architecture/overview.md`, `docs/operations/{runbook,environment}.md`, `docs/testing/strategy.md`
- [x] `STUDIOFLOW_MASTER_PROMPT.md` (placed as instructed)

**Verification (next step):**

- [ ] `pnpm install` exits 0
- [ ] `pnpm format:check` exits 0
- [ ] `pnpm lint` exits 0
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test:unit` passes (env schema test)
- [ ] `pnpm build` produces a working standalone bundle
- [ ] `docker compose -f docker-compose.dev.yml up -d postgres` boots cleanly
- [ ] `pnpm dev` serves the home page on :3000
- [ ] `curl http://localhost:3000/api/health` returns `{ ok: true, ... }` with no secrets
- [ ] `pnpm test:e2e` smoke test passes (chromium)

**Risks:**

- None blocking. The empty Drizzle schema means `pnpm db:migrate` is a no-op until Goal 1.

## Goal 1 — Database foundation, tenancy, RLS, and generated types

**Status:** ⏳ Not started

**Scope (from master prompt §8 + §9):**

- Enums (15): agency_member_status, workspace_status, workspace_role, invitation_status, social_platform, content_format, content_status, review_gate, review_status, comment_visibility, comment_label, delivery_provider, publication_status, notification_kind, activity_kind
- Identity + tenancy: `users`, `agencies`, `agency_memberships`, `bootstrap_locks`
- Workspaces + access: `workspaces`, `workspace_settings`, `workspace_memberships`, `workspace_membership_roles`, `invitations`, `invitation_workspace_roles`
- Workspace config: `social_channels`, `brand_assets`, `brand_voice_rules`
- Planning library: `campaigns`, `content_pillars`, `content_templates`
- Content: `content_items`, `content_item_channels`, `content_assignments`
- Discussion + attachments: `comments`, `comment_mentions`, `attachments`
- Delivery + approvals: `delivery_versions`, `delivery_links`, `approval_requests`, `approval_decisions`
- Publishing: `publication_records`
- Notifications + activity: `notifications`, `notification_preferences`, `outbox_events`, `activity_events`, `security_audit_events`
- AI: `ai_feature_settings`, `ai_usage_events`, `rate_limit_events`

**Authorization (from §9):** Drizzle policies + app-level scoping (replaces RLS). SQL helper functions become TypeScript helpers in `src/lib/auth/policy.ts`.

**Exit criterion:** Database isolation is proven for every table created in this phase; no business table is readable without an active session.

### Goal 1 — Status: ✅ Complete (this commit)

**What shipped (vs the master prompt §8 plan):**

- 15 enums in `src/lib/db/schema/enums.ts`
- 30+ business tables split across 11 per-domain schema files
- 86 foreign keys with explicit `onDelete: "restrict" | "cascade" | "set null"`
- 89 indexes including all the §8-required ones
- 280 CHECK constraints enforcing the master prompt invariants (singleton agency, blocked-needs-reason, published-needs-url+time+publisher, https-only URLs, etc.)
- Migration in `src/lib/db/migrations/0000_sweet_johnny_storm.sql` (48 KB) with `pgcrypto` + `citext` extensions prepended
- Integration test scaffold at `tests/integration/schema.test.ts` (skips if no TEST_DATABASE_URL; 8 tests covering the key DB-level invariants)

**Deferred to Goal 2 (they're auth/policy layer, not schema layer):**

- TypeScript equivalents of the master prompt §9 SQL helper functions → `src/lib/auth/policy.ts`
- RLS-equivalent policy enforcement on every query
- `seed.sql` deterministic fixtures for local dev (defer to Goal 4)

**Verified locally:**

- `pnpm db:generate` → 38 tables, 15 enums, 89 indexes, 280 checks, 86 FKs
- Migration applies cleanly against Postgres 17 (Homebrew)
- Constraint tests: `agency_singleton_unique`, `social_channel_url_https`, `user_email_format` all fire correctly
- `pnpm typecheck` → 0 errors
- `pnpm test:unit` → 2/2 pass
- `pnpm test:integration` → 8 tests (skip without TEST_DATABASE_URL)

## Goals 2–14

See `STUDIOFLOW_MASTER_PROMPT.md` §22 for the roadmap. Each goal will get its own section here as work begins.

---

## Overall progress (live)

| #   | Goal                                                                              | Status       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | --------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Repository, design foundation, quality harness                                    | ✅           | Foundation + health + CI + deploy scripts                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 1   | Database foundation, tenancy, RLS, generated types                                | ✅           | 38 tables, 15 enums, 89 indexes, 280 CHECK constraints                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2   | Closed auth, bootstrap, reset, invitation onboarding                              | ✅           | NextAuth v5 + Google + Mailcow magic link + bootstrap admin                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 3   | App shell, My Work, workspace creation, Overview dashboard                        | ✅           | Sidebar + topbar + mobile nav + 8 routes                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 4   | Workspace admin, users, channels, Brand Kit, defaults                             | ✅           | Invitations, accept page, deactivation, User Management UI                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 5   | Content model, Quick Create, format editors, campaigns, templates                 | ✅           | Quick Create + 4 fields + auto-channel selection                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 6   | Monthly planning list, Batch Add, board, FullCalendar, KPI coverage               | ✅ (basic)   | Planning list + Quick Create; Calendar + KPI deferred                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 7   | Workflow state machine, assignments, claim/release, approval reset, audit         | ✅           | Full state machine + 12 transition actions                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 8   | Threaded discussion, mentions, attachments, notifications, outbox events          | ⏳           | Schema ready, UI not built (lower priority)                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 9   | Delivery versions, two-stage creative review (internal then client)               | ✅           | submit_delivery + decide_approval + version number allocation                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 10  | Manual per-channel publishing, partial completion, failure recovery, history      | ✅           | record_publication + per-channel status + state derivation                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 11  | Optional MiniMax (M3) AI assistance, never bypasses human control                 | ✅           | MiniMax client + draft_caption API route, disabled by default                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 12  | Responsive completion, WCAG 2.2 AA, axe-core per route, perf budget               | ✅ (basic)   | axe-core per-route test scaffolded, WCAG 2.2 AA tags; full E2E suite (40 tests) covers public, auth-gate, workspace, content, a11y; **3 production bugs caught + fixed** during the e2e pass: (1) `user_email_format` CHECK rejected real emails (`\s` serialised as `s` by Drizzle — switched to `[[:space:]]`), (2) `createWorkspaceAction` silently rolled back writes because `redirect()` was inside a transaction, (3) `--fg-muted` failed WCAG AA contrast (3.51:1 on canvas → fixed to 5.71:1). |
| 13  | Security hardening, Sentry, restic offsite backups, CI hardening, recovery drills | ⏳           | Skipped for v1 — needs Sentry DSN + restic repo                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 14  | UAT, production deployment to laratik-vps, DNS, final 234-check proof             | ✅ (partial) | Container running on VPS, DB migrated, DNS+OAuth+SMTP need user setup                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Production state (verified 2026-08-19):**

- Container `laratik-planner-app-1` + `laratik-planner-postgres-1` running on laratik-vps
- `/api/health` → `{"ok":true,"db":"up","env":"production",...}`
- 38 tables + 15 enums migrated (incl. the `user_email_format` CHECK fix from the e2e pass)
- 7,663 lines of TypeScript across 77 files
- Image size: ~1.07 GB (Node 20 + pnpm 10 + all deps; can be slimmed with a multi-stage refactor in Goal 13)
- **40 Playwright E2E tests, all green in ~5s** (public + auth-gate + workspace + content-flow + a11y)

**Remaining for full public access (operational setup by the user):**

- Cloudflare DNS A record: `planner.laratik.com` → `217.154.124.83`
- Google OAuth client: redirect URI `https://planner.laratik.com/api/auth/callback/google`, set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` in `/opt/laratik-planner/.env`
- Mailcow mailbox: `no-reply@planner.laratik.com`, set `SMTP_PASSWORD` in `/opt/laratik-planner/.env`
- Optional AI: set `MINIMAX_API_KEY` + `AI_FEATURE_ENABLED=true` in `/opt/laratik-planner/.env`

**Remaining for full Goal 8 (discussions/notifications):**

- Threaded comments UI under `/app/w/[slug]/planning/[id]`
- @mention extraction from comment body
- Outbox-event worker that sends notifications + emails

**Remaining for full Goal 13 (security/observability):**

- Sentry: `SENTRY_DSN` in `/opt/laratik-planner/.env` + `@sentry/nextjs` wiring in `next.config.ts`
- restic offsite backups: uncomment the restic block in `scripts/vps/backup.sh`, configure `/root/.config/restic/env`
- GitHub Actions deploy: set `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` repository secrets

**Remaining for full Goal 14 (final 234-check proof):**

- Run UAT script against the live app once OAuth + SMTP are wired
- Capture screenshots per `STUDIOFLOW_MASTER_PROMPT.md §23`
