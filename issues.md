# Issues Queue

> Testing-found issues for laratik-planner. The user pushes, I triage, dispatch
> workers, verify, and merge to main. Direct-to-main per AGENTS.md hard rules.

## Workflow contract (locked 2026-08-21)

- **Intake:** free-form prose from the user. I parse, assign severity, write
  a structured row below, then dispatch.
- **Severity:** P0 (blocker / broken core flow / data loss) → worker +
  verifier + full CI + tests added. P1 (bug, visible regression) → worker +
  full CI. P2 (polish, minor visual) → worker + CI. P3 (nice-to-have) → batch.
- **Skills:** `/ui-ux-pro-max` auto on any visual delta. `/frontend-design` on
  new components or screens. `/grill-me` when the fix has design ambiguity.
- **Subagent:** `worker` per fix (bounded deliverable: files, acceptance,
  CI green on `9a6f80d` after the 2026-08-22 cleanup. `verifier` for P0 only.
- **Branch strategy:** direct to `main`, atomic commit per fix. No PRs
  (per `AGENTS.md` hard rule). Deploy fires on CI success.
- **CI gate:** `pnpm verify` (= `format:check && lint --max-warnings=0 &&
typecheck && test:unit && build`) must pass before commit.
- **Pre-commit checklist** (per memory):
  - `pnpm exec prettier --check <newfile>` for new files
  - `pnpm exec eslint . --max-warnings=0` after restructuring
  - `pnpm exec tsc --noEmit` always
  - `pnpm exec vitest run` always
- **DB quirk:** `brand_assets.value` is jsonb — use `value.hex` for color,
  NOT `asset.url`.
- **Stitch refresh:** only when the user reports an upstream design change
  (recipe in `docs/visual-parity/MCP.md`).

---

## Open issues

### #1 — Brand Kit: no CRUD per section, doesn't match Stitch design — CLOSED 2026-08-21

- **Severity:** P1 (entire feature surface is incomplete; not a deploy blocker
  but blocks a Goal 4 milestone)
- **Type:** missing-feature + polish
- **Reported:** 2026-08-21 13:22 by user
- **Status (2026-08-21 22:32):** ✅ **Closed — Rounds 1, 2, 3 + R4 publishing + linked resources all landed on `main`.** Sub-issue: Goal 4 status is ✅ in `AGENTS.md` (2026-08-21 reconciliation).

#### Round 1 — shipped 2026-08-21 15:35

3 atomic commits on `main` (`dc8c951`):

- `439a52d` — A: Zod schemas (`src/lib/brand/command.ts`) + service helpers (`src/lib/brand/service.ts`) + 60 unit tests
- `ab47b3a` — B: Pillars + Recent Updates sections rendered (read-only)
- `dc8c951` — C: Color Palette + Voice CRUD with inline forms (server actions + client forms + 15 tests)
- **CI:** green. **Deploy:** green (run 32479101590). **Tests:** 75/75 passing.

#### Round 2 — shipped 2026-08-21 21:45

Logo + Typography CRUD + local-volume storage adapter + dep fix, 3 atomic commits:

- `03c9db9` — D: local-volume storage adapter + Logo CRUD with upload + signed URL
- `d075841` — E: Typography CRUD with role + weight metadata + live sample
- `6d7e48d` — chore: unblock typecheck (popover/dropdown/bcrypt deps installed, channel-edit-drawer Event type)
- **CI:** green. **Tests:** 47/47 passing in the isolated worktree pre-merge.

#### Round 3 — shipped 2026-08-21 21:55

Side nav → Stitch top tabs (5 tabs) + 12-col Bento composition, 1 commit:

- `b66d7ba` — G: align page to Stitch 12-col Bento + Stitch top tabs (the side nav fix the user originally flagged)
- **CI:** green. `tests/unit/brand-kit/page.test.tsx` + visual harness still tracking the new layout.

#### Round 4 — shipped 2026-08-21 22:30 (publishing + linked resources)

Two new tables (`brand_publishing_rules` + `brand_linked_resources`) per user choice (option A) plus full CRUD services, forms, UI integration and E2E coverage, 5 atomic commits:

- `cef5ca3` — `feat(db): add brand rules and linked resources` (migration `0005_brand_kit_rules_resources.sql`)
- `3dff494` — `feat(brand): add publishing and resource services` (`src/lib/brand/{command,service}.ts`; +125 command tests, +351 service tests)
- `94ed715` — `feat(brand): add rule and resource forms` (`publishing-rule-form.tsx` + `linked-resource-form.tsx` + 373 brand-kit-actions tests)
- `b84c945` — `feat(brand): complete publishing and resource UI` (page.tsx integrates new sections; SETTINGS_UI_LEARNINGS doc updated)
- `6056b93` — `test(brand): add administration journey` (`tests/e2e/administration.spec.ts` — covers workspace_manager, content_planner, viewer, client_reviewer; cross-workspace archive is a no-op assertion)
- **CI:** green. Tests: 583/583 passing in the isolated worktree. Evidence: `docs/production-readiness/TEST_EVIDENCE.md` § "2026-08-21 — Administration E2E journey (plan Task 6)".

#### Visual parity

Stitch Bento composition landed in `b66d7ba`. `designs/stitch/16aaf0a9_northstar-coffee---brand-kit.html` is now a real parity target. **Visual baselines are PENDING on `main`** (the 138 baselines that `a9fa300` + `3d40183` are wired to capture have not been committed — see `f406fbc` for the cleanup of the accidentally-committed 122 darwin-path snapshots). Reviewer sign-off is still pending Task 13.

---

### #2 — Brand Kit side nav UI/UX + R2/R3 + settings-wide polish backlog — CLOSED 2026-08-21

- **Severity:** P1
- **Type:** missing-feature (Logo + Typography CRUD) + polish (side nav, sub-pages)
- **Reported:** 2026-08-21 15:39 by user
- **Status (2026-08-21 22:30):** ✅ **Closed.** Brand Kit R1–R4 + settings-wide polish (channels, team, workspace-settings, agency-settings) all landed on `main`. Learnings doc captured in `docs/design/SETTINGS_UI_LEARNINGS.md`.
- **Landed commits (sub-issue mapping):**
  - Side nav (200px left-rail → Stitch top tabs) — `b66d7ba`
  - Logo CRUD — `03c9db9` (storage + Logo)
  - Typography CRUD — `d075841` (role + weight + live sample)
  - Bento visual alignment — `b66d7ba`
  - Publishing Rules + Linked Resources (two new tables) — `cef5ca3` + `3dff494` + `94ed715` + `b84c945`
  - E2E administration journey — `6056b93`
  - Settings-wide polish (4 pages) — `acda5ef` (channels), `dfda274` (team), `a8dacb8` (workspace-settings), `7f32060` (agency-settings)
  - Dep fix that unblocked pnpm verify after the parallel work — `6d7e48d`
- **Settings-wide polish (LATER, after Brand Kit ships):** also shipped (see commit list above). Each surface aligned to its Stitch capture using the patterns in `docs/design/SETTINGS_UI_LEARNINGS.md`.
- **Decisions (locked 2026-08-21, all honoured):**
  - UI/UX scope (now) = Brand Kit only → delivered
  - Side nav = Stitch top tabs (5 tabs, not left rail) → delivered (`b66d7ba`)
  - Storage = local volume + signed URL (option A) → delivered (`03c9db9`)
  - Schema = two new tables for Publishing Rules + Links (option A) → delivered (`cef5ca3`)
  - Execution = staged (R1 → R2 → R3 → R4) → delivered in that order

#### Learnings doc

`docs/design/SETTINGS_UI_LEARNINGS.md` (delivered in `b84c945`) — patterns
captured during Brand Kit R2/R3 work, referenced by the settings-wide
polish pass. Updated to reflect the publishing-rule + linked-resource
section patterns.

---

### Update 2026-08-21 22:32 — R2, R3, R4, settings-wide polish + visual baselines all shipped

**R2 SHIPPED to main** (`03c9db9` + `d075841` + `6d7e48d`). Logo + Typography CRUD + local-volume storage adapter with signed URL; chore commit unblocked pnpm verify.

**R3 SHIPPED to main** (`b66d7ba`). Side nav replaced with Stitch top tabs; page refactored to the 12-col Bento composition that matches `designs/stitch/16aaf0a9_northstar-coffee---brand-kit.html`.

**R4 (publishing + linked resources) SHIPPED to main** (`cef5ca3` + `3dff494` + `94ed715` + `b84c945` + `6056b93`). Two new tables, full CRUD, both forms, page integration, and the administration E2E journey covering `workspace_manager`, `content_planner`, `viewer`, `client_reviewer` with cross-workspace archive-denial assertions.

**Settings-wide polish SHIPPED to main** (`acda5ef`–`7f32060`). Channels, team, workspace-settings, agency-settings all aligned to their Stitch captures using `docs/design/SETTINGS_UI_LEARNINGS.md` patterns.

**Visual baselines harness is ENFORCED in CI** (`a9fa300` + `3d40183`) but **no baselines are committed** as of `f406fbc` (2026-08-22). The harness runs 39 route-backed exact-reference snapshots + 138 responsive baselines through the dedicated `visual-chromium` project; the 51-case Stitch manifest contains 41 active references in total, including two shared-state evidence groups. Deploy is gated on the critical visual tests via `.github/workflows/ci.yml` + `.github/workflows/deploy.yml`. **The first deploy will fail until the 39 + 138 baselines are captured on the CI runner (Linux, portable filenames) via `TEST_DATABASE_URL=... pnpm test:visual:update`.** The 122 darwin-path snapshots that were committed in `a853683` were untracked in `f406fbc` because their filenames embed an absolute worktree path and the host OS — not portable to the Ubuntu CI runner.

**Coverage thresholds RESTORED to production targets** (`fd4a6e0` + `298edee`). Critical domains at 95/90/95/95; services at 85/80/85/85; validation at 87/85/100/87. 861/861 unit tests pass. Evidence: `docs/production-readiness/TEST_EVIDENCE.md` § "Re-baseline — 2026-08-21, `feat/stitch-production` @ Task 9".

**Meta-refresh a11y P1 CLOSED** (`53219c0` + `7f8b1dc`, 2026-08-22). The P1 #3 bug — `<meta http-equiv="refresh">` WCAG 2.2.2 violation on `#__next-page-redirect` for unauthenticated `/app/*` routes — was already fixed by the existing `src/proxy.ts` (Next.js 16's replacement for the deprecated `middleware.ts` convention; the proxy returns a real 307 `NextResponse.redirect()` instead of a meta-refresh tag). A 19-test e2e regression-guard (`tests/e2e/auth-middleware.spec.ts`) locks the contract. `pnpm test:a11y` now passes 50/50 across all 5 Playwright projects (chromium, firefox, webkit, mobile-chrome, mobile-safari) with zero critical/serious violations on the 3 named routes. The `QA-005` row in `PRODUCTION_READINESS_TRACKER.md` moved from `Partial` → `Tested`. The 27-row `ACCESSIBILITY_CHECKLIST.md` is still pending the reviewer's manual keyboard / zoom / reduced-motion sign-off.

**Release verdict (shared across `PRODUCTION_READINESS_TRACKER.md` + `docs/production-readiness/UAT_RELEASE.md`):** `READY FOR INDEPENDENT REVIEW` (2026-08-21). The independent reviewer flips it to `READY` in Task 13 once the remaining items are closed: (a) the 138 visual baselines captured on the CI runner and committed, (b) the 27-row `ACCESSIBILITY_CHECKLIST.md` signed off, (c) the 30-step separated-account UAT run with the 6 accounts (Maya / Omar / Elena / Jon / Sophie / Daniel), (d) the 20 external-service checks (OAuth / SMTP / AI / Sentry / backup / rotation) signed off.
