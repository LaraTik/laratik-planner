import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentItemChannels, contentItems, socialChannels } from "@/lib/db/schema";
import type { EnrichedContentItem } from "@/lib/content/enriched-list";

const QUERY_BATCH_SIZE = 500;

export interface CreativeExportData {
  payload: Record<string, unknown>;
  mediaRequired: boolean;
  channels: ChannelCopyExportData[];
}

export interface ChannelCopyExportData {
  socialChannelId: string;
  platform: string;
  accountName: string;
  plannedPublishAtOverride: Date | null;
  caption: string | null;
  callToAction: string | null;
  hashtags: string[];
  platformPayload: Record<string, unknown>;
}

export async function loadCreativeExportData(
  workspaceId: string,
  items: readonly EnrichedContentItem[],
): Promise<Map<string, CreativeExportData>> {
  const output = new Map<string, CreativeExportData>();
  const ids = items.map((item) => item.id);
  for (let offset = 0; offset < ids.length; offset += QUERY_BATCH_SIZE) {
    const batch = ids.slice(offset, offset + QUERY_BATCH_SIZE);
    const creativeRows = await db
      .select({
        id: contentItems.id,
        formatPayload: contentItems.formatPayload,
        mediaRequired: contentItems.mediaRequired,
      })
      .from(contentItems)
      .where(and(eq(contentItems.workspaceId, workspaceId), inArray(contentItems.id, batch)));
    for (const row of creativeRows) {
      output.set(row.id, {
        payload: asRecord(row.formatPayload),
        mediaRequired: row.mediaRequired,
        channels: [],
      });
    }

    const channelRows = await db
      .select({
        contentItemId: contentItemChannels.contentItemId,
        socialChannelId: contentItemChannels.socialChannelId,
        platform: socialChannels.platform,
        accountName: socialChannels.accountName,
        plannedPublishAtOverride: contentItemChannels.plannedPublishAtOverride,
        caption: contentItemChannels.caption,
        callToAction: contentItemChannels.callToAction,
        hashtags: contentItemChannels.hashtags,
        platformPayload: contentItemChannels.platformPayload,
      })
      .from(contentItemChannels)
      .innerJoin(contentItems, eq(contentItems.id, contentItemChannels.contentItemId))
      .innerJoin(socialChannels, eq(socialChannels.id, contentItemChannels.socialChannelId))
      .where(
        and(
          eq(contentItems.workspaceId, workspaceId),
          eq(socialChannels.workspaceId, workspaceId),
          inArray(contentItems.id, batch),
        ),
      );
    for (const row of channelRows) {
      output.get(row.contentItemId)?.channels.push({
        socialChannelId: row.socialChannelId,
        platform: row.platform,
        accountName: row.accountName,
        plannedPublishAtOverride: row.plannedPublishAtOverride,
        caption: row.caption,
        callToAction: row.callToAction,
        hashtags: row.hashtags,
        platformPayload: asRecord(row.platformPayload),
      });
    }
  }
  return output;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}
