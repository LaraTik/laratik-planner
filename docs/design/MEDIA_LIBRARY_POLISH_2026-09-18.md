# Media library polish — agency switcher, upload dialog, folder-tree layout (2026-09-18)

Three independent UX fixes on top of the
[`MEDIA_LIBRARY_AUDIT_2026-09-16`](./MEDIA_LIBRARY_AUDIT_2026-09-16.md)
audit. The agency-level `/app/media` surface felt busy and did not
let users switch workspaces in-place; this pass addresses that.

## 1. Agency workspace switcher

### What was wrong

`AgencyWorkspaceChip` (in `src/components/media/media-library-page.tsx`)
was a `<div>` that showed the active workspace name and a count of
total agency workspaces. Clicking it did nothing. The only path to
switch workspaces was the sidebar `<WorkspaceSwitcher>`, which called
`getWorkspaceSwitchPath(pathname, w.slug)`:

```ts
const match = pathname.match(/^\/app\/w\/[^/]+(?:\/(.*))?$/);
if (!match) return `/app/w/${workspaceSlug}`;
```

Because `/app/media` does not match that pattern, every workspace
switch from the agency page kicked the user to `/app/w/<slug>` (a
different route), abandoning the active `q`, `kind`, `view`, `trash`,
`folder`, `shared`, `sort`, and `page` filters.

### What changed

New component `src/components/media/media-agency-workspace-switcher.tsx`
(visual rhythm mirrors `<AgencySwitcher>`). Trigger is a briefcase +
name + chevrons glyph `<button aria-haspopup="listbox">`. Popover
content renders three sections:

- a header label (`Switch workspace`)
- a portal-mounted `<ul role="listbox" tabIndex={0}>` whose
  `onOpenAutoFocus` overrides Radix's default to focus the listbox
  rather than the first tabbable descendant, so arrow-key nav lands
  without a second click
- a synthetic leading row `All workspaces` (value `""`) that
  matches the existing `page.tsx` cross-workspace convention
  (`selectedWorkspaceId === ""` → no `workspaceId` filter on
  `listMediaAssetsPage`).

ArrowDown / ArrowUp / Home / End / Enter are bound at the listbox
level. `onMouseEnter` mirrors the hover state. The trigger label
toggles between `active.name` (when one workspace is selected) and
`All workspaces` (when none is).

Three fallback branches cover the rest of the matrix:

| Options | Active | Rendered branch                                                      |
| ------- | ------ | -------------------------------------------------------------------- |
| 0       | any    | disabled dashed-border chip (`noWorkspacesAria`)                     |
| 1       | any    | static badge (no popover) — `media-agency-workspace-switcher-single` |
| ≥ 2     | any    | popover with `All + options` rows                                    |

The `MediaLibraryActions` parent gates the chip on
`mode === "agency" && agencyWorkspaces.length >= 2` — so a single-
workspace agency still gets a sensible header (a static badge with
the workspace name).

### URL preservation on switch

`buildHref(workspaceId)` deep-copies `preserveParams` and appends
`?workspace=` exactly when `workspaceId !== ""`. Every filter
prop except `selected=` (which is selection-store state, intentionally
omitted) carries across. Re-selecting the active option is a no-op
(no `router.push`).

## 2. "Add media" dialog

### What was wrong

`<MediaSourcePicker>` rendered inline on first paint as
`<div id="media-upload">` containing the `<MediaUploadForm>` +
`<MediaLinkImporter>` tabs. On a fresh `/app/media` this added
~250 lines of DOM _above_ the library content. The header CTA was a
plain `<a href="#media-upload">` that scrolled to the inline form.

### What changed

New component `src/components/media/media-upload-dialog.tsx` is a
Radix `<Dialog>` with `max-w-3xl` and `max-h-[min(90dvh,900px)]`.
Body: the same tabs + `<MediaUploadForm>` + `<MediaLinkImporter>`
that the inline picker used to mount. Header CTA is a `<Button>`
that flips local `useState(false) → true` to open the dialog.

The dialog supports a "busy" guard that intercepts `Escape`, backdrop
clicks, and the `×` close button. The flag is wired through `busy`
on `<MediaUploadDialog>`; v1 ships with a non-busy default so callers
that re-render with in-flight uploads get a working extension point.
The footer ships a secondary `<DialogClose>` button (always visible)
and a small hint line that swaps to `media.uploadDialog.busyHint`
when busy.

`<MediaSourcePicker>` is left intact as a back-compat source so the
per-workspace route `/app/w/[slug]/media` (which mounts the picker
directly) keeps working without a contract change.

## 3. Folder tree polish

### What changed in `media-folder-tree.tsx`

| Old                                                                                  | New                                                                                                                                      |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| One flat nav: All media, Unfiled, roots…, Agency shared                              | Three sections with `<h3>` labels: `Quick filters` / `Folders` / `Shared`                                                                |
| Four inline icon buttons per row (`Info`, `FolderPlus`, `Pencil`, `Trash2`)          | One `<DropdownMenu>` kebab per row with the same four actions                                                                            |
| `style={{ paddingInlineStart: \`${0.25 + depth * 0.75}rem\` }}`                      | `<aside style={\`--tree-indent: 0.5rem; --tree-indent-step: 1rem\`}>`+`calc(var(--tree-indent) + (depth - 1) * var(--tree-indent-step))` |
| No header controls                                                                   | New row: title + `<Search>`-prefixed input + `Expand all` / `Collapse all` + (capable) `New folder` button                               |
| `min-h-10` rows                                                                      | `min-h-11` rows + `h-9 w-9` chevron                                                                                                      |
| `<aside className="lg:w-64">`                                                        | `<aside>` (sidebar width is set by the parent; bumped to `lg:w-72 / xl:w-80` in `media-library-page.tsx`)                                |
| Create form rendered inline                                                          | Sticky-footer `<form>` so the tree stays scrollable while typing                                                                         |
| Nav tree pushed the layout down                                                      | Wrapped in `max-h-[60vh] overscroll-contain overflow-y-auto` for independent scroll                                                      |
| Selecting the all/active option expanded rows under user mouse leaves no scroll lock | Search input client-side filters folders by name, keeping ancestors expanded when a match is buried under parents                        |

### WAI-ARIA preserved

`role="tree"` / `role="treeitem"` / `role="group"` /
`aria-level` / `aria-expanded` / `aria-selected` continue to be
emitted exactly as before. The kebab menu inherits Radix's correct
`role="menu"` + `role="menuitem"` contract so screen readers see
"Folder actions" with the action labels.

### i18n

The parent `media-library-page.tsx` continues to inject a `labels`
prop into `<MediaFolderTree>`. The new polish namespace lives at
`labels.polish.{ section, actions, ... }`. All new strings ship in
both `en` and `ar`. `tests/unit/i18n/catalogs.test.ts` enforces
parity.

## Tests

Two new unit files; the rest of the suite is unchanged and green:

- `tests/unit/media/media-agency-workspace-switcher.test.tsx` (6 tests) —
  trigger renders active name, click opens popover, `ArrowDown` x3 +
  `Enter` calls `router.push` with the right preserved params,
  "All workspaces" strips `?workspace=`, re-selecting active is a
  no-op, 0 options renders the disabled empty chip, 1 workspace
  renders the static single badge.
- `tests/unit/media/media-folder-tree.test.tsx` (7 tests) — three
  section headings render with polish labels, Expand-all / Collapse-
  all flips chevrons, kebab shows four actions when `canManage`,
  kebab is `null` when `!canManage`, search filter narrows visible
  rows, aside sets `--tree-indent` / `--tree-indent-step`,
  empty-state copy renders when there are no folders.

`pnpm typecheck` clean. `pnpm test:unit` → **3491 passed | 4 todo
(3495 total)** including all prior media tests
(`bulk-cap`, `selection-store`, `sanitize-tags`, `folders`,
`share-token`, `media-assets-zip`, `media-bulk-header`,
`media-folder-sidebar`, `i18n/catalogs`).

## Future-work notes (deferred, see plan §"Unresolved decisions")

- `Cmd/Ctrl+U` keyboard shortcut for opening the upload dialog.
- `localStorage` persistence for `expanded` set per workspace.
- Kebab "Select all assets in folder" item (uses selection store's
  existing `setMany`).
- Auto-open the upload dialog when the grid is empty AND `canUpload`
  (today: out, manual affordance only).
- The legacy `<MediaFolderSidebar>` component is preserved per the
  2026-09-16 audit; delete in a follow-up release after one more
  cycle of consumption.
