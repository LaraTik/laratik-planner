# Operations runbook

> Day-2 operations for `laratik-planner` on `laratik-vps`. Mirrors the vps-ops pattern (`mavis-trader`, `laratik-social-platform`).

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
10. Install the backup cron (see below).
11. Set up Google OAuth: in Google Cloud Console, add `https://planner.laratik.com/api/auth/callback/google` as an authorized redirect URI, then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env` and `docker compose up -d app`.
12. Set up Mailcow mailbox `no-reply@planner.laratik.com` (Mailcow admin → Mailboxes → Add), then set `SMTP_PASSWORD` in `.env` and `docker compose up -d app`.
13. First sign-in: visit `https://planner.laratik.com/signin`, sign in with Google, then go to `/setup` and enter the agency name + slug + `BOOTSTRAP_SETUP_TOKEN`.

## Deploying a new version

The container is built **on the VPS** (the GHCR pull pattern in the deploy
script is a future option — the current image uses `pull_policy: never`
and is built locally with the multi-stage Dockerfile). The deploy flow
is therefore:

From your **local** machine:

```bash
# 1. Push to main (triggers CI: lint + typecheck + unit + e2e + build)
git push origin main

# 2. SSH to the VPS, pull + rebuild + restart
ssh laratik-vps
sudo bash -c '
  cd /opt/laratik-planner
  git pull origin main
  docker build -t laratik-planner:latest .
  docker compose -f docker-compose.yml up -d app
'
# 3. Smoke test
curl -sS https://planner.laratik.com/api/health
# Expected: {"ok":true,"db":"up","env":"production",...}
```

The local build can be slow (~3 min for the multi-stage Node 20-alpine
build on a 2-vCPU VM); the smoke test should pass within 30s of the
`up -d` finishing. If `pnpm` is missing on the VPS (fresh install),
one-shot: `corepack enable && corepack prepare pnpm@10.10.0 --activate`.

### Deploy verification checklist (post-deploy)

- [ ] `https://planner.laratik.com/` returns 200 with the new home-page `<title>`.
- [ ] `https://planner.laratik.com/api/health` returns `{"ok":true,"db":"up","env":"production",...}`.
- [ ] `https://planner.laratik.com/signin` returns 200 (renders the sign-in form).
- [ ] `https://planner.laratik.com/app` redirects (307) to `/signin?callbackUrl=%2Fapp`.
- [ ] `docker ps` shows `laratik-planner-app-1` as `(healthy)`.
- [ ] No new errors in `docker logs laratik-planner-app-1 --tail 200`.

### Rollback

The image tag is fixed (`laratik-planner:latest`) and rebuilt on every
deploy, so a rollback is: revert the commit in this repo, push, then
re-run the deploy flow. The Postgres schema is forward-only — Drizzle
migrations are append-only, so a rollback to an older commit is safe
as long as the older commit's migration set has already been applied
to the DB.

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

| What                   | Where                         | How                                                                                                           |
| ---------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`          | `.env` on VPS                 | `openssl rand -base64 32`, update, `docker compose up -d --no-deps app`. Active sessions are invalidated.     |
| `GOOGLE_CLIENT_SECRET` | Google Cloud Console + `.env` | Same as above.                                                                                                |
| `SMTP_PASSWORD`        | Mailcow admin                 | Same as above.                                                                                                |
| Image                  | GHCR                          | Automatic on `main` push. Old tags pruned via `docker image prune` (see disk hygiene below).                  |
| LE cert                | Traefik (vps-ops)             | Auto-renewed by Traefik; check with `ssh laratik-vps 'sudo bash /root/gitops/scripts/ops/check-certs.sh 30'`. |

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

40 Playwright tests live in `tests/e2e/` and run against a real Next.js dev server + Postgres. They cover every URL the master prompt defines (public landing, sign-in, sign-in/verify, the entire `/app/*` auth-gate, the workspace shell, the content-flow state machine) and the WCAG 2.2 AA accessibility contract via axe-core.

### What's covered

| Spec                             | Tests | What it covers                                                                                 |
| -------------------------------- | ----- | ---------------------------------------------------------------------------------------------- |
| `tests/e2e/public.spec.ts`       | 11    | `/`, `/signin`, `/signin/verify`, `/api/health`, `/api/bootstrap/status`, `/api/dev/*`         |
| `tests/e2e/auth-gate.spec.ts`    | 14    | 10 protected `/app/*` → 307 `/signin?callbackUrl=`, signed-in bypass, public-while-authed      |
| `tests/e2e/workspace.spec.ts`    | 5     | Seeded workspace nav, create-workspace form, invalid-slug rejection, non-member experience     |
| `tests/e2e/content-flow.spec.ts` | 4     | Quick Create, planning list, draft → content_review → approved_for_design, channel auto-select |
| `tests/e2e/a11y.spec.ts`         | 4     | axe-core WCAG 2.2 AA on `/`, `/signin`, `/signin/verify`, `/app` redirect                      |
| `tests/e2e/health.spec.ts`       | 2     | `/api/health` JSON shape, secret-leak guard                                                    |

Total: **40 tests, all green in ~5s on a warm server**.

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
pnpm test:a11y  # WCAG 2.2 AA only

# 5. Against a non-default base URL (e.g. the prod container on 3100)
PLAYWRIGHT_BASE_URL=http://localhost:3100 pnpm test:e2e:smoke
```

### Dev-only API helpers

`/api/dev/seed`, `/api/dev/sign-in`, and `/api/dev/sign-out` exist to make E2E tests skip the Google OAuth and Mailcow SMTP flows. They are guarded by `NODE_ENV !== "production"` in two places (the route handler + the proxy allowlist) so production builds return 404.

**They are safe to leave in the codebase** because:

1. The proxy only passes them through in non-prod.
2. The route handler checks `serverEnv.NODE_ENV === "production"` and returns 404.
3. They do not bypass authorization in production — they simply do not exist.
4. They never accept or return secrets; the seed uses the same Drizzle inserts the real bootstrap path uses.

### Running on CI (VPS smoke)

A 30-second smoke against the live container (no real auth needed because the dev endpoints aren't required for the public/auth-gate specs):

```bash
ssh laratik-vps 'cd /opt/laratik-planner && \
  PLAYWRIGHT_BASE_URL=http://localhost:3100 \
  pnpm test:e2e:smoke'
```

### Why this matters

The E2E suite caught three production bugs that the type checker, linter, and unit tests missed:

1. **`user_email_format` CHECK constraint rejected real emails.** Drizzle's SQL emitter serialises `\s` as just `s` in raw `sql` template literals. The regex became `^[^@s]+@[^@s]+...$` and rejected `test@laratik.local`. Fixed in `src/lib/db/schema/identity.ts:47` by switching to the portable `[[:space:]]` POSIX class.
2. **`createWorkspaceAction` silently dropped writes.** The `redirect()` call was inside a `db.transaction()` — the throw from `redirect()` rolled back the entire transaction, so the form returned 200 with a redirect to a non-existent workspace. Fixed in `src/app/(app)/app/workspaces/new/page.tsx:65` by hoisting `redirect()` outside the transaction.
3. **`--fg-muted` failed WCAG AA contrast (3.51:1 on canvas).** Darkened to `#5b6270` (5.71:1) in `src/app/globals.css:25`.

All three were caught the first time the test was run, not in production.

## Troubleshooting

| Symptom                              | First check                                        | Fix                                                                                                                            |
| ------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `502 Bad Gateway` from Traefik       | `docker compose ps` — is the app up?               | `docker compose up -d --no-deps app`                                                                                           |
| `db: down` in `/api/health`          | `docker compose logs postgres`                     | Check `pgdata` volume, `POSTGRES_PASSWORD` in `.env`                                                                           |
| `ok: false` in `/api/health`         | Same as above                                      |                                                                                                                                |
| Health check passes but UI is broken | `docker compose logs --tail=200 app`               | Likely a code issue — pull logs and diagnose                                                                                   |
| Stuck deploy                         | `docker compose ps` + `docker image ls`            | `docker image prune -f`, then `./scripts/deploy.sh` again                                                                      |
| Out of disk                          | `df -h /`                                          | `disk-cleanup.sh apply` (see above)                                                                                            |
| Magic link not arriving              | Mailcow queue: `https://mail.laratik.com/` → Queue | Check `SMTP_USER` + `SMTP_PASSWORD`, then `docker compose logs app                                                             | grep email` |
| Google OAuth fails                   | Google Cloud Console → OAuth client                | Check `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`, redirect URI must be `https://planner.laratik.com/api/auth/callback/google` |
