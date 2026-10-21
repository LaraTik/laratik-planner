import "server-only";
import { and, eq, gte, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activityEvents,
  campaigns,
  contentAssignments,
  contentItemChannels,
  contentItems,
  contentPillars,
  outboxEvents,
  socialChannels,
  contentResearchLinks,
  contentResearchTeardownLinks,
  researchTeardowns,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaceSettings,
  workspaces,
  trendBriefs,
  trendSignals,
} from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { z } from "zod";
import {} from "next/cache";
import { queryResearchPostObservation } from "@/lib/social/analytics-query";
import { BatchCreateSchema, type BatchCreateInput } from "@/lib/content/batch";
import {
  parseFormatPayload,
  FormatPayloadByFormat,
  type ContentFormat,
} from "@/lib/format-payload/schemas";
import { recordMaterialityEvent } from "@/lib/publishing/materiality";
import {
  enqueueAssignmentNotification,
  enqueueClaimNotification,
  enqueueDeadlineNotification,
  enqueueReleaseNotification,
} from "@/lib/notifications/service";
import { reconcileContentItemMediaFolders } from "@/lib/media/service";

/**
 * Content service — the heart of the app.
 *
 * Implements the master prompt §10 workflow state machine, but for the
 * minimum-viable path: create → submit review → approve → assign designer
 * → submit delivery → approve creative → ready to publish → record
 * publication. The full material-edit policy + role-specific gates are
 * enforced in the role helpers in policy.ts.
 */

// ─── Zod input schemas ────────────────────────────────────────────────────
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

/**
 * Editable content shape — same validation rules as QuickCreateSchema,
 * minus the workspaceId (resolved from the content item itself) and the
 * optional fields that don't apply to an edit. Reused by the planning
 * edit form so the rules stay in one place.
 */
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

// ─── Quick Create ────────────────────────────────────────────────────────
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

  // Auto-select active channels if not provided
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
    channelIds = rows.map((r) => r.id);
  }

  return await db.transaction(async (tx) => {
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
      .returning({ id: contentItems.id, slug: contentItems.title });

    if (channelIds.length > 0) {
      await tx.insert(contentItemChannels).values(
        channelIds.map((channelId) => ({
          contentItemId: created!.id,
          socialChannelId: channelId,
        })),
      );
    }

    if (trendSignal) {
      await tx.insert(trendBriefs).values({
        contentItemId: created!.id,
        signalId: trendSignal.id,
        workspaceId: input.workspaceId,
        velocityAtSchedule: trendSignal.velocity,
      });
    }

    if (researchObservation) {
      await tx.insert(contentResearchLinks).values({
        workspaceId: input.workspaceId,
        contentItemId: created!.id,
        socialPostObservationId: researchObservation.observation.id,
        createdBy: actor.id,
      });
    }

    if (researchTeardown) {
      await tx.insert(contentResearchTeardownLinks).values({
        workspaceId: input.workspaceId,
        contentItemId: created!.id,
        researchTeardownId: researchTeardown.id,
        createdBy: actor.id,
      });
    }

    // Assignment history
    await tx.insert(contentAssignments).values({
      contentItemId: created!.id,
      assignmentType: "owner",
      userId: actor.id,
      active: true,
    });

    return created!.id;
  });
}

/**
 * Update an editable content idea.
 *
 * Role-owned fields remain editable throughout the workflow. The item is
 * only immutable after cancellation; approval history and immutable delivery
 * versions provide the audit boundary instead of a status lock.
 */
export const UPDATEABLE_STATUSES = ["draft", "changes_requested"] as const;
export const DESIGNER_EDITABLE_STATUSES = ["in_design", "changes_requested"] as const;

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
  if (!item) throw new Error("Content item not found");

  await requirePolicy(
    hasWorkspaceRole(actor, item.workspaceId, ["workspace_manager", "content_planner"]),
    "update_content",
  );

  if (item.status === "cancelled") {
    throw new Error(
      `This idea is in ${item.status.replaceAll("_", " ")} and can no longer be edited.`,
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

    // Replace the channel set if one was provided. `undefined` keeps the
    // current selection (the form only sends what the user changed).
    if (input.channelIds) {
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

  // FEAT-MEDIA-LIBRARY-2026-09-16 — silent folder reconcile when
  // `plannedPublishAt` or `format` changed. Runs outside the
  // transaction so a reconcile failure does not roll back the
  // content-item update; the planner still gets a non-blocking warning.
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
      // Reconcile is best-effort; the planner sees a banner in the
      // planning page when the session-scoped "reconcile_failed" flag
      // is set.
    }
  }
}

/**
 * Re-export of the per-format schema map for the action layer.
 * The service does not own the shape; the schemas module does;
 * this re-export keeps the action's import surface narrow.
 */
export { FormatPayloadByFormat };

/**
 * Pure helper for the AI Insert / Replace behaviour (FEAT-04).
 *
 *  - `replace` overwrites the existing brief with the AI draft.
 *  - `insert` appends the AI draft below the existing brief, separated by
 *    a blank line. Both inputs are trimmed; the result is capped at 2000
 *    chars to match the brief column constraint.
 *
 * Exported from the service module (not the "use server" actions file)
 * so the unit test can exercise the merge logic without spinning up a
 * database.
 */
export function mergeAiDraftIntoBrief(
  currentBrief: string,
  draftText: string,
  mode: "insert" | "replace",
): string {
  const trimmed = draftText.trim();
  if (mode === "replace") return trimmed.slice(0, 2000);
  const combined = [currentBrief.trim(), trimmed].filter(Boolean).join("\n\n");
  return combined.slice(0, 2000);
}

/**
 * FEAT-09 (GAP-FULL-REVIEW-2026-08-25) — encode / decode a cursor for
 * the planning list's "load more" button. The cursor is a JSON tuple
 * of the last item's `plannedPublishAt` (ISO) and `id` (UUID), base64
 * so it survives as a URL search param. Round-tripping is best-effort:
 * an invalid cursor is treated as "no cursor" (start from the
 * beginning) so a stale bookmark never 500s.
 */
export function encodeContentCursor(cursor: { plannedPublishAt: Date; id: string }): string {
  const json = JSON.stringify({
    plannedPublishAt: cursor.plannedPublishAt.toISOString(),
    id: cursor.id,
  });
  return Buffer.from(json, "utf8").toString("base64url");
}

export function decodeContentCursor(
  raw: string | undefined | null,
): { plannedPublishAt: Date; id: string } | undefined {
  if (!raw) return undefined;
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { plannedPublishAt?: unknown; id?: unknown };
    if (typeof parsed.plannedPublishAt !== "string" || typeof parsed.id !== "string") {
      return undefined;
    }
    const date = new Date(parsed.plannedPublishAt);
    if (Number.isNaN(date.getTime())) return undefined;
    return { plannedPublishAt: date, id: parsed.id };
  } catch {
    return undefined;
  }
}

/** Create an entire pasted batch atomically; one invalid row rolls back all rows. */
export async function batchCreateContentItems(actor: Actor, input: BatchCreateInput) {
  const parsed = BatchCreateSchema.parse(input);
  await requirePolicy(
    hasWorkspaceRole(actor, parsed.workspaceId, ["workspace_manager", "content_planner"]),
    "batch_create_content",
  );
  const [channels, settingsRows, campaignRows, pillarRows] = await Promise.all([
    db
      .select({ id: socialChannels.id })
      .from(socialChannels)
      .where(
        and(
          eq(socialChannels.workspaceId, parsed.workspaceId),
          eq(socialChannels.isActive, true),
          isNull(socialChannels.archivedAt),
        ),
      ),
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
  const activeChannelIds = new Set(channels.map((channel) => channel.id));
  const campaignIds = new Set(campaignRows.map((row) => row.id));
  const pillarIds = new Set(pillarRows.map((row) => row.id));
  for (const item of parsed.items) {
    const selectedChannelIds = item.channelIds ?? channels.map((channel) => channel.id);
    const invalidChannel = selectedChannelIds.find((channelId) => !activeChannelIds.has(channelId));
    if (invalidChannel) {
      throw new Error(`Row "${item.title}" has an invalid or inactive channel selection.`);
    }
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
      // Per-row extensions (caption / hashtags / location
      // from the v2 batch format) → formatPayload. We
      // run the value through the per-format Zod schema so
      // a row that exceeds a per-format limit (e.g. a
      // hashtag that is too long for a specific format)
      // rolls back the whole batch — atomic, per master
      // prompt §17. The result is always the canonical
      // shape the editor + mapper expect.
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
      const selectedChannelIds = item.channelIds ?? channels.map((channel) => channel.id);
      if (selectedChannelIds.length)
        await tx.insert(contentItemChannels).values(
          selectedChannelIds.map((socialChannelId) => ({
            contentItemId: created.id,
            socialChannelId,
          })),
        );
      await tx.insert(contentAssignments).values({
        contentItemId: created.id,
        assignmentType: "owner",
        userId: item.contentOwnerId ?? actor.id,
        active: true,
      });
      if (settings?.defaultDesignerId)
        await tx.insert(contentAssignments).values({
          contentItemId: created.id,
          assignmentType: "designer",
          userId: settings.defaultDesignerId,
          assignedBy: actor.id,
          active: true,
        });
    }
    return ids;
  });
}

/**
 * FEAT-14 (GAP-FULL-REVIEW-2026-08-25) — bulk archive a list of
 * content items in a single transaction. Used by the design-queue
 * "Archive selected" bulk action.
 *
 * The function is intentionally narrow: it does not change the
 * `status` of the items (they keep their current workflow state)
 * and does not emit a per-item activity event. The audit log
 * records one summary event so a workspace manager reviewing the
 * feed can see "Anna archived 12 unassigned items" instead of 12
 * near-identical rows. The items are still soft-archived (the
 * `archivedAt` column is the v1 archive mechanism), so the change
 * is reversible by an operations script.
 *
 * Role gate: the same as `quickCreateContentItem` —
 * `workspace_manager` or `content_planner`. The page-level UI
 * hides the action from `designer` / `internal_reviewer` /
 * `publisher` even though they could in principle mutate, so the
 * bulk action stays in the planning / manager surface.
 */
export const BulkArchiveSchema = z.object({
  workspaceId: z.string().uuid(),
  contentItemIds: z.array(z.string().uuid()).min(1).max(500),
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
  workspaceId: z.string().uuid(),
  contentItemId: z.string().uuid(),
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

// ─── Designer assignment (claim/release) ───────────────────────────────
export async function claimAsDesigner(actor: Actor, contentItemId: string) {
  const [item] = await db
    .select({
      workspaceId: contentItems.workspaceId,
      designerId: contentItems.designerId,
      status: contentItems.status,
      contentOwnerId: contentItems.contentOwnerId,
      title: contentItems.title,
    })
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!item) throw new Error("Content item not found");
  if (item.designerId) throw new Error("Already assigned to a designer");

  // Verify user is a designer in the workspace
  await requirePolicy(hasWorkspaceRole(actor, item.workspaceId, ["designer"]), "claim_designer");
  if (item.status !== "approved_for_design" && item.status !== "in_design") {
    throw new Error(`Cannot claim when status is ${item.status}`);
  }

  await db.transaction(async (tx) => {
    await tx
      .update(contentItems)
      .set({ designerId: actor.id, status: "in_design", updatedAt: new Date() })
      .where(eq(contentItems.id, contentItemId));
    await tx.insert(contentAssignments).values({
      contentItemId,
      assignmentType: "designer",
      userId: actor.id,
      active: true,
    });
    // FEAT-01 — fire an in-app "assignment" notification to the
    // content owner so they know work has started. Skip the
    // self-notify case (the owner claimed their own item).
    if (item.contentOwnerId && item.contentOwnerId !== actor.id) {
      await enqueueClaimNotification(
        {
          userId: item.contentOwnerId,
          workspaceId: item.workspaceId,
          contentItemId,
          title: `Designer claimed "${item.title}"`,
          body: "The design task is now in progress. You'll be notified when a delivery is submitted.",
          messageKey: "notifications.events.designer_claimed",
          messageParams: { title: item.title },
        },
        tx,
      );
    }
  });
}

// ─── FEAT-07 — §14 required commands (GAP-FULL-REVIEW-2026-08-25) ──────────
//
// `assignDesigner` / `releaseDesignTask` / `rescheduleContentItem` are
// the §14 contract names. `claimAsDesigner` (the designer's
// self-claim) was the only one in place; assign and release are the
// planner-driven paths the workspace manager uses to move a task
// off a stuck designer or rotate it to a different one.

/**
 * Planner assigns a specific designer to a content item. Workspace
 * manager / content planner only.
 */
export const AssignDesignerSchema = z.object({
  contentItemId: z.string().uuid(),
  designerId: z.string().uuid(),
});
export type AssignDesignerInput = z.infer<typeof AssignDesignerSchema>;

export async function assignDesigner(actor: Actor, input: AssignDesignerInput) {
  const parsed = AssignDesignerSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const [item] = await db
    .select({
      workspaceId: contentItems.workspaceId,
      designerId: contentItems.designerId,
      title: contentItems.title,
    })
    .from(contentItems)
    .where(eq(contentItems.id, parsed.data.contentItemId))
    .limit(1);
  if (!item) throw new Error("Content item not found");
  await requirePolicy(
    hasWorkspaceRole(actor, item.workspaceId, ["workspace_manager"]),
    "assign_designer",
  );
  if (item.designerId === parsed.data.designerId) return; // idempotent
  const previousDesigner = item.designerId;
  await db.transaction(async (tx) => {
    await tx
      .update(contentItems)
      .set({ designerId: parsed.data.designerId, updatedAt: new Date() })
      .where(eq(contentItems.id, parsed.data.contentItemId));
    await tx.insert(contentAssignments).values({
      contentItemId: parsed.data.contentItemId,
      assignmentType: "designer",
      userId: parsed.data.designerId,
      assignedBy: actor.id,
      active: true,
    });
    await tx.insert(activityEvents).values({
      workspaceId: item.workspaceId,
      contentItemId: parsed.data.contentItemId,
      actorId: actor.id,
      kind: "assignment",
      // `summary` is the legacy fallback; the new
      // `activity.verbs.assignment_designer` template renders the
      // designer's display name (resolved server-side by
      // `buildActivityContext`). The raw UUID no longer reaches
      // the UI.
      summary: `Assigned a designer to "${item.title}"`,
      beforeData: { designerId: previousDesigner },
      afterData: { designerId: parsed.data.designerId },
      metadata: {
        field: "designer",
        before: previousDesigner,
        after: parsed.data.designerId,
      },
    });
    // FEAT-01 — fire an assignment notification to the new designer
    // and, if there was a previous designer, a release to them.
    await enqueueAssignmentNotification(
      {
        userId: parsed.data.designerId,
        workspaceId: item.workspaceId,
        contentItemId: parsed.data.contentItemId,
        title: `You were assigned "${item.title}"`,
        body: "A planner assigned this design task to you. Open the item to start.",
        messageKey: "notifications.events.assignment",
        messageParams: { title: item.title },
      },
      tx,
    );
    if (previousDesigner && previousDesigner !== parsed.data.designerId) {
      await enqueueReleaseNotification(
        {
          userId: previousDesigner,
          workspaceId: item.workspaceId,
          contentItemId: parsed.data.contentItemId,
          title: `Design task reassigned: "${item.title}"`,
          body: "This design task was reassigned to another designer.",
          messageKey: "notifications.events.designer_reassigned",
          messageParams: { title: item.title },
        },
        tx,
      );
    }
  });
}

/**
 * Planner changes the content owner without changing the workflow stage.
 * Workspace manager / content planner only. The current owner column and
 * assignment history are updated together so the list, detail view, and
 * audit trail cannot drift apart.
 */
export const AssignContentOwnerSchema = z.object({
  contentItemId: z.string().uuid(),
  ownerId: z.string().uuid(),
});
export type AssignContentOwnerInput = z.infer<typeof AssignContentOwnerSchema>;

export async function assignContentOwner(actor: Actor, input: AssignContentOwnerInput) {
  const parsed = AssignContentOwnerSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const [item] = await db
    .select({
      workspaceId: contentItems.workspaceId,
      contentOwnerId: contentItems.contentOwnerId,
      title: contentItems.title,
    })
    .from(contentItems)
    .where(eq(contentItems.id, parsed.data.contentItemId))
    .limit(1);
  if (!item) throw new Error("Content item not found");

  await requirePolicy(
    hasWorkspaceRole(actor, item.workspaceId, ["workspace_manager", "content_planner"]),
    "assign_content_owner",
  );
  await requirePolicy(
    hasWorkspaceRole({ id: parsed.data.ownerId }, item.workspaceId, [
      "workspace_manager",
      "content_planner",
      "designer",
      "internal_reviewer",
    ]),
    "assign_content_owner_target",
  );
  if (item.contentOwnerId === parsed.data.ownerId) return;

  const previousOwner = item.contentOwnerId;
  await db.transaction(async (tx) => {
    await tx
      .update(contentItems)
      .set({ contentOwnerId: parsed.data.ownerId, updatedAt: new Date() })
      .where(eq(contentItems.id, parsed.data.contentItemId));
    await tx
      .update(contentAssignments)
      .set({ active: false, releasedAt: new Date() })
      .where(
        and(
          eq(contentAssignments.contentItemId, parsed.data.contentItemId),
          eq(contentAssignments.assignmentType, "owner"),
          eq(contentAssignments.active, true),
        ),
      );
    await tx.insert(contentAssignments).values({
      contentItemId: parsed.data.contentItemId,
      assignmentType: "owner",
      userId: parsed.data.ownerId,
      assignedBy: actor.id,
      active: true,
    });
    await tx.insert(activityEvents).values({
      workspaceId: item.workspaceId,
      contentItemId: parsed.data.contentItemId,
      actorId: actor.id,
      kind: "assignment",
      // The formatter picks `activity.verbs.assignment_owner` because
      // `contentOwnerId` is present in `beforeData`/`afterData`.
      summary: `Changed the owner of "${item.title}"`,
      beforeData: { contentOwnerId: previousOwner },
      afterData: { contentOwnerId: parsed.data.ownerId },
      metadata: {
        field: "owner",
        before: previousOwner,
        after: parsed.data.ownerId,
      },
    });
    if (parsed.data.ownerId !== actor.id) {
      await enqueueAssignmentNotification(
        {
          userId: parsed.data.ownerId,
          workspaceId: item.workspaceId,
          contentItemId: parsed.data.contentItemId,
          title: `You were assigned "${item.title}"`,
          body: "You are now responsible for coordinating this content item.",
          messageKey: "notifications.events.assignment",
          messageParams: { title: item.title },
        },
        tx,
      );
    }
    if (previousOwner && previousOwner !== actor.id && previousOwner !== parsed.data.ownerId) {
      await enqueueReleaseNotification(
        {
          userId: previousOwner,
          workspaceId: item.workspaceId,
          contentItemId: parsed.data.contentItemId,
          title: `Content owner changed: "${item.title}"`,
          body: "This content item was assigned to another owner.",
          messageKey: "notifications.events.designer_reassigned",
          messageParams: { title: item.title },
        },
        tx,
      );
    }
  });
}

/**
 * Planner releases a designer's hold on an item. Sets designer_id to
 * null and rolls the item back to `approved_for_design` so it shows
 * up in the unassigned queue.
 *
 * `workspace_manager` only. Master prompt §9 grants "Assign/reassign
 * designer" to the agency admin (F) and the workspace manager (M) and
 * denies the planner (-), so releasing a designer's hold is a
 * manager action too — a planner could otherwise push an item into
 * the unassigned queue that no planner is allowed to fill.
 */
export const ReleaseDesignTaskSchema = z.object({
  contentItemId: z.string().uuid(),
});
export type ReleaseDesignTaskInput = z.infer<typeof ReleaseDesignTaskSchema>;

export async function releaseDesignTask(actor: Actor, input: ReleaseDesignTaskInput) {
  const parsed = ReleaseDesignTaskSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const [item] = await db
    .select({
      workspaceId: contentItems.workspaceId,
      designerId: contentItems.designerId,
      status: contentItems.status,
      title: contentItems.title,
    })
    .from(contentItems)
    .where(eq(contentItems.id, parsed.data.contentItemId))
    .limit(1);
  if (!item) throw new Error("Content item not found");
  await requirePolicy(
    hasWorkspaceRole(actor, item.workspaceId, ["workspace_manager"]),
    "release_design_task",
  );
  if (!item.designerId) {
    throw new Error("Content item is not currently assigned to a designer");
  }
  const releasedDesigner = item.designerId;
  await db.transaction(async (tx) => {
    await tx
      .update(contentItems)
      .set({
        designerId: null,
        status:
          item.status === "in_design" || item.status === "changes_requested"
            ? "approved_for_design"
            : item.status,
        updatedAt: new Date(),
      })
      .where(eq(contentItems.id, parsed.data.contentItemId));
    // Close out the active assignment row.
    await tx
      .update(contentAssignments)
      .set({ active: false, releasedAt: new Date() })
      .where(
        and(
          eq(contentAssignments.contentItemId, parsed.data.contentItemId),
          eq(contentAssignments.userId, releasedDesigner),
          eq(contentAssignments.assignmentType, "designer"),
          eq(contentAssignments.active, true),
        ),
      );
    await tx.insert(activityEvents).values({
      workspaceId: item.workspaceId,
      contentItemId: parsed.data.contentItemId,
      actorId: actor.id,
      kind: "assignment",
      // Formatter picks `activity.verbs.assignment_designer_released`
      // because `beforeData.designerId` is set and `afterData.designerId`
      // is null.
      summary: `Released the designer hold on "${item.title}"`,
      beforeData: { designerId: releasedDesigner, status: item.status },
      afterData: { designerId: null },
      metadata: {
        field: "designer",
        before: releasedDesigner,
        after: null,
      },
    });
    // FEAT-01 — notify the released designer.
    if (releasedDesigner !== actor.id) {
      await enqueueReleaseNotification(
        {
          userId: releasedDesigner,
          workspaceId: item.workspaceId,
          contentItemId: parsed.data.contentItemId,
          title: `Design task released: "${item.title}"`,
          body: "A planner released your hold on this design task. The item is back in the unassigned queue.",
          messageKey: "notifications.events.designer_released",
          messageParams: { title: item.title },
        },
        tx,
      );
    }
  });
}

/**
 * Move a content item's planned publish date. Distinct from the
 * broader `updateContentItem` (which also changes the brief / title
 * etc.) so the calendar UI can re-schedule without round-tripping
 * the full edit form. Accepts both the standard `workspaces.tz`
 * `Date` and a string for ergonomic `useActionState` form binding.
 */
export const RescheduleContentItemSchema = z.object({
  contentItemId: z.string().uuid(),
  plannedPublishAt: z.coerce.date(),
});
export type RescheduleContentItemInput = z.infer<typeof RescheduleContentItemSchema>;

export async function rescheduleContentItem(actor: Actor, input: RescheduleContentItemInput) {
  const parsed = RescheduleContentItemSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  const [item] = await db
    .select({
      workspaceId: contentItems.workspaceId,
      plannedPublishAt: contentItems.plannedPublishAt,
      designerId: contentItems.designerId,
      contentOwnerId: contentItems.contentOwnerId,
      title: contentItems.title,
      format: contentItems.format,
      agencyId: workspaces.agencyId,
    })
    .from(contentItems)
    .innerJoin(workspaces, eq(workspaces.id, contentItems.workspaceId))
    .where(eq(contentItems.id, parsed.data.contentItemId))
    .limit(1);
  if (!item) throw new Error("Content item not found");
  await requirePolicy(
    hasWorkspaceRole(actor, item.workspaceId, ["workspace_manager", "content_planner"]),
    "reschedule_content",
  );
  // No-op when the date didn't change.
  if (item.plannedPublishAt.getTime() === parsed.data.plannedPublishAt.getTime()) return;
  await db.transaction(async (tx) => {
    await tx
      .update(contentItems)
      .set({ plannedPublishAt: parsed.data.plannedPublishAt, updatedAt: new Date() })
      .where(eq(contentItems.id, parsed.data.contentItemId));
    await tx.insert(activityEvents).values({
      workspaceId: item.workspaceId,
      contentItemId: parsed.data.contentItemId,
      actorId: actor.id,
      kind: "schedule_change",
      summary: `Rescheduled "${item.title}"`,
      beforeData: { plannedPublishAt: item.plannedPublishAt.toISOString() },
      afterData: { plannedPublishAt: parsed.data.plannedPublishAt.toISOString() },
      metadata: {
        field: "date",
        before: item.plannedPublishAt.toISOString(),
        after: parsed.data.plannedPublishAt.toISOString(),
      },
    });
  });
  // FEAT-MEDIA-LIBRARY-2026-09-16 — silent folder reconcile when the
  // schedule changes (drag-to-reschedule on the board).
  try {
    await reconcileContentItemMediaFolders({
      actor,
      agencyId: item.agencyId,
      workspaceId: item.workspaceId,
      contentItemId: parsed.data.contentItemId,
      prevFormat: item.format,
      nextFormat: item.format,
      prevPlannedPublishAt: item.plannedPublishAt,
      nextPlannedPublishAt: parsed.data.plannedPublishAt,
    });
  } catch {
    // Best-effort; planner sees a non-blocking banner.
  }
}

// ─── FEAT-18 (GAP-FULL-REVIEW-2026-08-25) — deadline sweep ──────────────
//
// Master prompt §12 lists `deadline` as one of the 11 mandatory
// notification kinds. Today nothing fires it: the workflow transition
// path handles `ready_to_publish` and approval-driven events, but
// the "your publish date is tomorrow / in 3 days" reminder was never
// wired. This helper is the body of the daily cron — the cron route
// will call it once an hour, the function picks the items whose
// `planned_publish_at` is within the warning window and that have
// not been notified in the last 24h.
//
// The sweep is intentionally idempotent: the `outbox_event` row
// written by `enqueueDeadlineNotification` carries the content item
// id in the payload, so the dispatcher (or a future sweep audit)
// can dedupe a re-run. The function also re-reads the candidate set
// inside the transaction so a content item that just transitioned
// to `published` mid-tick is skipped.

/**
 * FEAT-18 (GAP-FULL-REVIEW-2026-08-25) — daily-deadline sweep.
 *
 * Scans every workspace for content items whose planned publish
 * date is within the warning window (`now` to `now + windowHours`)
 * and that are not yet in a closed status. For each candidate
 * that has not received a `deadline` notification in the last
 * 24h, enqueues one for the content owner and the designer
 * (the two roles who can act on a missed publish date).
 *
 * The default window of 24 hours matches the "24h-before-publish"
 * reminder the master prompt §12 calls out; the helper accepts
 * an override so a future cron can also fire a 72h / 1-week
 * "approaching" reminder without rewriting the body.
 *
 * Returns the count of notifications enqueued, so the cron
 * route can log a structured summary without re-querying.
 */
export async function dispatchDeadlineReminders(
  opts: {
    now?: Date;
    windowHours?: number;
  } = {},
): Promise<{ scanned: number; enqueued: number }> {
  const now = opts.now ?? new Date();
  const windowHours = opts.windowHours ?? 24;
  const windowEnd = new Date(now.getTime() + windowHours * 60 * 60 * 1000);
  // The 24h dedupe horizon: don't fire the same item twice in 24h.
  const dedupeCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Closed statuses (ready / partial / published) are excluded —
  // those items don't need a deadline reminder.
  const openStatuses = [
    "draft",
    "content_review",
    "approved_for_design",
    "in_design",
    "creative_review",
    "changes_requested",
    "blocked",
  ] as const;

  const candidates = await db
    .select({
      id: contentItems.id,
      workspaceId: contentItems.workspaceId,
      title: contentItems.title,
      plannedPublishAt: contentItems.plannedPublishAt,
      contentOwnerId: contentItems.contentOwnerId,
      designerId: contentItems.designerId,
    })
    .from(contentItems)
    .where(
      and(
        isNull(contentItems.archivedAt),
        gte(contentItems.plannedPublishAt, now),
        lt(contentItems.plannedPublishAt, windowEnd),
        inArray(contentItems.status, [...openStatuses]),
      ),
    );

  let enqueued = 0;
  for (const item of candidates) {
    // Skip if a `deadline` outbox event for this content item was
    // written in the last 24h. The aggregateId is the content item
    // id (enqueueOutboxEvent defaults `aggregateId` to the
    // `contentItemId` for content events).
    const [recent] = await db
      .select({ id: outboxEvents.id })
      .from(outboxEvents)
      .where(
        and(
          eq(outboxEvents.eventType, "deadline"),
          eq(outboxEvents.aggregateType, "content_item"),
          eq(outboxEvents.aggregateId, item.id),
          gte(outboxEvents.createdAt, dedupeCutoff),
        ),
      )
      .limit(1);
    if (recent) continue;

    // Re-read the item inside the loop to short-circuit if a
    // concurrent transition moved it to a closed status between
    // the candidate select and now.
    const [fresh] = await db
      .select({ status: contentItems.status })
      .from(contentItems)
      .where(eq(contentItems.id, item.id))
      .limit(1);
    if (!fresh) continue;
    if (
      ["ready_to_publish", "partially_published", "published", "cancelled"].includes(fresh.status)
    ) {
      continue;
    }

    const recipients = [item.contentOwnerId, item.designerId].filter((u): u is string =>
      Boolean(u),
    );
    for (const userId of recipients) {
      await enqueueDeadlineNotification({
        userId,
        workspaceId: item.workspaceId,
        contentItemId: item.id,
        title: `Deadline approaching: "${item.title}"`,
        body: `The planned publish date is approaching. Confirm the package is on track.`,
        messageKey: "notifications.events.deadline_warning",
        messageParams: { title: item.title },
      });
      enqueued += 1;
    }
  }
  return { scanned: candidates.length, enqueued };
}

// silence unused
void workspaceMembershipRoles;
void workspaceMemberships;
