import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { socialChannels } from "@/lib/db/schema";

export async function getActiveWorkspaceChannelIds(workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ id: socialChannels.id })
    .from(socialChannels)
    .where(
      and(
        eq(socialChannels.workspaceId, workspaceId),
        eq(socialChannels.isActive, true),
        isNull(socialChannels.archivedAt),
      ),
    );
  return rows.map((row) => row.id);
}

export function assertWorkspaceChannelSelection(
  requestedIds: readonly string[],
  activeIds: readonly string[],
  errorMessage: string,
): void {
  const activeIdSet = new Set(activeIds);
  if (requestedIds.some((channelId) => !activeIdSet.has(channelId))) {
    throw new Error(errorMessage);
  }
}
