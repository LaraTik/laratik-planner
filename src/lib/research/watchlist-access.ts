import "server-only";

import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { researchWatchlists } from "@/lib/db/schema";

/** Resolve a watchlist only when it is workspace-shared or owned by the actor. */
export async function getAccessibleResearchWatchlist(input: {
  workspaceId: string;
  actorId: string;
  watchlistId: string;
  activeOnly?: boolean;
}) {
  const [watchlist] = await db
    .select({ id: researchWatchlists.id })
    .from(researchWatchlists)
    .where(
      and(
        eq(researchWatchlists.id, input.watchlistId),
        eq(researchWatchlists.workspaceId, input.workspaceId),
        or(
          eq(researchWatchlists.shareScope, "workspace"),
          eq(researchWatchlists.createdBy, input.actorId),
        ),
        ...(input.activeOnly ? [isNull(researchWatchlists.archivedAt)] : []),
      ),
    )
    .limit(1);
  return watchlist;
}
