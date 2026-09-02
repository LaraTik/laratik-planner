# Environments and promotion path

> Records the current single-environment decision, the future
> three-environment topology (dev → staging → production), the
> promotion gate between environments, and the rollout sequence.
>
> The canonical references are:
>
> - [`AGENTS.md`](../../AGENTS.md) § "Production handoff contract":
>   the single-environment note.
> - [`docs/production-readiness/CODE_REVIEW_2026-08-20.md`](../production-readiness/CODE_REVIEW_2026-08-20.md)
>   row 35: the staging-environment estimate.
> - [`STUDIOFLOW_MASTER_PROMPT.md`](../../STUDIOFLOW_MASTER_PROMPT.md) §24
>   and Goal 14: the 3-env and §24 release-gate requirements.

## 1. Current state — single environment (v1)

Today the deployment is **single-environment**: there is one
production stack on `laratik-vps` and the developer's local
machine. The same Postgres, the same OAuth credentials, and the
same Sentry project back both. The acceptance flow is:

1. Local dev (`pnpm dev` against `localhost`) — full feature work, integration tests run against `TEST_DATABASE_URL`.
2. CI on every push / PR — authoritative format, lint, typecheck, unit, audit, integration, coverage, build, and operational gates; local hooks additionally run the critical E2E subset (`pnpm test:e2e:critical`).
3. Deploy workflow (CI green) — immutable SHA-tagged images to GHCR, VPS deploy script, post-deploy health probe.
4. Production handoff — owner-driven UAT, P0/P1 items in [`PRODUCTION_READINESS_TRACKER.md`](../production-readiness/PRODUCTION_READINESS_TRACKER.md), a verified `Verified` row per item.

### Why single env for v1

- **Operator count:** the project owner is the solo on-call. A second VPS doubles the deploy + backup + monitoring surface, which is significant for a one-person team. See [`incident-response.md`](./incident-response.md) § "Scope and on-call model".
- **Tenant count:** v1 has one production agency. The staging environment cannot have realistic tenant data without either an anonymised data export (a real engineering cost — see [`backup-recovery.md`](./backup-recovery.md) for the offsite-restore pattern) or a separate demo agency, which means a second round of seed fixtures.
- **CI coverage:** the integration tests against `TEST_DATABASE_URL`, the `pnpm migration-drill` script, and the static/unit/coverage/build release contract run on every push. The critical E2E subset runs in the local pre-push hook and the full browser/visual matrix is a manual release-candidate check. The deploy gate is a `head_sha`-pinned GHCR image; a bad SHA cannot land in production without first failing CI.
- **Migration discipline:** the migration journal is forward-only and is checked at boot by `/api/health/ready` (see [`../production-readiness/MIGRATION_DEPLOYMENT.md`](../production-readiness/MIGRATION_DEPLOYMENT.md) § "2026-08-24 incident" for the post-incident hardening). A bad migration cannot silently land in production.

The decision is recorded in [`AGENTS.md`](../../AGENTS.md) §169 as
**Goal 14, status: "not yet (single-environment for v1)"**. The
staging ticket is row 35 of
[`CODE_REVIEW_2026-08-20.md`](../production-readiness/CODE_REVIEW_2026-08-20.md)
with a `3 days` estimate. The linked work item is owned by the
project owner; the SLA is "after the §17 component-library
extraction batches land" because the staging env is the right
home for the multi-tenant-hardening items (row 40) that follow.

### Risks the single env accepts

- A bad release that passes the automated gates but breaks a flow the browser suite does not cover is caught only by the production handoff UAT. The blast radius is one production agency; the rollback path is [`runbook.md`](./runbook.md) § Rollback.
- AI / SMTP / social provider OAuth credentials are the **same** in CI, dev, and production. The dev-only `/api/dev/*` routes are gated by `NODE_ENV !== "production"` (route handler + proxy allowlist), so a production build never accepts the dev seed. The `META_APP_SECRET` and `TIKTOK_CLIENT_SECRET` are real in every env; misuse is mitigated by the per-agency provider config (M4.6) which scopes them per-agency, and the per-agency DEK (M4.5) which seals the social connection credentials.
- A failed migration leaves production down until the [`incident-response.md`](./incident-response.md) P0 procedure is run. The migration-drill script's "Failed-migration abort" (drill 4/4 PASS) is the test gate; a real production migration failure has not been observed since the 2026-08-24 incident was repaired.

## 2. Future state — three environments (Goal 14)

When staging lands, the deployment is **three-environment**:

| Env          | URL                                   | Postgres                                                                   | Users                                                                                                               | External integrations                                                                                                                                                                                                                        |
| ------------ | ------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dev`        | `http://localhost:3000`               | `localhost:5432` (developer)                                               | the developer                                                                                                       | none — dev-only routes                                                                                                                                                                                                                       |
| `staging`    | `https://staging.planner.laratik.com` | a separate `laratik-planner-staging` Postgres on the same or a sibling VPS | the project owner + a small group of named test users (the same set recorded in the team vault as v1 UAT reviewers) | **SMTP behind a flag** (`SMTP_ENABLED_FOR_STAGING=true`); **AI behind a flag** (`STAGING_AI_ENABLED=true` + per-test-agency `ai_feature_setting`); **social OAuth with a separate staging app** (Meta + TikTok "Staging" apps, sandbox mode) |
| `production` | `https://planner.laratik.com`         | `laratik-planner-prod` on `laratik-vps`                                    | real customers (the singleton v1 agency)                                                                            | full external integrations with the production credentials                                                                                                                                                                                   |

### Topology changes (when staging lands)

- **Separate VPS** — the staging stack runs on a sibling VPS (or the same VPS with a separate `docker-compose.staging.yml` overlay) with Traefik routing `staging.planner.laratik.com` to it. The VPS / Traefik setup lives in the vps-ops repo and mirrors the production vhost.
- **Separate Postgres** — `laratik-planner-staging` is its own database. The migration-drill script's "from-zero" path runs against an empty staging DB on every rebuild; the "in-place upgrade" path runs against the previous staging DB.
- **Restricted test users** — the staging app does not accept arbitrary email sign-ups. The `bootstrap/admin` route is gated to a hard-coded list of staging test emails (the project owner + named reviewers). The same gate is implemented as a `BOOTSTRAP_ALLOWED_EMAILS` env var consumed by `src/app/api/bootstrap/admin/route.ts`.
- **SMTP and AI behind flags** — the staging env uses a real Mailcow mailbox (`noreply-staging@planner.laratik.com`) but with a per-test-agency throttle. AI is enabled per-test-agency via `ai_feature_setting`; the global `MINIMAX_API_KEY` is the same key as production but each test agency has its own low daily / monthly cap. The `STAGING_AI_ENABLED` env var is the kill switch.
- **Social OAuth staging apps** — Meta and TikTok each have a separate "Staging" app in the provider dashboard. The staging app's client id / secret are stored in the staging `agency_social_provider_config` rows (M4.6). The credentials never reach the production app and vice versa.

## 3. Promotion gate (staging → production)

A change may be promoted from `staging` to `production` only when
**all** of the following are green on the `head_sha`:

1. **CI quality** — the CI workflow runs format, lint, strict typecheck, unit, audit, integration, coverage, build, and smoke gates on the `head_sha`. The release-gate coverage thresholds are 95/90 critical and 85/80 service, per [`../testing/strategy.md`](../testing/strategy.md).
2. **Release-candidate browser** — `pnpm test:e2e:critical` locally, followed by the full 5-browser and visual matrix, on the `head_sha`.
3. **CI migration** — `pnpm migration-drill` 4/4 PASS on the `head_sha`. The drill proves the from-zero, in-place upgrade, backup/restore, and failed-migration abort paths against a disposable Postgres.
4. **CI build** — `pnpm build` (Next.js production build) and `docker build` (immutable SHA-tagged images for `laratik-planner` and `laratik-planner-migrator`) both succeed.
5. **Staging release candidate** — the same SHA is deployed to `staging` automatically on green CI; the full 5-browser Playwright matrix (`pnpm test:e2e:isolated`) plus the visual-chromium project pass.
6. **Staging smoke** — the post-deploy verification checklist ([`runbook.md`](./runbook.md) § "Deploy verification checklist") returns 6/6 green on the staging URL.
7. **Staging UAT** — the staging build runs the §23 30-step journey end-to-end against the test agency. The reviewer is one of the named UAT reviewers (per the team vault). The UAT walkthrough is recorded as a check on the staging release candidate in [`PRODUCTION_READINESS_TRACKER.md`](../production-readiness/PRODUCTION_READINESS_TRACKER.md).
8. **No open P0** — [`PRODUCTION_READINESS_TRACKER.md`](../production-readiness/PRODUCTION_READINESS_TRACKER.md) has no P0 in the "Open" column on the `head_sha`. A P0 in "Open" blocks promotion regardless of CI / staging green.
9. **Manual approval** — the project owner (or a named backup operator) issues an explicit "promote to production" in the deploy channel. This is the human-in-the-loop step required by the master prompt §24.

Items 1-4 are the same as today (the deploy-gate CI). Items 5-9
are added when staging lands; until then, items 5-7 collapse into
the post-deploy production verification, items 8-9 are the UAT
walkthrough, and the "promote" button is the project owner
clicking the "merge to main" PR approval.

## 4. Rollout sequence

The sequence below is the v1 plan for moving from single-env to
three-env. The order is chosen so the staging env is production-
shaped from day one — no "throwaway staging" that has to be
re-tooled when it becomes the production-shaping step.

### Phase 0 — prerequisites (today)

- ✅ Solo operator + postmortem runbook ([`incident-response.md`](./incident-response.md)).
- ✅ Forward-only migration discipline ([`../production-readiness/MIGRATION_DEPLOYMENT.md`](../production-readiness/MIGRATION_DEPLOYMENT.md) § "2026-08-24 incident").
- ✅ Offsite backup wired ([`backup-recovery.md`](./backup-recovery.md) § 5) — the goal is to make the offsite backup path production-ready so it doubles as the staging restore path.
- ✅ Per-agency provider config (M4.6) and per-agency DEK (M4.5) — the staging app and the production app cannot share credentials even by accident.

### Phase 1 — staging infrastructure (3 days, CODE_REVIEW row 35)

- Provision the sibling VPS (or a staging overlay on the existing VPS). Mirror Traefik routing, cert handling, and the GHCR pull credential.
- Add `docker-compose.staging.yml` and `scripts/vps/staging.sh`. The script is the staging analogue of `scripts/deploy.sh` and lives in the vps-ops repo alongside the production script.
- Provision the `laratik-planner-staging` Postgres. The migration runner is the same `laratik-planner-migrator` image; only the `DATABASE_URL` differs.
- Set the `BOOTSTRAP_ALLOWED_EMAILS` env var to the named UAT reviewer list. Wire the gate in `src/app/api/bootstrap/admin/route.ts`.
- Provision the `noreply-staging@planner.laratik.com` Mailcow mailbox. Set `SMTP_ENABLED_FOR_STAGING=true` and the staging `SMTP_PASSWORD`.
- Provision the Meta + TikTok "Staging" apps. Add the staging `agency_social_provider_config` rows for the staging test agency.
- Wire `STAGING_AI_ENABLED=true` and the per-test-agency AI caps in `ai_feature_setting`.

### Phase 2 — promotion gate (2 days)

- Extend the deploy workflow to target `staging` on every green CI run (a `deploy-staging.yml` analogue of `deploy.yml`).
- Add the staging release-candidate gate: the 5-browser Playwright matrix + visual-chromium must pass on the staging URL before the "promote to production" button is enabled.
- Add the staging UAT walkthrough to [`PRODUCTION_READINESS_TRACKER.md`](../production-readiness/PRODUCTION_READINESS_TRACKER.md). The §23 30-step journey runs against the staging test agency; reviewer is one of the named UAT reviewers.
- Add the manual-approval step to the deploy channel (a slash command, a GitHub check, or a release-train calendar event — pick the one the team is already using).

### Phase 3 — first three-env release (1 day)

- Cut a release tag (the `releases/v…` pattern). Tag the SHA; do not retag.
- Verify the SHA on staging; verify the deploy-gate CI is green for the SHA; verify the staging release-candidate is green.
- The project owner issues "promote to production". The deploy workflow applies the same image to production.
- The first 24 h of production is monitored more aggressively than the steady state (extra Sentry alerts, the Uptime Kuma probe at 30s instead of 60s).
- The postmortem loop in [`incident-response.md`](./incident-response.md) is the regression net for anything missed.

### Phase 4 — iterate (ongoing)

- Staging and production track each other until a meaningful divergence justifies a config-as-code PR.
- The staging env is the integration target for the §17 component-library extraction (CODE_REVIEW row 34) and the multi-tenant-hardening items (row 40). Without staging, those items land in production blind.

## Related documents

- [`runbook.md`](./runbook.md) — Day-2 operations, deploy, rollback.
- [`incident-response.md`](./incident-response.md) — P0/P1 procedure.
- [`backup-recovery.md`](./backup-recovery.md) — RPO / RTO, restore drills.
- [`../production-readiness/MIGRATION_DEPLOYMENT.md`](../production-readiness/MIGRATION_DEPLOYMENT.md) — Migration evidence + the 2026-08-24 incident.
- [`../production-readiness/CODE_REVIEW_2026-08-20.md`](../production-readiness/CODE_REVIEW_2026-08-20.md) — Row 35 (staging) + row 40 (multi-tenant hardening).
- [`../production-readiness/PRODUCTION_READINESS_TRACKER.md`](../production-readiness/PRODUCTION_READINESS_TRACKER.md) — Production handoff contract.
- [`../testing/strategy.md`](../testing/strategy.md) — Release gates.
- [`AGENTS.md`](../../AGENTS.md) — Production handoff contract, single-env note.
- [`STUDIOFLOW_MASTER_PROMPT.md`](../../STUDIOFLOW_MASTER_PROMPT.md) §24, Goal 14 — 3-env and release-gate requirements.
