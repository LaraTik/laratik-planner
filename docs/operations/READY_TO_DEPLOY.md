# READY TO DEPLOY — operator checklist

> Purpose: a one-page runbook for taking the repo from "READY TO DEPLOY" (code-complete, deploy wired, secrets missing) to "first live deploy on `laratik-vps`". This is the OPS-001 closure path.
>
> Two-gate reminder: this checklist closes the **deploy** gate. The **UAT** gate (`docs/production-readiness/UAT_RELEASE.md`) is separate and requires the §23 30-step journey with separated accounts plus the external owner checks.

## What is already wired (no action needed)

- `.github/workflows/ci.yml` — quality + Docker build + smoke health, gates the deploy.
- `.github/workflows/e2e.yml` — Playwright 5-project suite, runs in parallel, does not gate deploy.
- `.github/workflows/deploy.yml` — `workflow_run: workflows: [CI], types: [completed]` + `if: github.event.workflow_run.conclusion == 'success'`; builds `ghcr.io/laratik/laratik-planner:<sha>` and `ghcr.io/laratik/laratik-planner-migrator:<sha>`; pulls previous image; runs `scripts/deploy.sh` via `appleboy/ssh-action` on the VPS.
- `scripts/deploy.sh` — backups the local Postgres (`scripts/vps/backup.sh`), runs the migrator (aborts on failure), recreates the app container pinned to the new SHA, hits `/api/health`, rolls back on any failure.
- `src/app/api/health/route.ts` — reports the real release SHA at container runtime.
- `docs/production-readiness/MIGRATION_DRILL_RESULTS.md` — 4 / 4 migration drills PASS (forward-only, rollback drill deferred).
- `src/lib/validation/env.ts` + `src/lib/validation/provider-configuration.ts` — fail-fast on missing or non-production provider config at container start.

## What you must add (the OPS-001 closure)

Three buckets. Each is an explicit action with a target. **Never paste real values into this file** — record only operator, date, environment and result.

### 1. GitHub repository secrets (the deploy blocker)

`Settings → Secrets and variables → Actions → New repository secret`. These are referenced by `.github/workflows/deploy.yml` via `appleboy/ssh-action@v1` `envs:` and `with:`.

| Secret        | What it is                                                                                | Where to get it                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `VPS_HOST`    | SSH host for the LaraTik VPS                                                              | `217.154.124.83` (or the current VPS host)                                                              |
| `VPS_USER`    | SSH user with passwordless key auth and `docker compose` rights on `/opt/laratik-planner` | Provision a dedicated deploy user; do not reuse the root user                                           |
| `VPS_SSH_KEY` | Private key matching the deploy user's `authorized_keys`                                  | Generate a fresh ed25519 keypair; the public half is added to `~deploy/.ssh/authorized_keys` on the VPS |
| `GHCR_PAT`    | GitHub PAT with `read:packages` (to pull `ghcr.io/laratik/laratik-planner`)               | `Settings → Developer settings → Personal access tokens → Fine-grained tokens` for the deploy bot user  |
| `GHCR_USER`   | GitHub username that owns the PAT                                                         | The same user the PAT was issued to                                                                     |

After adding all five, re-run the most recent failed deploy from the Actions tab — it should now pass the SSH step.

### 2. Production environment variables (VPS side, `docker-compose.yml`)

Edit `/opt/laratik-planner/.env` on the VPS (or use the `laratik_vps_secrets` env file pattern from `mavis-trader` / `laratik-social-platform`). The values below are required; the app fails fast at startup if any are missing or in the wrong shape (`src/lib/validation/env.ts`).

| Variable                     | Purpose                                                   | Source                                                                                   |
| ---------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `DATABASE_URL`               | Postgres 16 connection string for the app                 | Internal Docker network `postgresql://planner:…@laratik-planner-postgres-1:5432/planner` |
| `AUTH_SECRET`                | NextAuth v5 session secret (≥ 32 random bytes, base64)    | `openssl rand -base64 48` — store in Vault, not in shell history                         |
| `AUTH_URL`                   | Canonical app URL                                         | `https://planner.laratik.com`                                                            |
| `NEXTAUTH_URL`               | NextAuth v5 legacy alias                                  | `https://planner.laratik.com`                                                            |
| `GOOGLE_OAUTH_CLIENT_ID`     | Google OAuth client id                                    | Google Cloud Console → APIs & Services → Credentials                                     |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth client secret                                | Same as above                                                                            |
| `SMTP_HOST`                  | Mailcow SMTP                                              | `mail.laratik.com`                                                                       |
| `SMTP_PORT`                  | SMTP port                                                 | `587` (STARTTLS)                                                                         |
| `SMTP_USER`                  | Mailcow mailbox user                                      | `planner@laratik.com` (or the alias the agency uses)                                     |
| `SMTP_PASSWORD`              | Mailcow mailbox password                                  | Mailcow admin → Mailboxes                                                                |
| `SMTP_FROM`                  | `From:` address for transactional email                   | `planner@laratik.com`                                                                    |
| `MINIMAX_API_KEY`            | MiniMax API key                                           | `api.minimax.io` → API keys (only used if `AI_FEATURE_ENABLED=true`)                     |
| `MINIMAX_BASE_URL`           | MiniMax OpenAI-compat base                                | `https://api.minimax.io/v1`                                                              |
| `MINIMAX_MODEL`              | MiniMax model id                                          | `MiniMax-M3`                                                                             |
| `AI_FEATURE_ENABLED`         | Gates the entire AI surface                               | `false` for v1 launch (default); flip to `true` when ready to expose AI                  |
| `SENTRY_DSN`                 | Sentry project DSN                                        | `sentry.io` → Projects → planner-laravel / planner → Client Keys (DSN)                   |
| `SENTRY_AUTH_TOKEN`          | Sentry auth token for source-map upload (build-time only) | `sentry.io` → Settings → Auth Tokens                                                     |
| `SENTRY_ORG`                 | Sentry org slug                                           | `laratik`                                                                                |
| `SENTRY_PROJECT`             | Sentry project slug                                       | `laratik-planner`                                                                        |
| `BOOTSTRAP_SETUP_TOKEN`      | First-administrator setup token                           | `openssl rand -hex 32`; rotate on first setup                                            |
| `LOG_LEVEL`                  | Structured-log level                                      | `info` (prod)                                                                            |
| `NODE_ENV`                   | Next.js mode                                              | `production`                                                                             |

### 3. Offsite backup target

| Variable                                                         | Purpose                               | Source                                                                                                   |
| ---------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `RESTIC_REPO`                                                    | Restic repository URL                 | Provision a restic repo on Backblaze B2 / Wasabi / S3 — the existing `mavis-trader` pattern is the model |
| `RESTIC_PASSWORD`                                                | Restic repo encryption passphrase     | `openssl rand -base64 48` — store in Vault                                                               |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (or B2 equivalent) | Cloud credentials for the restic repo | Backblaze B2 → Application Key, scoped to the restic bucket only                                         |
| `RESTIC_OFFSITE_BUCKET`                                          | Bucket name                           | `laratik-planner-backups`                                                                                |

`scripts/vps/backup.sh` must write both locally (`/opt/laratik-planner/backups/`) and to the restic repo. Schedule via `cron.d` on the VPS:

```
# /etc/cron.d/laratik-planner-backup
15 3 * * * deploy /opt/laratik-planner/scripts/vps/backup.sh >> /var/log/laratik-planner-backup.log 2>&1
```

## First deploy sequence (after OPS-001 is in place)

1. **Confirm the image is in GHCR.** Open `https://github.com/LaraTik/laratik-planner/pkgs/container/laratik-planner` and check that `:latest` and the latest SHA tag are present.
2. **Confirm CI is green on `main`.** Open `https://github.com/LaraTik/laratik-planner/actions` — the most recent `CI` workflow must show a green check.
3. **Re-run the most recent failed `Deploy` workflow** from the Actions tab. The first attempt after secrets land will succeed.
4. **Watch the deploy run logs** for:
   - `backup.sh` exit code 0
   - Migrator exit code 0
   - `curl https://planner.laratik.com/api/health` returning `{ ok: true, version: "<sha>", env: "prod", db: "up" }`
5. **Post-deploy smoke (5 minutes, on the live URL):**
   - `curl -fsS https://planner.laratik.com/api/health` → JSON above
   - `curl -fsS https://planner.laratik.com/` → 200, HTML, no 500 in `docker compose logs app`
   - Open `https://planner.laratik.com/signin` in a browser → renders, Google OAuth button visible
   - Open `https://planner.laratik.com/setup` (first-administrator bootstrap) → token-gated form renders
   - `docker compose -p laratik-planner logs --tail=200 app` → no stack traces
6. **Tag the release** once smoke passes:
   ```bash
   git tag -a v0.1.0 <sha> -m "first production deploy"
   git push origin v0.1.0
   ```
7. **Open the §23 UAT journey** (`docs/production-readiness/UAT_RELEASE.md`). The deploy gate flips to `READY` the moment smoke passes; the UAT gate is the §23 30-step journey with separated accounts and the external owner checks.

## First-deploy rollback

If any post-deploy smoke step fails, the deploy script already rolled back the image. If you need to roll back manually:

```bash
ssh deploy@217.154.124.83
cd /opt/laratik-planner
docker compose -p laratik-planner pull app
# pin to previous SHA in docker-compose.yml `image:` line
docker compose -p laratik-planner up -d --no-deps app
curl -fsS https://planner.laratik.com/api/health
```

If the rollback cause is a schema issue, write a forward-fix migration (never edit an applied migration) and re-deploy.

## Owner-action log

| Action                                   | Operator | Date | Result / ticket |
| ---------------------------------------- | -------- | ---- | --------------- |
| `VPS_SSH_KEY` provisioned                |          |      |                 |
| `GHCR_PAT` + `GHCR_USER` provisioned     |          |      |                 |
| Google OAuth client configured           |          |      |                 |
| Mailcow mailbox provisioned              |          |      |                 |
| MiniMax API key provisioned              |          |      |                 |
| Sentry project + DSN + token provisioned |          |      |                 |
| restic offsite bucket + credentials      |          |      |                 |
| `cron.d` backup job installed            |          |      |                 |
| First production deploy                  |          |      | image tag:      |
| First §23 UAT run with 6 accounts        |          |      |                 |

Never record secret values, real invitation URLs, or production user data in this log.

## Cross-references

- `PRODUCTION_READINESS_TRACKER.md` — OPS-001 row, DEP-001 / DEP-002 rows
- `docs/operations/runbook.md` — daily ops (status, logs, restart, shell, health, migrate, backup)
- `docs/operations/environment.md` — every env var, what it does, where it lives
- `docs/production-readiness/MIGRATION_DEPLOYMENT.md` — migration + deploy evidence and the rollback story
- `docs/production-readiness/UAT_RELEASE.md` — the §23 30-step journey + external owner checks
- `docs/production-readiness/TEST_EVIDENCE.md` — quality gate evidence
- `docs/production-readiness/SECURITY_AUDIT.md` — security findings + closure evidence
