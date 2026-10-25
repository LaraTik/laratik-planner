# Release path — merge, cleanup, push, deploy

> **This is the canonical release path.** It supersedes the release procedure scattered across `AGENTS.md` (quick start, hard rules, conventions), `docs/operations/runbook.md` (§ Local review, release, and deployment), and `docs/contributing/release-checklist.md`. Those surfaces remain correct but now point here.
>
> **Decisions:** `docs/decisions/0021-local-review-and-release.md` (local review and release), `docs/decisions/0022-main-only-hosted-image-build-and-deploy.md` (main-only hosted build and deploy), `docs/decisions/0024-release-path-and-review-evidence.md` (this path, the cleanup rule, and the review-evidence form).
>
> **Scope:** one ordered path, no options. Step 6 records the deploy. Nothing in this path weakens a hard deployment control: branch protection, exact-SHA images, provider preflight, pre-migration backup, readiness check, and automatic rollback all still apply and all still block.

## 0. Before you start

```bash
cd /Users/mohamad.nezam/Documents/Personal/laratik-planner
git status --short          # must be empty
git rev-parse --abbrev-ref HEAD
```

**Success criteria:** the tree is clean and you are on the branch you intend to release. A dirty tree invalidates every recorded gate result.

**Do not** run `docker compose down -v` anywhere, and do not point `TEST_DATABASE_URL` at `planner` or any production database.

## 1. Verify the change on the exact SHA

```bash
pnpm verify
```

Runs `format:check → lint → typecheck → test:unit → build`.

Then, **only for the change type in scope**:

| Change type                              | Additional gate                                                                                      |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Any database or schema change            | `NODE_ENV=test pnpm migration-drill` (5 scenarios, disposable Postgres 16)                           |
| User-facing UI or localization           | affected bilingual browser + accessibility + visual checks — `pnpm test:affected -- --layer browser` |
| Release candidate (broad shared surface) | `pnpm test:e2e:release` (full 5-browser + visual matrix)                                             |

**Success criteria:** `pnpm verify` green on the exact clean commit SHA, and every in-scope additional gate green on that same SHA.

> If the branch advances or the tree becomes dirty after this point, the affected gates are void and must be rerun.

## 2. Review

The implementation agent moves work to **`Tested`** and stops there. A **reviewer who is not the code author** moves it to **`Verified`**.

The reviewer confirms every box in `docs/contributing/pr-review-checklist.md` and records the result — reviewer identity, date, and the exact SHA. The record may be a GitHub PR review **or** a local review record in the evidence file; the form is not what the gate protects, independence is.

**Success criteria:** the checklist is confirmed by a reviewer who did not write the code, and the reviewer, date, and SHA are recorded.

> **Never** assign `Verified` without that review, and never let the implementation agent self-certify. The review itself is unchanged by this document — only the _form_ of its record is.

## 3. Merge to `main`

```bash
git checkout main
git pull --ff-only origin main
git merge --squash <feature-branch>      # or: gh pr merge --squash
git commit -m "<type>(<scope>): <description>"
```

**Success criteria:** `main` holds the change, the tree is clean, and the merge is a single squash commit (repo convention — see `AGENTS.md` § Conventions).

## 4. Clean up merged branches and worktrees

```bash
./scripts/cleanup-worktrees.sh            # report only — safe, read-only
./scripts/cleanup-worktrees.sh --apply    # remove branches already contained in main
```

The script checks ancestry first, then falls back to **patch equivalence plus a per-file content comparison** — a squash-merged branch is only patch-equivalent to `main`, never an ancestor, so `git branch -d` refuses it. The script never touches `main`, never removes a dirty worktree, and never removes a branch that still carries unmerged work.

**Success criteria:** `git worktree list` shows only the main checkout, and `git branch` shows no stale feature branch.

> A branch that still carries real changes is **not** cleanup — it is unfinished work. Rebase it onto the new `main` and finish it. See `docs/audits/RELEASE_PROCESS_REVIEW_2026-10-25.md` §3.

## 5. Push

```bash
git push origin main
```

The pre-push hook runs the affected unit and integration checks for the pushed range against the disposable `planner_test` database.

**Verify the test database resolves to the intended server before trusting the result:**

```bash
psql "$TEST_DATABASE_URL" -tAc 'select current_database()'   # must print: planner_test
```

If a native Postgres is already bound to `127.0.0.1:5432`, it wins over Docker's `0.0.0.0` bind and every check silently runs against the wrong server. `docker exec … pg_isready` still passes in that case — the database name is the only reliable signal.

**Success criteria:** the push completes and the hook's affected checks passed against `planner_test`.

## 6. Build and publish images (CI, on `main`)

Dispatch the **CI** workflow with **`main`** selected:

```bash
gh workflow run ci.yml --ref main
gh run list --workflow ci.yml --branch main --limit 1
```

**Never dispatch a branch or PR ref.**

CI runs the main-only quality, unit, migration, audit, image-build and smoke jobs, and publishes the app and migrator images tagged with that exact `main` SHA.

**Success criteria:** the CI run is green for the exact `main` SHA, and both SHA tags exist:

```bash
docker buildx imagetools inspect "ghcr.io/laratik/laratik-planner:$DEPLOY_SHA"
docker buildx imagetools inspect "ghcr.io/laratik/laratik-planner-migrator:$DEPLOY_SHA"
```

### Fallback — local build, only when the CI build is unavailable

This path is the **fallback**, not the normal path. Use it only when the dispatched CI build cannot run.

```bash
DEPLOY_SHA="$(git rev-parse HEAD)"
APP_BUILD_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker buildx build --platform linux/amd64 \
  --build-arg "APP_VERSION=$DEPLOY_SHA" --build-arg "APP_BUILD_AT=$APP_BUILD_AT" \
  --tag "ghcr.io/laratik/laratik-planner:$DEPLOY_SHA" --push .
docker buildx build --platform linux/amd64 \
  --build-arg "APP_VERSION=$DEPLOY_SHA" --build-arg "APP_BUILD_AT=$APP_BUILD_AT" \
  --target migrator \
  --tag "ghcr.io/laratik/laratik-planner-migrator:$DEPLOY_SHA" --push .
```

**Before any local build:** check the Buildx VM's memory — `docker info --format '{{.MemTotal}}'`. Below 8 GiB, raise Docker Desktop's allocation (12 GiB on a 48 GiB host). The Next production build caps workers at two and the V8 heap at 3 GiB; raising the heap alone does not fix a BuildKit allocation failure.

## 7. Deploy

Dispatch the **Deploy** workflow with **`main`** selected:

```bash
gh workflow run deploy.yml --ref main
gh run list --workflow deploy.yml --branch main --limit 1
```

The workflow verifies successful CI for that commit and the existence of both SHA tags, then invokes the transactional VPS deployment: provider preflight → verified pre-migration backup → migrations → app recreate → readiness check → automatic rollback on failure.

**Direct VPS invocation** (when the Deploy workflow is unavailable and the exact-SHA images exist):

```bash
ssh laratik-vps
cd /opt/laratik-planner
git status --short          # stop if there are changes to preserve
DEPLOY_SHA="<full 40-char SHA>"
git fetch origin "$DEPLOY_SHA"
git checkout --detach "$DEPLOY_SHA"
./scripts/deploy.sh "$DEPLOY_SHA"
exit
```

**Success criteria:** the deploy run is green, and the public health endpoint reports the new SHA:

```bash
curl -fsS https://planner.laratik.com/api/health
# version matches the first 7 chars of DEPLOY_SHA, db: "up", schema: "ready"
```

## 8. Post-deploy verification

- [ ] `https://planner.laratik.com/` returns 200 with the new home-page `<title>`.
- [ ] `https://planner.laratik.com/api/health` returns `{"ok":true,"db":"up","env":"production",...}` with the new version.
- [ ] `https://planner.laratik.com/signin` returns 200 and renders the sign-in form.
- [ ] `https://planner.laratik.com/app` redirects (307) to `/signin?callbackUrl=%2Fapp`.
- [ ] `docker ps` shows `laratik-planner-app-1` as `(healthy)`.
- [ ] `docker logs laratik-planner-app-1 --tail 200` shows no new errors.
- [ ] If the release changed the Planner MCP, follow `docs/operations/mcp-maintenance.md`.

## 9. Record the deploy

**Routine release — one row**, in `docs/operations/READY_TO_DEPLOY.md` § "Deploy log":

| SHA | Date | Operator | CI run | Deploy run | Health version | Reviewer | Gates | Result |
| --- | ---- | -------- | ------ | ---------- | -------------- | -------- | ----- | ------ |

**Add the full narrative** to `PRODUCTION_READINESS_TRACKER.md` and `docs/production-readiness/TEST_EVIDENCE.md` **only when** a gate failed, a gate was waived, or the release carried a risk acceptance. That is the case where the prose carries information; a clean release does not need a paragraph to say nothing happened.

Then, if the release was a release candidate:

- Tag it: `git tag -a v<MAJOR>.<MINOR>.<PATCH> <sha> -m "<message>"`.
- Monitor for 60 minutes — the four Sentry alert rules in `docs/operations/observability.md` are the floor.

## 10. Waiving a gate

An explicit user request to **merge** or **deploy** the current release authorizes proceeding when local review evidence or readiness gates are incomplete.

- Record the authorization, the exact release SHA, the incomplete or failed gates, and the material impact/security/data risks.
- **A waiver is not a pass.** Keep the failed gate failed. Do not weaken a test, do not describe a failed gate as passed, and do not assign `Verified` or `READY` without the independent reviewer.
- The hard controls still apply and still block: branch protection, deployment-environment approvals, exact-SHA CI and images, provider preflight, pre-migration backup, readiness check, automatic rollback. If one of them fails, **stop and report the blocker**.

## 11. Rollback

The deploy script captures the previous application image and recreates the app from it automatically if the post-migration health check fails. No operator action is needed for a health-check rollback.

Manual rollback of a release that passed health but is otherwise broken:

```bash
ssh laratik-vps
cd /opt/laratik-planner
docker compose -p laratik-planner pull app
# pin the previous SHA in the docker-compose.yml `image:` line
docker compose -p laratik-planner up -d --no-deps app
curl -fsS https://planner.laratik.com/api/health
```

The Postgres schema is **forward-only**. Drizzle migrations are append-only — never edit an applied migration. If the rollback cause is a schema issue, write a forward-fix migration and re-deploy.

Record the rollback in `docs/operations/runbook.md` (timeline, operator, date) and in the deploy log. A rollback is a release-quality event, not a deploy-quality event.

## 12. Report back

After the release, report exactly these six items — nothing else:

1. **Release SHA** (full 40 chars) and the `main` commit it deployed.
2. **CI run URL** and **Deploy run URL**.
3. **Health** — the `version` reported by `/api/health`.
4. **Reviewer** — who signed the `pr-review-checklist.md` boxes, and whether the release was waived.
5. **Gates** — green / failed / waived, per gate, with the exact command for anything that failed.
6. **Cleanup** — the branches and worktrees removed, and any branch still carrying unmerged work.
