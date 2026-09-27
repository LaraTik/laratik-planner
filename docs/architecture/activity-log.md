# Activity log

> Status: living document — last updated 2026-09-27 with the
> shared formatter + renderer refactor.

The activity log is the project's lifecycle / audit surface.
It is rendered identically in two places:

1. **Workspace-wide feed** at `/app/w/[slug]/activity` — the
   full team-wide history.
2. **Per-item timeline** on the planning detail page — the
   lifecycle of a single content item.

Both surfaces used to carry their own `humanizeKind` /
`ICON_BY_KIND` / `TONE_BY_KIND` tables. Adding a new `kind`
required touching both renderers, both icon maps, and both
tone tables. **As of 2026-09-27** this is gone: there is one
formatter, one renderer, and one source of truth for verb
templates.

---

## Pipeline

```
┌──────────────────────────┐
│ Server: listActivity*()  │   raw events (kind, summary, metadata,
│                          │   beforeData, afterData, …)
└─────────────┬────────────┘
              ▼
┌──────────────────────────┐
│ buildActivityContext()   │   batched IDs → names (designer,
│  (lib/activity/resolve)  │   channel, status enum, …) per workspace
└─────────────┬────────────┘
              ▼
┌──────────────────────────┐
│ formatActivityEvent()    │   pure function: event + context + t
│  (lib/activity/format)   │   → ActivityRenderSpec
└─────────────┬────────────┘
              ▼
┌──────────────────────────┐
│ <ActivityEntry />        │   server-renderable presentational
│  (components/activity)   │   component, identical on both surfaces
└──────────────────────────┘
```

The only file that touches `db` is `resolve.ts`. The only
file that renders is `components/activity/activity-entry.tsx`.
The formatter is the contract between them.

---

## Layer 1 — pure formatter (`lib/activity/format.ts`)

A single `switch (event.kind)` mapping every `activity_kind`
enum value to:

- a **verb template** in `messages/{en,ar}/activity.json`
  under `activity.verbs.<kind>`,
- an **icon** (`ActivityIconKind`),
- a **tone class** (semantic Tailwind classes only),
- a **diff spec** (`{field, before, after, shape}`) or `null`
  for kinds without per-field changes.

The verb template uses `{name}` placeholders for
`{target}`, `{before}`, `{after}`, `{metadata}`, `{count}`.
`{name}` interpolation mirrors the project-wide i18n helper.

For text-shaped diffs (brief, title, copy), the
`<ActivityDiff shape="text" />` primitive emits a
`<del>` (strikethrough) + `<ins>` (underline) pair inside a
collapsible `<details>` for long copy.

For chip-shaped diffs (status, date, channel), the
primitive emits two pills with an arrow between them,
tone-coded (success for promoting, warning for regressing,
neutral for no-op).

---

## Layer 2 — resolver (`lib/activity/resolve.ts`)

`buildActivityContext(workspaceId, rawEvents, locale)` runs a
small batch of SQL queries against `db`:

1. `users` for every distinct actor / foreign-key id found in
   the events.
2. `content_item_channel` + `social_channel` for every
   `contentItemChannelId` referenced.
3. `content_assignments` for every distinct `contentItemId`,
   resolving the active designer + owner.

The result is an `ActivityContext` with the following maps:

```ts
{
  statusLabels,                    // status enum → "In design"
  formatLabels,                    // format enum → "Reel"
  userById,                        // user.id → { name, email }
  channelByContentItemChannelId,   // cic.id → "Instagram · LaraTik Main"
  designerByContentItemId,         // contentItem.id → { id, name }
  ownerByContentItemId,            // contentItem.id → { id, name }
}
```

Page load is bounded — the worst case is one extra round-trip
per workspace-wide feed render (~5 ms). No in-process cache
yet; a future optimisation can wrap it in `unstable_cache` if
profiling shows it's hot.

The formatter accepts `null` for any unresolved ID and falls
back to the localised "Unknown" label with a `data-*` testid
so the regression is caught in tests.

---

## Layer 3 — shared components (`components/activity/`)

```
components/activity/
  activity-entry.tsx          # presentational row; consumes ActivityRenderSpec
  activity-diff.tsx           # <ActivityDiff/> chip / strikethrough renderer
  activity-feed.tsx           # server component: <ol> + entries (workspace)
  activity-timeline.tsx       # server component: <Card> + entries (per-item)
  index.ts                    # public exports
```

`<ActivityEntry />` is server-renderable (no `"use client"`).
It accepts a `renderTime` callback so each surface can use its
own locale-aware formatter (the workspace feed honours the
workspace timezone, the per-item timeline uses the user's
browser locale).

`<ActivityDiff />` supports two shapes:

- `chip` — short values (status, date, name). Two pills with
  an arrow, tone-coded.
- `text` — long values (brief, title, copy). Two stacked
  rows with `<del>` / `<ins>`. Long text uses a collapsible
  `<details>` so the row doesn't overflow.

---

## Layer 4 — emitter contract

The emitter side is what gives the formatter structured data
to render. Two principles:

1. **`summary` is the legacy fallback only.** The formatter
   uses the verb template; `summary` is shown only when the
   template is missing.
2. **`beforeData` / `afterData` are the contract** for any
   field the user might want to diff.

| Event                 | `kind`              | `beforeData` / `afterData`  | `metadata`                                                            |
| --------------------- | ------------------- | --------------------------- | --------------------------------------------------------------------- |
| Inline brief edit     | `brief_updated`     | `{ brief: string }`         | `{ field: "brief" }`                                                  |
| Inline title edit     | `title_updated`     | `{ title: string }`         | `{ field: "title" }`                                                  |
| Inline date edit      | `date_updated`      | `{ plannedPublishAt: ISO }` | `{ field: "date" }`                                                   |
| Status transition     | `status_transition` | `{ status: enum }`          | `{ field: "status", action }`                                         |
| Designer assigned     | `assignment`        | `{ designerId }`            | `{ field: "designer" }`                                               |
| Designer released     | `assignment`        | `{ designerId }` → `null`   | `{ field: "designer" }`                                               |
| Owner changed         | `assignment`        | `{ contentOwnerId }`        | `{ field: "owner" }`                                                  |
| Reschedule            | `schedule_change`   | `{ plannedPublishAt: ISO }` | `{ field: "date" }`                                                   |
| Publication           | `publication`       | `{ channelStatus }`         | `{ contentItemChannelId, platform, channelAccount, subkind? }`        |
| Meta publication link | `publication`       | `…`                         | `{ subkind: "meta_linked" \| "meta_refreshed" \| "meta_reconciled" }` |

Each emitter site ships with a unit test that pins the new
metadata shape. The old emitter shape (raw UUID / raw enum in
`summary`) is forbidden.

---

## Extension recipe — adding a new kind

1. Add the new value to `activity_kind` in
   `lib/db/schema/enums.ts` (this is a DDL migration; see
   `docs/architecture/migrations.md`).
2. Write the emitter call site with the appropriate
   `beforeData` / `afterData` / `metadata` (see table above).
3. Add a verb template under `activity.verbs.<kind>` in both
   `messages/en/activity.json` and
   `messages/ar/activity.json`.
4. (Only if the kind carries new ID-bearing fields) extend
   `lib/activity/resolve.ts` to look them up.
5. That's it. `<ActivityEntry />` does not change.

The kind list is exercised in
`tests/unit/planning/activity-timeline.test.tsx`. Adding a
kind without a verb template fails the
"humanises every known kind without leaking the raw enum"
test.

---

## Open decisions / risks

- **Meta publication subkind** — currently a single
  `kind: "publication"` with `metadata.subkind`. Promoted to
  distinct kinds when the volume justifies it.
- **Cache strategy for `buildActivityContext`** — single
  in-flight query is fine for now; switch to
  `unstable_cache` keyed by workspace + event-id-hash if
  profiling shows it's hot.
- **Bulk operations** — `bulk_archive`, `bulk_delete` don't
  carry per-item diffs today. Future work (out of scope)
  is per-item expansion.
- **RTL diff layout** — chip diffs collapse to a single column
  on mobile; bidi is handled by `<bdi dir="auto">` per token.
- **Workspace vs agency** — the formatter is shared across
  all workspaces; nothing workspace-specific lives in
  `components/activity`. Workspace context only enters via
  `buildActivityContext` and the i18n `t()`.
