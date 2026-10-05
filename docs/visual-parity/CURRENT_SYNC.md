# Current repository ↔ Google Stitch synchronization

Updated 2026-10-04.

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
| Publishing and recovery            | `/app/w/[slug]/planning/[id]#publishing` (`/publish` is a server-side `redirect()` shim)                                                        | Desktop | `95dfecceb93e46a699f2598263b0d54c` | Complete |
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

- **Open — baseline drift outside the publish tab, not caused by the
  Publish-tab work.** A `pnpm test:visual` run at the Publish-tab cockpit
  commit also failed on surfaces this work never touched:

  | Surface                                                                             | Failure                                              |
  | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
  | `/app/w/acme/channels` @ tablet, mobile-s, wide                                     | 13px height drift (expected 1359px, received 1372px) |
  | `/app/w/acme/settings`, `settings/plan` @ mobile-s, `settings/templates` @ mobile-s | height/pixel drift                                   |
  | `/app/w/acme/planning/{contentItemId}` ×2                                           | pixel drift                                          |

  These are pixel diffs of ~13px in height on pages with no shared code
  path with the publish surface. The committed baselines date from the
  `3f723bd4` / `193fc9b8` UI-alignment commits, so the set was already
  drifting before this pass. **Do not fold these into a bulk
  `test:visual:update`**: the standing rule in this file is that a
  baseline is not blessed merely because the screenshot changed, and a
  mass recapture would silently bless whatever those three commits
  changed without anyone reviewing it. They need their own review pass.

- **Publishing and recovery — 6 baselines moved at `4bb71fcb`; the Copy tab's held.**
  _(Superseded — see the entry above. This paragraph records the state at
  `4bb71fcb`; the six failures were recaptured after the Publish-tab cockpit
  pass.)_ `pnpm test:visual` was run against `4bb71fcb` with the gate open (`planner_test` is the
  disposable target; Firefox and WebKit are installed). Result: exact-reference
  **19 pass, 1 fail** (`95dfecceb93e46a699f2598263b0d54c`, the publishing-recovery screen)
  and the responsive planning matrix **5 fail, all publish** (mobile, tablet, laptop,
  wide, desktop).

  The earlier prediction was wrong in a useful direction: PR3 changed
  `PlatformPreview`'s no-media empty state and `MetaPublishingReadinessCard`, both shared
  with the Copy tab, but **no Copy-tab baseline moved**. The Copy tab is therefore _not_
  stale. Only the Publishing tab's 6 are, and they are stale because the rendering
  changed, not because the capture was blocked. These need a deliberate recapture
  **after** someone confirms the new rendering is correct — the standing rule is that a
  baseline is not blessed merely because the screenshot changed. Evidence and the
  outstanding list: `docs/production-readiness/TEST_EVIDENCE.md`.

- **Publishing and recovery — baselines recaptured after the Publish-tab
  cockpit pass.**
  The six stale publish-tab baselines recorded at `4bb71fcb` were held pending
  confirmation that the new rendering was correct rather than merely different.
  That confirmation now exists and is recorded below.

  The pass that unblocked them was not only cosmetic. Three defects made the
  Publish tab unusable by its primary route, and each was invisible in a
  screenshot taken by deep link:

  1. `WorkflowRail` gated its publish-only cards on a `hashchange` subscription,
     but `WorkspaceShell` switches tabs with `history.pushState`, which does not
     fire `hashchange`. **Blockers, Publishing integrations, and Channel
     readiness never rendered for anyone who clicked the "Publish" tab** — only
     for a full page load directly onto `#publishing`. The rail was not merely
     sparse on this screen; three of the mockup's four rail cards were absent
     in normal use.
  2. Deep-linking to `#publish` landed on Overview. The adoption effect queued
     `setActiveId("publish")` and returned early, so the sync effect pushed
     `#overview` over the hash in the same commit; the adoption effect then
     re-read the hash it had just clobbered and reverted the tab.
  3. The publish caption textarea resolved to **26px** — narrower than its own
     character counter — because the editor was a 50/50 grid whose left half
     nested a second two-column grid, inside a center column already narrowed by
     the 248px nav and the 304px rail. The hashtag helper wrapped to eight
     lines.

  The URL hash is now the single source of truth for the active tab, the rail
  subscribes to an explicit announcement rather than parsing the hash, and the
  editor gives the simulator a capped phone-width track. Verified by rendered
  box measurement, not by eye: the caption is 388px at 1440px, against 26px
  before.

  **Parity note.** The shipped tab keeps one deliberate divergence from the
  Stitch screen: the rail's lifecycle "Next action" is global to the workspace,
  so it can render "Submit for review" while the publish tab is open. The tab's
  own primary action is therefore scoped to _local_ work — save, or
  "Continue to {phase}" — and never a second lifecycle advance. This preserves
  the rule at `publish-package-form.tsx` ("two primary buttons describing
  different lifecycle levels is how a user ends up advancing the wrong thing").
  Matching the screenshot literally here would reintroduce that bug.

- **Known divergence — Publishing and recovery (`95dfecceb93e46a699f2598263b0d54c`).**
  The Stitch screen shows the publication-proof step as "Step 2 of 2" accepting
  either a public/creator-manager reference URL **or** a `PNG, JPG, or PDF` proof
  upload, plus a "Mark as delayed / Flag issue" action. The implementation
  accepts a URL only (`publishedUrl`, with `expiresAt` as the documented escape
  hatch for an ephemeral Story), and `publication_status` is
  `pending | published | failed | skipped` — there is no `delayed` state. Proof
  upload is a new capability rather than a visual-parity fix, so it is out of
  scope for the publish-surface work and stays a known difference rather than a
  parity failure. The route is also a server-side redirect to
  `/app/w/[slug]/planning/[id]#publishing` since Phase 7 (2026-08-30), so the
  screen is verified on the Publishing tab rather than at `/publish`.
- Manifest identity and pair counts were checked against the current Stitch
  project: 25 screens, 25 HTML files, and 25 PNG files.
- `pnpm verify` passed after the capture was added: formatting, lint, strict
  typecheck, 359 unit test files (3,343 passing tests and 4 todo tests), and the
  production build.
- `pnpm format:check` and `git diff --check` pass after the documentation
  refresh.
- The full current visual matrix was green at the capture commit — `pnpm test:visual`
  passed 87/87 exact-reference and responsive checks, including the platform-admin states
  and the 375/768/1024/1440 planning-detail matrix. **That is not the state at HEAD:**
  the run recorded above against `4bb71fcb` has 6 publish-tab failures. Capture mode
  rejects Next.js runtime-error overlays so they cannot become visual baselines.
- Direct live interaction with the Stitch UI remains pending until the local
  desktop is unlocked. The repository-side sync and visual evidence are
  complete; this lock only prevents a second visual inspection of the remote
  Stitch canvas in the browser.
