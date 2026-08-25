import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { contentItemChannels, contentItems } from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { revalidatePath } from "next/cache";

/**
 * Planning library — content-item clone (FEAT-06).
 *
 * `duplicateContentItem` is §14's required command. The §2 "v1
 * scope" calls it out as the way a planner reuses a winning
 * post without re-keying the brief.
 *
 * What we copy:
 *   - The `content_items` row, with:
 *       title  → "<original> (copy)"
 *       status → "draft"
 *       revision → 0
 *       archivedAt/archivedBy/cancellationReason/blockedReason → cleared
 *       designer / reviewer fields → null (the new copy has no team yet)
 *       approvedDeliveryVersionId → null
 *       createdBy/updatedAt → now()
 *   - The `content_item_channels` rows (one per social channel), with
 *     the per-channel override schedule dropped (the new copy
 *     inherits the default planned_publish_at).
 *
 * What we DO NOT copy:
 *   - delivery_versions / delivery_links (the new copy has no
 *     creative history)
 *   - approval_requests / approval_decisions
 *   - comments / comment_mentions
 *   - publication records (none should exist on the original by the
 *     time the user clicks Duplicate, but we filter defensively)
 *   - assignment history (the new copy is owned by the actor)
 *
 * Authz: workspace_manager / content_planner. The actor must have
 * read access to the source item; the helper performs the same
 * `hasWorkspaceRole` check the rest of the planning surface uses.
 */

export interface DuplicateContentItemOptions {
  /**
   * Optional override for the new copy's planned publish date. When
   * omitted, the source's date is reused (handy for "duplicate last
   * week's winner to plan the same slot next week"). Pass `null` to
   * push the copy to today + 7 days.
   */
  plannedPublishAt?: Date | null;
}

export async function duplicateContentItem(
  actor: Actor,
  sourceId: string,
  opts: DuplicateContentItemOptions = {},
): Promise<{ id: string }> {
  const [source] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, sourceId))
    .limit(1);
  if (!source) throw new Error("Content item not found");

  await requirePolicy(
    hasWorkspaceRole(actor, source.workspaceId, ["workspace_manager", "content_planner"]),
    "duplicate_content_item",
  );

  const planned = opts.plannedPublishAt ?? undefined;

  return await db.transaction(async (tx) => {
    const [clone] = await tx
      .insert(contentItems)
      .values({
        workspaceId: source.workspaceId,
        campaignId: source.campaignId,
        contentPillarId: source.contentPillarId,
        title: `${source.title} (copy)`,
        format: source.format,
        brief: source.brief,
        formatPayload: source.formatPayload,
        // The default for the new copy is the source's date, unless
        // the caller explicitly passed a different one (or null to
        // push it to next week).
        plannedPublishAt:
          planned === undefined
            ? source.plannedPublishAt
            : (planned ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
        status: "draft",
        priority: source.priority,
        contentOwnerId: actor.id,
        createdBy: actor.id,
        revision: 0,
      })
      .returning({ id: contentItems.id });
    if (!clone) throw new Error("Failed to duplicate content item");

    // Copy the per-channel selection (without the per-channel
    // override schedule — the new copy uses the default).
    const sourceChannels = await tx
      .select({ socialChannelId: contentItemChannels.socialChannelId })
      .from(contentItemChannels)
      .where(eq(contentItemChannels.contentItemId, sourceId));
    if (sourceChannels.length > 0) {
      await tx.insert(contentItemChannels).values(
        sourceChannels.map((c) => ({
          contentItemId: clone.id,
          socialChannelId: c.socialChannelId,
        })),
      );
    }
    revalidatePath(`/app/w/`);
    return { id: clone.id };
  });
}

/**
 * Read helper: returns the source's channel-ids so the UI can show
 * "this copy will be scheduled on N channels" before the user
 * confirms. Pure function over the source id; no authz check
 * (the action layer already gated the source).
 */
export async function listChannelIdsForContentItem(contentItemId: string): Promise<string[]> {
  const rows = await db
    .select({ id: contentItemChannels.socialChannelId })
    .from(contentItemChannels)
    .where(eq(contentItemChannels.contentItemId, contentItemId));
  return rows.map((r) => r.id);
}

// silence unused-and-keep-import
void and;
