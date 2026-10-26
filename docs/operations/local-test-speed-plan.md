# Local test speed plan

**Status:** Adopted for the development loop; safe full-suite parallelization is
planned and is not enabled yet.

## Fast feedback for each change

Do not rerun the full PostgreSQL suite for every small fix. Select the narrowest
check that covers the change, then let the pre-push hook add affected unit and
integration tests from the pushed commit range.

```bash
# One focused unit file
pnpm exec vitest run tests/unit/workspace-assistant-route.test.ts

# One focused database integration file (disposable planner_test only)
TEST_DATABASE_URL=postgresql://planner:planner_dev_only@127.0.0.1:5436/planner_test \
  pnpm test:integration -- tests/integration/workspace-assistant.test.ts

# Tests selected from changed files / the push range
pnpm test:affected -- --layer core
pnpm test:affected -- --push --layer core

# Browser layer only when a user journey or screen changed
pnpm test:affected -- --layer browser
```

The integration runner applies migrations, accepts only a disposable test/CI
database URL, and runs requested test files serially. A focused file takes
seconds rather than waiting for every database suite. The pre-push hook uses
the pushed range and affected-test manifest; it does not run the full suite.
Do not use the ordinary development `planner` database for tests.

## Local release gate

Run the full integration suite once for a release candidate, after affected
feedback is clean. It remains required locally before release while the suite
shares one database and its isolation has not been proven for parallel runs.

```bash
TEST_DATABASE_URL=postgresql://planner:planner_dev_only@127.0.0.1:5436/planner_test \
  pnpm test:integration
```

Run `pnpm verify` for format, lint, typecheck, all unit tests, and production
build. Run `pnpm migration-drill` for database changes, and affected bilingual
browser, accessibility, and visual checks for UI changes. Record release
evidence against the exact clean SHA.

## Speed-up work

1. **Keep the fast path.** Maintain the affected-test manifest and module
   ownership map so a code change selects its unit and relevant integration
   coverage. Unknown or shared changes must conservatively select more tests.
2. **Measure the slow files.** Add per-file duration summaries to the runner and
   identify slow fixture setup, redundant migration work, and avoidable
   subprocess startup. Optimize the slowest measured costs first.
3. **Remove process startup safely.** Prototype a single Vitest invocation with
   one worker and explicit sequential file execution. Compare the full results
   with the current runner over repeated clean database runs; keep the existing
   runner unless order, cleanup, and concurrency behavior remain identical.
4. **Parallelize only with database isolation.** If profiling still justifies
   it, create a migrated PostgreSQL template and give each worker a separate
   cloned database. Add a small capped worker count only after repeated runs
   prove there is no cross-file fixture interference, leaked state, or
   nondeterminism. Never parallelize suites against the shared `planner_test`
   database.
5. **Preserve release coverage.** Faster affected checks shorten fix/push cycles;
   they do not replace the full local integration, migration, or browser gates
   required by the production-readiness tracker.

## Completion measures

- A routine code fix runs only its related unit and integration suites locally.
- The pre-push hook remains bounded to the pushed range and never starts a full
  integration run implicitly.
- The full integration suite reports per-file and total duration, stays
  deterministic, and completes materially faster before replacing the current
  serial runner.
- No test becomes skipped or loses assertions as part of the speed work.
