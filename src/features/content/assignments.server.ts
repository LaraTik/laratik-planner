import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { activityEvents, contentAssignments, contentItems } from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import {
  enqueueAssignmentNotification,
  enqueueClaimNotification,
  enqueueReleaseNotification,
} from "@/lib/notifications/service";
import { z } from "zod";

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
    const claimed = await tx
      .update(contentItems)
      .set({ designerId: actor.id, status: "in_design", updatedAt: new Date() })
      .where(
        and(
          eq(contentItems.id, contentItemId),
          isNull(contentItems.designerId),
          inArray(contentItems.status, ["approved_for_design", "in_design"]),
        ),
      )
      .returning({ id: contentItems.id });
    if (claimed.length === 0) {
      throw new Error("Already assigned to a designer or status changed; refresh and try again");
    }
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
// `assignDesigner` / `releaseDesignTask` are the §14 contract names.
// `claimAsDesigner` (the designer's self-claim) is the designer-driven
// path; assign and release are manager-driven paths to rotate a task.

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
  await requirePolicy(
    hasWorkspaceRole({ id: parsed.data.designerId }, item.workspaceId, ["designer"]),
    "assign_designer_target",
  );
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
