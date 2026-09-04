# Operations runbook

> Day-2 operations for `laratik-planner` on `laratik-vps`. Mirrors the vps-ops pattern (`mavis-trader`, `laratik-social-platform`).

## Milestone scope (M-tag glossary)

The runbook uses `M1`–`M4.5` tags inline to anchor a procedure to a release. A new operator reading the runbook does not need to load the milestone plan to follow any individual section, but the scope is summarised here for self-contained reading. Authoritative per-milestone evidence lives in [`docs/implementation/progress.md`](../implementation/progress.md) and [`docs/architecture/overview.md`](../architecture/overview.md).

| Tag    | Scope (one-line summary)                                                                                                                                | First appeared on `main`     | Canonical reference                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `M1`   | Auth + security: Google OAuth sign-in, agency cookie + HMAC, CSRF for server actions, base rate limiting, audit row for auth events.                    | pre-2026-08-19               | `progress.md` "auth/security"                                                                                          |
| `M2`   | Workflow + publishing + AI foundations: content lifecycle, channels, brand kit, invitations, MiniMax default, per-agency `provider_secret` placeholder. | 2026-08-19                   | `progress.md` round-2 review plan; `MIGRATION_DRILL_RESULTS.md` § "2026-08-23 M2 ledger-safe rerun"                    |
| `M3`   | AI governance + support access: per-agency `ai_provider_secret`, `support_access_grant` lifecycle, platform-only `support_session` banner.              | 2026-08-24 (merge `4a999fe`) | `progress.md` "M3 (AI governance + support access) merged"                                                             |
| `M3a`  | Infra + deploy chain: VPS, Docker, GHCR, M3a migrator image, `deploy.yml` workflow_run gate, schema-readiness probe.                                    | 2026-08-20                   | `progress.md` "deploy chain live on `laratik-vps`"; this runbook § "Deploying a new version"                           |
| `M3b`  | Product + docs: authenticated surfaces (workspace, content, channels, brand, design, library), E2E coverage, axe-core a11y, role-by-route matrix.       | 2026-08-22                   | This runbook § "End-to-end tests" (E2E spec table)                                                                     |
| `M4`   | Social profile analytics: read-only Meta + TikTok per-profile metrics, AES-256-GCM envelope, 5-state staged rollout, daily cron, 25-month retention.    | 2026-08-24 (merge `0f6d552`) | `progress.md` "Social profile analytics (M4) merged"; this runbook § "Social analytics (M4)"                           |
| `M4.5` | Per-agency social DEK + lazy platform KEK: agency-scoped DEKs wrapped by the platform KEK, `rotate-social-kek.ts` script, optional-at-boot env var.     | 2026-08-24                   | `progress.md` "Per-agency social DEK + lazy platform KEK (M4.5) merged"; this runbook § "Platform KEK rotation (M4.5)" |

When a section header in this runbook carries an M-tag, that tag is the contract for which milestone's behaviour the procedure relies on. If the milestone is undone or re-scoped, the section must be re-read before following it.

## Locations

| What                 | Where                                        |
| -------------------- | -------------------------------------------- |
| Source on VPS        | `/opt/laratik-planner/`                      |
| Real `.env`          | `/opt/laratik-planner/.env` (chmod 600)      |
| `docker-compose.yml` | `/opt/laratik-planner/docker-compose.yml`    |
| Backup dir           | `/var/backups/laratik-planner/`              |
| Health endpoint      | `https://planner.laratik.com/api/health`     |
| Traefik              | `infra/traefik/` (managed in vps-ops repo)   |
| GitHub repo          | `https://github.com/LaraTik/laratik-planner` |
| Image                | `ghcr.io/laratik/laratik-planner`            |

## First-time bootstrap (one-time per VPS)

1. Add Cloudflare DNS: `planner.laratik.com` → `217.154.124.83` (A record, proxy off for direct cert validation).
2. Clone the repo:
   ```bash
   ssh laratik-vps
   sudo git clone https://github.com/LaraTik/laratik-planner.git /opt/laratik-planner
   cd /opt/laratik-planner
   ```
3. Copy `.env.example` to `.env` and fill in real values:
   ```bash
   sudo cp .env.example .env
   sudo chmod 600 .env
   sudo -e .env  # set AUTH_SECRET, GOOGLE_CLIENT_ID, SMTP_PASSWORD, etc.
   ```
4. Generate `AUTH_SECRET` and `BOOTSTRAP_SETUP_TOKEN`:
   ```bash
   openssl rand -base64 32  # AUTH_SECRET
   openssl rand -hex 32      # BOOTSTRAP_SETUP_TOKEN (one-time admin token)
   openssl rand -base64 24  # POSTGRES_PASSWORD
   ```
5. **Important:** any `+`, `/`, or `=` characters in `POSTGRES_PASSWORD` must be percent-encoded in `DATABASE_URL`:
   ```bash
   # Example: MuRWMSVPWZ3YaE+sF8aJY/4jGq3Y8M1P becomes MuRWMSVPWZ3YaE%2BsF8aJY%2F4jGq3Y8M1P
   PASSWORD=$(grep ^POSTGRES_PASSWORD= .env | cut -d= -f2-)
   ENC=$(printf "%s" "$PASSWORD" | sed "s|+|%2B|g; s|/|%2F|g; s|=|%3D|g")
   sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://planner:${ENC}@postgres:5432/planner|" .env
   ```
6. Build the Docker image (locally, on the VPS — pnpm 10.10 is used, Node 20 compatible):
   ```bash
   sudo docker build -t laratik-planner:latest .
   ```
7. Apply the database migration (the runner container has no pnpm, so apply via the postgres container):
   ```bash
   cat src/lib/db/migrations/0000_*.sql > /tmp/migration.sql
   sudo docker compose cp /tmp/migration.sql postgres:/tmp/migration.sql
   sudo docker compose exec -T postgres psql -U planner -d planner -v ON_ERROR_STOP=1 -f /tmp/migration.sql
   ```
8. Boot the stack:
   ```bash
   sudo docker compose up -d
   ```
9. Verify health:
   ```bash
   curl -sS http://localhost:3100/api/health | jq   # until DNS is set up; or https://planner.laratik.com/api/health
   ```
   Expected: `{"ok":true,"db":"up","env":"production",...}`
10. Install the backup + cert-check crons:

    ```bash
    sudo ./scripts/vps/install-cron.sh
    ```

    Idempotent: re-running is a no-op. Installs both the daily `pg_dump` backup
    and the daily `mail.laratik.com:465` cert-expiry probe into
    `/etc/cron.d/laratik-planner`. See the Backup and SMTP-certificate-management
    sections below for what each entry does.

11. Set up Google OAuth: in Google Cloud Console, add `https://planner.laratik.com/api/auth/callback/google` as an authorized redirect URI, then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env` and `docker compose up -d app`.
12. Set up Mailcow mailbox `no-reply@planner.laratik.com` (Mailcow admin → Mailboxes → Add), then set `SMTP_PASSWORD` in `.env` and `docker compose up -d app`.
13. **GHCR credential for the deploy workflow**: the `ghcr.io/laratik/laratik-planner{-migrator}` images are private. The VPS-side `scripts/deploy.sh` does `echo "$GHCR_PAT" | docker login ghcr.io -u "$GHCR_USER" --password-stdin` before pulling, but the credential comes from the GitHub repo secrets, not from the VPS filesystem. Set them once:
    ```bash
    # 1. https://github.com/settings/tokens?type=beta → Generate new token
    #    • Resource owner: LaraTik
    #    • Repository access: Public repositories (read) + LaraTik org (read:packages)
    #    • No other scopes needed
    #    • No expiration (or 1 year + a calendar reminder)
    # 2. Save the PAT to a local file, then:
    gh secret set GHCR_PAT  --repo LaraTik/laratik-planner < ~/.ssh/<pat-file>
    gh secret set GHCR_USER --repo LaraTik/laratik-planner --body "MHDNEZAM"
    ```
    The PAT must be kept secret — it grants read:packages on the LaraTik org. Rotate on the same cadence as the deploy SSH key (see Rotation).
14. First sign-in: visit `https://planner.laratik.com/signin`, sign in with Google, then go to `/setup` and enter the agency name + slug + `BOOTSTRAP_SETUP_TOKEN`.

## Deploying a new version

Deployment is fully automated by the M3a pipeline. CI builds the
`laratik-planner` (app) and `laratik-planner-migrator` (migrator)
images, tags each by the exact commit SHA, and pushes them to GHCR. A
separate `deploy` workflow triggers on `workflow_run` CI success, checks
out the same `head_sha`, and SSHes to the VPS to run `scripts/deploy.sh`,
which performs `backup → migrate → recreate app → health check →
rollback on failure` without any manual Docker commands.

From your **local** machine:

```bash
git push origin main
# CI: lint, typecheck, unit, integration, coverage, audit, build,
#      Docker image + health smoke + GHCR push, SMTP cert probe,
#      workflow/Dockerfile/shell linters. Full release-gate contract —
#      see docs/testing/strategy.md (Release gates).
# On green CI: deploy workflow verifies the GHCR tag, SSHes to the
#              VPS, and runs scripts/deploy.sh.
# On red health check: the deploy script rolls back to the previous
#                      image automatically.
#
# Expected wall-clock (measured 2026-08-28, post single-build change):
#   CI green:           ~9 min  (4 jobs in parallel + build-smoke)
#   workflow_run → deploy: ~2 s
#   deploy (verify + ssh + deploy.sh): ~60 s
#   Push → live:        ~10 min  (down from ~14-16 min pre-change)
```

```bash
# Manual deploy — only when CI is unavailable:
ssh laratik-vps 'cd /opt/laratik-planner && sudo ./scripts/deploy.sh'
```

If `pnpm` is missing on the VPS (fresh install), one-shot:
`corepack enable && corepack prepare pnpm@10.10.0 --activate`.

### Deploy verification checklist (post-deploy)

- [ ] `https://planner.laratik.com/` returns 200 with the new home-page `<title>`.
- [ ] `https://planner.laratik.com/api/health` returns `{"ok":true,"db":"up","env":"production",...}`.
- [ ] `https://planner.laratik.com/signin` returns 200 (renders the sign-in form).
- [ ] `https://planner.laratik.com/app` redirects (307) to `/signin?callbackUrl=%2Fapp`.
- [ ] `docker ps` shows `laratik-planner-app-1` as `(healthy)`.
- [ ] No new errors in `docker logs laratik-planner-app-1 --tail 200`.

### Rollback

`scripts/deploy.sh` captures the previous application image before
recreating the app. If the post-migration health check fails, the
script automatically recreates the app from the captured previous
image — no manual operator action is required for a health-check
rollback. The migrator runs in a separate container and aborts the
deploy on any non-zero exit; it never suppresses migration errors.

For a manual rollback of a bad release that passed health but is
otherwise broken, push a revert (or the last known-good commit) to
`main` and let the automated pipeline re-apply the previous image.
The Postgres schema is forward-only — Drizzle migrations are
append-only, so reverting application code is safe as long as the
revert's migration set has already been applied to the DB.

## Backup

Local (manual):

```bash
./scripts/project.sh backup    # → ./tmp/backups/planner-<ts>.sql.gz
```

VPS (automated cron):

```bash
# /etc/cron.d/laratik-planner-backup
30 3 * * * root /opt/laratik-planner/scripts/vps/backup.sh >> /var/log/laratik-planner-backup.log 2>&1
```

Backups are kept 14 days locally. To enable offsite (restic), uncomment the `restic` block in `scripts/vps/backup.sh` and create `/root/.config/restic/env` with the `RESTIC_REPOSITORY` + `RESTIC_PASSWORD` vars (see vps-ops `docs/runbooks/backup-restore.md`).

## Restore

```bash
# 1. Find the backup
ls -la /var/backups/laratik-planner/

# 2. Stop the app
ssh laratik-vps 'cd /opt/laratik-planner && docker compose stop app'

# 3. Restore into Postgres
ssh laratik-vps 'gunzip -c /var/backups/laratik-planner/planner-20260818-030000.sql.gz | docker compose exec -T postgres psql -U planner -d planner'

# 4. Restart
ssh laratik-vps 'cd /opt/laratik-planner && docker compose up -d app'
```

## Rotation

| What                          | Where                            | How                                                                                                                                                                                                                                                                                             |
| ----------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`                 | `.env` on VPS                    | `openssl rand -base64 32`, update, `docker compose up -d --no-deps app`. Active sessions are invalidated.                                                                                                                                                                                       |
| `GOOGLE_CLIENT_SECRET`        | Google Cloud Console + `.env`    | Same as above.                                                                                                                                                                                                                                                                                  |
| `SMTP_PASSWORD`               | Mailcow admin                    | Same as above.                                                                                                                                                                                                                                                                                  |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | `.env` on VPS                    | Re-wrap every `agency_social_dek` row from the old KEK to the new KEK, then swap. The per-agency DEKs are unchanged; only the platform KEK is rotated. See the **Platform KEK rotation** section below for the exact script. The env var is **optional at boot** (M4.5 — per-agency DEK model). |
| `META_APP_SECRET`             | Meta App Dashboard + `.env`      | Same pattern as `GOOGLE_CLIENT_SECRET`; the secret applies to long-lived token exchange. After rotation, the cron route will re-issue long-lived tokens for every active connection on the next refresh cycle.                                                                                  |
| `TIKTOK_CLIENT_SECRET`        | TikTok Developer Portal + `.env` | Same as above. TikTok's 365-day refresh token is bound to the app secret at the time of grant issuance; a secret rotation invalidates existing refresh tokens, so all workspaces must reconnect.                                                                                                |
| Image                         | GHCR                             | Automatic on `main` push. Old tags pruned via `docker image prune` (see disk hygiene below).                                                                                                                                                                                                    |
| LE cert                       | Traefik (vps-ops)                | Auto-renewed by Traefik; check with `ssh laratik-vps 'sudo bash /root/gitops/scripts/ops/check-certs.sh 30'`.                                                                                                                                                                                   |

## Disk hygiene

Before any deploy, check the VPS disk:

```bash
ssh laratik-vps 'df -h /'
```

If `/` is > 70%, run the vps-ops cleanup first:

```bash
ssh laratik-vps 'sudo bash /root/gitops/scripts/disk-cleanup.sh apply'
```

This truncates container logs (the 10m × 5 per-container rotation in `docker-compose.yml` is the long-term fix, but already-large logs need manual truncation), prunes dangling images, clears build cache, and vacuums journald.

After a deploy, prune the previous image:

```bash
ssh laratik-vps 'cd /opt/laratik-planner && docker image prune -f'
```

## Monitoring

- **Uptime:** Uptime Kuma (`http://localhost:3001` via `./scripts/open-kuma.sh` in vps-ops) — add `https://planner.laratik.com/api/health` as an HTTP monitor
- **Errors:** Sentry (Goal 13) — `SENTRY_DSN` in `.env`
- **Telegram alerts:** already wired via the ops-monitor stack in vps-ops; add a Telegram notifier in Uptime Kuma for downtime
- **Health snap:** `ssh laratik-vps 'sudo bash /root/gitops/scripts/health-snap.sh'` — daily cron output captures container state

## End-to-end tests

The Playwright suite in `tests/e2e/` runs against a real Next.js dev server + Postgres. Historical CI counts and current per-spec evidence are kept in [`../production-readiness/TEST_EVIDENCE.md`](../production-readiness/TEST_EVIDENCE.md). The release-candidate command runs the five functional projects (Chromium, Firefox, WebKit, mobile Chrome, and mobile Safari) locally. The visual harness currently has 39 exact-reference plus 73 scoped responsive assertions; candidate baselines passed 112/112 at snapshot `f702b46`, while final exact-HEAD rerun and human review remain required (see UI-010 in the production tracker).

### Spec files

| Spec file                              | What it covers                                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `tests/e2e/public.spec.ts`             | `/`, `/signin`, `/signin/verify`, `/api/health`, `/api/bootstrap/status`                                                |
| `tests/e2e/auth-gate.spec.ts`          | Auth-gate behaviour across `/app/*` and the public-while-authed redirect                                                |
| `tests/e2e/workspace.spec.ts`          | Workspace shell, create-workspace form, slug validation, non-member experience                                          |
| `tests/e2e/content-flow.spec.ts`       | Quick Create, planning list, draft → content_review → approved_for_design, channel auto-select                          |
| `tests/e2e/a11y.spec.ts`               | axe-core WCAG 2.2 AA on `/`, `/signin`, `/signin/verify`, `/app` redirect                                               |
| `tests/e2e/health.spec.ts`             | `/api/health` JSON shape, secret-leak guard                                                                             |
| `tests/e2e/a11y-routes.spec.ts`        | Per-authenticated-route axe scan (M3b)                                                                                  |
| `tests/e2e/boundaries.spec.ts`         | Client-review data-shape denial — internal fields never enter client results (M3b)                                      |
| `tests/e2e/discussions.spec.ts`        | Discussion mention/attachment/realtime happy paths (M3b)                                                                |
| `tests/e2e/error-states.spec.ts`       | Operational states (loading / empty / error / denied / archived) (M3b)                                                  |
| `tests/e2e/mobile.spec.ts`             | Mobile responsive baseline (M3b)                                                                                        |
| `tests/e2e/role-authorization.spec.ts` | Role-by-route matrix for admin, manager, planner, designer, internal reviewer, client reviewer, publisher, viewer (M3b) |

### Run locally

Prereqs: Postgres reachable at `DATABASE_URL`, Node 20+, pnpm 10.10.

```bash
# 1. Make sure migrations are applied
pnpm db:migrate

# 2. Run the full suite (boots pnpm dev automatically via webServer config)
pnpm test:e2e:run

# 3. Or just the smoke (public + auth-gate + health) — fast, ~3s
pnpm test:e2e:smoke

# 4. Or one spec at a time
pnpm test:e2e:public
pnpm test:e2e:auth
pnpm test:e2e:workspace
pnpm test:e2e:content
pnpm test:a11y           # WCAG 2.2 AA
pnpm test:e2e:isolated   # the exact CI command

# 5. During development, run only the affected contracts
pnpm test:affected
pnpm test:area content
pnpm test:affected -- --since origin/main --layer browser
```

```bash
# Against a non-default base URL (e.g. the prod container on 3100)
PLAYWRIGHT_BASE_URL=http://localhost:3100 pnpm test:e2e:smoke
```

### CI vs. local E2E

The authoritative deploy-gate workflow is `.github/workflows/ci.yml`
(2026-08-28 contract, post CI-minimization plan + the "E2E moves
local" follow-up + the "single-build-pipeline" change). It runs the
irreducible release contract that genuinely cannot be reproduced on
a dev laptop:

- integration + migration drill (`pnpm test:integration`) — the
  audit re-run; the dev's pre-push already ran it locally;
- target coverage (95/90 critical modules, 85/80 application
  services) — runs the unit suite under v8 instrumentation;
- `pnpm audit --prod` (zero critical/high production findings);
- production build, Docker image build, a `/api/health` smoke
  against the built image, **and the GHCR push** (app + migrator
  with the `<sha>` and `latest` tags) — the single source of
  the production image as of the 2026-08-28 single-build change;
- SMTP cert probe (deploy-blocker);
- workflow / Dockerfile / shell linters (actionlint + zizmor +
  hadolint + shellcheck).

Format, lint, typecheck, the full unit suite, integration, and the
critical E2E subset (chromium + visual-chromium) moved out of CI to
`.husky/pre-commit` and `.husky/pre-push` so a regression is caught
before CI minutes are spent. CI re-runs integration as the deploy-gate
audit, not as the first signal.

The 5-browser E2E matrix and the full visual matrix also moved out
of CI. They are run **locally** as a manual pre-merge step (the
critical subset is the pre-push signal, the full 5-browser matrix is
the pre-merge signal). The `e2e.yml` GitHub workflow was deleted in
the 2026-08-26 "E2E moves local" commit. Production deploy fires on
CI green alone — no E2E gate.

The 2026-08-28 single-build change also removed the duplicate
`next build` + `docker build` from `.github/workflows/deploy.yml`:
CI's `build-smoke` job is now the single source of the GHCR push,
and the deploy job just verifies the tag exists in the registry
before SSHing to the VPS to pull + run migrations + restart. This
shaves ~270s off every deploy (deploy.yml's `Build + push image`
job ran for 4.5 min on the previous 8 successful deploys).

#### Local E2E recipes

```bash
# One-time setup (Mac + Linux). Postgres + disposable test database + Playwright.
docker compose -f docker-compose.dev.yml up -d postgres
docker exec laratik-planner-pg-dev pg_isready -U planner -d planner
# Create planner_test once. The first command is idempotent; the second runs
# only when the database does not already exist.
docker exec laratik-planner-pg-dev psql -U planner -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname = 'planner_test'" | grep -q 1 || \
  docker exec laratik-planner-pg-dev psql -U planner -d postgres \
  -c "CREATE DATABASE planner_test"
pnpm install --frozen-lockfile
pnpm exec playwright install --with-deps chromium firefox webkit

# Keep this in the shell that runs the checks (or add it to direnv/.env.test).
export TEST_DATABASE_URL=postgresql://planner:planner_dev_only@localhost:5432/planner_test

# Verify the disposable database and migration pipeline before browser tests.
NODE_ENV=test pnpm migration-drill
pnpm test:integration

# Pre-push: critical subset (chromium + visual-chromium). Runs in
# .husky/pre-push automatically; the isolated runner applies migrations
# and supplies test-only AUTH_* values; ~10 min on a Mac.
pnpm test:e2e:critical

# Pre-merge: full 5-browser matrix. ~45 min on Linux CI, ~30-60 min
# on a Mac. Run on the release-candidate branch before merging to
# main.
pnpm test:e2e:isolated

# Pre-merge: full visual matrix (assert mode against committed
# baselines). ~15 min locally (longer on cold dev servers). The command uses the same isolated runner and
# therefore needs TEST_DATABASE_URL. Use `pnpm test:visual:update` to refresh
# baselines after a deliberate UI change.
pnpm test:visual
```

`pnpm test:e2e:isolated`, `pnpm test:e2e:critical`, and `pnpm test:visual`
all run through `scripts/run-e2e-tests.ts`. The runner refuses a URL that does
not contain `test` or `ci`, resets only the disposable test database while
preserving the migration ledger, applies migrations before starting Playwright,
and injects deterministic test-only `AUTH_SECRET`, `AGENCY_COOKIE_SECRET`,
`AUTH_URL`, and `NEXTAUTH_URL` values. This is why a missing
`TEST_DATABASE_URL` is a configuration error rather than a test skip.

The affected runner is the normal development loop. It uses the Git working
tree plus upstream changes, selects unit tests through Vitest's import graph,
and selects integration/browser contracts through the ownership manifest.
Use `pnpm test:area <domain>` when you want to check one domain deliberately.
Its browser path runs Chromium and only adds affected accessibility or visual
selectors. Shared or unknown changes escalate to full relevant coverage.

Pre-push remains a full local gate for code pushes. It reads the pushed commit
range rather than the staging index, so a normal push after committing cannot
silently skip the gate. `TEST_DATABASE_URL` must be configured for integration;
otherwise the hook fails with the disposable-database setup instructions.
`SKIP_E2E=1`, `SKIP_INTEGRATION=1`, and `git push --no-verify` remain explicit
escape hatches, and CI remains authoritative.

#### Local integration setup

Integration moved out of CI into `.husky/pre-push` on 2026-08-28
(symmetric with the 2026-08-26 "E2E moves local" decision). CI still
re-runs integration as the deploy-gate audit, so skipping it locally
is safe — it just makes the dev's pre-push signal weaker than the
CI signal again.

The integration runner requires a disposable Postgres database that
contains the substring `test` or `ci` in the URL
(`scripts/run-integration-tests.ts` enforces this guard). The dev's
local Postgres is fine; the only extra step is a second database:

```bash
# One-time: create a disposable test database on your dev Postgres. The Docker
# command works even when the host has no `psql` binary installed.
docker compose -f docker-compose.dev.yml up -d postgres
docker exec laratik-planner-pg-dev psql -U planner -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname = 'planner_test'" | grep -q 1 || \
  docker exec laratik-planner-pg-dev psql -U planner -d postgres \
  -c "CREATE DATABASE planner_test"

# Then set the test URL in your shell rc (or .env / direnv). The
# .env.example template includes this line for reference.
export TEST_DATABASE_URL=postgresql://planner:planner_dev_only@localhost:5432/planner_test

# Verify locally before relying on the pre-push gate:
pnpm test:integration
```

The same `TEST_DATABASE_URL` is required by `pnpm migration-drill` and the
isolated/visual Playwright commands. If the database is unavailable, check
`docker compose -f docker-compose.dev.yml ps postgres` and
`docker exec laratik-planner-pg-dev pg_isready -U planner -d planner` before
rerunning the checks.

If PostgreSQL reports `cannot connect to invalid database "planner_test"`
after an interrupted migration drill, the disposable database was left in
the catalog while its storage was being dropped. Repair only that test
database (never a production database), then rerun the drill:

```bash
docker exec laratik-planner-pg-dev psql -U planner -d postgres \
  -c 'DROP DATABASE IF EXISTS planner_test;'
docker exec laratik-planner-pg-dev psql -U planner -d postgres \
  -c 'CREATE DATABASE planner_test;'
docker exec laratik-planner-pg-dev pg_isready -U planner -d planner_test
NODE_ENV=test pnpm migration-drill
```

Do not cancel the drill while it is executing its drop/recreate step unless
the target is definitely `planner_test`; a cancelled production migration
must be handled through the backup/rollback runbook instead.

If `TEST_DATABASE_URL` is not set, `.husky/pre-push` fails
integration with a direct setup hint. This keeps the gate honest
after a normal commit and push. `SKIP_INTEGRATION=1` is the explicit
escape hatch when you have a reason to skip.

#### Checkbox controls and mobile touch targets

Use the shared Radix checkbox (`src/components/ui/checkbox.tsx`) for
every checkbox. The global mobile accessibility rule gives buttons and
`role="button"` elements a 44px minimum height; the checkbox primitive
sets `min-h-0` so its 16px visual control is not stretched into a tall
rectangle. Wrap it in a labeled row/card (with `htmlFor`) to provide the
full touch target and keep the helper text linked with
`aria-describedby`. When reviewing a mobile screenshot, a checkbox
should remain square while its surrounding row remains comfortably
touchable.

### Dev-only API helpers

`/api/dev/seed`, `/api/dev/sign-in`, and `/api/dev/sign-out` exist to make E2E tests skip the Google OAuth and Mailcow SMTP flows. They are guarded by `NODE_ENV !== "production"` in two places (the route handler + the proxy allowlist) so production builds return 404.

**They are safe to leave in the codebase** because:

1. The proxy only passes them through in non-prod.
2. The route handler checks `serverEnv.NODE_ENV === "production"` and returns 404.
3. They do not bypass authorization in production — they simply do not exist.
4. They never accept or return secrets; the seed uses the same Drizzle inserts the real bootstrap path uses.

### Running on CI

`ci.yml` is the only workflow that runs on every push and PR to
`main`. The 5-browser matrix and the visual run are local-only:

```yaml
# .github/workflows/ci.yml  (deploy-gate, post 2026-08-26 plan)
- run: pnpm db:migrate
- run: pnpm test:integration
- run: pnpm test:coverage
- run: pnpm audit --prod
- run: pnpm build
- run: docker build ...
- run: docker run ... (liveness smoke)
- run: scripts/vps/check-smtp-cert.sh
- run: actionlint / zizmor / hadolint / shellcheck
```

```bash
# Local pre-push (automatic via .husky/pre-push)
pnpm test:unit
pnpm test:integration   # requires TEST_DATABASE_URL=...planner_test
pnpm test:e2e:critical

# Local pre-merge (manual checklist on the release-candidate branch)
pnpm test:e2e:isolated
pnpm test:visual
```

The deploy workflow (`deploy.yml`) fires on `workflow_run: CI success`
and SSHes to the VPS for the production rollout. The deploy
workflow does not re-run any test against the VPS. See the **CI vs.
local E2E** section above and
[`../testing/strategy.md`](../testing/strategy.md) (Release gates)
for the full contract.

## Troubleshooting

| Symptom                                                             | First check                                        | Fix                                                                                                                            |
| ------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `502 Bad Gateway` from Traefik                                      | `docker compose ps` — is the app up?               | `docker compose up -d --no-deps app`                                                                                           |
| `db: down` in `/api/health`                                         | `docker compose logs postgres`                     | Check `pgdata` volume, `POSTGRES_PASSWORD` in `.env`                                                                           |
| `ok: false` in `/api/health`                                        | Same as above                                      |                                                                                                                                |
| Health check passes but UI is broken                                | `docker compose logs --tail=200 app`               | Likely a code issue — pull logs and diagnose                                                                                   |
| Stuck deploy                                                        | `docker compose ps` + `docker image ls`            | `docker image prune -f`, then `./scripts/deploy.sh` again                                                                      |
| Out of disk                                                         | `df -h /`                                          | `disk-cleanup.sh apply` (see above)                                                                                            |
| Magic link not arriving                                             | Mailcow queue: `https://mail.laratik.com/` → Queue | Check `SMTP_USER` + `SMTP_PASSWORD`, then `docker compose logs app                                                             | grep email` |
| Google OAuth fails                                                  | Google Cloud Console → OAuth client                | Check `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, redirect URI must be `https://planner.laratik.com/api/auth/callback/google` |
| "certificate has expired" on /signin, /app/users, or password reset | `./scripts/vps/check-smtp-cert.sh`                 | See [SMTP certificate management](#smtp-certificate-management) below                                                          |

## SMTP certificate management

The production SMTP transport (Nodemailer → Mailcow at `mail.laratik.com:465`) uses a Let's Encrypt certificate served by Mailcow's built-in ACME client (or the `acme-companion` sidecar, depending on the install). If that cert expires without being renewed, every email send surfaces the raw OpenSSL error `"certificate has expired"` to the user — including invitation resend, magic-link sign-in, password reset, and any future notification/digest email.

We hit this on **2026-08-22** when the Let's Encrypt E7 cert for `mail.laratik.com` went 1 day past `notAfter` because the ACME container's renewal cron was paused. The CI gate below now catches this scenario before it can break production.

### Health check (gating)

The CI job [`check-smtp-cert`](../../.github/workflows/ci.yml) runs `scripts/vps/check-smtp-cert.sh` against `mail.laratik.com:465` on every push to `main`, every PR, and once per day via `cron: "0 6 * * *"`. Exit codes:

| Exit | Days remaining | Behavior                                                                                 |
| ---- | -------------- | ---------------------------------------------------------------------------------------- |
| `0`  | > 30           | Job passes, deploy is unblocked                                                          |
| `1`  | 14–30          | Job passes (warning), but CI log + run summary surface the cert status for visibility    |
| `2`  | < 14           | Job **fails**, deploy is blocked, on-call is paged via the workflow failure notification |
| `3`  | n/a            | TLS handshake / cert parse error — job **fails**                                         |

The job's run summary always carries the full JSON (`status`, `daysLeft`, `notAfter`, `subject`, `issuer`) so the on-call can read it without re-running locally.

### Remediation: how to renew

If `check-smtp-cert` fails (or you receive the daily cron email), SSH to laratik-vps and run:

```bash
ssh laratik-vps
cd /opt/laratik-planner
git pull
./scripts/vps/renew-smtp-cert.sh
```

The script:

1. **Auto-detects the ACME client** — tries Mailcow's bundled `acme.sh` first, falls back to `acme-companion`'s `/app/force_renew` (or `certbot` inside the container).
2. **Force-renews** the `mail.laratik.com` cert.
3. **Restarts** `postfix-mailcow` + `nginx-mailcow` so the new cert is picked up immediately (Mailcow's containers only re-read the cert on restart).
4. **Verifies** by re-running `check-smtp-cert.sh` with relaxed thresholds (warn 60 / critical 30) — the script prints `✅ Cert verified` if the new cert is > 60 days out.

If the script reports a renewal failure, the underlying cause is almost always one of:

- **ACME cron paused** (most common): the container's internal cron stopped after a Mailcow update or a manual restart. Fix with `docker restart <acme-container>` and watch `docker logs --tail 200 <acme-container> | grep -i renew` for the next 5 minutes.
- **DNS-01 challenge failure**: the API token (Cloudflare / Hetzner / etc.) inside the ACME container has expired. Re-issue the token and re-run the script.
- **HTTP-01 challenge failure**: port 80 inbound to the VPS is blocked at the firewall. Check the Mailcow UI's `acme.sh` log for the exact reason.

### Local cron (recommended)

Add the following entry to the VPS-side root crontab so you receive an email alert 30/14/7 days before expiry, even if CI is somehow down:

```cron
# Daily SMTP cert-expiry check at 07:30 UTC. Exit 1 = warn (14-30d), exit 2 = critical (<14d).
# Cron only mails the local root user when the command exits non-zero, so this gives you
# exactly the warning tiers you want without extra plumbing.
30 7 * * * /opt/laratik-planner/scripts/vps/check-smtp-cert.sh >/dev/null
```

`cron` on the VPS already delivers root's mail to a reachable address (see the existing `monitoring` block in vps-ops `gitops`). The exit-code-as-severity pattern is the simplest reliable alerting without an external dependency.

## Social analytics (M4)

Read-only, provider-neutral social profile analytics for Meta and TikTok. This section is the operator reference; the architecture decision is in [`docs/decisions/0004-social-profile-analytics.md`](../decisions/0004-social-profile-analytics.md) and the per-task spec is in [`docs/superpowers/plans/2026-08-24-meta-tiktok-social-analytics.md`](../superpowers/plans/2026-08-24-meta-tiktok-social-analytics.md).

### Environment variables (server-only)

| Name                          | Default | Purpose                                                                                                                                                |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | empty   | Base64-encoded 32-byte key for the AES-256-GCM credential envelope. Generate with `openssl rand -base64 32`. Required when `SOCIAL_SYNC_ENABLED=true`. |
| `META_APP_ID`                 | empty   | Facebook App ID. Required for Meta connection to succeed.                                                                                              |
| `META_APP_SECRET`             | empty   | Facebook App secret.                                                                                                                                   |
| `META_LOGIN_CONFIG_ID`        | empty   | Facebook Login for Business configuration ID.                                                                                                          |
| `META_GRAPH_API_VERSION`      | `v25.0` | Pinned Graph API version. Bumping it requires re-applying the migration and re-running App Review.                                                     |
| `TIKTOK_CLIENT_KEY`           | empty   | TikTok app key.                                                                                                                                        |
| `TIKTOK_CLIENT_SECRET`        | empty   | TikTok app secret.                                                                                                                                     |
| `SOCIAL_SYNC_ENABLED`         | `false` | Master switch for the cron worker. When `false`, `/api/cron/social-metrics` is a no-op.                                                                |
| `SOCIAL_TIKTOK_ENABLED`       | `false` | Per-provider gate. When `false`, the TikTok provider and callback routes return 404 / disabled.                                                        |

None of these may be exposed as `NEXT_PUBLIC_*`. The application refuses to boot in production when `SOCIAL_SYNC_ENABLED=true` but the encryption key is missing or not exactly 32 bytes when decoded.

### Rollout (staged)

The M4 release ships in five rollout states, each a real production configuration. Do not skip states. The transition between states is a one-line env change followed by a `docker compose up -d --no-deps app`; no migration is needed between states because every state uses the same schema.

| State | `SOCIAL_SYNC_ENABLED` | `SOCIAL_TIKTOK_ENABLED` | What is reachable                                                                                          |
| ----- | --------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| 0     | `false`               | `false`                 | Code is deployed, cron is a no-op. Picker hidden.                                                          |
| 1     | `false`               | `false`                 | Same as 0; Meta App Review is submitted in parallel.                                                       |
| 2     | `true`                | `false`                 | Cron runs every 15 min; only the internal LaraTik workspace has connected profiles.                        |
| 3     | `true`                | `false`                 | Meta is enabled for all workspaces. Seven consecutive clean daily snapshots are observed before this flip. |
| 4     | `true`                | `true`                  | TikTok is enabled after the TikTok provider approval + focused UAT pass.                                   |

### Cron verification

The VPS-side cron calls the route every 15 minutes via `scripts/vps/social-metrics-sync.sh`. The script reads `CRON_SECRET` from `/opt/laratik-planner/.env`, calls `http://127.0.0.1:3100/api/cron/social-metrics` with a 60-second timeout, and never echoes the secret. To verify the chain end-to-end:

```bash
# On the VPS:
ssh laratik-vps
sudo systemctl status cron
grep social-metrics /etc/cron.d/laratik-planner   # confirm the */15 entry exists
sudo CRON_SECRET=$(sudo cat /opt/laratik-planner/.env | grep ^CRON_SECRET= | cut -d= -f2-) \
  /opt/laratik-planner/scripts/vps/social-metrics-sync.sh   # one-off manual run; prints the JSON
```

The expected response shape is `{ "claimed": <int>, "succeeded": <int>, "failed": <int>, "needsReauth": <int> }`. A non-JSON response or an HTTP non-2xx indicates the secret rotated, the route is down, or `SOCIAL_SYNC_ENABLED` is `false`.

### Cron routes and the proxy bypass list

All `/api/cron/*` routes authenticate via `Authorization: Bearer $CRON_SECRET`, not the NextAuth session cookie. The proxy (`src/proxy.ts`) MUST let these requests through without redirecting to `/signin` — otherwise the VPS-side cron gets a `307 → /signin` and the route handler's Bearer check is never reached.

**Symptom of the bypass being missing:** the social-metrics cron appears to run silently — `/var/log/laratik-planner-social-sync.log` shows `[social-metrics] unexpected 307 from http://127.0.0.1:3100/api/cron/social-metrics: /signin?callbackUrl=...` on every tick, channels' `last_synced_at` stops moving, no `last_sync_error_code` is set, and the analytics UI shows "Last synced 19h ago" (or similar) with no error banner.

**Where it's locked down:** `tests/unit/proxy-bypass.test.ts` enumerates every public path and asserts `status === 200, location === null`. If a future refactor drops `/api/cron/*` from the bypass list, that test fails before the bug reaches prod.

**Adding a new cron route:** add the path to `PUBLIC_PATHS` in `tests/unit/proxy-bypass.test.ts` in the same PR, and confirm the route handler still gates on `Authorization: Bearer $CRON_SECRET` (timing-safe compare — see `safeEqual` in any existing `/api/cron/*/route.ts`).

### Onboarding a new social profile (Meta, post-M4.6)

The Meta app config is **per-agency**, not platform-wide. Each agency that wants to use social analytics must add their own Meta app credentials at `/app/agency-settings/social/providers`. The agency admin pastes `app_id` + `app_secret` + `login_config_id`; the app secret is sealed with the per-agency DEK (the same key that protects the OAuth tokens) and re-fetched only when the cron or a Re-test needs it. After that, every workspace in the agency can run the OAuth flow.

**Onboarding one workspace, step by step:**

1. **Verify the agency config exists.** As an agency admin, open `/app/agency-settings/social/providers`. The Meta card should show "Configured" with the last-tested timestamp. If it says "Add", paste the app credentials first.
2. **Open the workspace's channels page.** As a workspace manager, navigate to `/app/w/<slug>/channels`. The "Connect a Meta account" card has a **Connect Meta** button (enabled when the agency config exists).
3. **Click Connect Meta.** The button POSTs to `/api/social/meta/connect` which redirects to the Facebook Login for Business dialog (`https://www.facebook.com/v25.0/dialog/oauth`). The OAuth flow requests only the read-only scopes: `pages_show_list`, `pages_read_engagement`, `read_insights`, `instagram_basic`, `instagram_manage_insights`. No publish / manage / ads scope is ever requested.
4. **Pick the right Pages + linked Instagram accounts in the picker.** ⚠️ The actor's Meta account may have admin access to **many** Pages. The picker surfaces every Page the actor can admin that holds `PROFILE_PLUS_ANALYZE` (or a full-control task like `MANAGE`/`CREATE_CONTENT`). For a multi-brand agency this is often 20-30+ Pages; pick only the ones that belong to the workspace's brand. The Picker filters out Pages with only `ADVERTISE` because they cannot back a read-only analytics connection.
5. **Finalize the selection.** Each selected Page becomes a `social_channel` row (`platform='facebook'`). If the Page has a linked Instagram business account, an additional `social_channel` row is created with `platform='instagram'` and `parent_provider_account_id` set to the Page ID. The Page access token is sealed and stored on the `social_connection` row.
6. **Wait for the first sync.** The next cron tick (within 15 minutes) claims the profile with a 5-minute lease, calls `fetchSnapshot`, and writes the first `social_profile_daily_metric` row. The first daily snapshot lands within 24 hours.
7. **Check the analytics page.** Within 24 hours, `/app/w/<slug>/analytics/social` shows the new channel with at least one row in the 7-day window. After 7 days, the 7-day window has 7 data points per channel. The cron never backfills historical data — the system starts from "today" of first connect. Meta retains 90 days of IG insights and 2 years of FB page insights, so a separate backfill task is possible but is not implemented.

**Brand mapping cheatsheet (2026-08-27 reference):**

The Meta app for this LaraTik instance connects to many brands. When onboarding, match the workspace to the right Facebook Page(s):

- **Just Halal workspace:** The user manages **3 Pages** under the Just Halal brand:
  - `Just Halal` (Page id `1197710403425500`, 56 fans) — main Page, **no linked Instagram**.
  - `Just Halal tr` (Page id `782569201613932`, 29 fans) — linked IG `@justhalal_tr` (id `17841471791695605`).
  - `Just Halal ar` (Page id `832243506634467`, 31 fans) — linked IG `@justhalal_ar` (id `17841471675852280`).
  - The Just Halal Instagram business account the user shared (`https://www.instagram.com/justhalal_tr/`) maps to the `Just Halal tr` Page. Connect `Just Halal tr` + its linked IG to the Just Halal workspace. Optionally also `Just Halal ar`. The main `Just Halal` Page can be connected too, but its analytics will be Facebook-only (no IG to back it with insights; reach/views/engaged/interactions will be `null` for it).
- **Food Game workspace:** Connect `Food Game` (Page id `939269935939946`, 69 fans) + its linked IG `@__foodgame` (id `17841480087235357`, 248 followers). The Food Game IG connection is presumed already set up (the existing `social_connection` row on the workspace).

**Note on URL vs. Page ID:** the `profile.php?id=…` URLs the user shares map to the Page's canonical ID via a redirect. For example, `profile.php?id=61582202499500` is the same Page as canonical id `1197710403425500`. Either ID is accepted by the Graph API but the canonical form is the 15-digit one in the `me/accounts` listing.

**Security reminder:** the user pasted a long-lived Meta user access token in chat during planning. That token is now considered **compromised** (it has been exposed in HTTP request URLs during verification, which means it appears in server logs at the Meta edge). Before any code is merged, the user must revoke it via `DELETE /{app-id}/me/permissions?access_token=…` in the Graph API Explorer, or rotate it via the Meta App Dashboard. The application never stores or echoes the token; the OAuth flow at `connect` time re-issues a fresh long-lived token with the app's `fb_exchange_token` grant.

### Forced one-profile sync

Use the channel's `Sync now` button on `/app/w/[slug]/channels` to set `next_sync_at=now()` for a single profile. The actual provider call still happens inside the cron route; the worker is the only path that talks to Meta / TikTok. To bypass the queue entirely (e.g. when the cron is paused), do not call the provider directly — instead flip `SOCIAL_SYNC_ENABLED=true`, wait one cron tick, then disable again.

### Reconnect diagnosis

When a channel shows `Needs reconnect` (`connection_status='needs_reauth'`), the cause is one of:

- **Refresh token expired** (TikTok's 365-day lifetime, Meta's `fb_exchange_token` 60-day lifetime when the app is not verified for long-lived tokens).
- **Meta Advanced Access revoked** for a previously-granted scope. The user must re-authorize through Facebook Login for Business with the original scopes.
- **Provider app secret rotated** (TikTok specifically: the 365-day refresh token is bound to the original app secret; rotation invalidates every active connection).

The UI shows a `Reconnect` button that re-runs the OAuth start flow. The application reseals the new envelope inside the same transaction that marks the old `social_connection` row `revoked_at = now()`, then creates a new active connection. Daily metrics are preserved.

### Rate-limit response

The provider HTTP client retries `429` and `5xx` up to twice with full-jitter delay (cap 4 s). After exhaustion it surfaces `SocialProviderError('rate_limited', retryable=false)`; the sync worker bumps `sync_failure_count` and applies a backoff schedule of 15 min → 1 h → 6 h → next daily slot. After three consecutive auth/permission failures, the connection is marked `needs_reauth` and the channel stops being called until the user reconnects. The rate-limit response never crashes the worker; one profile's failure does not abort the rest of the batch.

### Revoked-app handling

If Meta or TikTok revokes the application entirely (the `META_APP_ID` or `TIKTOK_CLIENT_KEY` is disabled), every call returns `4xx auth_expired`. The repository marks every attached connection `revoked` and every channel `disconnected`. Historical metrics are preserved. Recovery is a full re-authorization through the OAuth flow after the provider-side reactivation.

### Platform KEK rotation (M4.5)

`SOCIAL_TOKEN_ENCRYPTION_KEY` is the platform **Key Encryption Key (KEK)** that wraps each agency's **Data Encryption Key (DEK)** in `agency_social_dek`. Per-agency tokens are sealed with the agency DEK, NOT the platform KEK — so rotating the KEK only re-wraps the DEK envelopes, not the per-connection envelopes. The application boots fine without the KEK; it is only required when an agency enables social or when the cron worker runs. To rotate:

1. **Generate the new KEK** on the VPS:
   ```bash
   NEW_KEK=$(openssl rand -base64 32)
   ```
2. **Re-wrap every `agency_social_dek` row** from the old KEK to the new KEK. The script is `scripts/rotate-social-kek.ts` (run inside the application container because it talks to Postgres):
   ```bash
   cd /opt/laratik-planner
   sudo docker compose exec -T app \
     pnpm tsx scripts/rotate-social-kek.ts \
       --old-kek "$(grep ^SOCIAL_TOKEN_ENCRYPTION_KEY= .env | cut -d= -f2-)" \
       --new-kek "$NEW_KEK"
   ```
   The script prints KEK fingerprints (sha256, last 4 bytes hex) for the audit log. It exits 0 on success, 1 on operator error, 2 on partial failure (one or more rows could not be unwrapped with the supplied old KEK).
3. **Dry-run first** to verify scope:
   ```bash
   sudo docker compose exec -T app \
     pnpm tsx scripts/rotate-social-kek.ts \
       --old-kek "$OLD" --new-kek "$NEW" --dry-run
   ```
   The dry-run prints `scanned N agency_social_dek rows; ok=N, failed=0` and writes nothing.
4. **Update the env var** and restart:
   ```bash
   sudo -e /opt/laratik-planner/.env  # paste the new KEK into SOCIAL_TOKEN_ENCRYPTION_KEY
   sudo docker compose up -d --no-deps app
   ```
5. **Verify** the next sync tick reports `kekStatus: "ok"`:
   ```bash
   curl -sH "Authorization: Bearer $CRON_SECRET" \
     https://planner.laratik.com/api/cron/social-metrics
   ```
   The response includes a `kekStatus: "ok" | "kek_missing" | null` field. `"ok"` confirms the rotation took effect.

**Do NOT rotate the KEK without running the script.** Without the script, every agency's wrapped DEK stays bound to the old KEK. The application then fails to unwrap any DEK on first read, which surfaces as `dek_unwrap_failed` 500s on every social operation. Recovery in that state is the same script — re-run with the old KEK as `--old-kek` and the new KEK as `--new-kek`.

**What the script does NOT do:** it does not rotate agency DEKs. Agency DEK rotation is an in-app action triggered by an agency admin from `/app/agency-settings/social` (Rotate DEK button). The script only re-binds the DEK envelopes to a new platform KEK.

**Audit trail:** every KEK rotation run writes a summary line to the operator's shell; the script itself does NOT write to the audit log (it is operator-only, not a user action). Record the rotation in the change-management log with the timestamp, the old / new KEK fingerprints, and the script's exit code.

### Historical metric export / delete

The retention window is 25 months; the cron worker deletes `social_profile_daily_metric` rows older than that at the end of each run. A workspace can request an export before deletion through the agency admin's data-export endpoint (existing M2 surface). To force-delete a single channel's history ahead of the retention window:

```sql
-- Replace :channel_id with the actual uuid.
DELETE FROM social_profile_daily_metric WHERE social_channel_id = ':channel_id';
DELETE FROM social_channel WHERE id = ':channel_id';
```

The first statement preserves the channel row but drops its metric history; the second statement drops the channel entirely. Both statements are logged in the platform audit log (M3 surface).

## Notification outbox

The notification bell is driven by an **outbox + dispatcher** pattern: domain code (`comments.create`, `assignments.assign`, etc.) writes a row to `outbox_events` and returns; a dispatcher worker claims unprocessed rows and fans out the actual in-app notifications (and, in a Goal 13+ follow-up, emails). The dispatcher must run on a cron, otherwise the bell counter is decorative — every comment / assignment / mention is queued but never delivered.

### Route + cron

The dispatcher is exposed at `GET|POST /api/cron/outbox`. The route is gated by the same `CRON_SECRET` `Authorization: Bearer <secret>` header as `/api/cron/social-metrics` and calls `dispatchOutboxOnce({ maxEvents: 50 })`. The VPS-side cron invokes it every minute via `scripts/vps/outbox-dispatch.sh`; the script sources `CRON_SECRET` from `/opt/laratik-planner/.env`, POSTs to `http://127.0.0.1:3100/api/cron/outbox` with a 60-second timeout, and never echoes the secret.

The entry is added by `scripts/vps/install-cron.sh` alongside the existing backup / cert-probe / social-sync entries. Re-running the installer is idempotent: the cron file at `/etc/cron.d/laratik-planner` is rewritten only when the body actually changes.

```bash
# On the VPS, after the first install:
grep outbox /etc/cron.d/laratik-planner       # confirm the * * * * * entry exists
sudo /opt/laratik-planner/scripts/vps/outbox-dispatch.sh   # one-off manual run
```

The expected response shape is `{ "ok": true, "processed": <int>, "durationMs": <int> }`. A non-JSON response or an HTTP non-2xx indicates the secret rotated, the route is down, or the dispatcher threw. The dispatcher writes per-event failures to `outbox_events.last_error` and bumps `attempt_count` so a stuck event is observable without spamming the cron mail.

### Why a 1-minute cadence (not 5 or 15)

The bell counter is the user's primary signal that something needs their attention. Five minutes of latency on a `comment_created` mention would feel broken on a chatty day. The route is cheap — at most 50 single-row transactions per tick, no external calls in v1 — so the cost of a 1-minute cadence is negligible against the cost of "the bell doesn't update for 5 minutes". The integration test `tests/integration/discussions.test.ts` exercises the same `dispatchOutboxOnce` entry point directly, so the worker code is covered without depending on the cron.

## Repository protection (GitHub Settings)

The deploy chain is gated in two places: the `ci.yml` workflow (which is code) and the GitHub repository's protection rules (which are configured in the GH UI, not in code). This section is the canonical reference so a new maintainer can reproduce the production posture from a fresh checkout + the runbook.

| Surface                  | Setting                                                               | Where                                      |
| ------------------------ | --------------------------------------------------------------------- | ------------------------------------------ |
| `main` branch            | Require CI green (`.github/workflows/ci.yml`) before merge            | Branch protection rules                    |
| `main` branch            | Require 1 review from `@LaraTik/laratik-planner-maintainers`          | Branch protection rules                    |
| `main` branch            | Require linear history (no merge commits)                             | Branch protection rules                    |
| `main` branch            | No force-push                                                         | Branch protection rules                    |
| `main` branch            | No branch deletion                                                    | Branch protection rules                    |
| `main` branch            | Require CODEOWNERS review on touched paths (via `.github/CODEOWNERS`) | Branch protection rules                    |
| `production` environment | Require 1 approval from `@LaraTik/laratik-planner-maintainers`        | Environments → production                  |
| `production` environment | No wait timer (deploys are time-bounded; the CI gate is the wait)     | Environments → production                  |
| `production` environment | Restrict to `main` branch only                                        | Environments → production                  |
| Repository secrets       | `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `GHCR_PAT`, `GHCR_USER`        | Settings → Secrets and variables → Actions |
| Secret rotation          | GHCR PAT, VPS SSH key: every 90 days (see `OPS-001` evidence)         | Calendar reminder                          |
| Workflow file            | Top-level `permissions: contents: read` (default deny)                | All 3 workflows                            |
| `deploy.yml` job         | `permissions: contents: read, packages: read`                         | `deploy.yml` deploy job                    |
| `lint-meta` job          | Required for deploy (errors fail the gate)                            | `ci.yml` lint-meta job                     |

These rules are set in the GH web UI; the in-repo artifacts (`CODEOWNERS`, `dependabot.yml`, `zizmor.yml`, top-level `permissions:` blocks) only enforce what they can. The branch-protection + environment-protection + secret-rotation rules must be configured manually on a fresh repo.

### Code-side enforcement already in place

- **Default-deny `permissions:` blocks** at the top of every workflow (`contents: read`). Each job opts in to the scopes it needs.
- **`persist-credentials: false`** on every `actions/checkout@v4` — keeps the GITHUB_TOKEN out of `.git/config` so a subsequent `git fetch` can't exfiltrate it.
- **Env-var forwarding of secrets** in `deploy.yml` (no inline `${{ secrets.* }}` expansion into the SSH `script: |`). The `DEPLOY_SHA` is also forwarded via `env:` for the same reason.
- **`actionlint` + `zizmor` + `hadolint` + `shellcheck`** linters in the `lint-meta` job. Configured via `zizmor.yml` (accepted findings documented inline) and a `hadolint` warning threshold.
- **Dependabot** for npm + GitHub Actions. Weekly cadence, grouped minor/patch bumps.
- **CODEOWNERS** for review routing. The maintainer team gets auto-requested on every PR via the `*` rule; narrower rules request specific owners for the deploy chain, auth, and DB migrations.
