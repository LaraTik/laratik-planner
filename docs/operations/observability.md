# Observability

> Owner-action checklist for the Sentry, Uptime Kuma, and Telegram
> alerting stack on `laratik-planner`. Mirrors the runbook pattern
> from `runbook.md` (SMTP certificate management) — every item has
> the exact command to verify, the URL to point at, and the
> remediation when something is misconfigured.
>
> Tracker reference: `PRODUCTION_READINESS_TRACKER.md` `OBS-001`
> (Partial) and `OPS-001` (Tested, owner-supplied sub-items).

## Status

| Surface             | Status            | Owner action                                                                                                                                | When | Owner | Due         | Result    |
| ------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----- | ----------- | --------- |
| Sentry DSN          | ⏳ owner-supplied | Set `SENTRY_DSN` + `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_AUTH_TOKEN` in `/opt/laratik-planner/.env`, then `docker compose up -d --no-deps app` | Once | Owner | pre-go-live | ☐ Pending |
| Sentry source maps  | ⏳ owner-supplied | `SENTRY_AUTH_TOKEN` is already wired in `next.config.ts`; source maps upload on every build automatically once the token is set             | Once | Owner | pre-go-live | ☐ Pending |
| Sentry alert rules  | ⏳ owner-supplied | Create the 4 rules in the Sentry UI (templates below)                                                                                       | Once | Owner | pre-go-live | ☐ Pending |
| Uptime Kuma monitor | ⏳ owner-supplied | Add `https://planner.laratik.com/api/health` as an HTTP monitor, 60s interval, 3 retries                                                    | Once | Owner | pre-go-live | ☐ Pending |
| Telegram notifier   | ⏳ owner-supplied | Add a Telegram notifier in Uptime Kuma and the vps-ops ops-monitor stack (see vps-ops `gitops`)                                             | Once | Owner | pre-go-live | ☐ Pending |
| Log rotation        | ✅ live           | `docker-compose.yml` already rotates at `10m × 5` per service                                                                               | n/a  | n/a   | n/a         | ✅ Live   |
| Health snap (daily) | ✅ live           | `ssh laratik-vps 'sudo bash /root/gitops/scripts/health-snap.sh'` runs in the vps-ops `gitops` cron                                         | n/a  | n/a   | n/a         | ✅ Live   |

> **Closed-loop reminder (per OBS-001):** the four `⏳ owner-supplied` rows above block flipping OBS-001 from `Partial` to `Tested`. The `Due` and `Result` columns make the contract visible at a glance. Each row's surface has a runtime alert (see "Closed-loop alerts" below) — when that alert fires before the row is closed, the missing integration is observable without waiting for a manual audit.

## Sentry

### What the app already wires (M1, M3a)

- `instrumentation.ts` + `instrumentation-client.ts` register the Sentry SDK for server + client.
- `sentry.server.config.ts` + `sentry.edge.config.ts` register the runtime.
- `next.config.ts` is wrapped with `withSentryConfig`; source maps are deleted after upload, debug logging is treeshaken.
- `lib/observability/logger.ts` is the structured logger with recursive secret/private-data scrubbing (used in `instrumentation.ts` for request correlation).

### What the owner must supply

Three env vars in `/opt/laratik-planner/.env`:

```bash
# Sentry DSN — the ingest URL the SDK reports errors to.
# Get from: Sentry → Settings → Projects → laratik-planner → Client Keys (DSN)
SENTRY_DSN=

# Public DSN for client-side errors. Same value as SENTRY_DSN for server-side
# projects; the NEXT_PUBLIC_ prefix exposes it to the browser bundle.
NEXT_PUBLIC_SENTRY_DSN=

# Auth token for source-map upload. Sentry → Settings → Auth Tokens →
# create a token with `project:releases` + `project:debug-files` scopes.
SENTRY_AUTH_TOKEN=
```

After updating `.env`, restart the app so the new env_file is read:

```bash
ssh laratik-vps 'cd /opt/laratik-planner && sudo docker compose up -d --no-deps app'
```

### Verify

```bash
# 1. Confirm the SDK booted. Hit any authenticated route, then look for
#    the request id in the Sentry project. The structured logger writes
#    it to /data/uploads (no — actually to stdout; see docker logs).
ssh laratik-vps 'sudo docker logs laratik-planner-app-1 --tail 200 | grep -i sentry'

# 2. Force a sample error from the browser:
#    visit https://planner.laratik.com/throw-in-a-sentry-test
#    (or just hit any 500-prone endpoint)
# Then check Sentry → Issues for a new event in the last minute.
```

### Alert rules to add in Sentry (UI)

| Name                   | Condition                                                                           | Action           |
| ---------------------- | ----------------------------------------------------------------------------------- | ---------------- |
| `prod-5xx-spike`       | `level:error` AND `environment:production` AND count > 10 in 5m                     | Email + Telegram |
| `deploy-rollback`      | Tag `release` matches a `releases/v*` that has a follow-up `releases/v*` within 30m | Email on-call    |
| `slow-request`         | Transaction duration > 5s AND `environment:production`                              | Email on-call    |
| `release-health-crash` | Release `crashFreeSessions` < 99.5% for 2 consecutive releases                      | Email + page     |

The Sentry UI walks you through each rule. The conditions are deliberately simple — the goal is to catch the failure mode that auto-rollback can't (a green-health, red-sentry release), not to alert on every stack frame.

## Uptime Kuma

`Uptime Kuma` runs in the vps-ops `ops-monitor` stack on `laratik-vps:3001`. Add a single monitor:

| Field                 | Value                                    |
| --------------------- | ---------------------------------------- |
| Type                  | HTTP(s)                                  |
| URL                   | `https://planner.laratik.com/api/health` |
| Method                | GET                                      |
| Interval              | 60s                                      |
| Retries               | 3                                        |
| Accepted status codes | 200                                      |
| Body match            | `{"ok":true` (case-sensitive JSON)       |

The `/api/health` endpoint returns `{"ok":true,"db":"up","schema":"ready",...}` when the app is fully ready (DB up, migrations applied). The body-match string catches a half-ready state — if the body changes to `{"ok":false,...}` Kuma flags the monitor as DOWN even if the HTTP status is 200 (e.g. the readiness probe passes because the JSON shape is right, but the DB is failing).

### Verify

```bash
# Trigger Kuma to check the monitor right now:
# Uptime Kuma UI → Monitors → planner.laratik.com → ⋯ → "Check now"
# Or wait 60s for the next scheduled check.
```

## Telegram notifier

The vps-ops `ops-monitor` stack already includes a Telegram notifier for Kuma and a few ops scripts. Add a second notifier for `laratik-planner` and link it to:

- The Kuma monitor (above).
- The `health-snap.sh` daily cron (it already posts to a Telegram channel via the vps-ops shared notifier — add `laratik-planner` to the channel topic list).

## Log rotation

Already configured in `docker-compose.yml`:

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"
    max-file: "5"
```

This is the per-container setting; the daemon-level `logrotate` rule on `laratik-vps` is configured in the vps-ops `gitops` repo and not duplicated here. Verify on a deployed host:

```bash
ssh laratik-vps 'sudo ls -la /var/lib/docker/containers/*/'
# Each container's log JSON file should be < 10MB, with at most 5 rotations.
```

## What's still owner-supplied (one-time)

The following tracking table replaces the previous empty checkbox list. The columns mirror the `EXTERNAL_SERVICES_UAT.md` row template (`Owner` / `Date` / `Result` / `Evidence link`) so OBS-001 closure can be cross-referenced with the existing UAT evidence. Each row's `Surface` matches a row in the Status table above; the `Result` and `Date` columns close the loop.

| #   | Surface / Item                                                                                                                               | Owner | Due                     | Date       | Result    | Evidence link                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------- | ---------- | --------- | ---------------------------------------------------------------------- |
| 1   | `SENTRY_DSN` in `/opt/laratik-planner/.env` (Sentry → Settings → Projects → Client Keys)                                                     | Owner | pre-go-live             | 2026-**-** | ☐ Pending | (paste Sentry project URL + masked DSN)                                |
| 2   | `NEXT_PUBLIC_SENTRY_DSN` in `/opt/laratik-planner/.env` (same value as `SENTRY_DSN`)                                                         | Owner | pre-go-live             | 2026-**-** | ☐ Pending | (same as #1)                                                           |
| 3   | `SENTRY_AUTH_TOKEN` in `/opt/laratik-planner/.env` (Sentry → Settings → Auth Tokens, with `project:releases` + `project:debug-files` scopes) | Owner | pre-go-live             | 2026-**-** | ☐ Pending | (paste Sentry auth-token creation date)                                |
| 4   | `docker compose up -d --no-deps app` to restart with the new env                                                                             | Owner | immediately after #1–#3 | 2026-**-** | ☐ Pending | (`docker ps` shows the new container; `docker logs` confirms SDK boot) |
| 5   | Sentry alert rule `prod-5xx-spike`                                                                                                           | Owner | pre-go-live             | 2026-**-** | ☐ Pending | (paste Sentry alert rule URL)                                          |
| 5a  | Sentry alert rule `deploy-rollback`                                                                                                          | Owner | pre-go-live             | 2026-**-** | ☐ Pending | (same)                                                                 |
| 5b  | Sentry alert rule `slow-request`                                                                                                             | Owner | pre-go-live             | 2026-**-** | ☐ Pending | (same)                                                                 |
| 5c  | Sentry alert rule `release-health-crash`                                                                                                     | Owner | pre-go-live             | 2026-**-** | ☐ Pending | (same)                                                                 |
| 6   | Uptime Kuma monitor: `https://planner.laratik.com/api/health` with body match `{"ok":true`                                                   | Owner | pre-go-live             | 2026-**-** | ☐ Pending | (paste Kuma monitor status page)                                       |
| 7   | Telegram notifier for Kuma + the health-snap channel                                                                                         | Owner | pre-go-live             | 2026-**-** | ☐ Pending | (paste vps-ops `gitops` notifier config)                               |

When **all** rows above reach `☐ Pending` → `✅ Done` (replace the ☐ with ✅ and fill the Date + Evidence link), flip `OBS-001` in the tracker from `Partial` to `Tested` and capture the Sentry + Kuma screenshots in `docs/production-readiness/`. The Date column is the actual completion date; the Due column is the contract.

## Closed-loop alerts (runtime surfaces that catch a missed item)

The pattern below turns each unchecked row above into a runtime signal — so OBS-001 closure is observable without a manual audit, and a missed item surfaces the same week instead of at the next go-live review.

| #    | Surface (above)          | Runtime alert that surfaces it                                                                                                                                                                                  | Where to look when the alert fires                                                                                    |
| ---- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1–3  | Sentry DSN / auth token  | `prod-5xx-spike` (Sentry alert rule) — errors that should be captured by the SDK are not, so a release with the missing DSN shows a 5xx spike in the vps-ops Telegram channel with **no** matching Sentry event | Sentry → Issues (should be populated) vs. vps-ops Telegram (5xx spike) → if Sentry is empty, the DSN is still missing |
| 4    | App restart with new env | `deploy-rollback` Sentry rule + Uptime Kuma monitor (`/api/health` 60s, body match) — if the app fails to boot after the env swap, the health monitor flips DOWN within 60s                                     | Uptime Kuma → planner.laratik.com monitor                                                                             |
| 5–5c | Sentry alert rules       | `slow-request` and `release-health-crash` are themselves the rules; if the rule list is empty, the vps-ops ops-monitor stack surfaces "no Sentry alert activity" via the daily `health-snap.sh` Telegram post   | Uptime Kuma → planner.laratik.com monitor + vps-ops `health-snap.sh` daily Telegram post                              |
| 6    | Uptime Kuma monitor      | The monitor itself is the closed loop — if the rule is missing, the vps-ops `ops-monitor` stack alerts "Uptime Kuma: 0 monitors for planner.laratik.com" within 24h of the next daily check                     | Uptime Kuma → Dashboard (should show 1 monitor for the planner endpoint)                                              |
| 7    | Telegram notifier        | The first `prod-5xx-spike` Sentry alert or the first Uptime Kuma DOWN should reach a Telegram chat. If no Telegram message is received within 5 minutes of a known event, the notifier is not wired             | vps-ops `gitops` ops-monitor stack notifier config                                                                    |

> The pattern above is the same one that closed the 2026-08-22 SMTP-cert story: the cert-probe job now runs daily and gates deploy, so a missed renewal surfaces within 24h instead of at the next incident review. Apply the same model to OBS-001.
