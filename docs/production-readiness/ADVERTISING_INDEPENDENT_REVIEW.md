# Advertising independent-review checklist

> Review target: LaraTik Planner advertising foundation at exact clean SHA
> `a54629e4a5fcd61556d1d734fdea5e51168d1d91`.
>
> This checklist is prepared for an independent reviewer. The implementer may
> provide evidence and fix findings, but must not assign `Verified` to these
> rows. Do not paste secrets, real tokens, account IDs, spend exports, or
> production user data into this file.

## Evidence already available

- [x] `pnpm verify` passes: 509 unit files / 4,728 tests and production build.
- [x] Focused disposable-Postgres integration completed; advertising lifecycle 6/6 and tenant guards 17/17, including account-revocation lease fencing.
- [x] Migration drill completed 5/5 with 86/86 ledger rows.
- [x] Advertising functional browser matrix completed 15/15 across five browser projects: admin 5/5, reporting EN 5/5, reporting AR 5/5.
- [x] Advertising accessibility browser matrix completed 15/15 across five browser projects: settings 5/5, analytics EN 5/5, analytics AR 5/5; serious and critical axe findings absent.
- [x] Combined advertising browser release gate completed 30/30; the prior 15/15 + 10/10 wording counted only the reporting accessibility subset and is superseded here.
- [x] Production health, CI, deployment, and release workflows passed for the
      exact target SHA; the live Meta validation was read-only and recorded
      sanitized results only.

## Reviewer gates

### Tenant and authorization isolation

- [ ] Confirm the reviewer contract: canonical Meta ingestion is platform/account
      scoped and is performed only by the trusted, cron-authorized worker. Review
      `src/app/api/cron/advertising-sync/route.ts` (`isCronAuthorized`, `handle`)
      and `src/lib/advertising/sync-worker.ts`
      (`claimAdvertisingSyncStates`, `runAdvertisingSyncTick`). Claims join only
      active connections, active account links, and active provider accounts;
      this ingestion scope is not tenant disclosure authorization.
- [ ] Confirm activation remains explicit and account-scoped. Review
      `src/lib/advertising/meta-workflow.ts` (`runMetaConfigurationWorkflow`),
      `src/lib/advertising/connection-service.ts`
      (`activateAdvertisingConnection`), and
      `src/lib/advertising/sync-service.ts` (`setAdvertisingSyncState`). A
      configured connection or global sync flag must not activate an unapproved
      account.
- [ ] Confirm every tenant-facing report, grant, export, and AI projection
      resolves agency/workspace authorization before loading, aggregating, or
      disclosing provider facts. Review
      `src/lib/advertising/authorization.ts` (`authorizeAdvertising`),
      `src/lib/advertising/reporting-service.ts` (`buildScopedAdvertisingReport`),
      `src/lib/advertising/reporting-boundary.ts`, and
      `src/lib/advertising/reporting-query.ts`.
- [ ] Confirm shared canonical provider accounts cannot leak campaigns, spend,
      audiences, or exports across agencies without an explicit active grant and
      required financial authority.
- [ ] Confirm grant revocation and financial-authority revocation take effect
      immediately and leave an auditable event.
- [ ] Confirm replay, concurrent claims, fencing, failed attempts, and
      dead-letter behavior do not duplicate canonical spend. Review
      `sync-worker.ts` (`claimAdvertisingSyncStates`, `createAdvertisingSyncRun`,
      `finishAdvertisingSync`, `failAdvertisingSync`) and
      `ingestion-service.ts` (`ingestAdvertisingSpend`,
      `buildSpendReconciliation`).
- [ ] Confirm deactivation fences both in-flight writes and queued retries.
      Review `src/lib/advertising/credential-service.ts`
      (`revokeAdvertisingConnection`, `revokeAdvertisingAccountAccess`),
      `sync-worker.ts` (`finishAdvertisingSync`, `failAdvertisingSync`), and the
      exact integration tests:
      `fences late completion after an in-flight account is disabled` and
      `revoking one account access fences its lease and removes it from future
claims` in `tests/integration/advertising-tenant-guards.test.ts`.
      Revocation must clear lease metadata, pause the state, and leave future
      claims empty.

### Exact authorization and aggregation tests

The reviewer should verify these named tests at the immutable source SHA:

- `tests/unit/advertising-reporting-service.test.ts` — `filters facts before
totals for two tenants sharing one account` and `returns an indistinguishable
empty projection when the tenant is denied`.
- `tests/unit/advertising-reporting-boundary.test.ts` — `authorizes before
aggregation for dashboard, detail, and background surfaces`, `does not leak
denied rows through exports or AI context`, and `does not expose spend to AI
context without financial authority`.
- `tests/integration/advertising-tenant-guards.test.ts` — `scopes one shared
account across workspaces and revokes report access immediately`, `supports
the same external Meta account in two agencies through isolated local links`,
  `shares one platform credential and one canonical provider identity across two
agencies`, `does not expose account-level audience rows through a
campaign-scoped grant`, and `revokes financial authority in place and records
an audit event`.
- `tests/integration/advertising-credential-lifecycle.test.ts` — `revokes
provider reads, active versions, linked sync state, and blocks reactivation`.

### Credentials and provider safety

- [ ] Confirm tokens remain encrypted at rest, are never returned to client
      code, and are absent from logs, URLs, screenshots, and exports. Review
      `src/lib/advertising/crypto.ts` and
      `src/lib/advertising/credential-service.ts`.
- [ ] Confirm provider scopes are read-only and the Meta publishing kill switch
      remains disabled.
- [ ] Complete the controlled Meta UAT using an explicitly authorized test
      account, one test agency, and a documented stop window. The initial
      read-only validation passed 9/10 checks at 2026-10-15 10:39:42; scoped
      visibility, reconciliation, bounded sync, and fencing evidence remain.
      Record only sanitized outcomes in `EXTERNAL_SERVICES_UAT.md`.
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

| State               | What is currently evidenced                                                                                                                                                                                                                                                                                                                                                             | What is still required                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Local code/tests    | Exact-SHA verification, disposable-DB integration, migration drill, and 30/30 browser gate                                                                                                                                                                                                                                                                                              | Independent reviewer confirmation                                                                                  |
| Live provider       | Sanitized production v26 validation: 9/10 checks passed; creative read fixed; bounded worker UAT claimed one approved account, wrote 21/21 rows, produced six zero-discrepancy partial reconciliations, paused the account with cleared leases, and recorded a zero-claim follow-up; `Read reports` is granted to DR Reem Reda; financial authority revoked; reporting flag remains off | Independent review of the UAT evidence, product-owner flag approval if reporting is enabled, and operator sign-off |
| Operations/recovery | Local backup/restore drill only; restic remains stubbed                                                                                                                                                                                                                                                                                                                                 | Provision offsite repository and complete timed disposable restore                                                 |
| Independent review  | Checklist and code-reference map prepared; implementer status remains Tested                                                                                                                                                                                                                                                                                                            | Reviewer assigns Verified after all applicable gates                                                               |

## Sign-off

| Role                 | Name   | Date | Result  | Notes                                        |
| -------------------- | ------ | ---- | ------- | -------------------------------------------- |
| Implementer          |        |      | Tested  | Evidence prepared; no `Verified` assignment  |
| Independent reviewer | Msalam |      | Pending | Assigned; must complete all applicable gates |
| Operations owner     |        |      | Pending | Must close backup/RPO/RTO gates              |

Current recommendation: **NO-GO** for production advertising enablement until
the unchecked live-UAT, offsite-recovery, and independent-review gates are
closed.
