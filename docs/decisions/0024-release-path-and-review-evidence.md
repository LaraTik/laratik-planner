# ADR 0024 — Canonical release path, review evidence, and branch lifecycle

## Status

Accepted — 2026-10-25

> **Merge sequence superseded in part by ADR 0025:** independent review and completed local release gates are not prerequisites for merge.

## Context

Four mechanics in the release path were unreachable, contradictory, or mechanically impossible. Each converted an ordinary merge into a written risk-acceptance narrative. The full analysis, with measurements, is in [`docs/audits/RELEASE_PROCESS_REVIEW_2026-10-25.md`](../audits/RELEASE_PROCESS_REVIEW_2026-10-25.md).

1. **The independent-review gate named an evidence form the repository stopped producing.** ADR 0021 moved review to the local operator machine, but `docs/contributing/release-checklist.md` still required a **GitHub PR comment** as the proof, and `docs/contributing/pr-review-checklist.md` still said a PR is the unit of verification. The readiness tracker then recorded, release after release, that _"the user reports review is complete, but no independent GitHub review decision is recorded"_ — the review was happening; only the record's artifact was missing. The verdict stayed `READY FOR INDEPENDENT REVIEW` from 2026-08-24 and every subsequent merge required an explicit waiver.

2. **Cleanup could not be performed with the standard git commands.** The repository squash-merges, so a merged branch is never an _ancestor_ of `main` — only _patch-equivalent_ to it. `git branch -d` therefore refuses branches that are safely merged. There was no branch or worktree lifecycle rule at all. On 2026-10-25 the operator machine held three merged branches with attached worktrees, one detached worktree, and one branch that still carried real work — with no supported way to tell them apart or to remove the safe ones.

3. **The release path was described three different ways.** The `AGENTS.md` quick start implied a local build → `deploy.sh` path; the `AGENTS.md` hard rules required dispatching CI and then Deploy on `main`; the operations runbook described the local buildx path as _"reserved for recovery"_. Nothing named the normal path, and picking the wrong one skips a gate.

4. **The evidence-recording tax was a multi-paragraph narrative per deploy.** `PRODUCTION_READINESS_TRACKER.md` reached 501,647 bytes and `docs/production-readiness/TEST_EVIDENCE.md` 4,578 lines, because every deploy appended dense prose to both files — including the many releases where nothing had failed. `docs/contributing/release-checklist.md` already pointed at a § "Deploy log" in `docs/operations/READY_TO_DEPLOY.md`; that section did not exist.

A fifth, lower-severity defect: `docs/decisions/` uses three numbers twice (`0005`, `0010`, `0016`), and `docs/superpowers/plans/2026-09-02-platform-aware-social-analytics.md` cites `0005-platform-aware-social-metrics.md`, a file that has never existed.

## Decision

1. **One canonical release path.** `docs/operations/release.md` is the ordered path — merge → clean up → push → exact-SHA CI → Deploy → verify → record — with exact commands, success criteria, and rollback. Run local checks and request review when practical, but neither is a merge prerequisite. `AGENTS.md`, the operations runbook, and the release checklist describe the same path and defer to it on any disagreement. The local buildx → GHCR → SSH path is named explicitly as the **fallback** for when the dispatched CI build is unavailable.

2. **The independent review is a person, not a form.** The reviewer is the repository owner, or any other person who did not write the change; the implementation agent can never review its own work. The review may be recorded as a **GitHub PR review** or as a **local review record** naming the reviewer, the date, the exact SHA, and the confirmed boxes. The substantive checklist — IDOR, transaction boundaries, audit rows, tenant isolation, coverage, migrations and secrets — is unchanged, and the prohibition on assigning `Verified` without the review is unchanged.

3. **Branch and worktree lifecycle.** A feature branch and its worktree are temporary scratch space and are removed once the work lands on `main`. `git branch -d` and `git worktree remove` are correct for the common case, but a **squash-merged branch is only patch-equivalent to `main`, never an ancestor**, and `git branch -d` refuses it — so ancestry alone is never a safe test. `scripts/cleanup-worktrees.sh` checks ancestry first and then falls back to **patch equivalence plus a per-file content comparison**. It reports by default, removes only on an explicit flag, refuses `main` and the current branch, refuses dirty worktrees, and never discards unique work. A dirty worktree whose uncommitted content is already in `main` is classified as a **stale snapshot** and is removable only with `--discard-stale`. A branch that still carries unmerged commits is unfinished work, not cleanup.

4. **Deploy recording scales with what happened.** A routine release records **one row** in the § "Deploy log" of `docs/operations/READY_TO_DEPLOY.md` (SHA, date, operator, CI run, deploy run, health version, reviewer, gate results, result). A **full narrative** in `PRODUCTION_READINESS_TRACKER.md` and `docs/production-readiness/TEST_EVIDENCE.md` is added only when a gate failed, a gate was waived, or the release carried a risk acceptance.

5. **ADR disambiguation by index, not by renumbering.** `docs/decisions/README.md` maps every ADR number to its full slug, title, and date, so "the ADR for X" is answerable despite the three reused numbers. The numbers themselves are left alone: renumbering would make a September 2026 decision appear to have been taken in October 2026, and ADR numbers are cited in release gates. The one reference to a file that has never existed is corrected.

## Consequences

- A normal merge no longer requires a written waiver, and the readiness verdict can be advanced by the owner through a review that has in fact happened.
- The hard deployment controls are untouched: branch protection, deployment-environment approvals, exact-SHA CI and images, provider preflight, pre-migration backup, readiness check, and automatic rollback all still apply and all still block.
- The security content of the review checklist is unchanged; only the artifact the review is written on is now flexible.
- The tracker stops growing by narrative for clean releases. Risk-accepted and failed releases still get the full written record, which is where that prose carries information.
- Merged branches and worktrees can now actually be removed, and the removal is auditable: the script prints what it removed and what it refused to touch, and names the files that need human judgement.
- `scripts/cleanup-worktrees.sh` adds one executable file to the repository. It is read-only unless `--apply` is passed.
- Operators must run the cleanup script rather than `git branch -d` for merged branches; `git branch -D` on a branch with unmerged commits discards work and remains the wrong tool.

## Rollback

Revert this ADR's change set: delete `docs/operations/release.md` and `scripts/cleanup-worktrees.sh`, remove the deploy-log section from `docs/operations/READY_TO_DEPLOY.md`, restore the previous wording in `AGENTS.md`, `docs/contributing/pr-review-checklist.md`, and `docs/contributing/release-checklist.md`, and restore the ADR index's removal of the three duplicate numbers. No schema, migration, product code, or deployment control is affected, so no data remediation is required.
