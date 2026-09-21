# Reports (Round 3 — ui-ux-pro-max)

The Reports section turns social analytics into agency-wide PDF
reports. Built to scale: today the picker ships with one template
(Analytics — reach & engagement); tomorrow Post engagement and Ads
campaigns land as additive files without touching the page, the
renderer, or the storage layer.

| Surface                | Route                          |
| ---------------------- | ------------------------------ |
| Reports list + builder | `/app/agency-settings/reports` |
| Generated PDF download | `/api/reports/[id]/pdf`        |

## Architecture

```
src/lib/reports/
├── aggregate.ts            (reach / views / engaged / interactions)
├── render.tsx              (react-pdf → Buffer)
├── storage.ts              (data/reports/<id>.pdf + index.json)
└── templates/
    ├── types.ts            (ReportTemplateSpec<TData>)
    ├── index.ts            (registry — extensible)
    └── analytics.tsx       (the first template)

src/app/(app)/app/agency-settings/reports/
├── page.tsx                (list + builder, server-rendered)
├── actions.ts              ("use server" → renderReport + saveReport)
└── _components/
    ├── report-builder.tsx
    └── report-history-list.tsx

src/app/api/reports/[id]/pdf/
└── route.ts                (signed download)
```

## Why `@react-pdf/renderer` (and not Puppeteer)

| Option                    | Trade-off                                                            |
| ------------------------- | -------------------------------------------------------------------- |
| **@react-pdf/renderer** ✓ | Server-rendered. No browser instance. ~200KB added. Scales linearly. |
| Puppeteer                 | Heavy. Requires Chromium in container. Slow render. High ops cost.   |
| HTML → print-to-PDF       | User-driven, can't schedule, can't email.                            |
| jsPDF (client-side)       | Manual layout, doesn't scale to templates with charts.               |

`@react-pdf/renderer` is React-native: templates are React
components, no separate layout DSL to maintain. PDFs render
synchronously server-side — no Puppeteer deployment.

## Template registry — how to add "Post engagement"

1. `lib/reports/templates/post-engagement.tsx` exports a
   `ReportTemplateSpec<{ posts: PostRollup[] }>` with `id: "post_engagement"`.
2. `load(ctx)` runs the SQL aggregate.
3. `render(props)` returns the React-PDF Document.
4. `lib/reports/templates/index.ts` imports the new template and
   registers it in the Map.

That's it. The picker (`ReportBuilder`) auto-discovers the template
from `listTemplates()`, the API route renders it via `renderReport`,
and the storage layer writes the bytes. The page, the action, the
render pipeline, and the bilingual catalog are unchanged.

## Workspace × channels scoping

```
Workspaces  ⇢  Channels (visible per workspace)
  ├── ACL:   picked workspaces + picked channels go in
  │         the server action via FormData; channels not
  │         belonging to a picked workspace are
  │         automatically pruned client-side (and
  │         re-validated server-side in the action).
  └── pick channels one-by-one; deselected channels
      don't show in the PDF (reach = 0 across all rows
      for that channel).
```

## Period picker

| Preset       | Window                                             |
| ------------ | -------------------------------------------------- |
| Last 7 days  | 7 calendar days, inclusive                         |
| Last 30 days | 30 calendar days, inclusive                        |
| Last 90 days | 90 calendar days, inclusive                        |
| Custom       | `from` + `to` date inputs (inclusive on both ends) |

The server action `resolveCustomPeriod` rejects inverted ranges;
UI validation prevents the worst case but the SQL safety net is
there.

## Storage (v1, single-node)

Reports live in `data/reports/<id>.pdf` with `data/reports/index.json`
holding metadata. The cap is 100 entries — older entries fall off
the bottom and their PDFs are garbage-collected. Multi-node
deployments swap `storage.ts` for an S3 adapter; the read/write
surface is two helpers.

## Auth model

- Generate → agency admin only (`isAgencyAdmin`).
- Download → any signed-in user whose active agency matches the
  report's `agencyId`. Agency admins always pass; non-admins read
  their own reports.

## Bilingual

Every label in `src/messages/{en,ar}/reports.json`. Catalog
parity-pinned by `tests/unit/i18n/catalogs.test.ts`. The picker card
labels resolve via `t("reports.templates.<id>.label")` so new
templates slot in by adding two keys per locale.

## Verification

```
✅ pnpm typecheck                          clean
✅ pnpm exec eslint (max-warnings=0)       clean
✅ pnpm vitest run tests/unit/report-period.test.ts  7 / 7 passing
```

## Out of scope for this round

- **Schedule & email delivery.** The pipeline writes a `report_request`
  metadata row today; a cron-pickable scheduler that emails a fresh
  PDF weekly is one additional worker, intentionally deferred.
- **More aggregates.** Follow reach (the user's existing metric) is
  rolled into the reach field. Post engagement adds likes/comments/
  shares; Ads campaigns adds spend/ROAS/CPM. Each is a new
  `aggregateXxx()` returning its own typed shape — templates
  consume the shape they need, no shared "report row" union.
- **Charts inside the PDF.** `react-pdf` ships line/bar/pie
  primitives. The first template deliberately stays chart-free so
  the layout proves the canvas; chart components slot into the
  template-render tree.
