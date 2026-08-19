# Test and coverage evidence

## Baseline — 2026-08-19

| Command              | Result                                                                     | Release interpretation                                             |
| -------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `pnpm verify`        | Passed                                                                     | Compilation gate only; database constraints skipped inside Vitest. |
| `pnpm test:e2e`      | 144 passed, 10 skipped                                                     | Existing-route smoke/a11y coverage; not the complete role journey. |
| `pnpm test:coverage` | 10 passed, 8 skipped; 26.88% statements, 43.53% branches, 17.14% functions | Fails production coverage expectations.                            |

Critical baseline weaknesses:

- Core content, delivery, publishing, invitation and AI services have no meaningful unit coverage.
- One agency-admin fixture receives every role, masking authorization defects.
- The advertised happy path stops at Approved for Design and conditionally tolerates a missing approval action.
- Database tests can skip based on process environment.
- CI runs Chromium only and has no visual baselines or coverage threshold.
- React 19 deprecation warnings and intermittent aborted development requests appear during E2E.

## Required final evidence

Record fresh outputs for frozen install, formatting, lint, strict typecheck, unit, database, coverage, build, audit, Docker build, migrations, all Playwright projects, accessibility and visual comparison. Include commit SHA and do not replace failed output with a summary.
