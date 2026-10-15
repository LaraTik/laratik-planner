# Advertising release-candidate evidence manifest

Status: **Tested / NO-GO**. This manifest records the verified local candidate
and the controlled live v26 read-only result; it does not authorize production
flag changes, provider writes, or release approval.

## Immutable identity

| Identity                   | Value                                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implementation commit      | `a54629e4a5fcd61556d1d734fdea5e51168d1d91`                                                                                                                                                                                                        |
| Evidence/deployment commit | `a54629e4a5fcd61556d1d734fdea5e51168d1d91`                                                                                                                                                                                                        |
| Database migration head    | `0085`                                                                                                                                                                                                                                            |
| Drizzle migration ledger   | `86/86` in the disposable migration drill                                                                                                                                                                                                         |
| Production version         | `a54629e` confirmed by `/api/health`                                                                                                                                                                                                              |
| CI workflow artifact       | [CI](https://github.com/LaraTik/laratik-planner/actions/runs/38696125682), [Deploy](https://github.com/LaraTik/laratik-planner/actions/runs/38698789956), [Release](https://github.com/LaraTik/laratik-planner/actions/runs/38698989956) — passed |

The source commit is the only code identity to which the results below may be
attached. If the branch advances or becomes dirty, rerun the affected gates.

## Reproducible local evidence

All database commands use a disposable `planner_test` database.

| Gate                                   | Result                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Verification                           | Pass — formatting, lint, strict typecheck, 509 unit files / 4,728 tests, production build                 |
| Advertising integration                | Pass — focused lifecycle 6/6 and tenant guards 17/17, including Graph-version migration and lease fencing |
| Full migration safety                  | Pass — 5/5 drills, 86/86 ledger rows, backup/restore included                                             |
| Advertising functional browser gate    | Pass — 15/15 across Chromium, Firefox, WebKit, mobile Chrome, mobile Safari                               |
| Advertising accessibility browser gate | Pass — 15/15 across the same five projects; serious/critical axe findings absent                          |
| Combined advertising browser gate      | Pass — **30/30**                                                                                          |

Exact command forms:

```text
pnpm verify
TEST_DATABASE_URL=… pnpm test:integration tests/integration/advertising-credential-lifecycle.test.ts tests/integration/advertising-tenant-guards.test.ts
TEST_DATABASE_URL=… pnpm migration-drill
TEST_DATABASE_URL=… pnpm test:e2e:isolated -- tests/e2e/advertising-admin.spec.ts tests/e2e/advertising-reporting.spec.ts --grep 'advertising|Advertising'
TEST_DATABASE_URL=… pnpm test:e2e:isolated -- tests/e2e/a11y-routes.spec.ts --grep 'advertising|Advertising'
```

The 30/30 total is intentionally explicit: 15 functional cases plus 15
advertising accessibility cases. The older “15/15 plus 10/10” wording counted
only the reporting accessibility subset and must not be used as the final
release total.

## Controlled live v26 UAT result

The deployed candidate ran a bounded, read-only validation at
`2026-10-15 10:39:42` (Europe/Berlin). Nine of ten checks passed: identity,
Facebook Page, campaign, ad set, ad, creative, daily insights, breakdown, and
ad-account discovery. Instagram returned explicit no-accessible-data; this is
an optional social-identity condition and does not block ad-account reporting.
The approved account then ran one bounded worker tick at `2026-10-15
10:42:40 UTC`: one account was claimed, the run completed as an explicit
`partial` result with 21 rows read and written, and no error or dead-letter
state was recorded. Six reconciliation snapshots were written; all six were
`partial` with zero discrepancy and zero unallocated spend. The account was
then disabled through the admin workflow; its state became `paused`,
`nextRunAt` and all lease fields were cleared, and a follow-up worker tick
claimed zero accounts. No publishing or financial workflow was used. The
`Read reports` visibility grant remains active for the approved `DR Reem Reda`
workspace, while the pre-existing agency-wide financial authority is revoked.
The reporting surface remains behind its rollout gate: advertising reporting
is not enabled and no data is disclosed while `ADVERTISING_REPORTING_ENABLED`
remains off. The temporary sync enablement was removed and production health
returned to ready on the verified application image.

## Canary activation decision

No new server allowlist is required for this release candidate. The existing
controls provide the smallest scoped canary:

- `setAdvertisingSyncState` activates one connection/account pair and writes an
  audit event; disabling clears `nextRunAt` and the lease fields.
- `claimAdvertisingSyncStates` claims only active linked accounts whose state is
  due and not `paused` or `dead_letter`.
- `finishAdvertisingSync` and `failAdvertisingSync` require the state to remain
  `running` with the original unexpired lease token, so a late in-flight result
  cannot reactivate a disabled account.
- `revokeAdvertisingConnection` and `revokeAdvertisingAccountAccess` also clear
  lease ownership/token/expiry immediately; the account-revocation regression
  proves the revoked state is absent from subsequent claims.
- Workspace reporting is independently grant-scoped through
  `listAdvertisingReportAccounts` / `loadAdvertisingReport`.
- `ADVERTISING_SYNC_ENABLED`, `ADVERTISING_REPORTING_ENABLED`, and
  `META_PUBLISHING_ENABLED` remain deployment-level gates; publishing remains
  disabled by default.

The agency-admin screen shows each account’s `idle`, `running`, `partial`,
`failed`, `dead_letter`, or `paused` state and records activation/deactivation.
The operator should activate one approved test account only, observe sync and
reporting independently, and disable it before expanding scope.

## Remaining release blockers

1. `ADVERTISING_REPORTING_ENABLED` remains off. A product owner must separately
   approve any live reporting canary after review of the bounded UAT evidence;
   publishing remains disabled.
2. Restic offsite backup is not wired and no disposable offsite restore has
   been timed. The operator procedure is in
   [`OFFSITE_RECOVERY_VERIFICATION.md`](./OFFSITE_RECOVERY_VERIFICATION.md).
3. An independent reviewer has not assigned `Verified`.

Therefore the release recommendation is **NO-GO**. This manifest does not
authorize production flag changes, deployment, credential access, or provider
writes.
