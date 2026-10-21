import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  contentAssignments,
  contentItemChannels,
  contentItems,
  contentResearchLinks,
  contentResearchTeardownLinks,
  researchTeardowns,
  socialChannels,
  trendBriefs,
  trendSignals,
  workspaceSettings,
} from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { queryResearchPostObservation } from "@/lib/social/analytics-query";
import { parseFormatPayload, type ContentFormat } from "@/lib/format-payload/schemas";
import { z } from "zod";

export const QuickCreateSchema = z.object({
  workspaceId: z.string().uuid(),
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
  /** If omitted, all active workspace channels are auto-selected (master prompt §8). */
  channelIds: z.array(z.string().uuid()).optional(),
  campaignId: z.string().uuid().optional(),
  contentPillarId: z.string().uuid().optional(),
  designerId: z.string().uuid().optional(),
  trendSignalId: z.string().uuid().optional(),
  /** Optional workspace-scoped research source used to preserve provenance. */
  researchPostObservationId: z.string().uuid().optional(),
  /** Optional reviewed teardown used to seed a planner draft. */
  researchTeardownId: z.string().uuid().optional(),
  /** Optional structured creative payload, validated against the selected format. */
  formatPayload: z.record(z.string(), z.unknown()).optional(),
});

export type QuickCreateInput = z.infer<typeof QuickCreateSchema>;

/** Create one planning item with its selected channels and provenance links. */
export async function quickCreateContentItem(actor: Actor, input: QuickCreateInput) {
  await requirePolicy(
    hasWorkspaceRole(actor, input.workspaceId, ["workspace_manager", "content_planner"]),
    "create_content",
  );

  const [settings] = await db
    .select()
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, input.workspaceId))
    .limit(1);

  const trendSignal = input.trendSignalId
    ? (
        await db
          .select({ id: trendSignals.id, velocity: trendSignals.velocity })
          .from(trendSignals)
          .where(
            and(
              eq(trendSignals.id, input.trendSignalId),
              eq(trendSignals.workspaceId, input.workspaceId),
            ),
          )
          .limit(1)
      )[0]
    : null;
  if (input.trendSignalId && !trendSignal)
    throw new Error("Trend signal not found in this workspace");

  const researchObservation = input.researchPostObservationId
    ? await queryResearchPostObservation(db, input.workspaceId, input.researchPostObservationId)
    : null;
  if (input.researchPostObservationId && !researchObservation)
    throw new Error("Research post not found in this workspace");

  const researchTeardown = input.researchTeardownId
    ? (
        await db
          .select({ id: researchTeardowns.id })
          .from(researchTeardowns)
          .where(
            and(
              eq(researchTeardowns.id, input.researchTeardownId),
              eq(researchTeardowns.workspaceId, input.workspaceId),
            ),
          )
          .limit(1)
      )[0]
    : null;
  if (input.researchTeardownId && !researchTeardown)
    throw new Error("Research teardown not found in this workspace");

  const storedFormatPayload =
    input.formatPayload === undefined
      ? undefined
      : parseFormatPayload(input.format as ContentFormat, input.formatPayload);

  let channelIds = input.channelIds;
  if (!channelIds || channelIds.length === 0) {
    const rows = await db
      .select({ id: socialChannels.id })
      .from(socialChannels)
      .where(
        and(
          eq(socialChannels.workspaceId, input.workspaceId),
          eq(socialChannels.isActive, true),
          isNull(socialChannels.archivedAt),
        ),
      );
    channelIds = rows.map((row) => row.id);
  }

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(contentItems)
      .values({
        workspaceId: input.workspaceId,
        title: input.title,
        format: input.format,
        brief: input.brief ?? "",
        ...(storedFormatPayload ? { formatPayload: storedFormatPayload } : {}),
        plannedPublishAt: input.plannedPublishAt,
        contentOwnerId: actor.id,
        createdBy: actor.id,
        ...(input.campaignId ? { campaignId: input.campaignId } : {}),
        ...(input.contentPillarId ? { contentPillarId: input.contentPillarId } : {}),
        ...(input.designerId || settings?.defaultDesignerId
          ? { designerId: input.designerId ?? settings?.defaultDesignerId }
          : {}),
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
    if (!created) throw new Error("Content item was not created");

    if (channelIds.length > 0) {
      await tx.insert(contentItemChannels).values(
        channelIds.map((channelId) => ({
          contentItemId: created.id,
          socialChannelId: channelId,
        })),
      );
    }

    if (trendSignal) {
      await tx.insert(trendBriefs).values({
        contentItemId: created.id,
        signalId: trendSignal.id,
        workspaceId: input.workspaceId,
        velocityAtSchedule: trendSignal.velocity,
      });
    }

    if (researchObservation) {
      await tx.insert(contentResearchLinks).values({
        workspaceId: input.workspaceId,
        contentItemId: created.id,
        socialPostObservationId: researchObservation.observation.id,
        createdBy: actor.id,
      });
    }

    if (researchTeardown) {
      await tx.insert(contentResearchTeardownLinks).values({
        workspaceId: input.workspaceId,
        contentItemId: created.id,
        researchTeardownId: researchTeardown.id,
        createdBy: actor.id,
      });
    }

    await tx.insert(contentAssignments).values({
      contentItemId: created.id,
      assignmentType: "owner",
      userId: actor.id,
      active: true,
    });

    return created.id;
  });
}
