# Advertising release operator handoff sheets

Status: **NO-GO**. These sheets are execution checklists for authorized
operators. They do not authorize production access, provider requests, flag
changes, or infrastructure provisioning. Record only sanitized evidence: no
tokens, account identifiers, database contents, or secrets.

## Sheet A — Authorized read-only Meta UAT

**Owner action:** Product/operations owner authorizes one test agency, one
workspace, one approved Meta account, a date window, and read-only scopes. The
operator executes the existing agency-admin workflow and one bounded worker
tick.

**Prerequisites:** Written approval and stop window; approved secret/config
path; publishing disabled; advertising sync/reporting flags off until the
window; sanitized evidence location; reviewer-approved reconciliation window.

**Execution:**

1. Record a sanitized baseline and confirm no advertising work is running.
2. Configure and validate the approved read-only connection without copying the
   credential into evidence. Activate only the approved account/link.
3. Run one bounded sync tick through the existing scheduler path. Observe
   account-scoped claims, pagination/partial state, retry behavior, and audit
   history.
4. Grant only the approved workspace scope and financial authority. Compare
   provider account totals with canonical facts and attributed, unallocated,
   and disputed workspace projections.
5. Verify denied workspace/report/export/AI requests disclose no rows or totals.
6. Deactivate the account. Confirm paused state, cleared lease metadata, no new
   claim, and no queued retry can commit after deactivation.

**Expected evidence:** Sanitized timestamps, state transitions, counts,
reconciliation deltas, authorization outcomes, health result, and audit-event
references. Never include provider IDs, raw spend, tokens, or tenant data.

**Stop conditions:** Any provider write or publish attempt; unexpected account;
credential/scope mismatch; secret in logs or UI; cross-tenant row or total;
unapproved rate-limit/permission failure; missing partial-state evidence; or a
deactivated account that remains claimable or writable.

**Pass criteria:** Only approved read-only calls occurred; exactly the approved
account was ingested; tenant projections remained grant/authority scoped; the
reconciliation is within the approved variance; and deactivation fences both
in-flight and queued work. Otherwise record **Blocked/Fail** and keep NO-GO.

## Sheet B — Encrypted offsite backup and disposable restore

**Owner action:** Operations owner performs the approved encrypted offsite
backup and restores it into a disposable, isolated database and private-storage
location. Follow the full procedure in
[`OFFSITE_RECOVERY_VERIFICATION.md`](./OFFSITE_RECOVERY_VERIFICATION.md).

**Prerequisites:** Approval ticket and maintenance window; approved provider
and least-privilege credentials; separately recoverable non-production test
keys; synthetic encrypted canary; R2/private-storage inventory; defined RPO and
RTO targets; isolated application configuration with provider calls, cron,
email, publishing, and OAuth disabled.

**Execution:** Verify archive and restic integrity, restore Postgres and
private storage separately, recover keys through the approved store, prove the
database alone cannot decrypt the canary, run migrations, start the isolated
application, and time through `/api/health/ready`, bootstrap safety, and the
tenant/report smoke check. Compare object counts, bytes, integrity markers,
rows/checksums, and observed RPO/RTO with the defined targets.

**Expected evidence:** Redacted snapshot reference, checksums/integrity result,
canary result without plaintext, separate-key result, storage completeness,
migration head, phase timings, total restore duration, health result, and RPO/RTO
comparison.

**Stop conditions:** Production endpoint or secret access; provider write;
key mismatch; checksum, object, or row mismatch; missing object; health or
tenant-isolation failure; or an RPO/RTO target breach.

**Pass criteria:** Backup is readable and intact; the encrypted canary recovers
only with separately recovered keys; private storage is complete; application
health and tenant smoke checks pass; and observed RPO/RTO meet the owner-defined
targets. Otherwise offsite recovery remains **Blocked**.

## Sheet C — Independent release review and sign-off

**Owner action:** Independent reviewer inspects the exact source SHA, evidence
manifest, code references, test outputs, live-UAT record, and restore record.
The implementer may not assign `Verified`.

**Prerequisites:** Clean exact-SHA checkout; current
[`ADVERTISING_RELEASE_EVIDENCE_MANIFEST.md`](./ADVERTISING_RELEASE_EVIDENCE_MANIFEST.md);
focused test evidence; sanitized UAT and recovery evidence; no implementer-only
approval; and explicit confirmation that flags remain disabled.

**Execution:** Verify the source identity and clean tree, inspect worker
authorization and account-scoped claiming, inspect agency/workspace authorization
before report/grant/export/AI disclosure, inspect activation/deactivation fencing,
and verify every cited test was run against the exact source SHA. Confirm live
Meta UAT, offsite recovery, defined/observed RPO/RTO, and rollback evidence.
Record findings in the independent-review checklist.

**Expected evidence:** Reviewer name/date, exact SHA, checklist result per gate,
links to sanitized test and operator evidence, findings, decision, and explicit
`Verified` assignment only if all gates pass.

**Stop conditions:** SHA mismatch or dirty tree; missing or fabricated evidence;
secret or production data exposure; unresolved P0/P1 isolation or recovery
finding; live flag change without approval; or any required external gate still
open.

**Pass criteria:** Local evidence is exact and reproducible; worker ingestion
and tenant disclosure contracts are distinct and enforced; live read-only Meta
UAT and encrypted offsite recovery pass; RPO/RTO meet defined targets; no
release-blocking finding remains; and the independent reviewer assigns
`Verified`. Until then, release status remains **NO-GO**.
