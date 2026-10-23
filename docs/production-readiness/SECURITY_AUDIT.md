# Security audit

## Baseline verdict

Release-blocking. `pnpm audit --prod` reported 23 advisories: 3 critical, 5 high, 12 moderate and 3 low.

Known critical/high areas include vulnerable Auth.js/NextAuth, `@auth/core`, Drizzle and Nodemailer versions. Re-run the audit after compatible upgrades; the lockfile result is authoritative.

## 2026-10-23 — Next.js and Sentry production advisory remediation

The manually dispatched CI run for the Planning XLSX export commit failed its
production dependency audit. The lockfile resolved Next.js `16.3.8` and
`@sentry/nextjs` `10.70.0`; the audit reported six findings, including three
critical and one high. The CI image build was correctly skipped because the
quality job (including this audit) is a prerequisite for publishing a release
image.

Direct dependencies were raised to Next.js `16.4.2` and
`@sentry/nextjs` `10.76.2`, both within their existing major lines and above
the advisory's patched floors. The production audit now passes at the release
threshold (`pnpm audit --prod --audit-level high`); two moderate advisories
remain and are below the documented deployment threshold. Full verification
and a new exact-commit CI run are required before deployment.

## Confirmed application findings

1. Invitation acceptance does not bind the token to the signed-in verified email.
2. User deactivation can remove the current/final administrator.
3. Current E2E authorization coverage is invalidated by an all-roles admin fixture.
4. Sensitive endpoints have no explicit bounded application rate limits.
5. AI failures may expose provider response details.
6. Production response headers omit the application CSP and related defense-in-depth headers.
7. Credential rotation remains an external owner action; never copy values into this file.

## Required closure evidence

- Zero unaccepted critical/high dependency findings.
- Role-by-route and role-by-command denial matrix.
- Cross-workspace and client-safe response-shape tests.
- Secret scan of tracked files and history.
- Production header capture.
- Owner-recorded credential rotation date without secret values.

## 2026-08-25 — Platform role authorization

Code snapshot `40d0dc8` replaces the binary platform-administrator capability
with four closed roles: Platform Owner, Agency Operator, Platform Auditor, and
Support Operator. Authorization is enforced by named server permissions; the
sidebar and controls reflect those permissions but are not the security
boundary.

- Only Owners can grant, change, or revoke platform assignments. The final
  active Owner cannot be downgraded or revoked; a transaction-scoped advisory
  lock serializes concurrent attempts.
- Agency Operators can create and maintain agencies, plans, and lifecycle state
  without receiving agency membership. Archive/unarchive remains Owner-only.
- Auditors have read-only access to agency metadata, access assignments, and
  audit surfaces.
- Support Operators can read agency metadata and request ticketed, time-limited
  support access. A platform role alone never grants tenant-content access;
  tenant content still requires the separate support-grant workflow.
- Role changes and their security audit events commit atomically. The database
  rejects roles outside the closed vocabulary and the audit history remains
  append-only.
- Revoked assignments fail closed, non-platform users receive the stable
  forbidden surface, and the legacy `/app/platform/admins` URL permanently
  redirects to `/app/platform/access`.

Evidence: 1,701 unit tests, 150 integration tests, 11 focused platform browser
tests, the six-viewport responsive matrix, and the Chromium axe sweep all pass.
`pnpm audit --prod` reports no known vulnerabilities. Status remains `READY FOR
INDEPENDENT REVIEW`; this implementation has not assigned itself `Verified`.
