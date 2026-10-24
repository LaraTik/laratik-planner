import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityEvents, contentItems } from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { z } from "zod";

export const BulkArchiveSchema = z.object({
  workspaceId: z.string().guid(),
  contentItemIds: z.array(z.string().guid()).min(1).max(500),
});
export type BulkArchiveInput = z.infer<typeof BulkArchiveSchema>;

export async function bulkArchiveContentItems(actor: Actor, input: BulkArchiveInput) {
  const parsed = BulkArchiveSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const { workspaceId, contentItemIds } = parsed.data;
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, ["workspace_manager", "content_planner"]),
    "bulk_archive_content",
  );
  const now = new Date();
  return await db.transaction(async (tx) => {
    const updated = await tx
      .update(contentItems)
      .set({ archivedAt: now, archivedBy: actor.id, updatedAt: now })
      .where(
        and(
          eq(contentItems.workspaceId, workspaceId),
          inArray(contentItems.id, contentItemIds),
          // Defensive: ignore items that are already archived so the
          // bulk action is idempotent.
          isNull(contentItems.archivedAt),
        ),
      )
      .returning({ id: contentItems.id });
    const archivedSet = new Set(updated.map((u) => u.id));
    // Keep only the items the caller asked for that the update
    // actually touched.
    const archivedIds = contentItemIds.filter((id) => archivedSet.has(id));
    await tx.insert(activityEvents).values({
      workspaceId,
      actorId: actor.id,
      kind: "bulk_archive",
      summary: `Bulk-archived ${archivedIds.length} content item${archivedIds.length === 1 ? "" : "s"}`,
      metadata: { contentItemIds: archivedIds },
    });
    return { archivedIds, skippedIds: contentItemIds.filter((id) => !archivedSet.has(id)) };
  });
}

export const ArchiveContentItemSchema = z.object({
  workspaceId: z.string().guid(),
  contentItemId: z.string().guid(),
});
export type ArchiveContentItemInput = z.infer<typeof ArchiveContentItemSchema>;

/**
 * Archive one planning item from the active workflow. This is the
 * single-item counterpart to the design-queue bulk action, with a
 * dedicated activity event so the item-level undo affordance has a
 * clear audit trail.
 */
export async function archiveContentItem(actor: Actor, input: ArchiveContentItemInput) {
  const parsed = ArchiveContentItemSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const { workspaceId, contentItemId } = parsed.data;
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, ["workspace_manager", "content_planner"]),
    "archive_content",
  );
  const now = new Date();
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(contentItems)
      .set({ archivedAt: now, archivedBy: actor.id, updatedAt: now })
      .where(
        and(
          eq(contentItems.workspaceId, workspaceId),
          eq(contentItems.id, contentItemId),
          isNull(contentItems.archivedAt),
        ),
      )
      .returning({ id: contentItems.id, title: contentItems.title });
    const item = updated[0];
    if (!item) throw new Error("Content item not found or already archived");
    await tx.insert(activityEvents).values({
      workspaceId,
      actorId: actor.id,
      kind: "archive",
      summary: `Archived content item: ${item.title}`,
      metadata: { contentItemId: item.id },
    });
  });
}

/** Restore a planning item after an archive undo action. */
export async function restoreContentItem(actor: Actor, input: ArchiveContentItemInput) {
  const parsed = ArchiveContentItemSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const { workspaceId, contentItemId } = parsed.data;
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, ["workspace_manager", "content_planner"]),
    "restore_content",
  );
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(contentItems)
      .set({ archivedAt: null, archivedBy: null, updatedAt: new Date() })
      .where(and(eq(contentItems.workspaceId, workspaceId), eq(contentItems.id, contentItemId)))
      .returning({ id: contentItems.id, title: contentItems.title });
    const item = updated[0];
    if (!item) throw new Error("Content item not found");
    await tx.insert(activityEvents).values({
      workspaceId,
      actorId: actor.id,
      kind: "restore",
      summary: `Restored content item: ${item.title}`,
      metadata: { contentItemId: item.id },
    });
  });
}
