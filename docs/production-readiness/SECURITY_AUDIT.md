# Security audit

## Baseline verdict

Release-blocking. `pnpm audit --prod` reported 23 advisories: 3 critical, 5 high, 12 moderate and 3 low.

Known critical/high areas include vulnerable Auth.js/NextAuth, `@auth/core`, Drizzle and Nodemailer versions. Re-run the audit after compatible upgrades; the lockfile result is authoritative.

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
