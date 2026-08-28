/**
 * Pure data for the Reset-Idea destructive feature — no server-only
 * imports, safe to use from both Server and Client Components.
 *
 * 2026-08-28: extracted from `src/lib/content/reset-idea.ts` so the
 * Client Component `destructive-confirm-dialog.tsx` can import the
 * bucket labels and the empty-counts constant without pulling the
 * whole server-only module into the client bundle. The previous
 * single-file shape caused `next build` to fail with:
 *
 *   "You're importing a module that depends on 'server-only'. This
 *    API is only available in Server Components in the App Router,
 *    but you are using it in the Pages Router."
 *
 * (Next 16's `next build` walks the App Router tree and fails the
 * whole build when a client bundle transitively reaches a
 * `server-only` module. The dialog renders inside a Server
 * Component, but the dialog itself is a Client Component and
 * imports `RESET_IDEA_BUCKETS` as a runtime value.)
 *
 * The server-side `getResetIdeaCounts` function stays in
 * `reset-idea.ts` and re-imports the type / constants from here
 * for backward compatibility.
 */

export type ResetIdeaCounts = Readonly<{
  contentItem: number;
  contentItemChannels: number;
  contentAssignments: number;
  comments: number;
  deliveryVersions: number;
  deliveryLinks: number;
  approvalRequests: number;
  approvalDecisions: number;
  publicationRecords: number;
  attachments: number;
  aiUsageEvents: number;
  activityEvents: number;
}>;

export const EMPTY_RESET_IDEA_COUNTS: ResetIdeaCounts = {
  contentItem: 0,
  contentItemChannels: 0,
  contentAssignments: 0,
  comments: 0,
  deliveryVersions: 0,
  deliveryLinks: 0,
  approvalRequests: 0,
  approvalDecisions: 0,
  publicationRecords: 0,
  attachments: 0,
  aiUsageEvents: 0,
  activityEvents: 0,
};

/**
 * Bucket labels in display order. The keys MUST stay in lockstep
 * with `ResetIdeaCounts` and the SQL aggregate in `reset-idea.ts`;
 * the unit test in `tests/unit/reset-idea-counts.test.ts` pins the
 * contract.
 */
export const RESET_IDEA_BUCKETS = [
  { key: "contentItem", label: "Idea (the row itself)" },
  { key: "contentItemChannels", label: "Channel schedule rows" },
  { key: "contentAssignments", label: "Assignment history rows" },
  { key: "comments", label: "Comments" },
  { key: "deliveryVersions", label: "Delivery versions" },
  { key: "deliveryLinks", label: "Delivery links" },
  { key: "approvalRequests", label: "Approval requests" },
  { key: "approvalDecisions", label: "Approval decisions" },
  { key: "publicationRecords", label: "Publication records" },
  { key: "attachments", label: "Attachments (orphaned, link cleared)" },
  { key: "aiUsageEvents", label: "AI usage events (orphaned, link cleared)" },
  { key: "activityEvents", label: "Activity events (orphaned, link cleared)" },
] as const satisfies ReadonlyArray<{
  key: keyof ResetIdeaCounts;
  label: string;
}>;
