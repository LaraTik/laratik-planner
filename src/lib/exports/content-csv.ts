import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentItemChannels, contentItems, socialChannels, users } from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { rowsToCsv, type CsvColumn } from "@/lib/utils/csv";
import { listWorkspaceContent } from "@/lib/content/service";

/**
 * FEAT-15 (GAP-FULL-REVIEW-2026-08-25) — content items CSV export.
 *
 * The planner can request a CSV of every content item in the
 * workspace for the given month range, with the assigned channels
 * flattened into a single column so a downstream spreadsheet
 * can pivot / filter on the data without a join.
 *
 * The query is role-gated to internal roles (the same gate the
 * planning list uses). Client reviewers cannot bulk-export the
 * workspace's plan; their surface is the client portal.
 */

export interface ContentCsvExportOptions {
  monthStart?: Date;
  monthEnd?: Date;
}

interface ContentCsvRow {
  id: string;
  title: string;
  format: string;
  status: string;
  plannedPublishAt: Date;
  ownerEmail: string | null;
  designerEmail: string | null;
  channelAccountNames: string;
  brief: string;
}

export async function exportContentItemsCsv(
  actor: Actor,
  workspaceId: string,
  opts: ContentCsvExportOptions = {},
): Promise<string> {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, [
      "workspace_manager",
      "content_planner",
      "designer",
      "internal_reviewer",
      "publisher",
    ]),
    "export_content_csv",
  );

  const items = await listWorkspaceContent(actor, workspaceId, {
    ...(opts.monthStart ? { monthStart: opts.monthStart } : {}),
    ...(opts.monthEnd ? { monthEnd: opts.monthEnd } : {}),
    limit: 5000,
  });

  if (items.length === 0) {
    // Still produce a header-only CSV so the download is well-formed.
    return rowsToCsv<ContentCsvRow>([], CSV_COLUMNS);
  }

  // Resolve owner / designer emails + channel list in two batched
  // queries so the export doesn't N+1.
  const userIds = new Set<string>();
  for (const item of items) {
    if (item.contentOwnerId) userIds.add(item.contentOwnerId);
    if (item.designerId) userIds.add(item.designerId);
  }
  const allUsers = userIds.size
    ? await db.select({ id: users.id, email: users.email }).from(users)
    : [];
  const userById = new Map(allUsers.map((u) => [u.id, u.email]));

  const channelRows = await db
    .select({
      contentItemId: contentItemChannels.contentItemId,
      accountName: socialChannels.accountName,
      platform: socialChannels.platform,
    })
    .from(contentItemChannels)
    .innerJoin(socialChannels, eq(socialChannels.id, contentItemChannels.socialChannelId));
  const channelsByItem = new Map<string, string[]>();
  for (const row of channelRows) {
    const arr = channelsByItem.get(row.contentItemId) ?? [];
    arr.push(`${row.platform}:${row.accountName}`);
    channelsByItem.set(row.contentItemId, arr);
  }

  const rows: ContentCsvRow[] = items.map((item) => ({
    id: item.id,
    title: item.title,
    format: item.format,
    status: item.status,
    plannedPublishAt: item.plannedPublishAt,
    ownerEmail: item.contentOwnerId ? userById.get(item.contentOwnerId) ?? null : null,
    designerEmail: item.designerId ? userById.get(item.designerId) ?? null : null,
    channelAccountNames: (channelsByItem.get(item.id) ?? []).sort().join("; "),
    brief: item.brief,
  }));

  return rowsToCsv<ContentCsvRow>(rows, CSV_COLUMNS);
}

const CSV_COLUMNS: CsvColumn<ContentCsvRow>[] = [
  { header: "id", get: (r) => r.id },
  { header: "title", get: (r) => r.title },
  { header: "format", get: (r) => r.format },
  { header: "status", get: (r) => r.status },
  { header: "planned_publish_at", get: (r) => r.plannedPublishAt },
  { header: "owner_email", get: (r) => r.ownerEmail },
  { header: "designer_email", get: (r) => r.designerEmail },
  { header: "channel_accounts", get: (r) => r.channelAccountNames },
  { header: "brief", get: (r) => r.brief },
];
