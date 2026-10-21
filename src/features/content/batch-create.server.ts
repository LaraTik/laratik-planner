import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  campaigns,
  contentAssignments,
  contentItemChannels,
  contentItems,
  contentPillars,
  workspaceSettings,
} from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { BatchCreateSchema, type BatchCreateInput } from "@/lib/content/batch";
import { parseFormatPayload } from "@/lib/format-payload/schemas";
import {
  assertWorkspaceChannelSelection,
  getActiveWorkspaceChannelIds,
} from "./channel-selection.server";

/** Create an entire pasted batch atomically; one invalid row rolls back all rows. */
export async function batchCreateContentItems(actor: Actor, input: BatchCreateInput) {
  const parsed = BatchCreateSchema.parse(input);
  await requirePolicy(
    hasWorkspaceRole(actor, parsed.workspaceId, ["workspace_manager", "content_planner"]),
    "batch_create_content",
  );
  const [activeChannelIds, settingsRows, campaignRows, pillarRows] = await Promise.all([
    getActiveWorkspaceChannelIds(parsed.workspaceId),
    db
      .select()
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, parsed.workspaceId))
      .limit(1),
    db
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(
        and(
          eq(campaigns.workspaceId, parsed.workspaceId),
          inArray(
            campaigns.id,
            parsed.items.flatMap((item) => (item.campaignId ? [item.campaignId] : [])),
          ),
        ),
      ),
    db
      .select({ id: contentPillars.id })
      .from(contentPillars)
      .where(
        and(
          eq(contentPillars.workspaceId, parsed.workspaceId),
          inArray(
            contentPillars.id,
            parsed.items.flatMap((item) => (item.contentPillarId ? [item.contentPillarId] : [])),
          ),
        ),
      ),
  ]);
  const settings = settingsRows[0];
  const campaignIds = new Set(campaignRows.map((row) => row.id));
  const pillarIds = new Set(pillarRows.map((row) => row.id));

  for (const item of parsed.items) {
    const selectedChannelIds = item.channelIds ?? activeChannelIds;
    assertWorkspaceChannelSelection(
      selectedChannelIds,
      activeChannelIds,
      `Row "${item.title}" has an invalid or inactive channel selection.`,
    );
    if (item.contentOwnerId) {
      await requirePolicy(
        hasWorkspaceRole({ id: item.contentOwnerId }, parsed.workspaceId, [
          "workspace_manager",
          "content_planner",
          "designer",
          "internal_reviewer",
        ]),
        "assign_batch_content_owner",
      );
    }
    if (item.campaignId && !campaignIds.has(item.campaignId)) {
      throw new Error(`Row "${item.title}" has an invalid campaign selection.`);
    }
    if (item.contentPillarId && !pillarIds.has(item.contentPillarId)) {
      throw new Error(`Row "${item.title}" has an invalid content pillar selection.`);
    }
  }

  return db.transaction(async (tx) => {
    const ids: string[] = [];
    for (const item of parsed.items) {
      let formatPayload: Record<string, unknown> = { schemaVersion: 1 };
      if (item.formatPayload) {
        try {
          formatPayload = parseFormatPayload(item.format, item.formatPayload) as Record<
            string,
            unknown
          >;
        } catch (err) {
          throw new Error(
            `Row "${item.title}" (${item.format}) has invalid format payload: ${(err as Error).message}`,
          );
        }
      }
      if (item.extensions) {
        try {
          formatPayload = parseFormatPayload(item.format, {
            ...formatPayload,
            ...item.extensions,
          }) as Record<string, unknown>;
        } catch (err) {
          throw new Error(
            `Row "${item.title}" (${item.format}) has invalid extensions: ${(err as Error).message}`,
          );
        }
      }
      const [created] = await tx
        .insert(contentItems)
        .values({
          workspaceId: parsed.workspaceId,
          ...(item.campaignId ? { campaignId: item.campaignId } : {}),
          ...(item.contentPillarId ? { contentPillarId: item.contentPillarId } : {}),
          title: item.title,
          format: item.format,
          brief: item.brief,
          formatPayload,
          plannedPublishAt: item.plannedPublishAt,
          contentOwnerId: item.contentOwnerId ?? actor.id,
          createdBy: actor.id,
          ...(settings?.defaultDesignerId ? { designerId: settings.defaultDesignerId } : {}),
          ...(settings?.defaultContentReviewerId
            ? { contentReviewerId: settings.defaultContentReviewerId }
            : {}),
          ...(settings?.defaultInternalCreativeReviewerId
            ? { internalCreativeReviewerId: settings.defaultInternalCreativeReviewerId }
            : {}),
          ...(settings?.defaultClientReviewerId
            ? { clientReviewerId: settings.defaultClientReviewerId }
            : {}),
        })
        .returning({ id: contentItems.id });
      if (!created) throw new Error("Batch row could not be created");
      ids.push(created.id);
      const selectedChannelIds = item.channelIds ?? activeChannelIds;
      if (selectedChannelIds.length) {
        await tx.insert(contentItemChannels).values(
          selectedChannelIds.map((socialChannelId) => ({
            contentItemId: created.id,
            socialChannelId,
          })),
        );
      }
      await tx.insert(contentAssignments).values({
        contentItemId: created.id,
        assignmentType: "owner",
        userId: item.contentOwnerId ?? actor.id,
        active: true,
      });
      if (settings?.defaultDesignerId) {
        await tx.insert(contentAssignments).values({
          contentItemId: created.id,
          assignmentType: "designer",
          userId: settings.defaultDesignerId,
          assignedBy: actor.id,
          active: true,
        });
      }
    }
    return ids;
  });
}
