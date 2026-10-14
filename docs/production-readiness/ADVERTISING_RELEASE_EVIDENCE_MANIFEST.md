# Advertising release-candidate evidence manifest

Status: **Tested / NO-GO**. This manifest records the verified local candidate
and the controlled live v26 read-only result; it does not authorize production
flag changes, provider writes, or release approval.

## Immutable identity

| Identity                   | Value                                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implementation commit      | `3a518784a4e977ddf54f08d9f03c314f01bc0c9e`                                                                                                                                                                                                        |
| Evidence/deployment commit | `a458fa1c546f15c44bb63fb504bc5455ad0a3ecd`                                                                                                                                                                                                        |
| Database migration head    | `0085`                                                                                                                                                                                                                                            |
| Drizzle migration ledger   | `86/86` in the disposable migration drill                                                                                                                                                                                                         |
| Production version         | `a458fa1` confirmed by `/api/health`                                                                                                                                                                                                              |
| CI workflow artifact       | [CI](https://github.com/LaraTik/laratik-planner/actions/runs/38564688298), [Deploy](https://github.com/LaraTik/laratik-planner/actions/runs/38567790013), [Release](https://github.com/LaraTik/laratik-planner/actions/runs/38567948555) — passed |

The source commit is the only code identity to which the results below may be
attached. If the branch advances or becomes dirty, rerun the affected gates.

## Reproducible local evidence

All database commands use a disposable `planner_test` database.

| Gate                                   | Result                                                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Verification                           | Pass — formatting, lint, strict typecheck, 508 unit files / 4,721 tests, production build                 |
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

The deployed evidence commit migrated the existing explicit pin to `v26.0` and
ran one bounded, read-only validation. Identity, Facebook Page, campaign, ad
set, ad, and ad-account discovery passed. Creative read returned an explicit
unsupported-field partial result, and Instagram returned an explicit no-
accessible-data partial result. The approved account remained **Disabled**;
sync was not activated and no sync history was created. These provider
limitations were surfaced as partial/unavailable state, not converted to zero
or treated as a full-capability pass.

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

1. Restic offsite backup is not wired and no disposable offsite restore has
   been timed. The operator procedure is in
   [`OFFSITE_RECOVERY_VERIFICATION.md`](./OFFSITE_RECOVERY_VERIFICATION.md).
2. An independent reviewer has not assigned `Verified`.

Therefore the release recommendation is **NO-GO**. This manifest does not
authorize production flag changes, deployment, credential access, or provider
writes.
