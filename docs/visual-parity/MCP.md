# Google Stitch MCP — how to access the current design

> **Current source design system:** `https://stitch.withgoogle.com/projects/16083107078886291815`
> (LaraTik Planner current product flow — 25 curated screens).
>
> **Captured artefacts:** `./designs/stitch-current/` — 25 PNGs + 25 HTMLs +
> `manifest.json`. The historical `./designs/stitch/` capture and project
> remain archived for traceability; they are not the current parity target.

This document explains how to reach the live Stitch design when the captured
copy is stale (new screens, revised flows, updated tokens). It is a quick
recipe, not a tutorial — the Stitch team owns the canonical MCP docs.

## When to refresh from the live MCP

Refresh when the current repo flow changes, or when the user reports an upstream
Stitch change (new screen, token change, layout change). The current project and
its capture are the parity target; keep the historical project untouched.

Refresh triggers in priority order:

1. `STITCH_PROJECT_ID` changes (new design system / rebrand)
2. New screen added to the project (the matrix in `SCREEN_PARITY.md` references
   screens we don't have yet)
3. Token change in `DESIGN.md` (color, typography, spacing)
4. Layout change on an existing screen

## Endpoints and auth

| Resource      | Value                                                         |
| ------------- | ------------------------------------------------------------- |
| MCP URL       | `https://stitch.googleapis.com/mcp`                           |
| Auth header   | `X-Goog-Api-Key: <key>` (NOT `Authorization: Bearer`)         |
| Project ID    | `16083107078886291815` (digits only — see "Gotchas" below)    |
| Design system | `assets/14000568228937989951`                                 |
| Stitch UI     | `https://stitch.withgoogle.com/projects/16083107078886291815` |

The API key is the same one that powers the Stitch web app for the project
owner. Treat it as a personal secret — do **not** commit it, do **not** paste
it into logs or screenshots. The CI runner does not need it; the captured
copy in `./designs/stitch/` is the canonical artifact for the build.

## Tools (minimal set)

Three MCP tools cover everything you need for visual parity work:

| Tool                  | Param shape                                          | Returns                                  |
| --------------------- | ---------------------------------------------------- | ---------------------------------------- |
| `list_screens`        | `projectId: "16083107078886291815"`                  | All screens in the project (id + title)  |
| `get_screen`          | `name: "projects/16083107078886291815/screens/<id>"` | Full HTML + design tokens for one screen |
| `list_design_systems` | (no params)                                          | Available design systems (id + name)     |

There is no `get_project` tool that takes the project ID directly. Use
`list_screens` first to enumerate, then `get_screen` per ID.

## Recipe — re-capture one screen

```text
1. list_screens({ projectId: "16083107078886291815" })
   → [{ id: "9821d2eb...", title: "Workspace Overview" }, ...]

2. get_screen({ name: "projects/16083107078886291815/screens/9821d2eb..." })
   → HTML string, design tokens, screen dimensions

3. Save the HTML to designs/stitch-current/<id>_<slug>.html
4. If a PNG is needed, the get_screen response includes a download URL
   served from a CDN — these are 512px thumbnails, not 2560px originals.
   The 2560px PNG requires authenticated access; do not assume the
   CDN URL gives you the full-resolution asset.
```

The captured HTML is what `tests/e2e/visual-regression.spec.ts` masks
dynamic data against (timestamps, IDs). The PNG is what the visual
regression harness screenshots against when `--update-snapshots` is run.

## Recipe — re-capture all screens

```text
1. Read `designs/stitch-current/manifest.json` to identify the 25 current
   screen references, then verify them with `get_screen`.
2. for each id: get_screen
3. write designs/stitch-current/<id>_<slug>.html and the matching PNG
4. update `manifest.json` when screens are added, removed, or replaced
5. update `docs/visual-parity/CURRENT_SYNC.md` with route and rationale changes
6. commit with:  chore(design): refresh current stitch capture
7. run pnpm format:check  (the captured HTML is auto-generated, do not
   let prettier touch it — make sure designs/ is in .prettierignore)
```

`.prettierignore` already excludes `designs/**`; verify before committing.

## Tokens — what `DESIGN.md` is for

The current design system is documented in `docs/visual-parity/CURRENT_SYNC.md`.
After refreshing from the MCP, update that document if tokens or responsive
rules change. The historical `designs/stitch/DESIGN.md` remains an archive.

| Token category  | Source                                                                 |
| --------------- | ---------------------------------------------------------------------- |
| Color           | Stitch `colorTokens` for the project; map to `--color-*` in CSS vars   |
| Typography      | Stitch `typeTokens`; map to `text-*-*` Tailwind classes (already done) |
| Spacing         | Stitch `spacingTokens`; map to Tailwind spacing scale                  |
| Radius / shadow | Stitch `effectTokens`; the existing 4-step radius scale covers v1      |

The Stitch token names are project-specific. The mapping to
`src/app/globals.css` is the only place the laratik-planner code references
them — never hardcode a Stitch token name in a component.

## Gotchas (learned the hard way)

1. **Project ID is digits only.** Passing `"projects/16083107078886291815"`
   to `list_screens` returns "Request contains an invalid argument". Pass
   the bare integer string.

2. **`get_screen` requires the `name` field in `parent/child` shape** —
   `"projects/<id>/screens/<id>"`, not just the screen ID. `get_project`
   and `parent`-shaped variants are NOT supported.

3. **CDN thumbnails are 512px wide.** Stitch's response includes a
   `downloadUrl` for the captured PNG, but it is a CDN-served 512px
   thumbnail, not the 2560px original. Full-resolution requires
   authenticated access; don't assume the URL gives you the asset
   suitable for `--update-snapshots`.

4. **The HTML is not valid Tailwind.** Stitch emits class names with
   custom property values (`bg-[#3525cd]`) and arbitrary spacing
   (`p-[20px]`). The repo uses Tailwind 4 with a token-based theme —
   the captured HTML is for reference, not copy-paste. Always translate
   to the project's design tokens (`src/app/globals.css`).

5. **Do not commit the API key.** Even though the Stitch project is
   single-owner, the key is a personal secret. The captured copy in
   `./designs/stitch-current/` is the in-repo current artifact; the MCP is
   only needed for refreshes.

## Related files

- `docs/visual-parity/PLAN.md` — the M0–M6 plan that consumed the
  Stitch design
- `docs/production-readiness/DESIGN_AUDIT.md` — the structural audit
  that identified which screens needed the M2/M3 refactor
- `docs/production-readiness/SCREEN_PARITY.md` — the 27-row matrix
  that tracks each Stitch screen against the laratik-planner route
- `docs/visual-parity/CURRENT_SYNC.md` — the current source, inventory, and
  responsive visual contract
- `designs/stitch-current/manifest.json` — current screen IDs and routes
- `designs/stitch/DESIGN.md` — the historical token reference
- `tests/e2e/visual-regression.spec.ts` — the harness that uses
  captured HTML to mask dynamic data
