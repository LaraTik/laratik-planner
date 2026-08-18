import "server-only";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  contentAssignments,
  contentItemChannels,
  contentItems,
  socialChannels,
  workspaceMembershipRoles,
  workspaceMemberships,
} from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { z } from "zod";
import { revalidatePath } from "next/cache";

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

// ─── Quick Create ────────────────────────────────────────────────────────
export async function quickCreateContentItem(actor: Actor, input: QuickCreateInput) {
  await requirePolicy(
    hasWorkspaceRole(actor, input.workspaceId, ["workspace_manager", "content_planner"]),
    "create_content",
  );

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
        ...(input.designerId ? { designerId: input.designerId } : {}),
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

// ─── Read helpers ────────────────────────────────────────────────────────
export async function getContentItem(actor: Actor, contentItemId: string) {
  const [row] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!row) return null;

  // Authorization: must be in the same workspace
  await requirePolicy(
    hasWorkspaceRole(actor, row.workspaceId, [
      "workspace_manager",
      "content_planner",
      "designer",
      "internal_reviewer",
      "client_reviewer",
      "publisher",
      "viewer",
    ]),
    "view_content",
  );

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
      .where(eq(contentItemChannels.contentItemId, contentItemId)),
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
    hasWorkspaceRole(actor, workspaceId, [
      "workspace_manager",
      "content_planner",
      "designer",
      "internal_reviewer",
      "client_reviewer",
      "publisher",
      "viewer",
    ]),
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
const TRANSITION_GUARD: Record<string, { roles: string[]; from: string[]; to: string }> = {
  submit_content_review: {
    roles: ["workspace_manager", "content_planner"],
    from: ["draft"],
    to: "content_review",
  },
  approve_content: {
    roles: ["internal_reviewer", "workspace_manager"],
    from: ["content_review"],
    to: "approved_for_design",
  },
  request_content_changes: {
    roles: ["internal_reviewer"],
    from: ["content_review"],
    to: "changes_requested",
  },
  resubmit_content: {
    roles: ["workspace_manager", "content_planner"],
    from: ["changes_requested"],
    to: "content_review",
  },
  assign_designer: { roles: ["workspace_manager"], from: ["approved_for_design"], to: "in_design" },
  submit_delivery: {
    roles: ["designer", "workspace_manager"],
    from: ["in_design"],
    to: "creative_review",
  },
  approve_internal_creative: {
    roles: ["internal_reviewer"],
    from: ["creative_review"],
    to: "ready_to_publish",
  },
  request_creative_changes: {
    roles: ["internal_reviewer", "client_reviewer"],
    from: ["creative_review"],
    to: "changes_requested",
  },
  approve_client_creative: {
    roles: ["client_reviewer"],
    from: ["creative_review"],
    to: "ready_to_publish",
  },
  record_published: {
    roles: ["publisher", "workspace_manager"],
    from: ["ready_to_publish", "partially_published"],
    to: "published",
  },
  cancel: {
    roles: ["workspace_manager"],
    from: [
      "draft",
      "content_review",
      "approved_for_design",
      "in_design",
      "creative_review",
      "ready_to_publish",
    ],
    to: "cancelled",
  },
  block: {
    roles: ["workspace_manager"],
    from: [
      "draft",
      "content_review",
      "approved_for_design",
      "in_design",
      "creative_review",
      "ready_to_publish",
    ],
    to: "blocked",
  },
  unblock: { roles: ["workspace_manager"], from: ["blocked"], to: "draft" },
};

export type WorkflowAction = keyof typeof TRANSITION_GUARD;

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

  const guard = TRANSITION_GUARD[input.action];
  if (!guard) throw new Error(`Unknown action: ${input.action}`);

  if (!guard.from.includes(item.status)) {
    throw new Error(`Cannot ${input.action} from status ${item.status}`);
  }

  await requirePolicy(hasWorkspaceRole(actor, item.workspaceId, guard.roles), input.action);

  // Required reason for cancel / block
  if ((input.action === "cancel" || input.action === "block") && !input.reason) {
    throw new Error(`${input.action} requires a reason`);
  }
  // Required reason for changes_requested
  if (input.action === "request_content_changes" && !input.reason) {
    throw new Error("request_content_changes requires a reason (feedback)");
  }
  if (input.action === "request_creative_changes" && !input.reason) {
    throw new Error("request_creative_changes requires a reason (feedback)");
  }

  return await db.transaction(async (tx) => {
    const update: Record<string, unknown> = {
      status: guard.to,
      updatedAt: new Date(),
    };
    if (input.action === "cancel") update.cancellationReason = input.reason;
    if (input.action === "block") {
      update.blockedReason = input.reason;
      update.statusReturnTarget = item.status as never;
    }
    if (input.action === "unblock") {
      update.blockedReason = null;
      update.statusReturnTarget = null;
    }
    if (input.action === "request_content_changes" || input.action === "request_creative_changes") {
      update.changeRequestGate = "content";
      update.statusReturnTarget = item.status as never;
    }
    if (input.action === "resubmit_content") {
      update.changeRequestGate = null;
    }

    await tx.update(contentItems).set(update).where(eq(contentItems.id, input.contentItemId));

    revalidatePath(`/app/w/`);
    return { from: item.status, to: guard.to };
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
