# Contributing

Thanks for your interest in `laratik-planner`. This is the LaraTik
GmbH internal fork of the StudioFlow planner; the public-facing
contribution protocol lives in [`AGENTS.md`](./AGENTS.md).

## Where to read the protocol

Read these in order before opening a PR or running an agent on the
repo:

1. [`README.md`](./README.md) — release status, stack, local setup.
2. [`AGENTS.md`](./AGENTS.md) — the mandatory agent / contributor
   protocol. Covers commit hygiene, branch & PR scope, the
   "before you start a task" checklist, the per-domain style
   conventions, and the strict-no rules.
3. [`STUDIOFLOW_MASTER_PROMPT.md`](./STUDIOFLOW_MASTER_PROMPT.md) —
   product and engineering source of truth.
4. [`PRODUCTION_READINESS_TRACKER.md`](./PRODUCTION_READINESS_TRACKER.md)
   — implementation and release tracker; the "Verified" column is
   the production-handoff contract.

## Pull requests

- Reference the goal / feature / fix identifier in the PR title
  (e.g. `FEAT-07`, `BUG-123`).
- PRs must pass CI (`pnpm verify` + build + smoke e2e) before merge.
- The convention is `<type>(<scope>): <description>` for commits and
  the PR title.
- One reviewer with `Verified` authority is required; the
  `AGENTS.md` line "Only an independent reviewer may assign
  `Verified`" is enforced by the tracker.

## Code of conduct

By participating, you agree to abide by
[`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) (Contributor Covenant
v2.1).

## Reporting security issues

**Do not** file a public issue for security vulnerabilities. See
[`SECURITY.md`](./SECURITY.md) for the private disclosure channel and
response SLA.

## License

This project is proprietary. See [`LICENSE`](./LICENSE). Contact
`licensing@laratik.com` for any other use.
