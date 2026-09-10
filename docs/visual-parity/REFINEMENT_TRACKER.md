# LaraTik Planner UI parity and refinement tracker

Updated: 2026-09-10  
Status: Screen parity baseline complete — edge-state refinement queued

## Working agreement

- The repository is the source of truth for routes, behavior, permissions, workflow, data, and bilingual copy
- Google Stitch is the visual contract for the same product surfaces
- Refinements should preserve the existing design system: Inter, `#F7F7F5` canvas, white surfaces, `#DDE1E6` borders, `#172033` primary text, `#5D6678` secondary text, and `#4F46E5` primary actions
- Each screen should make one next action obvious, remain usable at 375px, and support English/LTR and Arabic/RTL
- Do not regenerate a screen just to increase the screen count; regenerate or edit only when the information architecture or visual intent needs to change
- New work stays unstaged unless the user explicitly asks for staging

## Current Stitch source

- Active project: `16083107078886291815` — LaraTik Planner — Current Product UI
- Active design system: `14000568228937989951` — LaraTik Planner
- Archived project: `5403097764334458790` — StudioFlow — Social Media Agency Platform
- Current capture manifest: [`designs/stitch-current/manifest.json`](../../designs/stitch-current/manifest.json)
- Current manifest size: 25 screens across desktop and mobile references

The archived project remains available for traceability only. It contains historical and duplicate screens and is not used as the current design target.

## Completed synchronization work

| Area                     | Result                                                                                                     | Evidence                                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Current Stitch project   | New project selected as the single visual target                                                           | `docs/visual-parity/CURRENT_SYNC.md`                                       |
| Current screen inventory | Routes, device types, screen IDs, and local captures recorded                                              | `designs/stitch-current/manifest.json`                                     |
| Capture artifacts        | Current Stitch HTML and PNG captures added under `designs/stitch-current/`                                 | Current manifest and capture directory                                     |
| Visual references        | Exact desktop/mobile references and responsive app snapshots wired into the visual suite                   | `tests/e2e/visual-regression.spec.ts`                                      |
| Shipped route coverage   | Expanded coverage now represents 70 shipped surfaces, 217 responsive baselines, and 24 exact Stitch checks | `tests/e2e/stitch-cases.ts`, `tests/e2e/visual-regression.spec.ts`         |
| Refresh procedure        | Authenticated Stitch MCP refresh recipe documented                                                         | `docs/visual-parity/MCP.md`                                                |
| Parity history           | Historical plan and archived baseline kept for traceability                                                | `docs/visual-parity/PLAN.md`, `docs/production-readiness/SCREEN_PARITY.md` |

## Completed screen refinements

These changes bring the implementation closer to the current Stitch intent without changing workflow behavior or permissions.

| Screen                  | Change                                                                                                                                | Why                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Workspace Overview      | Removed the generic mobile create action from the overview route                                                                      | Keeps the overview focused on status and the next workspace action                                              |
| Monthly Planning        | Removed the generic mobile create action from the planning list                                                                       | Prevents the floating action from competing with filters and the planning list                                  |
| Content Detail          | Removed the generic mobile create action from content detail                                                                          | Prevents overlap with workflow actions and readiness content                                                    |
| Reviews                 | Removed the generic mobile create action from the review inbox                                                                        | Keeps the decision task focused on approvals and requested changes                                              |
| Workspace Settings      | Removed the generic mobile create action from workspace settings and nested settings routes                                           | Prevents overlap with setup, configuration, and preset actions                                                  |
| Media Library           | Removed the generic mobile create action from the workspace Media route                                                               | Keeps the upload and library-management task focused                                                            |
| Agency AI configuration | Moved the primary AI feature controls directly below provider setup, before the longer diagnostic explanation                         | Keeps the secure configuration task discoverable while retaining all required governance details                |
| Publishing and recovery | Extended the route-aware mobile focus rule to nested publishing paths                                                                 | Prevents the generic create button from covering platform publishing cards and keeps recovery actions primary   |
| Client Review           | Corrected the visual fixture to use the `client_reviewer` role instead of an agency admin                                             | Captures the actual client-only review surface and preserves its access boundary                                |
| Brand kit and channels  | Removed the generic mobile create action from Brand Kit, Channels, and related setup surfaces                                         | Keeps asset, connection, and configuration actions visible without a competing floating shortcut                |
| Social Analytics        | Removed the generic mobile create action from workspace Social Analytics                                                              | Keeps the empty-state recovery action, `Go to Social Channels`, as the clear next step                          |
| Planning Library        | Removed the generic mobile create action from the library route                                                                       | Prevents the shortcut from covering campaign, pillar, and template creation forms                               |
| Global settings/admin   | Removed the unrelated workspace-create shortcut from Account, Agency Settings, People, Global Media, and the new-workspace form       | Keeps profile, administration, and setup tasks focused on their own controls                                    |
| Workflow Board          | Removed the generic mobile create action from the board route                                                                         | Keeps assignment and workflow-card actions unobstructed on the primary board item                               |
| Design Queue            | Removed the generic mobile create action from the design queue route                                                                  | Keeps the queue focused on claiming or assigning approved work                                                  |
| Editorial Calendar      | Reviewed the mobile agenda renderer and desktop calendar grid; no speculative layout change was needed                                | The mobile agenda keeps date and event semantics explicit, while the desktop grid remains the planning overview |
| Media Library           | On mobile, the Add media task now appears before storage details; workspace routes cannot show an unrelated workspace-create fallback | Keeps the primary upload task visible first and prevents a floating action from covering the upload surface     |

Implementation and regression coverage: [`src/components/app-shell/mobile-nav.tsx`](../../src/components/app-shell/mobile-nav.tsx) and [`tests/unit/app-shell/mobile-nav.test.tsx`](../../tests/unit/app-shell/mobile-nav.test.tsx)

## Verification completed

- Final repository gates passed individually: formatting, lint, TypeScript, the full unit suite (362 files / 3,380 passing / 4 todo), and the production build (the combined verify build was first killed by environment memory pressure, then the standalone build passed)
- Formatting, lint, and TypeScript checks passed
- Full unit suite passed: 3,365 tests, 4 todo
- Production build passed
- Content Detail visual check passed at mobile size
- Content Detail accessibility passed across Chromium, Firefox, WebKit, mobile Chrome, and mobile Safari
- Reviews visual, accessibility, and role checks passed
- Workspace Settings mobile visual check passed
- Workspace Settings accessibility passed across five browser targets
- Media Library mobile visual check passed
- Media Library accessibility passed across five browser targets
- Trend Radar onboarding flow passed end to end
- Trend Radar exact and responsive visual captures passed across desktop, mobile, and tablet sizes
- Trend Radar catalog copy remains bilingual after the populated-state refresh
- Agency AI exact and responsive visual captures passed after the hierarchy refinement
- Publishing and recovery exact and responsive visual captures passed at mobile-s, tablet, laptop, and wide sizes
- Client Review exact and responsive visual captures passed, including the corrected client-only 360px state
- Workflow Board and Design Queue responsive visual captures passed at mobile-s, tablet, and wide sizes
- Brand Kit exact desktop and responsive visual captures passed at mobile-s, tablet, and wide sizes
- Social Analytics responsive visual captures passed at mobile-s, tablet, and wide sizes
- Channels and Planning Library route-specific mobile action tests passed; these routes are not separate canonical screens in the current Stitch manifest
- Targeted MobileNav unit coverage passed: 28 tests
- Global settings/admin route-specific mobile action coverage added; the workspace list still retains its workspace-create action
- Full visual suite baseline passed: 126 tests across exact Stitch references and responsive canonical/app-only surfaces
- The current responsive matrix now covers 20 canonical and 50 app-only surfaces: 217 responsive baselines, with 46/46 expanded authenticated checks and 21/21 expanded public checks passing strict comparison
- `pnpm verify` passed after the shared nested Brand Kit fixes
- Media Library responsive capture and strict visual/accessibility comparison passed at mobile-s, tablet, and wide sizes
- Mobile navigation regression coverage passed: 29 tests, including unresolved workspace-route fallback protection
- Editorial Calendar implementation review completed; it is an app route without a separate current Stitch reference
- Client Calendar empty state added for months with no approved or review-stage content; English and Arabic copy are covered by the shared catalogs
- Brand Kit overview hero labels and first-asset guidance now use the bilingual catalog without changing the established layout
- Brand Kit Health heading now follows the active locale on section routes
- Brand Kit Templates interaction states and manager guidance now use bilingual catalog copy
- Agency Settings hub now follows Stitch's guided order: operational snapshot, identity, social configuration, storage health, and planning packs
- Added bilingual operational summaries and direct links from the Agency Settings hub to the existing secure admin routes
- Added responsive regression coverage for all six nested Agency Settings admin routes
- Agency Settings exact and responsive visual/accessibility comparison passed: 26 checks
- Platform overview now exposes focused operational controls for agencies, security, access, and app errors
- Added responsive regression coverage for the seven shipped platform-only routes
- Fixed the Agencies list in-text link so it remains visibly distinguishable at every viewport
- Platform exact and responsive visual/accessibility comparison passed: 29 checks
- Account and Notifications review completed; the existing vertical task order remains clear and its strict matrix evidence is retained
- Added responsive regression baselines for setup, sign-in verification, and password recovery
- Replaced invalid blank setup baselines created during a dev-manifest restart with stable captures
- Access and First-admin exact/responsive visual and accessibility comparison passed: 13 checks
- Route-level error recovery now uses one centered action pattern with retry, local back navigation, My Work escape, and an optional support reference
- Agency Settings loading now announces its busy state politely for assistive technology
- Route-error regression coverage passed for action order, recovery links, alert semantics, and digest rendering
- Primary workspace, agency, platform, account, users, and workspaces routes now have layout-shaped loading skeletons instead of the generic list fallback
- Platform restricted-access copy now follows the active English/Arabic catalog
- Public auth screens reserve mobile space for the fixed language switcher and keep the developer notice in reading order
- Responsive access/setup visual and accessibility checks passed: 9 checks
- App-wide error recovery now exposes assertive alert semantics for assistive technology
- Public legal pages keep inline links visibly distinguishable without relying on hover
- Expanded responsive coverage now includes public/legal routes, People, Media, new-workspace setup, Team, create/batch/edit/monthly planning, and all nested workspace settings routes
- Settings preset status badges now use the design-system subtle status surfaces so small text meets WCAG AA contrast
- Expanded authenticated route group passed strict visual and critical/serious accessibility checks: 46/46
- Expanded public route group passed strict visual and critical/serious accessibility checks: 21/21

Known environment note: earlier visual retries hit transient Next.js development-manifest/cache failures; the affected Brand Kit and Client Review captures were subsequently rerun and passed.

## Remaining refinement queue

The synchronization baseline is complete for the shipped, deterministic routes. The remaining work is visual and usability refinement, not route discovery.

### Active screen

1. Final edge-state audit — review bilingual loading, empty, error, denied, archived, and stale-data states across the already-synchronized routes

### Current finding

The nested Brand Kit section routes now have explicit app-only responsive regression coverage at mobile-s, tablet, and wide sizes. The shared sidebar list structure and template swatch semantics were corrected, then all 30 nested Brand Kit checks passed strict visual comparison and critical/serious accessibility checks. The current matrix covers 217 responsive baselines across 70 shipped, deterministic surfaces; the historical 126- and 174-check baselines are retained only for traceability. Agency Settings adds six nested admin routes with a separate strict 26-check pass, Platform adds seven platform-only routes with a strict 29-check pass, and public Access/First-admin adds three routes with a strict 13-check pass. The visual matrix also captures the actual Trends surface with a deterministic enabled-capability/source fixture, while Channels, Client Calendar, Planning Library, People, Media, new-workspace setup, Team, create/batch/edit/monthly planning, legal, and recovery routes have explicit app-only coverage. Client Calendar also has an empty state instead of a blank list surface. The operational fallback review found inconsistent signed-out/denied presentation in Platform Security and platform Storage; both now use the shared permission notice and retain bilingual copy. Workspace empty/no-results review added direct create-form anchors for Library managers and aligned Board empty guidance with its role gate; Library and Board strict responsive checks pass at all three widths.

### Next recommended screen

1. Final edge-state audit — review bilingual loading, empty, error, denied, archived, and stale-data states across the already-synchronized routes

### Following screens

- Trends workspace
- Publishing and recovery
- Client review and calendar
- Brand kit and channels
- Planning board and calendar
- Design queue and planning library
- Social analytics and trend sources
- Operational loading, empty, error, denied, archived, and stale-data states

For every screen, review desktop and mobile intent, then check Arabic/RTL, keyboard access, loading/empty/error/permission states, and the relevant visual and accessibility evidence before marking it complete.

## Deferred findings

| Finding                                                  | Required follow-up                                                                                                        | Status                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Trends visual capture lands on My Work                   | Add a test-only enabled capability/source fixture, then capture the live Trends route and its empty/degraded states       | Complete — live populated state captured at desktop, mobile, and tablet sizes |
| Trend card vertical label fell back to a raw catalog key | Add the missing English/Arabic `lifestyle` catalog entry                                                                  | Complete — bilingual copy added                                               |
| Agency AI is denser than the Stitch reference            | Review the information hierarchy against the repository’s required security and governance details before changing layout | Addressed — primary controls moved above diagnostics                          |
| Platform fallback states were visually inconsistent      | Reuse the shared permission notice for signed-out and denied platform surfaces                                            | Complete — Security and platform Storage aligned; 29 strict checks passed     |
| Route-level error states used different layouts          | Share the recovery surface while preserving local back links and support references                                       | Complete — five route boundaries now use the same recovery hierarchy          |
| Primary routes used a generic list loader                | Add responsive skeleton variants for dashboards, tables, forms, detail, analytics, and publish surfaces                   | Complete — shared ScreenLoading variants cover the remaining primary routes   |
| Platform restricted-access copy was English-only         | Route gate copy must resolve through the active interface locale                                                          | Complete — English and Arabic catalog entries added                           |
| Monthly planning session detail needs a deterministic ID | Add a test-only session seed, then cover `/app/w/[slug]/planning/monthly/{sessionId}` in the responsive matrix            | Deferred — current seed contract exposes content and agency IDs only          |
| Share-token and password-set flows need stateful links   | Add deterministic invitation/share-token fixtures before adding visual references                                         | Deferred — route state is token-dependent                                     |

## Change log

### 2026-09-10

- Established the current LaraTik Planner Stitch project and design system as the active visual source
- Captured the current Stitch screen inventory and generated the local reference manifest
- Added exact-reference and responsive visual parity coverage
- Refined mobile action focus for Workspace Overview, Monthly Planning, Content Detail, Reviews, and Workspace Settings
- Refined mobile action focus for Media Library
- Added regression tests for route-specific mobile action visibility
- Added a test-only Trend Radar capability fixture so visual captures exercise the actual Trends route
- Added a deterministic populated Trend Radar capture state and removed its competing mobile create shortcut
- Added the missing bilingual Lifestyle vertical label
- Refined Agency AI configuration hierarchy so the main controls appear before diagnostics
- Refined publishing mobile focus by removing the generic create shortcut from nested publish routes
- Corrected Client Review visual identity to use a client reviewer fixture
- Refined mobile action focus for Brand Kit, Channels, Social Analytics, and Planning Library
- Captured Social Analytics responsive evidence and added route-specific action regression coverage
- Refined mobile action focus for Account, Agency Settings, People, Global Media, and new-workspace setup
- Refined mobile action focus for Workflow Board and Design Queue
- Reviewed Editorial Calendar and documented its app-only status relative to the current Stitch manifest
- Fixed order-dependent AI visual fixtures by resetting dev-seeded AI state between screens
- Added a bilingual Client Calendar empty state so empty months still explain what belongs on the screen
- Routed Brand Kit overview hero metadata and empty guidance through the locale-aware catalog fallback pattern
- Localized the shared Brand Kit Health heading used by section screens
- Added responsive regression coverage for app-only Channels, Client Calendar, and Planning Library routes
- Added responsive regression coverage for all nested Brand Kit section routes
- Fixed nested Brand Kit sidebar list semantics and template swatch ARIA semantics found by the strict accessibility pass
- Refreshed and passed all 30 nested Brand Kit responsive visual checks
- Expanded and passed the full 126-test visual suite
- Standardized route-level error recovery across Agency Settings, Brand Kit, Channels, Planning, and Content Detail
- Added alert semantics, support-reference rendering, and focused regression checks for route errors
- Added the Agency Settings loading announcement
- Full repository verification passed again: 3,369 unit tests with 4 todos and production build
- Re-ran and passed the full 126-test visual suite after the Media Library refinement
- Preserved the existing 149 staged paths while keeping all current-pass changes unstaged
- Reordered the Media Library mobile flow so upload is the first task, while desktop order remains aligned with Stitch
- Added a URL-shaped workspace-route guard and regression test so Media cannot show the unrelated workspace-create action
- Localized Brand Kit template add, success, error, and permission states for English/Arabic parity
- Added this tracker so sync status, refinements, evidence, and follow-up work remain visible
- Added focused Platform overview operational controls and bilingual copy
- Added app-only responsive baselines for Platform access, admins, agencies, errors, cron operations, security, and storage
- Fixed the Platform Agencies guidance link to satisfy non-color link distinction at all breakpoints
- Reviewed Account and Notifications against Stitch; no speculative layout change was needed
- Added app-only responsive baselines for setup, sign-in verification, and password recovery
- Re-captured setup after a blank-shell dev-manifest failure and passed the strict 13-check access group
- Aligned Platform Security and platform Storage unauthenticated/permission-denied states with the shared permission notice pattern
- Added bilingual copy for the platform Storage access fallback
- Re-ran and passed the full 29-check Platform visual/accessibility group after the operational-state alignment
- Passed TypeScript and bilingual catalog parity checks after the operational-state alignment
- Planning Library empty sections now link directly to their create forms for managers and planners
- Board empty state now respects the content-creation role gate and has read-only guidance
- Planning Library empty sections now expose direct create actions and all three responsive checks pass
- Workflow Board empty-state role gating and bilingual read-only guidance now pass all three responsive checks
- Workspace empty/no-results review completed for Overview, Planning, Board, Design Queue, and Library
- Mobile More navigation now marks the active workspace, platform, and account destination consistently
- Mobile navigation unit coverage expanded to 31 checks for workspace and platform active-state behavior
- Updated the mobile browser contract to match the current intentional removal of the generic Planning create shortcut and optional Trend Radar links
- Mobile More sheet browser check passed with accessibility and horizontal-overflow assertions
- Full current 174-check visual sweep found one expected sign-in mobile reference mismatch after the spacing improvement; all other 173 checks passed
- Full `pnpm verify` passed again: formatting, lint, TypeScript, 3,379 unit tests with 4 todos, and production build
- Next active review moved to loading and error-state visuals
- Added responsive layout-shaped loading coverage for the remaining primary app routes
- Localized the platform restricted-access layout for English/LTR and Arabic/RTL
- Refined public auth mobile spacing around the fixed language switcher and corrected developer-mode notice wrapping
- Recaptured and strictly passed the 9-check access/setup responsive group
- Refreshed only the sign-in, forgot-password, and verification mobile responsive references so they reflect the corrected language-switcher spacing and developer-mode reading order
- Re-ran the complete public authentication responsive group: 9/9 checks passed
- Confirmed Media Library remains upload-first on mobile, Stitch-aligned on desktop, and covered at mobile-s, tablet, and wide sizes
- Advanced the tracker from screen-specific parity work to the final bilingual and edge-state audit
- Expanded the route matrix to cover 70 shipped deterministic surfaces, 217 responsive baselines, and 24 exact Stitch checks (241 visual tests total)
- Added strict responsive evidence for public/legal routes, People, Media, workspace creation, Team, planning create/batch/edit/monthly, and nested workspace settings
- Fixed serious WCAG contrast failures in Settings preset status badges and regenerated their responsive references
- Added app-error alert semantics and persistent legal-link distinction for keyboard and assistive-technology users
- Captured the missing root landing references and passed the strict root, public, and expanded authenticated groups

Known environment note: visual retries can hit transient Next.js development-manifest/cache failures. The affected Brand Kit, Client Review, root, public, and expanded route captures were rerun in focused groups and passed; one broad all-matrix rerun was stopped after the same bootstrap failure repeated across subsequent cases.

## Working-tree note

The repository already contained a staged review set before this pass. That staged state was preserved exactly. This tracker and all changes from the current pass remain unstaged; no existing changes were unstaged.
