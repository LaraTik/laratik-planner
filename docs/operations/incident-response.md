# Incident response runbook

> Operational protocol for P0/P1/P2 incidents on the production
> `laratik-planner` deployment (`https://planner.laratik.com`). Use this
> document under stress — keep it short, action-oriented, and loadable on
> a phone.
>
> The canonical worked example is the 2026-08-24 skipped-migration
> incident, recorded in
> [`../production-readiness/MIGRATION_DEPLOYMENT.md`](../production-readiness/MIGRATION_DEPLOYMENT.md)
> § "2026-08-24 incident — skipped migration 0012".

## Scope and on-call model

- **Production system:** the `laratik-planner` app + Postgres + Traefik stack on `laratik-vps` (see [`runbook.md`](./runbook.md) § Locations).
- **Operator today:** the project owner is the solo on-call for v1. There is no 24/7 rota, no paging vendor, and no in-product alerting beyond the Uptime Kuma HTTP monitor for `/api/health` (see [`runbook.md`](./runbook.md) § Monitoring) and the Sentry error stream.
- **Escalation policy:** when the on-call is unreachable for > 30 min during a P0, the on-call notifies a named backup operator in the LaraTik team channel and posts a status note in the project's customer-facing channel. The backup is the platform owner (`security@laratik.com`); the current list of named backups is kept in the LaraTik team vault, not in this repo.

## Severity definitions

| Tier | Definition                                                                                                                                          | Examples                                                                                                                               | First action                                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| P0   | **Customer-facing outage or data loss.** Auth broken, `/api/health` non-200 for > 2 min, data loss, or security incident with active exploitation.  | `db: down` in `/api/health`; auth 500-storm; leaked credentials; skipped migration on prod (see MIGRATION_DEPLOYMENT.md § 2026-08-24). | Page on-call. Open a [SEV] thread. Apply the [Comms](#comms-templates) templates within 5 min.                       |
| P1   | **Major degradation or imminent risk.** A core feature is broken for > 10% of users, or a non-prod-detected defect has a clear prod trigger.        | Posting pipeline stuck for one workspace; one provider OAuth returning 500; cron backlog > 1 h.                                        | Open a [SEV] thread. Triage within 30 min. Restore service or roll back per [`runbook.md`](./runbook.md) § Rollback. |
| P2   | **Minor degradation or latent defect.** A non-critical feature is broken, an alert fires but is auto-mitigated, or a follow-up from a closed P0/P1. | Cosmetic UI bug; flaky Sentry alert; non-blocking backup warning; single-agency support-access edge case.                              | File a follow-up issue. Resolve or schedule within one business day.                                                 |

Severity may be reclassified as the picture clarifies. The initial
assessment is enough — over-paging is better than under-paging at v1.

## First-hour checklist (P0 / P1)

1. **Acknowledge and stop the bleeding** — if a deploy caused this, follow [`runbook.md`](./runbook.md) § Rollback. If a migration caused this, follow [`MIGRATION_DEPLOYMENT.md`](../production-readiness/MIGRATION_DEPLOYMENT.md) § "2026-08-24 incident" for the forward-repair pattern.
2. **Open a [SEV] thread** in the LaraTik team channel (one chat thread per incident — do not split the timeline). Pin the thread.
3. **Start a timeline** in the thread or a shared doc, in UTC. Record every action with a timestamp. The 2026-08-24 incident is the worked example.
4. **Verify scope** — single-agency vs. platform-wide, single-tenant vs. multi-tenant, single-feature vs. system-wide. Use `ssh laratik-vps 'docker compose logs --tail=200 app'` and Sentry's live event stream.
5. **Decide rollback vs. forward fix** — if a deploy caused the issue, rollback (default). If data corruption is suspected, pause and follow the [Data-loss sub-flow](#data-loss-sub-flow).
6. **Post the first customer-facing status note** within 5 min for P0, within 15 min for P1. Use the [status template](#comms-templates) below.
7. **Loop in stakeholders** — for security incidents, page the platform owner (`security@laratik.com`) immediately. For data-loss incidents, also notify the legal contact per the LaraTik escalation tree (kept in the team vault).

## Data-loss sub-flow

If the incident is or may be a data-loss event:

1. **Stop the app** to prevent further writes: `ssh laratik-vps 'cd /opt/laratik-planner && docker compose stop app'`.
2. **Snapshot the live DB before any other action** — even if it conflicts with an in-flight migration:
   ```bash
   ssh laratik-vps 'docker compose exec -T postgres pg_dump -U planner -d planner | gzip > /var/backups/laratik-planner/incident-$(date -u +%Y%m%dT%H%M%SZ).sql.gz'
   sha256sum /var/backups/laratik-planner/incident-*.sql.gz
   ```
3. **Confirm the snapshot parses** before restoring from a previous one. The 14-day local retention is in [`runbook.md`](./runbook.md) § Backup. Offsite restic is **not yet wired** — see [`backup-recovery.md`](./backup-recovery.md).
4. **Record the SHA-256** of the live snapshot and the chosen restore point in the [SEV] thread. The owner cannot agree to a destructive restore without seeing both hashes.
5. **Restore** per [`runbook.md`](./runbook.md) § Restore. Restart the app only after `/api/health` is `{"ok":true,"db":"up"}`.
6. **Engage the postmortem** — the 24 h postmortem requirement below is mandatory for any data-loss P0.

## Comms templates

### Customer-facing status note (P0, first 5 min)

```
[Status] planner.laratik.com — investigating

We are aware of an issue affecting <scope>. The team is on it.
Last update: <UTC timestamp>. Next update within <15 min | 30 min>.
Reference: <SEV-id>.
```

### Customer-facing status note (P1, first 15 min)

```
[Status] planner.laratik.com — degraded

<Feature> is currently degraded. <Scope> users are affected.
Last update: <UTC timestamp>. Next update within <60 min>.
Reference: <SEV-id>.
```

### Resolution note (any tier)

```
[Resolved] planner.laratik.com — restored at <UTC timestamp>

Root cause: <one sentence>.
Resolution: <one sentence>.
Customer impact: <scope, duration>.
Postmortem: <link to 24 h postmortem doc>.
Reference: <SEV-id>.
```

### Internal escalation ping

```
[SEV-<id>] P<0|1|2>: <one-line summary>
Detected: <UTC> via <monitor source>.
Scope: <single agency | all | subset of workspaces>.
On-call: <name>.
Action so far: <rollback | forward fix | investigating>.
```

## 24-hour postmortem

Every P0 and every P1 with customer impact requires a postmortem
delivered within 24 h of resolution. The 2026-08-24 incident's
write-up is in
[`MIGRATION_DEPLOYMENT.md`](../production-readiness/MIGRATION_DEPLOYMENT.md)
§ "2026-08-24 incident" — use it as the template.

The postmortem must contain:

- **Incident summary** — one paragraph, customer-facing tone.
- **Timeline (UTC)** — detection, first action, mitigation, resolution, postmortem start.
- **Root cause** — what, not who. Reference the commit, migration, or external event.
- **Contributing factors** — guard rail that should have caught this; why it didn't.
- **Customer impact** — number of agencies, duration, data lost (if any).
- **What went well** — what the on-call did that worked.
- **What went poorly** — what blocked the response or made it worse.
- **Action items** — numbered, owner-assigned, with target dates. File each as a separate work item; do not bury them in the doc.
- **Evidence links** — Sentry event IDs, `docker logs` excerpts, the SHA-256 of any backup touched.

The postmortem doc lives in `docs/production-readiness/` next to
`MIGRATION_DEPLOYMENT.md` and is referenced from
`PRODUCTION_READINESS_TRACKER.md` and the [SEV] thread.

## Follow-up hygiene

- A closed P0/P1 must add at least one **guard rail action item** that would have caught the incident earlier (e.g. a new health probe, a new unit test, a new check in `preflight.sh`).
- Every P0/P1 closes only when the postmortem is merged and the action items are filed. The on-call owns the close-out, not the resolver.
- The 2026-08-24 incident's guard-rail work (the `migration-journal-order` test, the readier health probe, the `.dockerignore` hardening) is the worked example of this loop.

## Related documents

- [`runbook.md`](./runbook.md) — Day-2 operations, deploy, rollback, backup, rotation.
- [`backup-recovery.md`](./backup-recovery.md) — RPO/RTO, restore drill cadence, offsite status.
- [`environments.md`](./environments.md) — Current single-environment decision and future staging topology.
- [`../production-readiness/MIGRATION_DEPLOYMENT.md`](../production-readiness/MIGRATION_DEPLOYMENT.md) § "2026-08-24 incident" — canonical worked example.
- [`../production-readiness/EXTERNAL_SERVICES_UAT.md`](../production-readiness/EXTERNAL_SERVICES_UAT.md) — owner-supplied UAT rows (alert delivery, offsite restore) that gate P0 closure.
