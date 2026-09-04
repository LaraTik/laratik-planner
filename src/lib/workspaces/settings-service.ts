import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  securityAuditEvents,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaceSettings,
  workspaces,
} from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import {
  workspaceSettingsCommandSchema,
  type WorkspaceSettingsCommand,
} from "@/lib/workspaces/settings-command";

const ASSIGNMENT_ROLE = {
  defaultDesignerId: "designer",
  defaultContentReviewerId: "internal_reviewer",
  defaultInternalCreativeReviewerId: "internal_reviewer",
  defaultClientReviewerId: "client_reviewer",
} as const;

export async function updateWorkspaceSettings(actor: Actor, raw: WorkspaceSettingsCommand) {
  const input = workspaceSettingsCommandSchema.parse(raw);
  const metaPublishingChange =
    input.metaPublishingEnabled === undefined
      ? {}
      : { metaPublishingEnabled: input.metaPublishingEnabled };
  await requirePolicy(
    hasWorkspaceRole(actor, input.workspaceId, ["workspace_manager"]),
    "update_workspace_settings",
  );

  await db.transaction(async (tx) => {
    // Serialize changes using the stable workspace row even when settings do not exist yet.
    await tx.execute(sql`SELECT id FROM workspace WHERE id = ${input.workspaceId} FOR UPDATE`);

    for (const [field, role] of Object.entries(ASSIGNMENT_ROLE) as [
      keyof typeof ASSIGNMENT_ROLE,
      (typeof ASSIGNMENT_ROLE)[keyof typeof ASSIGNMENT_ROLE],
    ][]) {
      const userId = input[field];
      if (!userId) continue;
      const [membership] = await tx
        .select({ id: workspaceMemberships.id })
        .from(workspaceMemberships)
        .innerJoin(
          workspaceMembershipRoles,
          eq(workspaceMembershipRoles.workspaceMembershipId, workspaceMemberships.id),
        )
        .where(
          and(
            eq(workspaceMemberships.workspaceId, input.workspaceId),
            eq(workspaceMemberships.userId, userId),
            eq(workspaceMemberships.status, "active"),
            eq(workspaceMembershipRoles.role, role),
          ),
        )
        .limit(1);
      if (!membership) throw new Error(`Invalid ${field} assignment`);
    }

    await tx
      .update(workspaces)
      .set({ timezone: input.timezone, updatedAt: new Date() })
      .where(eq(workspaces.id, input.workspaceId));
    await tx
      .insert(workspaceSettings)
      .values({
        workspaceId: input.workspaceId,
        approvalMode: input.approvalMode,
        monthlyTarget: input.monthlyTarget,
        contentApprovalLeadDays: input.contentApprovalLeadDays,
        designCompleteLeadDays: input.designCompleteLeadDays,
        creativeApprovalLeadDays: input.creativeApprovalLeadDays,
        readyToPublishLeadDays: input.readyToPublishLeadDays,
        defaultDesignerId: input.defaultDesignerId,
        defaultContentReviewerId: input.defaultContentReviewerId,
        defaultInternalCreativeReviewerId: input.defaultInternalCreativeReviewerId,
        defaultClientReviewerId: input.defaultClientReviewerId,
        ...metaPublishingChange,
      })
      .onConflictDoUpdate({
        target: workspaceSettings.workspaceId,
        set: {
          approvalMode: input.approvalMode,
          monthlyTarget: input.monthlyTarget,
          contentApprovalLeadDays: input.contentApprovalLeadDays,
          designCompleteLeadDays: input.designCompleteLeadDays,
          creativeApprovalLeadDays: input.creativeApprovalLeadDays,
          readyToPublishLeadDays: input.readyToPublishLeadDays,
          defaultDesignerId: input.defaultDesignerId,
          defaultContentReviewerId: input.defaultContentReviewerId,
          defaultInternalCreativeReviewerId: input.defaultInternalCreativeReviewerId,
          defaultClientReviewerId: input.defaultClientReviewerId,
          ...metaPublishingChange,
          updatedAt: new Date(),
        },
      });
    await tx.insert(securityAuditEvents).values({
      actorId: actor.id,
      action: "workspace_settings_update",
      targetType: "workspace",
      targetId: input.workspaceId,
      outcome: "success",
      metadata: {
        approvalMode: input.approvalMode,
        timezone: input.timezone,
        ...(input.metaPublishingEnabled === undefined
          ? {}
          : { metaPublishingEnabled: input.metaPublishingEnabled }),
      },
    });
  });

  return { ok: true as const };
}
