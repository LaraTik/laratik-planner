# Release process review — merge, cleanup, push, deploy

> **Date:** 2026-10-25 · **Scope:** the repository instruction layer only (`AGENTS.md`, `docs/contributing/`, `docs/operations/`, `docs/production-readiness/`, `docs/decisions/`, the git hooks) and the live git state of the operator machine.
>
> **Method:** read the instruction layer, then test each gate against the machine's actual state. A rule that cannot be satisfied by the real repository, or that is satisfied in a form the repository no longer produces, is a defect even when its prose is correct.
>
> **Verdict:** the gate _content_ was largely sound. The friction was not "too many gates" — it was **four mechanics that were unreachable, contradictory, or mechanically impossible**, each of which converted an ordinary merge into a waiver narrative. No hard deployment control needed to move.
>
> **Outcome — this review is a dated record, not the live policy.**
>
> - **F1–F5 were shipped** in [ADR 0024](../decisions/0024-release-path-and-review-evidence.md): one canonical release path, a form-agnostic review record, the branch/worktree cleanup procedure and `scripts/cleanup-worktrees.sh`, a one-row deploy log, and the ADR index.
> - **F1 was then superseded in part by [ADR 0025](../decisions/0025-no-pre-merge-gates.md)** (2026-10-25): the repository owner removed independent review _and_ complete local release gates as **prerequisites for merging** altogether. The waiver-narrative symptom F1 described is therefore gone by policy, not by making the artifact easier to produce. The `Verified` rule and every hard deployment control are unchanged.
> - The branch and worktree cleanup described in F2 was performed afterwards; the repository now holds only `main` and the `origin` remote.
> - [ADR 0026](../decisions/0026-work-on-main-directly.md) then removed the branch layer itself: the default workspace is now `main`, and a branch or worktree is created only when the user explicitly asks for one. That closes F2's root cause — there is nothing left to accumulate.
> - Read ADR 0025, ADR 0026, and `docs/operations/release.md` for what the rules are _now_. This document explains what was wrong and why.

## 1. The finding in one table

| #   | Finding                                                                                                               | Where                                                                                                                   | Effect on the operator                                                                                                                                                            | Severity  |
| --- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :-------: |
| F1  | The independent-review gate names an evidence form the repo stopped producing                                         | `docs/contributing/release-checklist.md` § 2 vs `docs/decisions/0021-local-review-and-release.md`                       | Every release records "no independent review" → readiness is permanently `NOT READY` → every merge needs a written waiver                                                         |  🔴 High  |
| F2  | There is no branch/worktree cleanup procedure, and one worktree is blocked by uncommitted changes that already landed | `AGENTS.md` § "Hard rules" ("no finished work sits in a dirty tree or stale branch") with no supporting mechanism       | 3 merged branches and 1 dirty worktree accumulate; the only way to clear the dirty one is `git worktree remove --force`, which discards the very check that protects the operator |  🔴 High  |
| F3  | The release path is described three different ways                                                                    | `AGENTS.md` § "Quick start" vs § "Hard rules" vs `docs/operations/runbook.md` § "Local review, release, and deployment" | The operator must re-decide the release mechanism every time, and pick the wrong one half the time                                                                                | 🟠 Medium |
| F4  | The evidence-recording tax is a multi-paragraph narrative per deploy                                                  | `PRODUCTION_READINESS_TRACKER.md` (501 KB), `docs/production-readiness/TEST_EVIDENCE.md` (4,578 lines)                  | Most of the cost of a merge is writing prose, not running checks                                                                                                                  | 🟠 Medium |
| F5  | Three ADR numbers are used twice, and one reference points at a file that does not exist                              | `docs/decisions/0005-*`, `0010-*`, `0016-*`                                                                             | "The ADR for X" is ambiguous in a repo whose release gates cite ADRs by number                                                                                                    |  🟡 Low   |

## 2. F1 — the review gate names an evidence form the repo stopped producing

**The chain:**

- `AGENTS.md` § "Mandatory production-readiness protocol" — _"MiniMax may move work through `Tested`; only an independent reviewer may assign `Verified`."_
- `docs/contributing/pr-review-checklist.md` § "Review contract" — _"A PR is `Verified` only when an independent reviewer (not the author) confirms every item below."_
- `docs/contributing/release-checklist.md` § 2 (pre-release verdict table) — the evidence column for that box reads **`PR comment + tracker row `Verified`**.**
- `docs/decisions/0021-local-review-and-release.md` (accepted 2026-10-24) — _"Review code locally, obtain the independent review required by the production-readiness tracker…"_ and _"GitHub Actions are not required for normal branch checks, merge, image publication, deployment, or release tagging."_

**The contradiction.** ADR 0021 moved the _review_ local. The checklist still demands a **GitHub PR comment** as the proof. The readiness tracker then records, entry after entry:

> _"The user reports review is complete, but no independent GitHub review decision is recorded."_ — tracker entry for `1bfc9e32`

So the review **is happening**. The _form_ of the record is what is missing. The tracker then carries the missing form forward as an open blocker, readiness stays `NOT READY`, and the next merge again requires an explicit risk-acceptance paragraph. The verdict has read `READY FOR INDEPENDENT REVIEW` since **2026-08-24** (`AGENTS.md` § "Goal progress (live)") — a month — and no amount of additional engineering will move it.

**Why this is a defect and not a discipline worth keeping.** The substance of the gate is _independence_: the person checking the diff must not be the party that wrote the code. Here the code author is the AI agent and the reviewer is the repository owner — genuinely independent, and the tracker says so in its own words. The rule is not protecting anything by demanding a GitHub artifact; it is protecting nothing and blocking everything.

**Fix shipped.** The evidence form becomes form-agnostic: a recorded reviewer identity, date, and the checked boxes — in a GitHub PR review _or_ in the local evidence record — satisfies the box. The independence requirement, the checklist itself, and the "never assign `Verified` without review" prohibition are unchanged. See ADR 0024.

> **Superseded in part by ADR 0025.** The repository owner removed independent review and complete local release gates as **prerequisites for merging**. The rule above now governs only the `Tested` → `Verified` transition, which still requires a reviewer who did not write the change. Merging no longer waits on a review record of either form, so the F1 symptom — a written waiver on every merge — no longer occurs.

**What is deliberately not changed:** the gate still requires a second pair of eyes, still requires the checklist, and still forbids the implementation agent from self-certifying. `AGENTS.md` § "Explicit user-requested merge and deployment" — "never assign `Verified` without the independent reviewer" — stays verbatim.

## 3. F2 — cleanup has no procedure, and one worktree is blocked by changes that already landed

**Measured on the operator machine, 2026-10-25:**

| Ref                                  | State                    | Ancestor of `main`? | `git cherry main` (`+` = not patch-equivalent) | Unique content        |
| ------------------------------------ | ------------------------ | :-----------------: | :--------------------------------------------: | --------------------- |
| `codex/advertising-readiness-review` | worktree attached        |         yes         |                       0                        | none                  |
| `codex/default-knowledge-starters`   | worktree attached        |         yes         |                       0                        | none                  |
| `codex/local-prod-snapshot`          | worktree attached        |         yes         |                       0                        | none                  |
| `.worktrees/local-prod-preview`      | detached HEAD `b583b138` |         yes         |                       0                        | none (see below)      |
| `feat/advertising-dashboard-clarity` | no worktree              |         no          |                     **1**                      | **4 files, +608/−42** |

**What is actually blocking.** The three `codex/*` branches **are** ancestors of `main`, so `git branch -d` accepts them. They are leftovers because the repository has **no cleanup procedure at all** — `AGENTS.md` § "Hard rules" and § "Conventions" both demand _"No finished work sits in a dirty tree or stale branch"_ and neither the repo nor the tooling offers a mechanism, so four entries accumulated. Their three attached worktrees need `git worktree remove`, which is likewise undocumented.

**The one genuine git-level blocker** is `.worktrees/local-prod-preview`. It sits at `b583b138` — an ancestor of `main` — with 13 dirty paths, and `git worktree remove` refuses a worktree with uncommitted changes. Its content turns out to be a stale copy of work that has since landed in `main`:

| Dirty paths                                                                                                                                             | Verdict                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 8 files (`knowledge-library.tsx`, `server.ts`, `tools.ts`, `api/ai/workspace-assistant/route.ts`, `en/workspaceAssistant.json`, both architecture docs) | **byte-identical to `main`**                                                                                                                                         |
| 2 files (`knowledge/route.ts`, `ar/workspaceAssistant.json`)                                                                                            | differ **only in whitespace** — the worktree copy is unformatted, `main` is Prettier-formatted                                                                       |
| `default-knowledge.ts`                                                                                                                                  | `main` holds the **later** revision — same 9 entry keys, but refined Arabic copy and an extra `وشروط الاستخدام` (terms of use) coverage area the worktree copy lacks |
| `AGENTS.md`, `PRODUCTION_READINESS_TRACKER.md`                                                                                                          | older snapshots — `main` is strictly newer                                                                                                                           |

So the worktree is a stale copy of the Workspace AI Assistant work that has since landed in `main` in a better form. **Nothing unique is at risk** — but nothing in the repository says so, and the only way to remove it is `git worktree remove --force`, which discards the very check that protects the operator. The script refuses it and names the three diverging files, because it cannot know that `main` is the _newer_ side of an Arabic copy revision.

**The forward-looking hazard — squash-merges break ancestry-based tests.** The three branches above were merged as real commits, so ancestry happened to work. That is not guaranteed in a repository that squash-merges: a squash-merged branch is only _patch-equivalent_ to `main`, never an ancestor, and `git branch -d` refuses it. This was verified against a synthetic squash-merge, where `git branch -d` reports _"the branch is not fully merged"_ for a branch whose content is entirely in `main`. Any cleanup procedure that relies on ancestry alone will therefore mis-report safely-merged branches as unmerged — and an operator who "fixes" that with `git branch -D` discards the merge check the command exists to provide.

**Fix shipped.** `scripts/cleanup-worktrees.sh` decides containment by **ancestry first, then patch equivalence plus a per-file content comparison** — so it is correct for both merge styles. It refuses `main`, refuses the current branch, refuses dirty worktrees, reports by default, and removes only on an explicit flag. A worktree whose uncommitted content is already in the base ref is classified as a _stale snapshot_ and can be discarded with `--discard-stale`; a worktree carrying genuinely unique content is never discarded. `AGENTS.md` gains the branch/worktree lifecycle rule that was missing entirely.

## 4. F3 — the release path is described three ways

Three surfaces disagree about how a release happens:

| Surface                                                                | Says                                                                                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `AGENTS.md` § "Quick start"                                            | `./scripts/deploy.sh <full-sha>` — _"deploys the exact 40-char SHA **built and published locally**"_                                |
| `AGENTS.md` § "Hard rules"                                             | merge → push `main` → **dispatch CI on `main`** → dispatch **Deploy** on `main`                                                     |
| `docs/operations/runbook.md` § "Local review, release, and deployment" | the local `docker buildx` + GHCR + `ssh` path is _"reserved for **recovery** when the manually dispatched CI build is unavailable"_ |

An operator following the quick start builds and publishes locally, then deploys — bypassing the CI dispatch the hard rules require. An operator following the runbook dispatches CI. Nothing says which is normal, and the failure mode of guessing wrong is a release that skipped a gate.

**Fix shipped.** `docs/operations/release.md` is the one canonical path, and every other surface points at it: merge → cleanup → push → dispatch CI → dispatch Deploy → verify → record. The local buildx path is named explicitly as the **fallback** for when the CI build is unavailable, and is no longer described as the normal path in the quick start.

## 5. F4 — the evidence-recording tax

`PRODUCTION_READINESS_TRACKER.md` is **501,647 bytes** and `docs/production-readiness/TEST_EVIDENCE.md` is **4,578 lines**. The cause is the format the release rules mandate: each deploy appends a dense multi-sentence paragraph — exact SHA, run IDs, every gate result, risk acceptance, open items — to both files.

Roughly the first six lines of the tracker's current header are _four separate deploy narratives_, and they disagree in tone and completeness. The information is duplicated across the tracker, `TEST_EVIDENCE.md`, `MIGRATION_DEPLOYMENT.md`, and `UAT_RELEASE.md`.

**Fix shipped.** Routine releases record **one row** in the deploy log (`docs/operations/READY_TO_DEPLOY.md` §"Deploy log"), and the tracker carries a narrative only when a gate failed, was waived, or the release carried a risk acceptance. The substantive gate stays: a waived release still gets a full written record, which is exactly the case where the prose has value.

`docs/contributing/release-checklist.md` § 4 already points at a §"Deploy log" in `READY_TO_DEPLOY.md` — **that section does not exist** (the file has an "Owner-action log" instead). The dangling reference is what makes this cheap: the surface was already chosen, it was never written.

## 6. F5 — duplicate ADR numbers and one broken reference

`docs/decisions/` contains three duplicated numbers: `0005-platform-aware-social-metric-contract.md` / `0005-platform-role-permissions.md`, `0010-meta-publishing-readiness.md` / `0010-r2-agency-storage.md`, `0016-agency-tasks-and-global-calendar.md` / `0016-ephemeral-publication-expiry.md`. `docs/architecture/migrations.md` § 1 instructs the reader to consult _"the ADR template (see `docs/decisions/0005-platform-role-permissions.md` for a worked example)"_ — so the ambiguity reaches into the migration gate.

Separately, `docs/superpowers/plans/2026-09-02-platform-aware-social-analytics.md` (5 references) points at `docs/decisions/0005-platform-aware-social-metrics.md`, **a file that has never existed**; the real file is `0005-platform-aware-social-metric-contract.md`.

**Fix shipped.** The reference to the non-existent file is corrected.

The three duplicate numbers are resolved by an **index**, not by renumbering: `docs/decisions/README.md` maps every number to its slug, title, and date, so "the ADR for X" is answerable and the slug is documented as the unique identifier.

Renumbering was considered and rejected. Moving a September 2026 decision to a number in the 0025+ range would make it appear to have been taken after ADR 0024 (this change set) — inventing a false decision ordering in a repository whose release gates cite ADRs by number. The index removes the ambiguity at the cost of three reused numbers that are now enumerated, and it carries no risk of breaking a citation in a file the search did not reach.

## 7. What is _not_ wrong, and should not be touched

These are correct, and the simplification keeps every one of them intact:

- **The hard deployment controls** — branch protection, exact-SHA images, provider preflight, pre-migration backup, readiness check, automatic rollback (`AGENTS.md` § "Explicit user-requested merge and deployment").
- **The independent review itself** — F1 removes the _form_ requirement, not the review.
- **The security-review checklist** — IDOR, transaction boundaries, audit rows, tenant isolation (`docs/contributing/pr-review-checklist.md` §1–§4). These are the strongest part of the instruction layer.
- **`pnpm verify` before push** and the pre-commit / pre-push hooks.
- **Migration discipline** — registered journal entries, additive-only, drill evidence.
- **The `Tested` → `Verified` split** between implementation and review.

## 8. One thing that will still cost time, and is not a documentation problem

The **pre-push hook** runs affected unit + integration tests against `TEST_DATABASE_URL`, defaulting to `postgresql://planner:planner_dev_only@127.0.0.1:5432/planner_test`. `AGENTS.md` § "Local disposable test database" documents the trap correctly: if a native Postgres is already bound to `127.0.0.1:5432`, the more specific loopback bind wins over Docker's `0.0.0.0`, every check runs against the **wrong server**, and `docker exec … pg_isready` still passes — the failure only surfaces as `database "planner_test" does not exist` on a database that was just created.

The documentation already names the trap; the missing piece is that the check is opt-in. `psql "$TEST_DATABASE_URL" -tAc 'select current_database()'` before trusting a push result should be part of the release path, not a note.

## 9. Recommendation

Ship the four mechanical fixes (F1–F4) plus the ADR numbering repair (F5) as one reviewed change, then adopt `docs/operations/release.md` as the single path. The gates that protect production data — backup, rollback, exact-SHA images, preflight, audit, tenant isolation — stay exactly as they are; what changes is that a normal merge no longer requires a waiver narrative, and a merged branch can actually be deleted.

**Cost:** one documentation-and-script change set, no product code, no schema, no migration, no deploy-control change.
**Risk:** low and reversible. ADR 0024 records the decision and the rollback.

**Status: shipped.** ADR 0024 landed, and ADR 0025 then removed the merge prerequisites outright. The gates that protect production data are unchanged, and the hard deployment controls still apply and still block.
