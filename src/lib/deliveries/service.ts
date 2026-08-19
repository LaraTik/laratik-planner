import "server-only";
import { and, eq, max, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activityEvents,
  approvalDecisions,
  approvalRequests,
  contentItems,
  deliveryLinks,
  deliveryVersions,
  workspaceSettings,
} from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { deriveCreativeApprovalOutcome } from "@/lib/deliveries/approval-workflow";

/**
 * Delivery service (Goal 9 — master prompt §8 + §10).
 *
 * Workflow:
 *  1. Designer submits a delivery version (with at least one link)
 *  2. Content moves to creative_review (via transitionContent "submit_delivery")
 *  3. Internal reviewer approves → ready_to_publish (or "request_creative_changes")
 *  4. If workspace has client_reviewer + internal_then_client mode, an
 *     additional client approval request is created
 *  5. When all gates approve, item moves to ready_to_publish
 */

export const SubmitDeliverySchema = z.object({
  contentItemId: z.string().uuid(),
  description: z.string().min(1).max(500),
  designerNote: z.string().max(2000).optional(),
  links: z
    .array(
      z.object({
        provider: z.enum([
          "google_drive",
          "dropbox",
          "onedrive",
          "frame_io",
          "figma",
          "canva",
          "other",
        ]),
        label: z.string().min(1).max(120),
        url: z
          .string()
          .url()
          .refine((u) => u.startsWith("https://"), "URL must be https"),
        isPreview: z.boolean().default(false),
      }),
    )
    .min(1, "At least one delivery link is required"),
});

export type SubmitDeliveryInput = z.infer<typeof SubmitDeliverySchema>;

export async function submitDelivery(actor: Actor, input: SubmitDeliveryInput) {
  const [item] = await db
    .select({
      workspaceId: contentItems.workspaceId,
      status: contentItems.status,
      changeRequestGate: contentItems.changeRequestGate,
    })
    .from(contentItems)
    .where(eq(contentItems.id, input.contentItemId))
    .limit(1);
  if (!item) throw new Error("Content item not found");

  await requirePolicy(
    hasWorkspaceRole(actor, item.workspaceId, ["designer", "workspace_manager"]),
    "submit_delivery",
  );
  const isCreativeRevision =
    item.status === "changes_requested" &&
    (item.changeRequestGate === "creative_internal" ||
      item.changeRequestGate === "creative_client");
  if (item.status !== "in_design" && !isCreativeRevision) {
    throw new Error(`Cannot submit a delivery while content is ${item.status}`);
  }

  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM content_item WHERE id = ${input.contentItemId} FOR UPDATE`);

    await tx
      .update(approvalRequests)
      .set({
        status: "cancelled",
        invalidatedAt: new Date(),
        invalidationReason: "Superseded by a new delivery version",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(approvalRequests.contentItemId, input.contentItemId),
          eq(approvalRequests.status, "pending"),
          sql`${approvalRequests.gate} IN ('creative_internal', 'creative_client')`,
        ),
      );

    // Allocate the next version number
    const versionRows = await tx
      .select({ max: max(deliveryVersions.versionNumber) })
      .from(deliveryVersions)
      .where(eq(deliveryVersions.contentItemId, input.contentItemId));
    const maxVersion = versionRows[0]?.max;
    const nextVersion = (maxVersion ?? 0) + 1;

    const [created] = await tx
      .insert(deliveryVersions)
      .values({
        contentItemId: input.contentItemId,
        versionNumber: nextVersion,
        description: input.description,
        ...(input.designerNote ? { designerNote: input.designerNote } : {}),
        submittedBy: actor.id,
      })
      .returning({ id: deliveryVersions.id });

    await tx.insert(deliveryLinks).values(
      input.links.map((l) => ({
        deliveryVersionId: created!.id,
        provider: l.provider,
        label: l.label,
        url: l.url,
        isPreview: l.isPreview,
      })),
    );

    // Open an internal creative-review request
    await tx.insert(approvalRequests).values({
      contentItemId: input.contentItemId,
      gate: "creative_internal",
      deliveryVersionId: created!.id,
      requestedBy: actor.id,
      sequence: 1,
    });

    await tx
      .update(contentItems)
      .set({
        status: "creative_review",
        changeRequestGate: null,
        statusReturnTarget: null,
        approvedDeliveryVersionId: null,
        updatedAt: new Date(),
      })
      .where(eq(contentItems.id, input.contentItemId));

    await tx.insert(activityEvents).values({
      workspaceId: item.workspaceId,
      contentItemId: input.contentItemId,
      actorId: actor.id,
      kind: "delivery",
      summary: `Submitted delivery V${nextVersion}`,
      beforeData: { status: item.status },
      afterData: { status: "creative_review", deliveryVersionId: created!.id },
    });

    revalidatePath(`/app/w/`);
    return { deliveryVersionId: created!.id, versionNumber: nextVersion };
  });
}

export const DecideApprovalSchema = z.object({
  approvalRequestId: z.string().uuid(),
  decision: z.enum(["approved", "changes_requested"]),
  feedback: z.string().max(2000).optional(),
});

export type DecideApprovalInput = z.infer<typeof DecideApprovalSchema>;

export async function decideApproval(actor: Actor, input: DecideApprovalInput) {
  if (input.decision === "changes_requested" && !input.feedback) {
    throw new Error("changes_requested requires non-empty feedback");
  }

  const [req] = await db
    .select()
    .from(approvalRequests)
    .where(eq(approvalRequests.id, input.approvalRequestId))
    .limit(1);
  if (!req) throw new Error("Approval request not found");
  if (req.status !== "pending") throw new Error(`Request is ${req.status}`);

  // Resolve workspace for policy check
  const [item] = await db
    .select({ workspaceId: contentItems.workspaceId })
    .from(contentItems)
    .where(eq(contentItems.id, req.contentItemId))
    .limit(1);
  if (!item) throw new Error("Content item not found");

  const role =
    req.gate === "content"
      ? ["internal_reviewer"]
      : req.gate === "creative_internal"
        ? ["internal_reviewer"]
        : ["client_reviewer"];

  await requirePolicy(hasWorkspaceRole(actor, item.workspaceId, role), "decide_approval");

  return await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM approval_request WHERE id = ${req.id} FOR UPDATE`);
    const [lockedRequest] = await tx
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, req.id))
      .limit(1);
    if (!lockedRequest || lockedRequest.status !== "pending") {
      throw new Error("Approval request is no longer pending");
    }

    const [settings] = await tx
      .select({ approvalMode: workspaceSettings.approvalMode })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, item.workspaceId))
      .limit(1);
    const approvalMode =
      settings?.approvalMode === "internal_then_client" ? "internal_then_client" : "simple";

    await tx.insert(approvalDecisions).values({
      approvalRequestId: lockedRequest.id,
      reviewerId: actor.id,
      decision: input.decision,
      ...(input.feedback ? { feedback: input.feedback } : {}),
    });
    await tx
      .update(approvalRequests)
      .set({
        status: input.decision,
        invalidatedAt: input.decision === "changes_requested" ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(approvalRequests.id, req!.id));

    if (lockedRequest.gate === "content") {
      throw new Error("Content approvals must use the content workflow command");
    }

    const outcome = deriveCreativeApprovalOutcome({
      gate: lockedRequest.gate,
      decision: input.decision,
      approvalMode,
    });

    if (outcome.createClientRequest) {
      if (!lockedRequest.deliveryVersionId) throw new Error("Delivery version is required");
      await tx.insert(approvalRequests).values({
        contentItemId: lockedRequest.contentItemId,
        gate: "creative_client",
        deliveryVersionId: lockedRequest.deliveryVersionId,
        requestedBy: actor.id,
        sequence: 2,
      });
    }

    if (outcome.markDeliveryFinal && lockedRequest.deliveryVersionId) {
      await tx
        .update(deliveryVersions)
        .set({ isFinalApproved: false })
        .where(eq(deliveryVersions.contentItemId, lockedRequest.contentItemId));
      await tx
        .update(deliveryVersions)
        .set({ isFinalApproved: true })
        .where(eq(deliveryVersions.id, lockedRequest.deliveryVersionId));
    }

    await tx
      .update(contentItems)
      .set({
        status: outcome.contentStatus,
        changeRequestGate: outcome.changeRequestGate,
        statusReturnTarget: outcome.statusReturnTarget,
        approvedDeliveryVersionId: outcome.markDeliveryFinal
          ? lockedRequest.deliveryVersionId
          : null,
        updatedAt: new Date(),
      })
      .where(eq(contentItems.id, lockedRequest.contentItemId));

    await tx.insert(activityEvents).values({
      workspaceId: item.workspaceId,
      contentItemId: lockedRequest.contentItemId,
      actorId: actor.id,
      kind: "review",
      summary: `${lockedRequest.gate} ${input.decision}`,
      afterData: {
        status: outcome.contentStatus,
        deliveryVersionId: lockedRequest.deliveryVersionId,
      },
    });

    revalidatePath(`/app/w/`);
    return { ok: true };
  });
}

export async function listApprovalsForItem(actor: Actor, contentItemId: string) {
  const [item] = await db
    .select({ workspaceId: contentItems.workspaceId })
    .from(contentItems)
    .where(eq(contentItems.id, contentItemId))
    .limit(1);
  if (!item) throw new Error("Content item not found");
  await requirePolicy(
    hasWorkspaceRole(actor, item.workspaceId, [
      "workspace_manager",
      "content_planner",
      "designer",
      "internal_reviewer",
      "client_reviewer",
      "publisher",
      "viewer",
    ]),
    "list_approvals",
  );

  return db
    .select({
      id: approvalRequests.id,
      gate: approvalRequests.gate,
      status: approvalRequests.status,
      requestedAt: approvalRequests.requestedAt,
      invalidatedAt: approvalRequests.invalidatedAt,
      deliveryVersionId: approvalRequests.deliveryVersionId,
    })
    .from(approvalRequests)
    .where(eq(approvalRequests.contentItemId, contentItemId))
    .orderBy(sql`${approvalRequests.requestedAt} DESC`);
}
