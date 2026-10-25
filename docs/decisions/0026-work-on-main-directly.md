# ADR 0026 — Work on `main` directly

## Status

Accepted — 2026-10-25

## Context

Every change in this repository travelled through a feature branch, a worktree, a pull request, a squash-merge, and a branch deletion. Each step was individually reasonable; together they made an ordinary change expensive, and each one added a way for the change to be stranded — a branch that was never merged, a worktree holding uncommitted work, a PR left open.

The instruction layer compounded this. `AGENTS.md` § Conventions prescribed `feat/*`, `fix/*`, `chore/*` branch types and squash-merges, and the "no finished work sits in a dirty tree or stale branch" rule required cleanup that no documented procedure supported. The audit in `docs/audits/RELEASE_PROCESS_REVIEW_2026-10-25.md` §3 measured the residue: three merged branches, one dirty worktree, and one branch still carrying real work.

The repository owner has now asked for the opposite default: **work on `main` directly, unless told otherwise.** This continues the direction of ADR 0025, which removed independent review and complete local release gates as merge prerequisites — the same intent, applied to the branching layer.

## Decision

- **The default workspace is the `main` checkout.** Changes are made, verified, and committed directly on `main`. No feature branch and no worktree are created.
- **A branch or worktree is created only when the user explicitly asks for one** — for example to stage a large change for review, to keep an in-progress experiment off `main`, or to run two lines of work in parallel.
- **A pull request is transport, not a workspace.** Where the remote requires a pull request to update `main`, the local `main` commits are pushed through a short-lived branch, the PR is opened and merged against `main`, and the branch is deleted immediately. The work is still done on `main`.
- **Cleanup becomes the exception, not the routine.** `./scripts/cleanup-worktrees.sh` stays available for branches that were created deliberately or left over from earlier work. It still checks ancestry first and then patch equivalence plus a per-file content comparison, refuses `main` and dirty worktrees, and never discards unique work.
- **Commit discipline does not change.** One commit per unit of work, `<type>(<scope>): <description>`, on the exact SHA that was verified. `main` stays linear (GitHub enforces linear history).
- **Nothing else moves.** Independent review and local release gates remain non-prerequisites for merge (ADR 0025). The `Verified` transition still requires an independent reviewer. Every hard deployment control — branch protection's force-push and deletion bans, exact-SHA CI and images, provider preflight, pre-migration backup, readiness checks, and automatic rollback — remains in force and remains able to block.

## Consequences

- A routine change is: edit → check → commit on `main` → push. There is no branch to create, merge, or delete, and no worktree to prune.
- The "no finished work sits in a dirty tree or stale branch" rule becomes a statement about `main` itself: the working tree is clean and `main` holds the work.
- Concurrency risk moves onto `main`. Two sessions editing the same repository at once can now collide on the same branch, so `git pull --ff-only origin main` before starting and a clean tree before committing matter more than they did when each session had its own branch. A pull that is not a fast-forward is a stop-and-report condition, not something to force.
- The audit's cleanup residue is a one-time removal, not a recurring chore.
- The pull-request requirement on `main` is a repository setting the owner controls. This decision governs the working method; it does not, by itself, change that setting.

## Rollback

Restore branch-per-change through a reviewed change to `AGENTS.md` § Conventions and § Hard rules, `docs/contributing/conventions.md`, `docs/operations/release.md` § 3–§ 4, and this decision. If the pull-request requirement on `main` is changed, that is a separate repository setting and is reverted in the GitHub branch-protection configuration.
