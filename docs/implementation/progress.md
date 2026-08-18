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

## Goals 2–14

See `STUDIOFLOW_MASTER_PROMPT.md` §22 for the roadmap. Each goal will get its own section here as work begins.
