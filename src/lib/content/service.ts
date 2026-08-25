import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activityEvents,
  approvalDecisions,
  approvalRequests,
  contentAssignments,
  contentItemChannels,
  contentItems,
  socialChannels,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaceSettings,
} from "@/lib/db/schema";
import {
  canAccessInternalWorkspace,
  hasWorkspaceRole,
  INTERNAL_WORKSPACE_ROLES,
  requirePolicy,
  type Actor,
} from "@/lib/auth/policy";
import {
  WORKFLOW_RULES,
  resolveWorkflowTransition,
  type WorkflowAction,
  type WorkspaceRole,
} from "@/lib/content/workflow";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { BatchCreateSchema, type BatchCreateInput } from "@/lib/content/batch";

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

    // Assignment history
    await tx.insert(contentAssignments).values({
      contentItemId: created!.id,
      assignmentType: "owner",
      userId: actor.id,
      active: true,
    });

    revalidatePath(`/app/w/`);
    return created!.id;
  });
}

/**
 * Update an editable content idea.
 *
 * Editability is intentionally narrow (master prompt §10): once a planner
 * has submitted an item for review, the title/format/schedule are frozen
 * so downstream reviewers can rely on a stable contract. Items past
 * `draft | changes_requested` therefore reject updates with a friendly
 * `notEditable` error. Service throws; the calling action surfaces the
 * message to the form.
 */
export const UPDATEABLE_STATUSES = ["draft", "changes_requested"] as const;

export async function updateContentItem(
  actor: Actor,
  input: {
    contentItemId: string;
    title: string;
    format: UpdateContentInput["format"];
    brief: string;
    plannedPublishAt: Date;
    channelIds: string[] | undefined;
  },
): Promise<void> {
  const [item] = await db
    .select({
      id: contentItems.id,
      workspaceId: contentItems.workspaceId,
      status: contentItems.status,
    })
    .from(contentItems)
    .where(eq(contentItems.id, input.contentItemId))
    .limit(1);
  if (!item) throw new Error("Content item not found");

  await requirePolicy(
    hasWorkspaceRole(actor, item.workspaceId, ["workspace_manager", "content_planner"]),
    "update_content",
  );

  if (!UPDATEABLE_STATUSES.includes(item.status as (typeof UPDATEABLE_STATUSES)[number])) {
    throw new Error(
      `This idea is in ${item.status.replaceAll("_", " ")} and can no longer be edited.`,
    );
  }

  await db.transaction(async (tx) => {
    await tx
      .update(contentItems)
      .set({
        title: input.title,
        format: input.format,
        brief: input.brief,
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
      afterData: { title: input.title, format: input.format },
    });
  });

  revalidatePath(`/app/w/`);
}

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

/** Create an entire pasted batch atomically; one invalid row rolls back all rows. */
export async function batchCreateContentItems(actor: Actor, input: BatchCreateInput) {
  const parsed = BatchCreateSchema.parse(input);
  await requirePolicy(
    hasWorkspaceRole(actor, parsed.workspaceId, ["workspace_manager", "content_planner"]),
    "batch_create_content",
  );
  const [channels, settingsRows] = await Promise.all([
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
  ]);
  const settings = settingsRows[0];
  return db.transaction(async (tx) => {
    const ids: string[] = [];
    for (const item of parsed.items) {
      const [created] = await tx
        .insert(contentItems)
        .values({
          workspaceId: parsed.workspaceId,
          title: item.title,
          format: item.format,
          brief: item.brief,
          plannedPublishAt: item.plannedPublishAt,
          contentOwnerId: actor.id,
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
      if (channels.length)
        await tx
          .insert(contentItemChannels)
          .values(
            channels.map((channel) => ({ contentItemId: created.id, socialChannelId: channel.id })),
          );
      await tx.insert(contentAssignments).values({
        contentItemId: created.id,
        assignmentType: "owner",
        userId: actor.id,
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

// ─── Read helpers ────────────────────────────────────────────────────────
export async function getContentItem(actor: Actor, contentItemId: string) {
  const [row] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!row) return null;

  // Internal detail includes private strategy, assignments and review data.
  // Client reviewers use dedicated, allow-listed queries in the client portal.
  await requirePolicy(canAccessInternalWorkspace(actor, row.workspaceId), "view_content");

  const [channels, assignments] = await Promise.all([
    db
      .select({
        id: contentItemChannels.id,
        socialChannelId: contentItemChannels.socialChannelId,
        accountName: socialChannels.accountName,
        platform: socialChannels.platform,
        plannedPublishAtOverride: contentItemChannels.plannedPublishAtOverride,
      })
      .from(contentItemChannels)
      .innerJoin(socialChannels, eq(socialChannels.id, contentItemChannels.socialChannelId))
      .where(eq(contentItemChannels.contentItemId, contentItemId))
      .orderBy(asc(socialChannels.platform), asc(socialChannels.accountName)),
    db
      .select({
        id: contentAssignments.id,
        assignmentType: contentAssignments.assignmentType,
        userId: contentAssignments.userId,
        active: contentAssignments.active,
      })
      .from(contentAssignments)
      .where(eq(contentAssignments.contentItemId, contentItemId)),
  ]);

  return { ...row, channels, assignments };
}

export async function listWorkspaceContent(
  actor: Actor,
  workspaceId: string,
  opts: {
    monthStart?: Date;
    monthEnd?: Date;
    status?: string;
    limit?: number;
  } = {},
) {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, [...INTERNAL_WORKSPACE_ROLES]),
    "list_content",
  );

  const conditions = [eq(contentItems.workspaceId, workspaceId), isNull(contentItems.archivedAt)];
  if (opts.monthStart) conditions.push(sql`${contentItems.plannedPublishAt} >= ${opts.monthStart}`);
  if (opts.monthEnd) conditions.push(sql`${contentItems.plannedPublishAt} < ${opts.monthEnd}`);
  if (opts.status) conditions.push(sql`${contentItems.status} = ${opts.status}`);

  return db
    .select()
    .from(contentItems)
    .where(and(...conditions))
    .orderBy(sql`${contentItems.plannedPublishAt} ASC`)
    .limit(opts.limit ?? 200);
}

// ─── Workflow transitions (master prompt §10) ──────────────────────────
export type { WorkflowAction } from "@/lib/content/workflow";

export async function transitionContent(
  actor: Actor,
  input: {
    contentItemId: string;
    action: WorkflowAction;
    reason?: string;
    /** For status_return_target on changes_requested/blocked */
    returnTarget?: string;
  },
) {
  const [item] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, input.contentItemId))
    .limit(1);
  if (!item) throw new Error("Content item not found");

  const allowedRoles =
    input.action === "unblock"
      ? (["workspace_manager"] as const)
      : WORKFLOW_RULES[input.action].roles;
  const actorRoles = (
    await Promise.all(
      allowedRoles.map(async (role) =>
        (await hasWorkspaceRole(actor, item.workspaceId, [role])) ? role : null,
      ),
    )
  ).filter((role): role is WorkspaceRole => role !== null);

  const transition = resolveWorkflowTransition({
    action: input.action,
    currentStatus: item.status,
    actorRoles,
    ...(input.reason ? { reason: input.reason } : {}),
    statusReturnTarget: item.statusReturnTarget,
  });

  if (input.action === "assign_designer" && !item.designerId) {
    throw new Error("Assign a designer before moving the item into design");
  }

  return await db.transaction(async (tx) => {
    const update: Record<string, unknown> = {
      status: transition.to,
      updatedAt: new Date(),
      changeRequestGate: transition.changeRequestGate ?? null,
      statusReturnTarget: transition.statusReturnTarget ?? null,
    };
    if (transition.cancellationReason !== undefined) {
      update.cancellationReason = transition.cancellationReason;
    }
    if (transition.blockedReason !== undefined) update.blockedReason = transition.blockedReason;

    await tx.update(contentItems).set(update).where(eq(contentItems.id, input.contentItemId));

    if (input.action === "submit_content_review" || input.action === "resubmit_content") {
      await tx.insert(approvalRequests).values({
        contentItemId: input.contentItemId,
        gate: "content",
        requestedBy: actor.id,
        sequence: 1,
      });
    }

    if (input.action === "approve_content" || input.action === "request_content_changes") {
      const [pendingRequest] = await tx
        .select({ id: approvalRequests.id })
        .from(approvalRequests)
        .where(
          and(
            eq(approvalRequests.contentItemId, input.contentItemId),
            eq(approvalRequests.gate, "content"),
            eq(approvalRequests.status, "pending"),
          ),
        )
        .limit(1);
      if (!pendingRequest) throw new Error("Pending content approval request not found");
      const decision = input.action === "approve_content" ? "approved" : "changes_requested";
      await tx.insert(approvalDecisions).values({
        approvalRequestId: pendingRequest.id,
        reviewerId: actor.id,
        decision,
        ...(input.reason ? { feedback: input.reason } : {}),
      });
      await tx
        .update(approvalRequests)
        .set({
          status: decision,
          invalidatedAt: decision === "changes_requested" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(approvalRequests.id, pendingRequest.id));
    }

    await tx.insert(activityEvents).values({
      workspaceId: item.workspaceId,
      contentItemId: item.id,
      actorId: actor.id,
      kind: "status_transition",
      summary: `${item.status} → ${transition.to}`,
      beforeData: { status: item.status },
      afterData: { status: transition.to },
      metadata: { action: input.action },
    });

    revalidatePath(`/app/w/`);
    return { from: item.status, to: transition.to };
  });
}

// ─── Designer assignment (claim/release) ───────────────────────────────
export async function claimAsDesigner(actor: Actor, contentItemId: string) {
  const [item] = await db
    .select({
      workspaceId: contentItems.workspaceId,
      designerId: contentItems.designerId,
      status: contentItems.status,
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

  await db
    .update(contentItems)
    .set({ designerId: actor.id, status: "in_design", updatedAt: new Date() })
    .where(eq(contentItems.id, contentItemId));
  await db.insert(contentAssignments).values({
    contentItemId,
    assignmentType: "designer",
    userId: actor.id,
    active: true,
  });
  revalidatePath(`/app/w/`);
}

// silence unused
void workspaceMembershipRoles;
void workspaceMemberships;
