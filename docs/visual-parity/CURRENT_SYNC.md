# Current repository ↔ Google Stitch synchronization

Updated 2026-09-10.

## Canonical design source

- **Current Stitch project:** `16083107078886291815` — **LaraTik Planner — Current Product UI**
- **Current Stitch design system:** `assets/14000568228937989951` — **LaraTik Planner**
- **Previous project:** `5403097764334458790` — **StudioFlow — Social Media Agency Platform**

The previous project is retained as an archive/reference because Stitch does not
provide a screen-delete operation. It contains 78 mixed historical, duplicate,
and variant screens and must not be used as the current parity source.

The repository remains the source of truth for behavior, routes, permissions,
data states, and bilingual copy. Stitch is the visual contract for those same
surfaces. When they conflict, implement the repository's security and workflow
invariants and record the visual adjustment here.

## Current-state Stitch inventory

The new project was generated from the current route structure and current
LaraTik tokens, not from the archived screen set.

| Surface                            | Route                                                                                                                                           | Device  | Stitch screen                      | Status   |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ---------------------------------- | -------- |
| Workspace overview                 | `/app/w/[slug]`                                                                                                                                 | Desktop | `9821d2eb7b254f7bbfe47827e9ab53eb` | Complete |
| Monthly planning                   | `/app/w/[slug]/planning`                                                                                                                        | Desktop | `9f3ef0dec68646c2a697fadffeb65731` | Complete |
| Content detail                     | `/app/w/[slug]/planning/[id]`                                                                                                                   | Desktop | `8ba7973deb6c4353aeb45ed1af2972d9` | Complete |
| Reviews and delivery               | `/app/w/[slug]/reviews`                                                                                                                         | Desktop | `d1252782c93c45ee92fd4300444489b0` | Complete |
| Workspace settings                 | `/app/w/[slug]/settings`                                                                                                                        | Desktop | `9bce0489fe5e4146a937dfb4a330a5ea` | Complete |
| Agency AI configuration            | `/app/agency-settings/ai`                                                                                                                       | Desktop | `d93de8e32cb543cdb049f7b11428a165` | Complete |
| Media library                      | `/app/w/[slug]/media`                                                                                                                           | Desktop | `5f2606cfa6be4f02822e477c637ddcf0` | Complete |
| Trends workspace                   | `/app/w/[slug]/trends`                                                                                                                          | Desktop | `e5f6a4338ea441f4b9b4710bcbb775c1` | Complete |
| Platform operations                | `/app/platform/overview`                                                                                                                        | Desktop | `ab5ee0411c54483191c4ad5403afa35f` | Complete |
| Access and first-admin setup       | `/signin`, `/setup`                                                                                                                             | Desktop | `c6e51dea498041958a5631d4cd21c715` | Complete |
| Workspaces and users               | `/app/workspaces`, `/app/users`, `/app/w/[slug]/team`                                                                                           | Desktop | `f9fae47e44a44fb09a9870485ae7806e` | Complete |
| Brand kit and channels             | `/app/w/[slug]/brand-kit`, `/app/w/[slug]/channels`                                                                                             | Desktop | `b8b3b576e09e47a0825637f3bab5d0c5` | Complete |
| Publishing and recovery            | `/app/w/[slug]/planning/[id]/publish`                                                                                                           | Desktop | `95dfecceb93e46a699f2598263b0d54c` | Complete |
| Client review and calendar         | `/app/w/[slug]/client`, `/app/w/[slug]/client/calendar`                                                                                         | Desktop | `a62bb395ab294343bd2853b4f11941d9` | Complete |
| Account and notifications          | `/app/account`                                                                                                                                  | Desktop | `76e0913910d04e0f8de463b349a5bc73` | Complete |
| Planning board and calendar        | `/app/w/[slug]/board`, `/app/w/[slug]/calendar`                                                                                                 | Desktop | `b75a9ec57d5b4859ab318e2003f2bf65` | Complete |
| Design queue and planning library  | `/app/w/[slug]/design-queue`, `/app/w/[slug]/library`                                                                                           | Desktop | `a37448b4648449b5bd18e41d7dbf34b5` | Complete |
| Agency settings hub                | `/app/agency-settings`, `/app/agency-settings/social`, `/app/agency-settings/storage`, `/app/agency-settings/planning-packs`                    | Desktop | `e344b125c0084ca7a58c778523eeccd0` | Complete |
| Social analytics and trend sources | `/app/w/[slug]/analytics/social`, `/app/w/[slug]/settings/trends`                                                                               | Desktop | `e87426aa83a4456899e3242418efba33` | Complete |
| Platform admin governance          | `/app/platform/agencies/[agencyId]`, `/app/platform/access`, `/app/platform/security`, `/app/platform/storage`, `/app/platform/operations/cron` | Desktop | `fa90e2470d684514b0b12ca5ddbf0086` | Complete |
| Operational states                 | Shared loading, empty, error, denied, archived, and stale-data states                                                                           | Desktop | `27d7fc6cddd444d78d79535f0b2e328b` | Complete |
| Workspace overview                 | `/app/w/[slug]`                                                                                                                                 | Mobile  | `8319aff48c454f69a6c614fe79e7b411` | Complete |
| Monthly planning                   | `/app/w/[slug]/planning`                                                                                                                        | Mobile  | `8758e7247c194e00a24e09f9a9a37962` | Complete |
| Content detail                     | `/app/w/[slug]/planning/[id]`                                                                                                                   | Mobile  | `627f80e530f04738a7e16f829ea35fe3` | Complete |
| Workspace settings                 | `/app/w/[slug]/settings`                                                                                                                        | Mobile  | `176f9b09f4cb49b08b2051b820cb48ee` | Complete |

The remaining work is refinement, not route discovery: split a grouped surface
into a separate Stitch screen only when the route has materially different
information architecture or permissions. Do not reintroduce superseded variants
merely to increase the screen count.

## Shared visual contract

- Canvas `#F7F7F5`; white surfaces; `#DDE1E6` borders.
- Primary text `#172033`; secondary text `#5D6678`; primary action `#4F46E5`.
- Inter typography; 4px spacing rhythm; 8px controls; 10px cards.
- Desktop shell: 248px sidebar and 64px top bar.
- At 1024px collapse secondary panels before shrinking core controls.
- At 768px stack columns while preserving list readability.
- At 375px use compact navigation, full-width cards, full-screen sheets, and
  44px touch targets. Never compress a desktop table into unreadable columns.
- Every status uses an icon plus text and a pale semantic treatment; color is
  never the only signal.
- Every surface supports English/LTR and Arabic/RTL with logical spacing,
  direction-isolated mixed values, Western digits, keyboard focus, and
  loading/empty/error/permission states.
- Each screen has one visually dominant next action. Advanced settings and AI
  drafts use progressive disclosure; AI never changes status or writes to the
  database autonomously.

## Refresh protocol

1. Read this file, `STUDIOFLOW_MASTER_PROMPT.md`, and the production-readiness
   tracker before changing a screen.
2. Confirm the route and current behavior in `src/app/` first.
3. Generate or edit one focused Stitch surface using design system
   `14000568228937989951`.
4. Check desktop and mobile intent, then review the Arabic/RTL layout and
   operational states.
5. Update this inventory and the relevant parity evidence at the exact clean
   commit. Keep the archived project unchanged.

## Local current capture

The current Stitch references are mirrored in `designs/stitch-current/` as 25
HTML/PNG pairs. The files are intentionally separate from the archived
`designs/stitch/` baseline so visual comparisons can identify whether a change
comes from the product or from a refreshed design reference.

## Verification boundary

- Manifest identity and pair counts were checked against the current Stitch
  project: 25 screens, 25 HTML files, and 25 PNG files.
- `pnpm verify` passed after the capture was added: formatting, lint, strict
  typecheck, 359 unit test files (3,343 passing tests and 4 todo tests), and the
  production build.
- `pnpm format:check` and `git diff --check` pass after the documentation
  refresh.
- The full current visual matrix is green: `pnpm test:visual` passed 87/87
  exact-reference and responsive checks, including the platform-admin states
  and the 375/768/1024/1440 planning-detail matrix. Capture mode rejects
  Next.js runtime-error overlays so they cannot become visual baselines.
- Direct live interaction with the Stitch UI remains pending until the local
  desktop is unlocked. The repository-side sync and visual evidence are
  complete; this lock only prevents a second visual inspection of the remote
  Stitch canvas in the browser.
