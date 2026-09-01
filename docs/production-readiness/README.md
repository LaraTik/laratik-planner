# Production-readiness evidence

This directory contains evidence, not optimistic progress notes. The authoritative work list is `/PRODUCTION_READINESS_TRACKER.md`.

## Evidence rules

1. Record the exact command, date, commit SHA, exit code and summarized result.
2. Never paste credentials, private content, raw invitation links or production user data.
3. Mask dynamic timestamps/IDs in visual baselines.
4. A screenshot proves presentation only; pair it with behavioral and authorization tests.
5. A build proves compilation only; pair it with domain, database and browser tests.
6. External checks that cannot be automated must name the operator and date.
7. Evidence belongs to one exact clean commit SHA. If that SHA changes or the worktree becomes dirty, rerun every affected gate before reusing the result.
8. Database changes require registered migration metadata plus successful from-zero and supported-upgrade drills; `pnpm verify` is not migration evidence.
9. A localized UI route reaches `Tested` only with English/LTR and Arabic/RTL browser, accessibility, and responsive/visual evidence. Catalog parity or `<html dir>` alone is insufficient.

Documents:

- `SCREEN_PARITY.md` — canonical Stitch route and viewport matrix.
- `TEST_EVIDENCE.md` — reproducible quality and coverage record.
- `SECURITY_AUDIT.md` — vulnerabilities, authorization and secret-handling record.
- `MIGRATION_DEPLOYMENT.md` — forward/rollback, backup and release proof.
- `UAT_RELEASE.md` — primary journey, owner checks and final verdict.
