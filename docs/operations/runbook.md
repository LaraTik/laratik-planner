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
# CI: lint, typecheck, unit, integration, coverage, audit, Chromium
#      critical E2E + visual baseline, build, Docker smoke on the
#      head_sha. Full release-gate contract — see
#      docs/testing/strategy.md (Release gates).
# E2E (separate workflow, release-candidate only): full 5-browser
#      functional matrix + visual-chromium on the head_sha. Does NOT
#      gate deploy.
# On green CI: deploy workflow SSHes to the VPS and runs scripts/deploy.sh.
# On red health check: the deploy script rolls back to the previous image automatically.
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

The Playwright suite in `tests/e2e/` runs against a real Next.js dev server + Postgres. The most recent CI run on the `head_sha` reports **144 pass / 10 skip**; current numbers and per-spec evidence are kept in [`../production-readiness/TEST_EVIDENCE.md`](../production-readiness/TEST_EVIDENCE.md). CI invokes `pnpm test:e2e:isolated` on Chromium, Firefox, WebKit, and mobile Chrome. Mobile Safari and per-viewport visual baselines remain under UI-010 (Partial) in the production tracker.

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
```

```bash
# Against a non-default base URL (e.g. the prod container on 3100)
PLAYWRIGHT_BASE_URL=http://localhost:3100 pnpm test:e2e:smoke
```

### CI vs. E2E workflow split

The authoritative deploy-gate workflow is `.github/workflows/ci.yml`
(Task 10). It runs the full release contract in three dependent jobs
(`unit-quality` → `browser-verify` → `build-smoke`), including:

- format, lint, typecheck;
- unit + target coverage (95/90 critical modules, 85/80 application
  services);
- integration + migration;
- `pnpm audit --prod` (zero critical/high production findings);
- Chromium critical E2E + visual baseline (`pnpm test:e2e:critical`);
- production build, Docker image build, and a `/api/health` smoke
  against the built image.

The full Playwright matrix lives in `.github/workflows/e2e.yml` and
runs the 5-browser functional suite (chromium, firefox, webkit,
mobile-chrome, mobile-safari) plus the dedicated `visual-chromium`
project. It is automatic on every PR and push to `main` and is a
**required release-candidate check**, but production deploy waits
**only** for the critical CI subset above. If a release candidate
fails the full E2E workflow, do not promote it to production — fix or
revert on the PR before merge.

### Dev-only API helpers

`/api/dev/seed`, `/api/dev/sign-in`, and `/api/dev/sign-out` exist to make E2E tests skip the Google OAuth and Mailcow SMTP flows. They are guarded by `NODE_ENV !== "production"` in two places (the route handler + the proxy allowlist) so production builds return 404.

**They are safe to leave in the codebase** because:

1. The proxy only passes them through in non-prod.
2. The route handler checks `serverEnv.NODE_ENV === "production"` and returns 404.
3. They do not bypass authorization in production — they simply do not exist.
4. They never accept or return secrets; the seed uses the same Drizzle inserts the real bootstrap path uses.

### Running on CI

Two workflows run browser tests on every push and PR to `main`:

```yaml
# .github/workflows/ci.yml  (deploy-gate)
- run: pnpm test:e2e:critical # chromium + visual-chromium projects only
```

```yaml
# .github/workflows/e2e.yml  (release-candidate)
- run: pnpm test:e2e:isolated # full 5-browser functional matrix
- run: pnpm test:visual # visual-chromium only (if functional matrix green)
```

`test:e2e:critical` covers the deploy-critical subset (Chromium
functional + visual baseline). The full 5-browser matrix and the
dedicated visual run live in the separate `e2e.yml` workflow and
remain required for the release candidate, but do not gate deploy.
See the **CI vs. E2E workflow split** section above and
[`../testing/strategy.md`](../testing/strategy.md) (Release gates)
for the full contract. The deploy workflow only fires after the
critical CI subset is green; it does not re-run e2e against the VPS.

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
