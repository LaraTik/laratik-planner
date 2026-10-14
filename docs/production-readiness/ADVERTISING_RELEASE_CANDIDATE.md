# Advertising release-candidate rollout plan

> Current status: **NO-GO**. This document is the rollout plan; the current
> deployed/evidence checkpoint is recorded in
> `ADVERTISING_RELEASE_EVIDENCE_MANIFEST.md`.

## Candidate

- Implementation: `3a518784a4e977ddf54f08d9f03c314f01bc0c9e`
- Evidence/deployment: `a458fa1c546f15c44bb63fb504bc5455ad0a3ecd`
- Database: migration head `0085`; disposable drill ledger `86/86`.
- Current decision: **NO-GO** pending encrypted offsite backup plus disposable
  restore evidence and independent review. Controlled v26 Meta UAT completed
  with explicit partial provider results; sync remains disabled.

## Preconditions

1. Independent reviewer signs `ADVERTISING_INDEPENDENT_REVIEW.md`.
2. Operations owner confirms a tested local and offsite backup, measured RPO/RTO,
   and a restore window.
3. Product owner authorizes one Meta test account, one agency, a date window,
   and the exact read-only scopes. Credentials are entered only through the
   approved production secret/configuration path.
4. Confirm disk, database, migration ledger, image digest, health endpoint,
   alerting, and operator access before the window.

## Controlled rollout

1. Keep `ADVERTISING_SYNC_ENABLED=false`,
   `ADVERTISING_REPORTING_ENABLED=false`, and
   `META_PUBLISHING_ENABLED=false`.
2. Deploy the reviewed image and run forward-only migrations with a confirmed
   pre-change backup.
3. Configure one agency's provider connection through the agency admin UI;
   validate credentials without exposing the token.
4. Run one read-only discovery/probe and confirm the approved host, requested
   scopes, account identity, pagination, retry, and partial-state evidence.
5. Grant one test workspace the minimum campaign/reporting scope and financial
   authority required for the test. Reconcile provider totals against the
   canonical spend facts.
6. Enable reporting only for the test agency, observe one bounded sync window,
   then review audit and sync history. Do not enable publishing.
7. Expand only after the reviewer records a pass for isolation, freshness,
   financial reconciliation, error recovery, and rollback readiness.

## Stop and rollback criteria

Stop immediately and disable the advertising flags if any of the following is
observed: cross-tenant data, token-like log output, unexpected provider write,
duplicate canonical spend, unexplained financial variance, stale or silently
truncated pagination, missing partial-state labeling, repeated retry/dead-letter
growth, failed backup, or an unreviewed migration result.

Rollback is: disable the feature flags, revoke the test grant/connection,
preserve sanitized logs and audit IDs, and roll back the application image to
the previously approved digest. Do not reverse a production migration with a
destructive command. Database restoration is reserved for a confirmed data-loss
incident and only from a verified backup under the incident runbook.

## Exit criteria

- [ ] Test agency reconciliation is within the reviewer-approved variance.
- [ ] No cross-tenant or credential-handling finding remains.
- [ ] Sync freshness, pagination completeness, retry behavior, and partial
      states are evidenced.
- [ ] Offsite backup and restore evidence is current.
- [ ] Independent reviewer and operations owner sign off.
- [ ] Product owner explicitly approves any flag change beyond the canary.
