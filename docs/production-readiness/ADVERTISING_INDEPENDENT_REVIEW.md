# Advertising independent-review checklist

> Review target: LaraTik Planner advertising foundation at exact clean SHA
> `90a533f437aacd3df704e0db1e68580b7cd90d8f`.
>
> This checklist is prepared for an independent reviewer. The implementer may
> provide evidence and fix findings, but must not assign `Verified` to these
> rows. Do not paste secrets, real tokens, account IDs, spend exports, or
> production user data into this file.

## Evidence already available

- [x] `pnpm verify` passes: 507 unit files / 4,718 tests and production build.
- [x] Full disposable-Postgres integration runner completed; advertising lifecycle 3/3 and tenant guards 15/15.
- [x] Migration drill completed 5/5 with 85/85 ledger rows.
- [x] Advertising functional browser matrix completed 15/15 across five browser projects: admin 5/5, reporting EN 5/5, reporting AR 5/5.
- [x] Advertising accessibility browser matrix completed 15/15 across five browser projects: settings 5/5, analytics EN 5/5, analytics AR 5/5; serious and critical axe findings absent.
- [x] Combined advertising browser release gate completed 30/30; the prior 15/15 + 10/10 wording counted only the reporting accessibility subset and is superseded here.
- [x] No push, deployment, live Meta request, or provider mutation was performed.

## Reviewer gates

### Tenant and authorization isolation

- [ ] Confirm every advertising read and write resolves agency and workspace
      scope before loading provider facts. Review
      `src/lib/advertising/reporting-query.ts` (`listAdvertisingReportAccounts`,
      `loadAdvertisingReport`) and
      `src/lib/advertising/sync-service.ts` (`setAdvertisingSyncState`).
- [ ] Confirm shared canonical provider accounts cannot leak campaigns, spend,
      audiences, or exports across agencies without an explicit active grant.
      Review the grant joins in `reporting-query.ts` and the ownership guards in
      `connection-service.ts`.
- [ ] Confirm grant revocation and financial-authority revocation take effect
      immediately and leave an auditable event.
- [ ] Confirm replay, concurrent claims, fencing, failed attempts, and
      dead-letter behavior do not duplicate canonical spend. Review
      `sync-worker.ts` (`claimAdvertisingSyncStates`, `createAdvertisingSyncRun`,
      `finishAdvertisingSync`, `failAdvertisingSync`) and
      `ingestion-service.ts` (`ingestAdvertisingSpend`,
      `buildSpendReconciliation`).

### Credentials and provider safety

- [ ] Confirm tokens remain encrypted at rest, are never returned to client
      code, and are absent from logs, URLs, screenshots, and exports. Review
      `src/lib/advertising/crypto.ts` and
      `src/lib/advertising/credential-service.ts`.
- [ ] Confirm provider scopes are read-only and the Meta publishing kill switch
      remains disabled.
- [ ] Complete the controlled Meta UAT using an explicitly authorized test
      account, one test agency, and a documented stop window. Record only
      sanitized outcomes in `EXTERNAL_SERVICES_UAT.md`.
- [ ] Observe and record permission denial, rate limiting, pagination, retry,
      partial-data, and provider-error behavior against the authorized account.

### Financial and reporting correctness

- [ ] Reconcile provider-returned account totals to canonical daily spend facts
      over an agreed date window.
- [ ] Verify attributed, unallocated, and disputed spend totals and confirm
      they do not silently disappear from admin reconciliation.
- [ ] Verify linked, unresolved, unsupported, and unpublished post states are
      distinct and that duplicate promoted-post references do not duplicate rows.
- [ ] Verify report pagination, freshness, sample size, and partial-state
      labels remain visible to the user. Review `reporting-query.ts`,
      `sync-worker.ts` (`persistSyncCursor`, `attributedSpendForDate`), and the
      advertising reporting page.

### Operations and recovery

- [ ] Provision encrypted offsite restic backup through the operator-approved
      secret store; do not commit repository URLs or passwords.
- [ ] Complete and time a disposable offsite restore, record the sanitized
      result, and replace the RPO/RTO placeholders in `backup-recovery.md`.
- [ ] Confirm backup-before-migration, forward-only migration, rollback, and
      application-image rollback procedures with the operator.
- [ ] Confirm alerts, sync retry/dead-letter visibility, and kill-switch
      procedures are actionable by the on-call owner. Review
      `src/lib/validation/env.ts` (`ADVERTISING_SYNC_ENABLED`,
      `ADVERTISING_REPORTING_ENABLED`, `META_PUBLISHING_ENABLED`), the cron
      route, the reporting page, and
      `src/lib/social/publishing-readiness-service.ts`.

### Distinct evidence state

| State               | What is currently evidenced                                                                | What is still required                                             |
| ------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Local code/tests    | Exact-SHA verification, disposable-DB integration, migration drill, and 30/30 browser gate | Independent reviewer confirmation                                  |
| Live provider       | No Meta credential read or request made                                                    | Authorized read-only Meta UAT and account reconciliation           |
| Operations/recovery | Local backup/restore drill only; restic remains stubbed                                    | Provision offsite repository and complete timed disposable restore |
| Independent review  | Checklist and code-reference map prepared; implementer status remains Tested               | Reviewer assigns Verified after all applicable gates               |

## Sign-off

| Role                 | Name | Date | Result  | Notes                                       |
| -------------------- | ---- | ---- | ------- | ------------------------------------------- |
| Implementer          |      |      | Tested  | Evidence prepared; no `Verified` assignment |
| Independent reviewer |      |      | Pending | Must complete all applicable gates          |
| Operations owner     |      |      | Pending | Must close backup/RPO/RTO gates             |

Current recommendation: **NO-GO** for production advertising enablement until
the unchecked live-UAT, offsite-recovery, and independent-review gates are
closed.
