import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityEvents, contentItemChannels, contentItems, workspaces } from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { DomainError } from "@/lib/content/workflow";
import { parseFormatPayload, type ContentFormat } from "@/lib/format-payload/schemas";
import { recordMaterialityEvent } from "@/lib/publishing/materiality";
import { reconcileContentItemMediaFolders } from "@/lib/media/planning-folder-lifecycle";
import {
  assertWorkspaceChannelSelection,
  getActiveWorkspaceChannelIds,
} from "./channel-selection.server";
import { z } from "zod";

export const UpdateContentSchema = z.object({
  title: z.string().min(2).max(200),
  format: z.enum([
    "static_post",
    "carousel",
    "story",
    "short_form_video",
    "long_form_video",
    "live_content",
    "article",
    "other",
  ]),
  brief: z.string().max(2000).optional().default(""),
  plannedPublishAt: z.coerce.date(),
  channelIds: z.array(z.string().uuid()).optional(),
  /** Optional structured creative payload, validated against the item's format. */
  formatPayload: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateContentInput = z.infer<typeof UpdateContentSchema>;

export const UPDATEABLE_STATUSES = ["draft", "changes_requested"] as const;
export const DESIGNER_EDITABLE_STATUSES = ["in_design", "changes_requested"] as const;

/** Update an editable content idea and its optional channel selection. */
export async function updateContentItem(
  actor: Actor,
  input: {
    contentItemId: string;
    title: string;
    format: UpdateContentInput["format"];
    brief: string;
    plannedPublishAt: Date;
    channelIds: string[] | undefined;
    formatPayload?: Record<string, unknown>;
  },
): Promise<void> {
  const [item] = await db
    .select({
      id: contentItems.id,
      workspaceId: contentItems.workspaceId,
      status: contentItems.status,
      agencyId: workspaces.agencyId,
      prevFormat: contentItems.format,
      prevPlannedPublishAt: contentItems.plannedPublishAt,
    })
    .from(contentItems)
    .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId))
    .where(eq(contentItems.id, input.contentItemId))
    .limit(1);
  if (!item) throw new DomainError("not_found", "Content item not found");

  await requirePolicy(
    hasWorkspaceRole(actor, item.workspaceId, ["workspace_manager", "content_planner"]),
    "update_content",
  );

  if (item.status === "cancelled") {
    throw new DomainError(
      "invalid_transition",
      `This idea is in ${item.status.replaceAll("_", " ")} and can no longer be edited.`,
    );
  }

  if (input.channelIds !== undefined) {
    const activeChannelIds = await getActiveWorkspaceChannelIds(item.workspaceId);
    assertWorkspaceChannelSelection(
      input.channelIds,
      activeChannelIds,
      "Invalid or inactive channel selection for this workspace",
    );
  }

  const drift =
    item.prevFormat !== input.format ||
    item.prevPlannedPublishAt.getTime() !== input.plannedPublishAt.getTime();
  const storedFormatPayload =
    input.formatPayload === undefined
      ? undefined
      : parseFormatPayload(input.format as ContentFormat, input.formatPayload);

  await db.transaction(async (tx) => {
    await tx
      .update(contentItems)
      .set({
        title: input.title,
        format: input.format,
        brief: input.brief,
        ...(storedFormatPayload ? { formatPayload: storedFormatPayload } : {}),
        plannedPublishAt: input.plannedPublishAt,
        updatedAt: new Date(),
      })
      .where(eq(contentItems.id, input.contentItemId));

    if (input.channelIds !== undefined) {
      await tx
        .delete(contentItemChannels)
        .where(eq(contentItemChannels.contentItemId, input.contentItemId));
      if (input.channelIds.length > 0) {
        await tx.insert(contentItemChannels).values(
          input.channelIds.map((socialChannelId) => ({
            contentItemId: input.contentItemId,
            socialChannelId,
          })),
        );
      }
    }

    await tx.insert(activityEvents).values({
      workspaceId: item.workspaceId,
      contentItemId: item.id,
      actorId: actor.id,
      kind: "content_updated",
      summary: `Updated idea: ${input.title}`,
      beforeData: { status: item.status },
      afterData: {
        title: input.title,
        format: input.format,
        ...(storedFormatPayload
          ? { formatPayloadKeys: Object.keys(storedFormatPayload).sort() }
          : {}),
      },
    });
  });

  await recordMaterialityEvent({
    actor,
    contentItemId: input.contentItemId,
    resource: drift ? "schedule" : "audience_copy",
    beforeValue: null,
    afterValue: {
      title: input.title,
      format: input.format,
      plannedPublishAt: input.plannedPublishAt.toISOString(),
    },
    reasonCode: drift ? "schedule.update" : "audience_copy.update",
  });

  if (drift) {
    try {
      await reconcileContentItemMediaFolders({
        actor,
        agencyId: item.agencyId,
        workspaceId: item.workspaceId,
        contentItemId: item.id,
        prevFormat: item.prevFormat,
        nextFormat: input.format,
        prevPlannedPublishAt: item.prevPlannedPublishAt,
        nextPlannedPublishAt: input.plannedPublishAt,
      });
    } catch {
      // Reconcile is best-effort; the planner displays a warning on this session.
    }
  }
}
