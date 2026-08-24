# Environment variables

> Reference only — no values, only names. The real values live in `.env` (gitignored) on local + VPS.

## Client-side (`NEXT_PUBLIC_*`)

Exposed to the browser. **Never** put a secret here.

| Name                     | Required | Default                 | Purpose                                        |
| ------------------------ | -------- | ----------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_APP_URL`    | yes      | `http://localhost:3000` | Used for OAuth callbacks, email links, OG tags |
| `NEXT_PUBLIC_SENTRY_DSN` | no       | empty                   | Sentry browser DSN (Goal 13)                   |

## Server-side

### Runtime

| Name          | Required | Default       | Purpose                                                                |
| ------------- | -------- | ------------- | ---------------------------------------------------------------------- |
| `NODE_ENV`    | no       | `development` | Set to `production` on VPS                                             |
| `APP_VERSION` | injected | `dev`         | Exact Git SHA baked into CI-built images; never set manually in `.env` |
| `PORT`        | no       | `3000`        | Container port (matches Dockerfile EXPOSE)                             |
| `HOSTNAME`    | no       | `0.0.0.0`     | Bind address (set in Dockerfile)                                       |

### Database

| Name                | Required (prod) | Default | Purpose                                                                                                |
| ------------------- | --------------- | ------- | ------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`      | yes (prod)      | —       | `postgresql://<user>:<pass>@<host>:<port>/<db>`. On VPS, host is `postgres` (the sidecar service name) |
| `POSTGRES_USER`     | yes             | —       | Postgres role (used by `docker-compose.yml` to bootstrap the DB)                                       |
| `POSTGRES_PASSWORD` | yes             | —       | Postgres password (used by `docker-compose.yml`)                                                       |
| `POSTGRES_DB`       | yes             | —       | Postgres database name                                                                                 |

### NextAuth v5

| Name              | Required (prod) | Default                 | Purpose                                                              |
| ----------------- | --------------- | ----------------------- | -------------------------------------------------------------------- |
| `AUTH_SECRET`     | yes (prod)      | —                       | 32+ char random secret. Generate with `openssl rand -base64 32`      |
| `AUTH_URL`        | no              | `http://localhost:3000` | Canonical app URL. Set to `https://planner.laratik.com` in prod      |
| `AUTH_TRUST_HOST` | yes (prod)      | `false`                 | Required when behind a reverse proxy (Traefik). Set to `true` on VPS |

### Google OAuth

| Name                   | Required | Purpose                                                   |
| ---------------------- | -------- | --------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | yes      | From Google Cloud Console → APIs & Services → Credentials |
| `GOOGLE_CLIENT_SECRET` | yes      | Same                                                      |

**Redirect URI** (configure in Google Cloud Console): `https://planner.laratik.com/api/auth/callback/google`

### Mailcow SMTP

| Name            | Required | Default            | Purpose                                                 |
| --------------- | -------- | ------------------ | ------------------------------------------------------- |
| `SMTP_HOST`     | yes      | `mail.laratik.com` | Mailcow hostname                                        |
| `SMTP_PORT`     | no       | `587`              | 587 for STARTTLS, 465 for TLS                           |
| `SMTP_USER`     | yes      | —                  | Full email address, e.g. `no-reply@planner.laratik.com` |
| `SMTP_PASSWORD` | yes      | —                  | Mailbox password                                        |
| `SMTP_FROM`     | yes      | —                  | `"laratik-planner <no-reply@planner.laratik.com>"`      |

The mailbox must exist in Mailcow before the first deploy (`https://mail.laratik.com/` → Mailboxes → Add).

### MiniMax AI (Goal 11)

| Name                 | Required | Default                            | Purpose                                                                                               |
| -------------------- | -------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `MINIMAX_API_KEY`    | no       | empty                              | Server-only. Leave empty to disable AI features                                                       |
| `MINIMAX_BASE_URL`   | no       | `https://api.minimax.io/anthropic` | Anthropic-compat endpoint                                                                             |
| `MINIMAX_MODEL`      | no       | `MiniMax-M3`                       | Model name                                                                                            |
| `AI_FEATURE_ENABLED` | no       | `false`                            | Hard kill-switch. When `false`, the AI settings page shows "Disabled" and all AI endpoints return 503 |

### Sentry (Goal 13)

| Name                     | Required | Purpose                              |
| ------------------------ | -------- | ------------------------------------ |
| `SENTRY_DSN`             | no       | Server-side DSN                      |
| `NEXT_PUBLIC_SENTRY_DSN` | no       | Browser DSN (must be the public DSN) |
| `SENTRY_AUTH_TOKEN`      | no       | CI token for source-map upload       |

### Cron + bootstrap

| Name                    | Required           | Purpose                                                                                                |
| ----------------------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| `CRON_SECRET`           | yes (prod, Goal 8) | Shared secret for `/api/cron/*` endpoints hit by VPS `cron.d`                                          |
| `BOOTSTRAP_SETUP_TOKEN` | yes (Goal 2)       | One-time token for the first administrator. Becomes operationally irrelevant after bootstrap is locked |

## Where each env var lives

| Environment | File                                                      | How to update                                                                                                                    |
| ----------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Local dev   | `.env` (in repo root, gitignored)                         | Edit + `docker compose -f docker-compose.dev.yml restart postgres` if Postgres vars change                                       |
| Local E2E   | `.env.test` or in CI env block                            | `playwright.config.ts` reads `process.env.PLAYWRIGHT_BASE_URL`                                                                   |
| CI          | `.github/workflows/ci.yml` env block + repository secrets | Edit the workflow file or `gh secret set`                                                                                        |
| VPS prod    | `/opt/laratik-planner/.env` (chmod 600)                   | `ssh laratik-vps 'sudo -e /opt/laratik-planner/.env'`, then `cd /opt/laratik-planner && sudo docker compose up -d --no-deps app` |

## Boot-time validation

`src/lib/validation/env.ts` runs at module load. In production, **all required server vars must be present**, or the process crashes with a structured error. In development, only the schema is validated (vars can be missing for partial dev).

This is deliberate: catching a missing `AUTH_SECRET` at boot is far better than discovering it at the first sign-in.

## M4 — social profile analytics

| Name                          | Required (prod) | Default | Purpose                                                                                                                                  |
| ----------------------------- | --------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | conditional     | empty   | Base64-encoded 32-byte key for the AES-256-GCM credential envelope. Required when `SOCIAL_SYNC_ENABLED=true`. `openssl rand -base64 32`. |
| `META_APP_ID`                 | conditional     | empty   | Facebook App ID. Required for Meta connection to succeed.                                                                                |
| `META_APP_SECRET`             | conditional     | empty   | Facebook App secret. Required for Meta connection.                                                                                       |
| `META_LOGIN_CONFIG_ID`        | conditional     | empty   | Facebook Login for Business configuration ID.                                                                                            |
| `META_GRAPH_API_VERSION`      | no              | `v25.0` | Pinned Graph API version. Changing it requires re-applying the migration and re-running the App Review.                                  |
| `TIKTOK_CLIENT_KEY`           | conditional     | empty   | TikTok app key. Required for TikTok connection.                                                                                          |
| `TIKTOK_CLIENT_SECRET`        | conditional     | empty   | TikTok app secret. Required for TikTok connection.                                                                                       |
| `SOCIAL_SYNC_ENABLED`         | no              | `false` | Master switch for the cron worker. When `false`, `/api/cron/social-metrics` is a no-op.                                                  |
| `SOCIAL_TIKTOK_ENABLED`       | no              | `false` | Per-provider gate. When `false`, the TikTok provider and callback routes return 404 / disabled.                                          |

None of these may be exposed as `NEXT_PUBLIC_*`. The application refuses to boot in production when `SOCIAL_SYNC_ENABLED=true` but the encryption key is missing or not exactly 32 bytes when decoded.
