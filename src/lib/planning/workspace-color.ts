/**
 * Workspace colour assignment for the agency-wide calendar.
 *
 * WHY THIS EXISTS
 * The global calendar (`/app/calendar`) renders plans and tasks from
 * every workspace in the agency into one grid. Before this module the
 * day-cell card carried only a title + status badge, so two cards in
 * the same cell were indistinguishable — an admin could not tell
 * *which client* a plan belonged to without opening it.
 *
 * WHY A DERIVED COLOUR AND NOT A STORED ONE
 * The `workspace` table has no colour column (`db/schema/workspaces.ts`)
 * and no admin colour picker exists. Rather than ship a migration plus
 * a settings screen, we derive the colour from the workspace's position
 * in a stable sort. Consequences, stated plainly:
 *   - Zero migration, zero schema change, zero admin UI.
 *   - Colours are identical on every deploy and every user's machine.
 *   - Renaming a workspace can shift its colour (sort is by name).
 *     Switching the sort to `id` is a one-line change in
 *     `compareWorkspaces` if that ever matters.
 *   - Beyond six workspaces the palette cycles, so two workspaces can
 *     share a colour. The workspace NAME is always rendered next to
 *     the dot, so colour is a redundant cue, never the only one
 *     (WCAG 1.4.1 "color-not-only").
 *
 * The tokens consumed are the design system's existing
 * `--chart-series-1..6`, which are already defined separately for light
 * and dark surfaces (`app/globals.css`) and were chosen for chart
 * legibility. Reusing them means workspace identity inherits that
 * theme-aware contrast work instead of introducing raw hex.
 */

/** Number of distinct colour slots (matches `--chart-series-1..6`). */
export const WORKSPACE_SERIES_SLOTS = 6 as const;

/**
 * CSS variable reference for a colour slot. Returned as a string so it
 * can be assigned through an inline `style`, matching how the social
 * analytics dashboard already consumes these tokens (they are not
 * exposed as Tailwind colour utilities).
 */
export function workspaceSeriesVar(slot: number): string {
  const index =
    ((Math.trunc(slot) % WORKSPACE_SERIES_SLOTS) + WORKSPACE_SERIES_SLOTS) % WORKSPACE_SERIES_SLOTS;
  return `var(--chart-series-${index + 1})`;
}

/**
 * Stable ordering for colour assignment: by name, case-insensitively,
 * with the workspace id as tie-breaker so two workspaces sharing a name
 * still get a deterministic (and distinct) order.
 *
 * Deliberately locale-independent. `localeCompare` with a locale would
 * make the resulting colours depend on which server locale happened to
 * be running — the same workspace could be a different colour on two
 * different hosts.
 */
export function compareWorkspaces(
  a: { id: string; name: string },
  b: { id: string; name: string },
): number {
  const byName = a.name.toLowerCase().localeCompare(b.name.toLowerCase(), "en");
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
}

/**
 * Assign a colour slot to every workspace.
 *
 * Call this ONCE per render with the full workspace list, then look
 * slots up by id. Assigning from the full list is what guarantees that
 * adjacent workspaces get adjacent colours — computing the slot from a
 * single workspace in isolation (e.g. a hash) would let two workspaces
 * in the same agency collide while a third sits unused.
 */
export function assignWorkspaceSeries(
  workspaces: readonly { id: string; name: string }[],
): Map<string, number> {
  const ordered = [...workspaces].sort(compareWorkspaces);
  const slots = new Map<string, number>();
  ordered.forEach((workspace, index) => {
    slots.set(workspace.id, index % WORKSPACE_SERIES_SLOTS);
  });
  return slots;
}

/**
 * Look up a workspace's colour slot, tolerating a workspace that is not
 * in the supplied list (a plan whose workspace was archived, or an event
 * the calendar returned without a workspace).
 *
 * Returns `null` for a missing workspace so the card can omit the dot
 * entirely rather than painting a meaningless colour — an event with no
 * workspace must not look like it belongs to slot 0's workspace.
 */
export function workspaceSeriesSlot(
  slots: ReadonlyMap<string, number>,
  workspaceId: string | null | undefined,
): number | null {
  if (!workspaceId) return null;
  const slot = slots.get(workspaceId);
  return slot === undefined ? null : slot;
}
