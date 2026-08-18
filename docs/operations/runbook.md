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
4. Generate `AUTH_SECRET`:
   ```bash
   openssl rand -base64 32
   ```
5. Boot the stack:
   ```bash
   sudo docker compose pull
   sudo docker compose up -d
   ```
6. Verify health:
   ```bash
   curl -sS https://planner.laratik.com/api/health | jq
   ```
7. Install the backup cron (see below).

## Deploying a new version

From your **local** machine:

```bash
# 1. Push to main (triggers CI build + push to GHCR)
git push origin main

# 2. Wait for the deploy workflow to finish (Actions tab)
# 3. (Optional) Manual deploy if auto-deploy is paused
./scripts/deploy.sh <sha-or-tag>
```

The deploy script:

1. SSHes to `laratik-vps`.
2. Runs `docker compose pull app` (pulls the new image).
3. Runs `docker compose up -d --no-deps app` (rolling restart of the app only — Postgres is never touched).
4. Runs `docker compose exec -T app pnpm db:migrate` (idempotent; safe on no-op).
5. Hits `/api/health` and exits non-zero if the app is not healthy.

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
