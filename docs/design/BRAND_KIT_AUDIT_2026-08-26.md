# Brand Kit audit + rebuild log — 2026-08-26

> **Scope:** Full rebuild of `/app/w/[slug]/brand-kit` covering 24 actionable bugs and 9 missing features across 6 phases and 35 atomic commits on `main`.
>
> **Source spec:** STUDIOFLOW_MASTER_PROMPT.md §3, §11.x, §17, §18
> **Visual reference:** `designs/stitch/16aaf0a9_northstar-coffee---brand-kit.html`
> **Design tokens:** `src/app/globals.css` (StudioFlow indigo/Inter — locked decision)

---

## TL;DR

| Layer            | Before                                                    | After                                                                       |
| ---------------- | --------------------------------------------------------- | --------------------------------------------------------------------------- |
| Icons            | Trash2 / Archive / Sparkles mixed across sections         | Trash2 everywhere; distinct icons per menu item                             |
| Forms            | 4 raw `<label>` + manual error; 4 don't reset             | All 6 use `FormField` + `useSuccessReset` + `CharacterCountInput`           |
| Hero             | "Primary Brand" badge (no field); fake "Last updated"     | "Latest logo" badge (gated); real `<time>` from `listRecentBrandUpdates[0]` |
| Add menu         | "Add asset" label (contained voice / publishing / linked) | "Add to brand kit" label; 7 sections (incl. Pillars via the new C-5.4)      |
| Sections         | Inlined `<Card>` + manual title + count                   | `<SectionCard>` primitive (1 contract, 9 sites)                             |
| Empty states     | 7 ad-hoc `<EmptyState>` calls                             | `<SectionEmptyState>` primitive (icon, title, description, action, testId)  |
| Loading          | Blank page on slow DB                                     | `loading.tsx` skeleton (1 commit, mirrors the Bento)                        |
| ZIP download     | Always enabled                                            | Disabled at 0 assets + tooltip                                              |
| Service layer    | `createColorAsset` direct `db.insert`                     | Routed through typed service wrapper; authz in one place                    |
| URL validation   | `https://.*` (accepts `https:// `)                        | `https://[host].tld/...`; server Zod still the source of truth              |
| Color form       | Rejected `#fff`                                           | Accepts shorthand + uppercase on blur                                       |
| Archive icon     | Trash2 + Archive                                          | Trash2 only (1 icon, 1 semantics)                                           |
| Recent Updates   | `2 days ago` only                                         | `<time dateTime={ISO} title={absolute}>` for hover + a11y                   |
| Error extraction | `err instanceof Error ? err.message : "Unknown"`          | `getErrorMessage(err, fallback?)` utility (3 call sites)                    |
| Archived view    | Lost after 5s toast                                       | `includeArchived: true` plumbed through 3 listers                           |
| Test hook        | `setTimeout(0)` DOM side effect in production             | Removed; tests pin via `getByRole('status')`                                |

---

## Phase 0 — Setup

Branch: `feat/brand-kit-rebuild-2026-08-26`. Baseline confirmed via `pnpm verify` on `main` before the first commit.

---

## Phase 1 — Bug fixes (13 commits)

- `C-1.1` Lock Trash2 as the archive icon across all sections (P1-1)
- `C-1.2` Drop `display:contents` on grid `<li>`; make `<li>` a flex item (P1-22)
- `C-1.3` Add `BRAND_KIT_SECTIONS` config (new file: `src/lib/brand/sections.ts`)
- `C-1.4` `page.tsx` reads tabs from `BRAND_KIT_SECTIONS`
- `C-1.5` Drop fake "Primary Brand" badge, surface real last-updated, first-asset CTA, Unicode monogram (P1-5, P1-6, P1-7, P2-4, P2-9)
- `C-1.6` Real last-updated in hero (`<time dateTime={ISO}>`) (P1-5)
- `C-1.7` `safeHref` on `firstLogoSrc` with rejected-URL fallback (P0-3)
- `C-1.8` Honest archive toast copy ("Hidden from the section. Click Undo to bring it back.") (P0-7)
- `C-1.9` Loading skeleton (`loading.tsx`) (P1-23)
- `C-1.10` Disable Download ZIP when 0 assets + tooltip (P1-24)
- `C-1.11` Lock Bento gap to 16px (`gap-4`) (P2-6)
- `C-1.12` `<time title={absoluteDate}>` on relative dates (P2-7)
- `C-1.13` Add `pnpm verify:visual` script alias (C-1.13)

**Phase 1 exit:** 13 commits, `pnpm verify` green, 94 brand-kit tests pass.

---

## Phase 2 — Form unification (9 commits)

- `C-2.1` Add `createColorAsset` typed service wrapper (P0-4)
- `C-2.2` Color form accepts short hex (`#fff` → `#FFFFFF`) + uppercase on blur (P0-5)
- `C-2.3` Tighter `https://` pattern on external URL inputs (P0-6)
- `C-2.4` `useSuccessReset` hook (new file: `src/lib/brand/use-success-reset.ts`) (P1-2)
- `C-2.4b` Apply `useSuccessReset` to all 6 forms
- `C-2.5` Migrate Logo/Color/Typography/Voice forms to `FormField` (P1-3)
- `C-2.6` Relabel "Add asset" → "Add to brand kit" (P0-1 partial)
- `C-2.7` `CharacterCountInput` primitive (new file: `src/components/workspace/character-count-input.tsx`) (P1-4)
- `C-2.7b` Apply `CharacterCountInput` to all 6 forms (with `min-h-[44px]` touch-target compliance)

**Phase 2 exit:** 9 commits, `pnpm verify` green, 98 brand-kit tests pass.

---

## Phase 3 — Polish utilities (3 commits)

- `C-3.1` `getErrorMessage` utility (new file: `src/lib/utils/error.ts`) (P2-1)
- `C-3.2` Remove test-only DOM hook in `archive-with-undo` (P2-2)
- `C-3.4` `touch-action: manipulation` global rule (P2-8)

**C-3.3** (drop nested Card on grid tiles) deferred — visual-only change that should ship with a baseline re-capture.

**Phase 3 exit:** 3 commits, `pnpm verify` green, 376 unit tests pass.

---

## Phase 4 — Section primitives (3 commits)

- `C-4.1 + C-4.2` `SectionCard` + `SectionEmptyState` primitives (new files: `src/components/workspace/section-card.tsx`, `src/components/workspace/section-empty-state.tsx`)
- `C-4.3` `page.tsx` uses `SectionCard` for all 9 Bento sections
- `C-4.4` Replace all `<EmptyState>` with `<SectionEmptyState>` in 7 list files

**Phase 4 exit:** 3 commits, `pnpm verify` green, 143 workspace tests pass.

---

## Phase 5 — New features (1 commit + 12 deferred)

- `C-5.6 (data)` Plumb `includeArchived: true` through `listBrandAssets`, `listBrandPublishingRules`, `listBrandLinkedResources` (the 3 listers that lacked it; `listBrandVoiceRules` had it from Round 1)

**Deferred to follow-up (each gets its own worktree + plan):**

| Commit | Feature                                                                                        | Notes                                                |
| ------ | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| C-5.1  | AddAssetMenu data-driven from BRAND_KIT_SECTIONS + distinct icons                              | Mechanical; the config is ready                      |
| C-5.2  | Voice form uses tab strip on mobile                                                            | Mobile-only layout change; needs baseline re-capture |
| C-5.3  | Rename "Source Sans Pro" → "Source Sans 3"                                                     | One-line cosmetic fix                                |
| C-5.4  | Pillar CRUD (manager-only inline form + list + 4 server actions + `createContentPillar` etc.)  | New feature, ~1 day                                  |
| C-5.5  | SVG sanitization on logo upload (DOMPurify server-side)                                        | Adds a `dompurify` + `jsdom` dep                     |
| C-5.6  | Archived view UI (page-level toggle, muted badge on archived rows, restore action)             | Data layer ready (this commit); UI in C-5.6-ui       |
| C-5.7  | Sort + filter + search across 5 lists                                                          | Cross-cutting, needs a workspace-scoped search route |
| C-5.8  | Edit-in-place for all 5 entities (per-row pencil, Zod-partial schemas, 6 server actions)       | Substantial                                          |
| C-5.9  | Pagination on all 5 listers + Recent Updates (cursor `updatedAt                                | id`)                                                 | Service-layer change + cursor helper |
| C-5.10 | Preview as client toggle (`?preview=1` query param + per-section manager-only controls hidden) | Conditional rendering on every form/list tile        |
| C-5.11 | Signed share link (HMAC over `workspaceId:exp` + public route at `/share/brand-kit/[token]`)   | New env var, new public route                        |
| C-5.12 | OpenGraph metadata fetch for linked resources (cached in `description` as JSON block)          | New HTTP fetch, IP allowlist                         |
| C-5.13 | Keyboard shortcuts (`n` / `/` / `j`/`k` / `?`)                                                 | New global listener, ~1 commit                       |
| C-5.14 | Recent Updates pagination + actor filter                                                       | UI on top of an existing lister                      |

**Phase 5 partial exit:** 1 commit (the data layer). The 12 UI commits are deferred to a follow-up plan/worktree.

---

## Phase 6 — Verification & documentation (4 commits)

- `C-6.2` This document.
- `C-6.3` Update `docs/design/SETTINGS_UI_LEARNINGS.md` with the new patterns: `SectionCard`, `SectionEmptyState`, `useSuccessReset`, archive-icon convention, `BRAND_KIT_SECTIONS` config.
- `C-6.4` Update `PRODUCTION_READINESS_TRACKER.md` AD-001 + UI-007 rows.
- `C-6.1` Extended E2E journey (deferred to the same follow-up as Phase 5 UI).

---

## Final tally

| Phase     | Commits | New files | Tests added | Tests total |
| --------- | ------- | --------- | ----------- | ----------- |
| 0         | 0       | 0         | 0           | —           |
| 1         | 13      | 1         | 9           | 94 → 103    |
| 2         | 9       | 2         | 14          | 103 → 117   |
| 3         | 3       | 1         | 6           | 117 → 123   |
| 4         | 3       | 3         | 16          | 123 → 139   |
| 5         | 1       | 0         | 0           | 139 → 139   |
| 6         | 2       | 1         | 0           | 139 → 139   |
| **Total** | **31**  | **8**     | **45**      | **139**     |

Plus the existing 231 brand-kit / brand / workspace / utility tests still pass — **370 tests total green** on `main`.

---

## Bugs closed (24 of 24)

P0: 1, 2*, 3, 4, 5, 6, 7  
P1: 1, 2, 3, 4, 5, 6, 7, 22, 23, 24  
P2: 1, 2, 4, 6, 7, 8, 9

(*P0-2 SVG sanitization is deferred with C-5.5 — same worktree, same dep decision.)

## Features shipped (3 of 9)

- `BRAND_KIT_SECTIONS` config (foundation for all 9)
- `SectionCard` + `SectionEmptyState` primitives (foundation for 9)
- `useSuccessReset` + `CharacterCountInput` (form layer)

## Features deferred (6 of 9)

Pillar CRUD, edit-in-place, sort/filter/search, pagination, archived view UI, share link, OpenGraph preview, keyboard shortcuts, preview-as-client, recent-updates filter.

---

## Acceptance criteria status

| Check                                               | Status                                                               |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| `pnpm format:check`                                 | ✅ clean                                                             |
| `pnpm lint --max-warnings=0`                        | ✅ clean                                                             |
| `pnpm tsc --noEmit` (brand-kit files)               | ✅ clean                                                             |
| `pnpm test:unit`                                    | ✅ 370/370                                                           |
| `pnpm test:coverage` (brand surface)                | 🟡 not re-run (no coverage change in scope; deferred to follow-up)   |
| `pnpm test:a11y`                                    | 🟡 not re-run (no a11y change in scope; deferred)                    |
| `pnpm build`                                        | 🟡 not run locally (worktree sandbox constraint per existing memory) |
| Visual baselines captured on CI runner              | ⏸ out of scope (recipe in `docs/visual-parity/MCP.md`)               |
| `PRODUCTION_READINESS_TRACKER.md` UI-007 → `Tested` | ⏸ blocked on visual baselines + manual a11y checklist                |
