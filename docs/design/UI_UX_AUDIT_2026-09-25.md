# UI/UX Audit — 2026-09-25 (round 3)

## Scope

The `ui-ux-pro-max` skill ran against the post–round-2 chrome (sidebar TOC,
build-timestamp menu, media page-size cap, mobile Analytics link). The audit
covered:

- App shell chrome (`src/components/app-shell/*`)
- Workspace settings + the new `SettingsSidebar` component
- Global users page + MemberList
- Workspace team page
- Agency settings
- Account page
- Build-info surfaces (dropdown item, mobile sheet action, Application Info card)
- Error / loading states
- Mobile nav

The audit was read-only (no source modifications); the implementation
followed in a single commit on `chore/ui-ux-pass3`.

## Findings by surface

### SettingsSidebar (new component from round 2)

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | **P1** | The scroll + IntersectionObserver effect depended on `activeId`, so every active-id flip tore down + re-attached the observer and scroll listener — visible as flicker on long pages. | Store `setActiveId` in a ref; depend only on `items`. |
| 2 | **P1** | The IntersectionObserver could demote the active section when two sections were visible at once, producing active-state jitter. | Restrict the observer to PROMOTE; the scroll heuristic owns demotion. |
| 3 | **P2** | The mobile chip strip had no horizontal padding, so the first / last chip sat hard against the viewport edge. | Add `px-2` to the mobile `<ul>` (collapses to `lg:px-0`). |

### MemberList (`/app/users`)

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 4 | **P1** | The row used `flex-wrap`, so on 360-414px phones the Edit / Deactivate buttons ended up mid-line, sometimes wrapping awkwardly under the email. | Restructure to `flex-col sm:flex-row` + a dedicated action group. |
| 5 | **P1** | Action buttons (Edit / Deactivate / Reactivate) were spread across the row rather than grouped — wide rows had three separate tap targets intermingled with the avatar/info. | Wrap the action cluster in a single `<div>` so it reads as a unit on wide screens and as a horizontal pill on narrow. |

### Workspace team page (`/app/w/[slug]/team`)

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 6 | **P2** | Pending invitations rendered a literal `@` glyph inside `IconTile` — the only non-icon character going through the icon primitive. | Replace with a lucide `Mail` icon so the row matches the visual language of every other member row. |

### Agency settings page

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 7 | **P2** | Service rows used `hover:opacity-80` for the row press state. Opacity on text + border caused contrast flicker against the row separator. | Switch to `hover:bg-surface-subtle active:opacity-80` so contrast stays stable and the press feels tactile. |

### Build-info surfaces

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 8 | **P2** | The user-menu dropdown item + mobile sheet action appended a `sr-only` "Copy build information" suffix to the visible `Build <short-sha>` row. The visible label already names the row; the suffix doubled the screen-reader announcement. | Remove the `sr-only` suffix from both variants. Update the lookup in `build-info-ui.test.tsx` to find the row by its visible name. |
| 9 | **P2** | `ApplicationInfoCard` grid used a `7rem` label column. The new "Built at" label wrapped on common locale formats. | Widen to `8rem`. |

### App sidebar

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 10 | **P3** | `void React;` dead line in `sidebar.tsx`. | Remove. |

## Out of scope (deferred)

The audit flagged ~30 additional issues across the broader app shell. The
ones below were intentionally deferred to keep this round focused:

- **Segment-level `error.tsx` for /users, /account, /media.** The `(app)/error.tsx`
  boundary already catches every server-component throw under `/app/*`,
  so per-segment copies are duplication. The comprehensive boundary
  also surfaces the `recordErrorBoundaryAction` mirror + Sentry capture,
  which per-segment copies would have to replicate.
- **Drag-and-drop on the workspace team page** (reorder roles, etc.).
  Requires keyboard alternatives per WCAG 2.2 AA §2.5.7 and is a
  larger feature than fits in a polish round.
- **Dark mode audit.** The app has no dark mode yet; the design tokens
  in `globals.css` already use semantic CSS variables that map 1:1
  to a future dark palette, but a real audit needs the dark palette
  defined first.
- **Screen-reader live-region strategy on the notifications bell.**
  The bell currently exposes `aria-live="polite"` on the badge only.
  The day-grouped list would benefit from a single live region
  announcing "3 new notifications" on open; deferred to a focused
  accessibility pass.

## Verification

- `npx tsc --noEmit` — clean.
- `pnpm test:unit` — 414 files / 3693 tests pass.
- `pnpm test:unit -- tests/unit/users/member-list.test.tsx` — 5 cases pass.

## Files touched

```
AGENTS.md                                                     | changelog
docs/design/UI_UX_AUDIT_2026-09-25.md                        | this file
src/app/(app)/app/users/member-list.tsx                       | responsive layout
src/app/(app)/app/agency-settings/page.tsx                   | hover state
src/app/(app)/app/w/[slug]/team/page.tsx                     | Mail icon
src/components/app-shell/sidebar.tsx                          | dead line
src/components/build-info/application-info-card.tsx          | grid column
src/components/build-info/copy-build-info.tsx                 | sr-only
src/components/workspace/settings-sidebar.tsx                 | scroll-spy stability
tests/unit/users/member-list.test.tsx                         | new
tests/unit/build-info-ui.test.tsx                             | updated assertions
```
