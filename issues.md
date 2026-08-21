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
  CI green). `verifier` for P0 only.
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

### #1 — Brand Kit: no CRUD per section, doesn't match Stitch design

- **Severity:** P1 (entire feature surface is incomplete; not a deploy blocker
  but blocks a Goal 4 milestone)
- **Type:** missing-feature + polish
- **Reported:** 2026-08-21 13:22 by user
- **Status:** 🚧 **Round 1 of 3 shipped (2026-08-21 15:35)**
- **Sub-issue: Goal 4 status** is ⏳ in `AGENTS.md`; this is effectively a
  Goal 4 implementation kickoff, not a regression.

#### Round 1 — shipped

3 atomic commits on `main` (`dc8c951`):

- `439a52d` — A: Zod schemas (`src/lib/brand/command.ts`) + service helpers (`src/lib/brand/service.ts`) + 60 unit tests
- `ab47b3a` — B: Pillars + Recent Updates sections rendered (read-only)
- `dc8c951` — C: Color Palette + Voice CRUD with inline forms (server actions + client forms + 15 tests)
- **CI:** green. **Deploy:** green (run 32479101590). **Tests:** 75/75 passing.

#### Round 2 — pending

- D: Logo CRUD with local-volume storage adapter + signed URL (per user choice: option A)
- E: Typography CRUD (role + weight metadata + live sample)

#### Round 3 — pending

- F: Publishing Rules + Linked Resources (two new tables per user choice: option A)
- G: Stitch 12-col Bento composition refactor
- H: E2E administration journey test

#### Visual parity

Stitch Bento composition is deferred to commit G. The current 2-col + left-rail layout still differs from the Stitch capture (`designs/stitch/16aaf0a9_northstar-coffee---brand-kit.html`).

---

### #2 — Brand Kit side nav UI/UX + R2/R3 + settings-wide polish backlog

- **Severity:** P1
- **Type:** missing-feature (Logo + Typography CRUD) + polish (side nav, sub-pages)
- **Reported:** 2026-08-21 15:39 by user
- **Status:** 🟡 planning → dispatching R2
- **Sub-issues:**
  - Side nav (`page.tsx:72-88`): 200px left-rail is ugly and takes unwanted space.
    Fix = replace with Stitch top-tab strip (5 tabs) in commit G.
  - Logo CRUD missing → commit D (with local-volume storage adapter).
  - Typography CRUD missing → commit E (role + weight + live sample).
  - Bento visual alignment → commit G.
  - Publishing Rules + Linked Resources (new tables) → commit F.
  - E2E administration journey → commit H.
- **Settings-wide polish backlog (LATER, after Brand Kit ships):**
  - Channels page, Team page, Users page, Agency Settings, Workspace Settings
  - Each gets a parity pass against its Stitch capture using the patterns in
    `docs/design/SETTINGS_UI_LEARNINGS.md`
- **Decisions locked 2026-08-21:**
  - UI/UX scope (now) = Brand Kit only; settings-wide = later
  - Side nav = Stitch top tabs (5 tabs, not left rail)
  - Storage = local volume + signed URL (option A)
  - Schema = two new tables for Publishing Rules + Links (option A)
  - Execution = staged (R2 first, then R3)

#### Learnings doc

`docs/design/SETTINGS_UI_LEARNINGS.md` (NEW) — patterns captured during
Brand Kit R2/R3 work, to be referenced by the future settings-wide polish
pass. Worker for R3 must update this doc as part of commit G.

---

### Update 2026-08-21 16:21 — R2 shipped, R3 + settings polish in flight

**R2 SHIPPED to main:** `6d7e48d` (chore) on top of `d075841` (Typography) on top of `03c9db9` (Storage + Logo). Pushed to origin/main. pnpm verify green in isolated worktree before merge; chore commit added missing deps + Event type annotation to unblock pnpm verify after the other agent's in-flight work pulled in un-typed code.

**R3 in flight** in worktree `/Users/mohamad.nezam/Documents/Personal/laratik-planner-r3` on branch `feat/brand-kit-r3`:

- G: Stitch 12-col Bento composition + Stitch top tabs (the side nav fix the user originally flagged)

**Settings-wide polish in flight** in worktree `/Users/mohamad.nezam/Documents/Personal/laratik-planner-settings` on branch `feat/settings-polish`:

- First pass: channels, team, settings, agency-settings (4 most user-facing pages)
- Library / planning / reviews / ai-settings / design-queue → follow-up pass
- Driven by `docs/design/SETTINGS_UI_LEARNINGS.md` patterns

**Other agent's parallel work** continues unimpeded in the main worktree (last seen: 5 commits ahead of R1, working on password sign-in + user-management + channels edit drawer + workspace switcher popover).
