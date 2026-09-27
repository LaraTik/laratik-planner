/**
 * Pure formatters for sidebar badge counts.
 *
 * Lives in its own file (not in `./badges.ts`) because the
 * server-only `badges.ts` module is forbidden in client
 * components. The sidebar is a `"use client"` component so it
 * can only import client-safe helpers from this file.
 */

/**
 * Maximum badge count we render before collapsing to "99+".
 *
 * Matches `BADGE_CAP` in `./badges.ts`. The two constants are
 * intentionally duplicated: this module is client-importable and
 * cannot reach the server-only module's constant; the server
 * side caps upstream via `cap(n)` and the client side caps the
 * display string here. Both numbers stay in lock-step.
 */
export const BADGE_DISPLAY_CAP = 99;

/**
 * Format a raw badge count for the rail pill.
 *
 * The raw number is already capped at `BADGE_CAP` (99) by the
 * upstream `cap(n)` helper so the sidebar never tries to render a
 * three-digit pill that wraps inside a 24×24 chip. This formatter
 * is the display layer that turns `100` → `"99+"`, `0` → `"0"` (so
 * the caller can hide the pill on falsy), `n` → `String(n)`.
 *
 * UI rendering contract:
 *   - `clampBadge(0)` → `"0"` — caller decides to hide.
 *   - `clampBadge(7)` → `"7"`.
 *   - `clampBadge(99)` → `"99"`.
 *   - `clampBadge(100)` → `"99+"` (cap reached).
 *
 * Non-finite inputs (`NaN`, `Infinity`) collapse to `"0"` so a
 * corrupt count never produces `"NaN+"` or `"∞"`. Negative counts
 * also collapse to `"0"`; an actionable queue should never be
 * negative.
 */
export function clampBadge(count: number): string {
  if (!Number.isFinite(count) || count < 0) return "0";
  if (count === 0) return "0";
  if (count > BADGE_DISPLAY_CAP) return `${BADGE_DISPLAY_CAP}+`;
  return String(count);
}
