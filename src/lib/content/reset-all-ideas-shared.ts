import type { ContentStatus } from "@/lib/content/status";

/**
 * Pure data for the bulk "Reset all ideas" destructive feature — no
 * server-only imports, safe to use from both Server and Client
 * Components.
 *
 * 2026-08-28: extracted from `src/lib/content/reset-all-ideas.ts` so
 * the Client Component `bulk-reset-confirm-dialog.tsx` can import the
 * status list and the per-status labels without pulling the whole
 * server-only module into the client bundle. The previous shape
 * caused `next build` to fail with:
 *
 *   "You're importing a module that depends on 'server-only'. This
 *    API is only available in Server Components in the App Router,
 *    but you are using it in the Pages Router."
 *
 * The 2026-08-28 `d0cc4b9` fix already established the pattern for
 * the single-idea reset (`reset-idea-shared.ts`). This file mirrors
 * it for the bulk variant. The server-side `getResetAllIdeasCounts`
 * function stays in `reset-all-ideas.ts` and re-imports the
 * constants from here for backward compatibility.
 */

export const LIVE_STATUSES: readonly ContentStatus[] = [
  "published",
  "partially_published",
] as const;

export const ALL_CONTENT_STATUSES: readonly ContentStatus[] = [
  "draft",
  "content_review",
  "approved_for_design",
  "in_design",
  "creative_review",
  "ready_to_publish",
  "partially_published",
  "published",
  "changes_requested",
  "blocked",
  "cancelled",
] as const;

export type ResetAllIdeasCounts = Readonly<{
  // Set the action will delete.
  total: number;
  byStatus: Readonly<Record<ContentStatus, number>>;
  // Context for the dialog — ideas the action will NOT delete.
  totalAllIdeas: number;
  totalExcludedByDefault: number; // live ideas skipped because includePublished=false
  totalLive: number; // total live ideas in the workspace, regardless of the toggle
}>;

export const EMPTY_RESET_ALL_COUNTS: ResetAllIdeasCounts = {
  total: 0,
  byStatus: ALL_CONTENT_STATUSES.reduce(
    (acc, status) => {
      acc[status] = 0;
      return acc;
    },
    {} as Record<ContentStatus, number>,
  ),
  totalAllIdeas: 0,
  totalExcludedByDefault: 0,
  totalLive: 0,
};

/**
 * Human label per status for the dialog's breakdown table. Mirrors
 * `humanStatus` from `src/lib/content/status.ts` but is inlined so
 * the destructive dialog can render without importing the larger
 * status module (which has format/colour helpers irrelevant here).
 */
export const CONTENT_STATUS_LABELS: Readonly<Record<ContentStatus, string>> = {
  draft: "Draft",
  content_review: "Content review",
  approved_for_design: "Approved for design",
  in_design: "In design",
  creative_review: "Creative review",
  ready_to_publish: "Ready to publish",
  partially_published: "Partially published",
  published: "Published",
  changes_requested: "Changes requested",
  blocked: "Blocked",
  cancelled: "Cancelled",
};
