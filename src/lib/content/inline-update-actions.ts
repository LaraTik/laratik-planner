/**
 * Inline-editability allow-list shared by the server actions
 * (in `./inline-update.ts`) and the page-level capability flag
 * (`src/app/(app)/app/w/[slug]/planning/[id]/page.tsx`).
 *
 * Kept in a separate file from the "use server" actions because
 * Next.js will refuse to ship a server-action module that
 * exports any non-function value — including pure type /
 * constant exports.
 *
 * The constant is intentionally broader than
 * `UPDATEABLE_STATUSES` (which gates the full edit form) so a
 * planner can fix a typo / a date / a brief on an item that's
 * already in review or even ready to publish without bouncing
 * to `/planning/edit/[id]`. The materiality service then
 * invalidates affected approvals so the workflow stays
 * consistent (master prompt §4).
 */
export const INLINE_EDITABLE_STATUSES = [
  "draft",
  "content_review",
  "changes_requested",
  "approved_for_design",
  "in_design",
  "creative_review",
  "ready_to_publish",
] as const;

export type InlineEditableStatus = (typeof INLINE_EDITABLE_STATUSES)[number];
