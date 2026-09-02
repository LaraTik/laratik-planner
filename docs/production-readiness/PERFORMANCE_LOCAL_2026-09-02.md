# Local Performance Baseline — 2026-09-02

Status: local baseline captured; release performance gate remains open

This is supporting evidence for the performance protocol in
`docs/testing/performance-report.md`. It is not a substitute for throttled
Lighthouse/WebPageTest runs or production observation.

## Reproduction context

| Field                      | Value                                                   |
| -------------------------- | ------------------------------------------------------- |
| Source verification commit | `bf151a0`                                               |
| Browser                    | Playwright Chromium 1.62.1                              |
| OS                         | macOS 26.5.2 (Build 25F84)                              |
| Node                       | v24.10.0                                                |
| Server                     | Local `next start` production build                     |
| Database                   | Disposable `planner_test`; no production data           |
| Network                    | Local loopback; no CPU/network throttling               |
| Runs                       | 3 per route and viewport; fresh browser context per run |
| Capture date               | 2026-09-02                                              |

The server used test-only `AUTH_SECRET` and `AGENCY_COOKIE_SECRET` values and a
temporary uploads directory. No real secret or production endpoint was used.

## Browser measurements

Values are milliseconds except CLS, transfer bytes, and resource count. The
`p75*` columns use the linear percentile over the three observed values only;
they must not be treated as release thresholds.

| Route     | Viewport         | LCP runs   | LCP p50 / p75* | FCP runs   | CLS | Transfer | Resources |
| --------- | ---------------- | ---------- | -------------: | ---------- | --: | -------: | --------: |
| `/signin` | desktop 1440×900 | 96, 60, 56 |        60 / 78 | 96, 60, 56 |   0 |  611,318 |        29 |
| `/`       | desktop 1440×900 | 56, 56, 56 |        56 / 56 | 56, 56, 56 |   0 |  595,064 |        20 |
| `/signin` | mobile 375×812   | 56, 60, 56 |        56 / 58 | 56, 60, 56 |   0 |  611,318 |        29 |
| `/`       | mobile 375×812   | 56, 52, 52 |        52 / 54 | 56, 52, 52 |   0 |  595,064 |        20 |

INP was not claimed because this capture did not exercise a representative
interaction flow. The next run must include a user interaction on the
authenticated planning surface and collect an actual event timing observation.

## Interpretation

- The public routes have a low local baseline and no observed layout shift.
- The result is deliberately optimistic: loopback, warm local resources, no
  network shaping, and public routes only.
- Authenticated planning, workspace overview, review queue, and content detail
  still need the same three-run capture with deterministic seeded data.
- Lighthouse or WebPageTest p50/p75, INP, slow-network behavior, and production
  observation remain release-gate work.
