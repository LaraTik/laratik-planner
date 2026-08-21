# Google Stitch MCP — how to access the design

> **Source design system:** `https://stitch.withgoogle.com/projects/5403097764334458790`
> (StudioFlow Production Development Master Prompt — 27 canonical screens).
>
> **Captured artefacts:** `./designs/stitch/` — 49 PNGs + 49 HTMLs + `DESIGN.md`
> (color/typography/spacing tokens). The captured copy is the local source of
> truth for visual parity work; the Stitch MCP is the live upstream when the
> project is updated.

This document explains how to reach the live Stitch design when the captured
copy is stale (new screens, revised flows, updated tokens). It is a quick
recipe, not a tutorial — the Stitch team owns the canonical MCP docs.

## When to refresh from the live MCP

Refresh **only** when the user reports an upstream change (new Stitch screen,
token change, layout change). The repo already carries a frozen copy; rebuilding
that copy on every session is wasteful and the captured PNGs are the visual
regression baselines.

Refresh triggers in priority order:

1. `STITCH_PROJECT_ID` changes (new design system / rebrand)
2. New screen added to the project (the matrix in `SCREEN_PARITY.md` references
   screens we don't have yet)
3. Token change in `DESIGN.md` (color, typography, spacing)
4. Layout change on an existing screen

## Endpoints and auth

| Resource      | Value                                                        |
| ------------- | ------------------------------------------------------------ |
| MCP URL       | `https://stitch.googleapis.com/mcp`                          |
| Auth header   | `X-Goog-Api-Key: <key>` (NOT `Authorization: Bearer`)        |
| Project ID    | `5403097764334458790` (digits only — see "Gotchas" below)    |
| Design system | `assets/e2bbd2e84f524a5eb7e1aa20a22d7531`                    |
| Stitch UI     | `https://stitch.withgoogle.com/projects/5403097764334458790` |

The API key is the same one that powers the Stitch web app for the project
owner. Treat it as a personal secret — do **not** commit it, do **not** paste
it into logs or screenshots. The CI runner does not need it; the captured
copy in `./designs/stitch/` is the canonical artifact for the build.

## Tools (minimal set)

Three MCP tools cover everything you need for visual parity work:

| Tool                  | Param shape                                         | Returns                                  |
| --------------------- | --------------------------------------------------- | ---------------------------------------- |
| `list_screens`        | `projectId: "5403097764334458790"`                  | All screens in the project (id + title)  |
| `get_screen`          | `name: "projects/5403097764334458790/screens/<id>"` | Full HTML + design tokens for one screen |
| `list_design_systems` | (no params)                                         | Available design systems (id + name)     |

There is no `get_project` tool that takes the project ID directly. Use
`list_screens` first to enumerate, then `get_screen` per ID.

## Recipe — re-capture one screen

```text
1. list_screens({ projectId: "5403097764334458790" })
   → [{ id: "f2bf40ae...", title: "Workspace Overview" }, ...]

2. get_screen({ name: "projects/5403097764334458790/screens/f2bf40ae..." })
   → HTML string, design tokens, screen dimensions

3. Save the HTML to designs/stitch/<id>_<slug>.html
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
1. list_screens  → 49 screen IDs
2. for each id: get_screen
3. write designs/stitch/<id>_<slug>.html
4. update designs/stitch/DESIGN.md if tokens changed
5. add the new screen to SCREEN_PARITY.md
6. commit with:  chore(design): refresh stitch capture
7. run pnpm format:check  (the captured HTML is auto-generated, do not
   let prettier touch it — make sure designs/ is in .prettierignore)
```

`.prettierignore` already excludes `designs/**`; verify before committing.

## Tokens — what `DESIGN.md` is for

`designs/stitch/DESIGN.md` is the human-readable token reference. After
refreshing from the MCP, regenerate the relevant sections:

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

1. **Project ID is digits only.** Passing `"projects/5403097764334458790"`
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
   `./designs/stitch/` is the in-repo canonical artifact; the MCP is
   only needed for refreshes.

## Related files

- `docs/visual-parity/PLAN.md` — the M0–M6 plan that consumed the
  Stitch design
- `docs/production-readiness/DESIGN_AUDIT.md` — the structural audit
  that identified which screens needed the M2/M3 refactor
- `docs/production-readiness/SCREEN_PARITY.md` — the 27-row matrix
  that tracks each Stitch screen against the laratik-planner route
- `designs/stitch/DESIGN.md` — the captured token reference
- `tests/e2e/visual-regression.spec.ts` — the harness that uses
  captured HTML to mask dynamic data
