import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activityEvents,
  contentItemChannels,
  contentItems,
  publicationRecords,
} from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { derivePublicationAggregate } from "@/lib/publishing/aggregate";

/**
 * Publishing service (Goal 10 — master prompt §8 + §10).
 *
 * "published requires actual_published_at, published_url, and publisher_id.
 *  skipped requires a note explaining why.
 *  failed requires failure_reason.
 *  pending clears publication-specific values.
 *  published_url must use https.
 *  overall content status is partially_published when at least one
 *  selected channel is published or skipped and at least one remains
 *  pending or failed.
 *  overall content status is published only when every selected channel
 *  is published or skipped."
 */

export const RecordPublicationSchema = z.object({
  contentItemChannelId: z.string().uuid(),
  status: z.enum(["published", "skipped", "failed"]),
  publishedUrl: z.string().url().optional(),
  note: z.string().max(500).optional(),
  failureReason: z.string().max(500).optional(),
});

export type RecordPublicationInput = z.infer<typeof RecordPublicationSchema>;

export async function recordPublication(actor: Actor, input: RecordPublicationInput) {
  if (input.status === "published" && !input.publishedUrl) {
    throw new Error("published requires a publishedUrl");
  }
  if (input.status === "skipped" && !input.note) {
    throw new Error("skipped requires a note");
  }
  if (input.status === "failed" && !input.failureReason) {
    throw new Error("failed requires a failureReason");
  }
  if (input.publishedUrl && !input.publishedUrl.startsWith("https://")) {
    throw new Error("publishedUrl must be https");
  }

  // Resolve workspace for policy check
  const [chan] = await db
    .select({ contentItemId: contentItemChannels.contentItemId })
    .from(contentItemChannels)
    .where(eq(contentItemChannels.id, input.contentItemChannelId))
    .limit(1);
  if (!chan) throw new Error("Channel link not found");

  const [item] = await db
    .select({ workspaceId: contentItems.workspaceId, status: contentItems.status })
    .from(contentItems)
    .where(eq(contentItems.id, chan.contentItemId))
    .limit(1);
  if (!item) throw new Error("Content item not found");
  if (
    !(["ready_to_publish", "partially_published", "published"] as string[]).includes(item.status)
  ) {
    throw new Error(`Cannot record publication while content is ${item.status}`);
  }

  await requirePolicy(
    hasWorkspaceRole(actor, item.workspaceId, ["publisher", "workspace_manager"]),
    "record_publication",
  );

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM content_item WHERE id = ${chan.contentItemId} FOR UPDATE`);
    const [lockedItem] = await tx
      .select({ status: contentItems.status })
      .from(contentItems)
      .where(eq(contentItems.id, chan.contentItemId))
      .limit(1);
    if (
      !lockedItem ||
      !(["ready_to_publish", "partially_published", "published"] as string[]).includes(
        lockedItem.status,
      )
    ) {
      throw new Error("Content is no longer ready for publication updates");
    }

    // Upsert publication record for this channel
    const existing = await tx
      .select({ id: publicationRecords.id })
      .from(publicationRecords)
      .where(eq(publicationRecords.contentItemChannelId, input.contentItemChannelId))
      .limit(1);

    const values = {
      contentItemChannelId: input.contentItemChannelId,
      status: input.status,
      actualPublishedAt: input.status === "published" ? new Date() : null,
      publishedUrl: input.status === "published" ? (input.publishedUrl ?? null) : null,
      publisherId: input.status === "published" ? actor.id : null,
      note: input.status === "skipped" ? (input.note ?? null) : null,
      failureReason: input.status === "failed" ? (input.failureReason ?? null) : null,
    };

    if (existing[0]) {
      await tx
        .update(publicationRecords)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(publicationRecords.id, existing[0].id));
    } else {
      await tx.insert(publicationRecords).values(values);
    }

    // Re-derive the content item's overall publication status
    const all = await tx
      .select({ status: publicationRecords.status })
      .from(publicationRecords)
      .innerJoin(
        contentItemChannels,
        eq(contentItemChannels.id, publicationRecords.contentItemChannelId),
      )
      .where(eq(contentItemChannels.contentItemId, chan.contentItemId));

    const allChannelCount = await tx
      .select({ x: contentItemChannels.id })
      .from(contentItemChannels)
      .where(eq(contentItemChannels.contentItemId, chan.contentItemId));

    const newStatus = derivePublicationAggregate(
      allChannelCount.length,
      all.map((record) => record.status),
    );

    await tx
      .update(contentItems)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(contentItems.id, chan.contentItemId));

    await tx.insert(activityEvents).values({
      workspaceId: item.workspaceId,
      contentItemId: chan.contentItemId,
      actorId: actor.id,
      kind: "publication",
      summary: `Publication marked ${input.status}`,
      beforeData: { status: lockedItem.status },
      afterData: { status: newStatus, channelStatus: input.status },
      metadata: { contentItemChannelId: input.contentItemChannelId },
    });

    revalidatePath(`/app/w/`);
  });

  return { ok: true };
}

export async function listPublicationsForItem(actor: Actor, contentItemId: string) {
  const [item] = await db
    .select({ workspaceId: contentItems.workspaceId })
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!item) throw new Error("Content item not found");
  await requirePolicy(
    hasWorkspaceRole(actor, item.workspaceId, ["workspace_manager", "publisher"]),
    "list_publications",
  );

  return db
    .select()
    .from(publicationRecords)
    .innerJoin(
      contentItemChannels,
      eq(contentItemChannels.id, publicationRecords.contentItemChannelId),
    )
    .where(eq(contentItemChannels.contentItemId, contentItemId));
}

// silence
void and;
void inArray;
