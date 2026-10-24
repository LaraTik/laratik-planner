import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activityEvents,
  approvalDecisions,
  approvalRequests,
  contentItems,
  workspaceSettings,
} from "@/lib/db/schema";
import { hasWorkspaceRole, isAgencyAdminForWorkspace, type Actor } from "@/lib/auth/policy";
import { humanStatus as humanizeForSummary } from "@/lib/content/status";
import {
  WORKFLOW_RULES,
  DomainError,
  getActiveScenario,
  resolveWorkflowTransition,
  type WorkflowAction,
  type WorkspaceRole,
} from "@/lib/content/workflow";
import {
  enqueueApprovalNotification,
  enqueueChangesRequestedNotification,
  enqueueReadyToPublishNotification,
  enqueueReviewRequestNotification,
} from "@/lib/notifications/service";

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
  if (
    input.action !== "unblock" &&
    !Object.prototype.hasOwnProperty.call(WORKFLOW_RULES, input.action)
  ) {
    throw new DomainError("invalid_transition", "Unknown workflow action");
  }

  const [item] = await db
    .select()
    .from(contentItems)
    .where(eq(contentItems.id, input.contentItemId))
    .limit(1);
  if (!item) throw new DomainError("not_found", "Content item not found");

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

  // Master prompt §9 gives the agency admin "F" (full) on client
  // creative review and §10 lists "assigned client reviewer, admin"
  // as the authorised parties for `approve_client_creative`. The admin
  // does not hold the `client_reviewer` role, so without this the
  // intersection above is empty for them and the admin is refused a
  // decision the spec says they own.
  if (
    input.action === "approve_client_creative" &&
    !actorRoles.includes("client_reviewer") &&
    (await isAgencyAdminForWorkspace(actor, item.workspaceId))
  ) {
    actorRoles.push("client_reviewer");
  }

  // The workspace's active workflow scenario filters the transition
  // table. This used to be a UI-only guard: the planning rail hid the
  // stages a scenario omits, but the server accepted the transition
  // anyway, so the scenario could be bypassed from the server action
  // or the MCP tool.
  const [settingsRow] = await db
    .select({
      workflowScenario: workspaceSettings.workflowScenario,
      approvalMode: workspaceSettings.approvalMode,
    })
    .from(workspaceSettings)
    .where(eq(workspaceSettings.workspaceId, item.workspaceId))
    .limit(1);
  const scenario = getActiveScenario({
    workflowScenario: settingsRow?.workflowScenario ?? "standard",
    approvalMode: settingsRow?.approvalMode ?? "simple",
  });

  const transition = resolveWorkflowTransition({
    action: input.action,
    currentStatus: item.status,
    actorRoles,
    ...(input.reason ? { reason: input.reason } : {}),
    statusReturnTarget: item.statusReturnTarget,
    scenario,
  });

  if (input.action === "assign_designer" && !item.designerId) {
    throw new DomainError(
      "validation_failed",
      "Assign a designer before moving the item into design",
    );
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

    // A content approval request exists only when the item actually
    // entered the content-review gate. Under a scenario that omits
    // that stage the submit action is routed straight to design, so
    // creating a request here would leave a permanently-pending
    // approval nobody can decide.
    if (
      (input.action === "submit_content_review" || input.action === "resubmit_content") &&
      transition.to === "content_review"
    ) {
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
      if (!pendingRequest) {
        throw new DomainError("not_found", "Pending content approval request not found");
      }
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
      // `summary` is the legacy fallback; the new
      // `activity.verbs.status_transition` template renders the
      // localised status names. Keeping the human-friendly copy
      // in `summary` ensures older clients / data exports still
      // surface a sensible string.
      summary: `${humanizeForSummary(item.status)} → ${humanizeForSummary(transition.to)}`,
      beforeData: { status: item.status },
      afterData: { status: transition.to },
      metadata: {
        action: input.action,
        field: "status",
        before: item.status,
        after: transition.to,
      },
    });

    // FEAT-01 — fire the right in-app notification for each
    // meaningful transition. Skipped when the recipient is the actor
    // themselves (self-approval / self-submit). The kinds map per
    // master prompt §12:
    //   submit_content_review / resubmit_content → "review_request"
    //     to the assigned content reviewer (fallback: the owner)
    //   approve_content                        → "approval"
    //     to the content owner + the designer (so they know the
    //     item is ready for the next step)
    //   request_content_changes                → "changes_requested"
    //     to the content owner
    //   any transition that lands in ready_to_publish
    //                                          → "ready_to_publish"
    //     to the content owner + designer
    const ownerId = item.contentOwnerId;
    const designerId = item.designerId;
    const contentReviewerId = item.contentReviewerId;
    const title = item.title;
    const skipSelf = (uid: string | null | undefined): string | null =>
      uid && uid !== actor.id ? uid : null;
    if (input.action === "submit_content_review" || input.action === "resubmit_content") {
      const reviewer = skipSelf(contentReviewerId) ?? skipSelf(ownerId);
      if (reviewer) {
        await enqueueReviewRequestNotification(
          {
            userId: reviewer,
            workspaceId: item.workspaceId,
            contentItemId: item.id,
            title: `Review requested: "${title}"`,
            body: "A planner submitted this item for content review.",
            messageKey: "notifications.events.review_request",
            messageParams: { title },
          },
          tx,
        );
      }
    } else if (input.action === "approve_content") {
      for (const recipient of [skipSelf(ownerId), skipSelf(designerId)].filter((u): u is string =>
        Boolean(u),
      )) {
        await enqueueApprovalNotification(
          {
            userId: recipient,
            workspaceId: item.workspaceId,
            contentItemId: item.id,
            title: `Content approved: "${title}"`,
            body: "The brief was approved. The item is ready for the next step.",
            messageKey: "notifications.events.approval",
            messageParams: { title },
          },
          tx,
        );
      }
    } else if (input.action === "request_content_changes") {
      const recipient = skipSelf(ownerId);
      if (recipient) {
        const reason = input.reason?.slice(0, 240);
        await enqueueChangesRequestedNotification(
          {
            userId: recipient,
            workspaceId: item.workspaceId,
            contentItemId: item.id,
            title: `Changes requested: "${title}"`,
            body: reason
              ? `Reviewer feedback: ${reason}`
              : "Open the item to see the reviewer's notes.",
            messageKey: reason
              ? "notifications.events.changes_requested_with_reason"
              : "notifications.events.changes_requested",
            messageParams: reason ? { title, reason } : { title },
          },
          tx,
        );
      }
    } else if (transition.to === "ready_to_publish") {
      for (const recipient of [skipSelf(ownerId), skipSelf(designerId)].filter((u): u is string =>
        Boolean(u),
      )) {
        await enqueueReadyToPublishNotification(
          {
            userId: recipient,
            workspaceId: item.workspaceId,
            contentItemId: item.id,
            title: `Ready to publish: "${title}"`,
            body: "All approvals are in. The item is ready to publish.",
            messageKey: "notifications.events.ready_to_publish",
            messageParams: { title },
          },
          tx,
        );
      }
    }
    // Deadline warnings (a planned-publish window is approaching)
    // are emitted by the outbox cron, not by the transition path —
    // see FEAT-18 (P2 backlog). Today the in-app kind is wired but
    // no scheduled worker fires it; the dispatcher will simply
    // process any future `deadline` events the moment they are
    // inserted.

    return { from: item.status, to: transition.to };
  });
}
