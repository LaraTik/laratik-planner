import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db as appDb } from "@/lib/db";
import { socialChannels, socialPostObservations } from "@/lib/db/schema";
import { SocialProviderError } from "@/lib/social/http";
import { blankToNull } from "@/lib/social/media-fields";
import {
  fetchMetaPostMediaFields,
  type MetaPostMediaFields,
} from "@/lib/social/providers/meta-media-fields";

type Db = typeof appDb;

export interface ThumbnailBackfillResult {
  /** Distinct posts considered, i.e. rows whose thumbnail was null. */
  candidates: number;
  /** Posts whose thumbnail was filled in. */
  updated: number;
  /** Candidates the provider returned no image for. */
  stillMissing: number;
  /** Candidates that could not be fetched, with the reason. */
  failed: Array<{ postId: string; reason: string }>;
}

/**
 * Backfill `thumbnail_url` (and `caption`, which rides along on the same
 * request) for posts whose provider sync never returned a preview image.
 *
 * Deliberately narrow, because the whole point is to stop spending provider
 * calls on data we already have:
 *
 *   - it only SELECTs rows where `thumbnail_url IS NULL`, so a post that
 *     already has an image is never re-fetched and never overwritten;
 *   - it works on DISTINCT posts, not observation rows, so the nine daily
 *     snapshots of one post cost one call, not nine;
 *   - it is bounded by an explicit `limit`, so a large workspace cannot
 *     produce an unbounded burst of API traffic;
 *   - it takes a token only for a workspace whose caller is already
 *     authorised — this function performs no permission check of its own.
 *
 * Rows are updated in place by their primary key, so `observation_date`,
 * `observed_at` and the snapshot history are left exactly as they were.
 */
export async function backfillMissingThumbnails(
  database: Db,
  workspaceId: string,
  accessToken: string,
  options: { apiVersion?: string | null; limit?: number } = {},
): Promise<ThumbnailBackfillResult> {
  const limit = Math.min(Math.max(options.limit ?? 25, 1), 100);

  // One row per post that still has no image. `row_number()` picks the newest
  // snapshot so the update writes the representative row, and the GROUP BY
  // keeps the candidate set to distinct posts.
  // Fetch a bounded window of rows that have no image, newest first, then
  // collapse to one row per post so a post with nine daily snapshots costs
  // one provider call rather than nine.
  const rows = await database
    .select({
      id: socialPostObservations.id,
      socialChannelId: socialPostObservations.socialChannelId,
      externalPostId: socialPostObservations.externalPostId,
      externalProvider: socialPostObservations.externalProvider,
      platform: socialChannels.platform,
    })
    .from(socialPostObservations)
    .innerJoin(socialChannels, eq(socialChannels.id, socialPostObservations.socialChannelId))
    .where(
      and(eq(socialChannels.workspaceId, workspaceId), isNull(socialPostObservations.thumbnailUrl)),
    )
    .orderBy(desc(socialPostObservations.observationDate))
    // Over-fetch relative to `limit` so collapsing snapshots still yields a
    // full set of distinct posts.
    .limit(limit * 10);

  const seenPosts = new Set<string>();
  const candidates = rows.filter((row) => {
    const key = `${row.socialChannelId}|${row.externalProvider}|${row.externalPostId}`;
    if (seenPosts.has(key)) return false;
    seenPosts.add(key);
    return true;
  });

  const result: ThumbnailBackfillResult = {
    candidates: candidates.length,
    updated: 0,
    stillMissing: 0,
    failed: [],
  };

  for (const row of candidates.slice(0, limit)) {
    // A row with no external post id cannot be re-fetched: there is nothing
    // to ask the provider about.
    // Both guards narrow the same value up front: a row with no external
    // post id cannot be re-fetched (there is nothing to ask about), and a
    // tiktok row has no provider path here — reporting it is better than
    // calling an endpoint that does not exist.
    const { externalPostId, platform } = row;
    if (externalPostId === null) {
      result.failed.push({ postId: "unknown", reason: "not_found" });
      continue;
    }
    if (platform === null) {
      result.failed.push({ postId: externalPostId, reason: "not_configured" });
      continue;
    }
    if (platform === "tiktok") {
      result.failed.push({ postId: externalPostId, reason: "provider_unsupported" });
      continue;
    }
    let media: MetaPostMediaFields | null;
    try {
      media = await fetchMetaPostMediaFields({
        platform,
        publicationId: externalPostId,
        accessToken,
        apiVersion: options.apiVersion ?? null,
      });
    } catch (error) {
      const reason = error instanceof SocialProviderError ? error.code : "provider_unavailable";
      result.failed.push({ postId: row.externalPostId, reason });
      continue;
    }

    if (!media || media.thumbnailUrl === null) {
      result.stillMissing += 1;
      continue;
    }

    await database
      .update(socialPostObservations)
      .set({ thumbnailUrl: media.thumbnailUrl, caption: blankToNull(media.caption) })
      .where(eq(socialPostObservations.id, row.id));
    result.updated += 1;
  }

  return result;
}

/** Count the posts a backfill would currently consider. */
export async function countPostsMissingThumbnails(
  database: Db,
  workspaceId: string,
): Promise<number> {
  const rows = await database
    .select({
      postId: sql<string>`(${socialPostObservations.socialChannelId}::text || '|' || ${socialPostObservations.externalProvider} || '|' || ${socialPostObservations.externalPostId})`,
    })
    .from(socialPostObservations)
    .innerJoin(socialChannels, eq(socialChannels.id, socialPostObservations.socialChannelId))
    .where(
      and(eq(socialChannels.workspaceId, workspaceId), isNull(socialPostObservations.thumbnailUrl)),
    );
  return new Set(rows.map((row) => row.postId)).size;
}
