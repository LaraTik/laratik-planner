import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Reset-idea destructive operation (FEAT-DESTRUCTIVE-IDEA-2026-08-28).
 *
 * The "Reset idea" button on the content detail page is a hard
 * kill switch that runs `DELETE FROM content_item WHERE id = $1` and
 * lets the foreign-key CASCADEs do the rest. This module owns the
 * pre-flight transparency data: a single SQL aggregate that returns
 * the count of every child row that will be removed (cascade) or
 * orphaned (set-null), so the confirm dialog can show "1 idea, 12
 * channels, 4 comments…" instead of an opaque "this will delete
 * things" prompt.
 *
 * The data shape is intentionally exhaustive — we list every child
 * table that references `content_item`, not just the most
 * consequential ones. Operators triaging an idea need to know if
 * there are 0 attachments vs 14, and a missing bucket would hide
 * that.
 *
 * Cascade children (DB deletes them when content_item is deleted):
 *   - content_item_channel
 *   - content_assignment
 *   - comment
 *   - delivery_version
 *   - delivery_link         (via delivery_version)
 *   - approval_request
 *   - approval_decision     (via approval_request)
 *   - publication_record    (via content_item_channel)
 *
 * Set-NULL children (rows survive with content_item_id = NULL):
 *   - attachment
 *   - ai_usage_event
 *   - activity_event
 *
 * Anything not listed here is either not tied to a content_item
 * (e.g. social_channel, agency, workspace) or has a NOT NULL
 * constraint that the DB rejects if we tried to NULL it out — the
 * pre-flight would fail at the DELETE anyway.
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

type CountRow = {
  content_item: string;
  content_item_channels: string;
  content_assignments: string;
  comments: string;
  delivery_versions: string;
  delivery_links: string;
  approval_requests: string;
  approval_decisions: string;
  publication_records: string;
  attachments: string;
  ai_usage_events: string;
  activity_events: string;
};

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && "rows" in result) {
    const rows = (result as { rows?: unknown }).rows;
    return Array.isArray(rows) ? (rows as T[]) : [];
  }
  return [];
}

function toCounts(row: CountRow): ResetIdeaCounts {
  return {
    contentItem: Number(row.content_item),
    contentItemChannels: Number(row.content_item_channels),
    contentAssignments: Number(row.content_assignments),
    comments: Number(row.comments),
    deliveryVersions: Number(row.delivery_versions),
    deliveryLinks: Number(row.delivery_links),
    approvalRequests: Number(row.approval_requests),
    approvalDecisions: Number(row.approval_decisions),
    publicationRecords: Number(row.publication_records),
    attachments: Number(row.attachments),
    aiUsageEvents: Number(row.ai_usage_events),
    activityEvents: Number(row.activity_events),
  };
}

/**
 * Read the per-table counts for the destructive "Reset idea" pre-flight.
 *
 * Returns `EMPTY_RESET_IDEA_COUNTS` (zeros, not null) when the idea
 * doesn't exist — the caller can decide whether to surface an empty
 * confirm ("nothing to delete") or a 404.
 */
export async function getResetIdeaCounts(contentItemId: string): Promise<ResetIdeaCounts> {
  // The single round-trip keeps this safe to call from the page
  // server component on every render. Each subquery is an indexed
  // lookup (FK column on every child table) so the total runtime
  // is bounded by Postgres' per-statement cost.
  const result = await db.execute<CountRow>(sql`
    SELECT
      (SELECT COUNT(*)::int FROM content_item WHERE id = ${contentItemId}) AS content_item,
      (SELECT COUNT(*)::int FROM content_item_channel WHERE content_item_id = ${contentItemId})
        AS content_item_channels,
      (SELECT COUNT(*)::int FROM content_assignment WHERE content_item_id = ${contentItemId})
        AS content_assignments,
      (SELECT COUNT(*)::int FROM comment WHERE content_item_id = ${contentItemId})
        AS comments,
      (SELECT COUNT(*)::int FROM delivery_version WHERE content_item_id = ${contentItemId})
        AS delivery_versions,
      (SELECT COUNT(*)::int FROM delivery_link dl
        INNER JOIN delivery_version dv ON dv.id = dl.delivery_version_id
        WHERE dv.content_item_id = ${contentItemId})
        AS delivery_links,
      (SELECT COUNT(*)::int FROM approval_request WHERE content_item_id = ${contentItemId})
        AS approval_requests,
      (SELECT COUNT(*)::int FROM approval_decision ad
        INNER JOIN approval_request ar ON ar.id = ad.approval_request_id
        WHERE ar.content_item_id = ${contentItemId})
        AS approval_decisions,
      (SELECT COUNT(*)::int FROM publication_record pr
        INNER JOIN content_item_channel cic ON cic.id = pr.content_item_channel_id
        WHERE cic.content_item_id = ${contentItemId})
        AS publication_records,
      (SELECT COUNT(*)::int FROM attachment WHERE content_item_id = ${contentItemId})
        AS attachments,
      (SELECT COUNT(*)::int FROM ai_usage_event WHERE content_item_id = ${contentItemId})
        AS ai_usage_events,
      (SELECT COUNT(*)::int FROM activity_event WHERE content_item_id = ${contentItemId})
        AS activity_events
  `);
  const rows = resultRows<CountRow>(result);
  if (rows.length === 0 || !rows[0]) return EMPTY_RESET_IDEA_COUNTS;
  return toCounts(rows[0]);
}

/**
 * Bucket labels in display order. The keys MUST stay in lockstep
 * with `ResetIdeaCounts` and the SQL aggregate above; the unit test
 * in `tests/unit/reset-idea-counts.test.ts` pins the contract.
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
