import "server-only";
import { and, eq, inArray, max, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activityEvents,
  approvalDecisions,
  approvalRequests,
  contentItems,
  deliveryLinks,
  deliveryVersions,
  users,
  workspaceSettings,
} from "@/lib/db/schema";
import { hasWorkspaceRole, requirePolicy, type Actor } from "@/lib/auth/policy";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { deriveCreativeApprovalOutcome } from "@/lib/deliveries/approval-workflow";
import {
  enqueueApprovalNotification,
  enqueueDeliveryNotification,
  enqueueReadyToPublishNotification,
  buildActionUrlForContentItem,
} from "@/lib/notifications/service";

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
  // P0a (2026-09-03, /ui-ux-pro-max): description is optional. A
  // designer submitting a Figma/Canva link with no narrative
  // description used to have to invent one to pass the gate. The
  // DB column is already nullable; we just relax the Zod check.
  description: z.string().max(500).optional(),
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
        // P0a: Zod now allows `undefined`; the DB column is NOT NULL
        // so coerce to "" when the designer left it blank. Empty
        // string is the same on-page state as a description that the
        // planner never filled in.
        description: input.description ?? "",
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

    // FEAT-01 — fire a `delivery` in-app notification to the
    // content owner and the assigned internal creative reviewer.
    // These are the two users the §12 contract names as "must
    // hear about a delivery submission". Skip the actor themselves.
    const skipSelf = (uid: string | null | undefined): string | null =>
      uid && uid !== actor.id ? uid : null;
    const itemRow = await tx
      .select({
        title: contentItems.title,
        contentOwnerId: contentItems.contentOwnerId,
        internalCreativeReviewerId: contentItems.internalCreativeReviewerId,
      })
      .from(contentItems)
      .where(eq(contentItems.id, input.contentItemId))
      .limit(1);
    const itemMeta = itemRow[0];
    if (itemMeta) {
      // Resolve the slug once per delivery submission so every
      // recipient gets a valid `/app/w/<slug>/planning/<id>` link
      // (the previous "no actionUrl" path fell through to a broken
      // `/app/planning/<id>` literal that 404'd in the App Router).
      const actionUrl = await buildActionUrlForContentItem(
        item.workspaceId,
        input.contentItemId,
        null,
        tx,
      );
      for (const recipient of [
        skipSelf(itemMeta.contentOwnerId),
        skipSelf(itemMeta.internalCreativeReviewerId),
      ].filter((u): u is string => Boolean(u))) {
        await enqueueDeliveryNotification(
          {
            userId: recipient,
            workspaceId: item.workspaceId,
            contentItemId: input.contentItemId,
            title: `Delivery submitted: "${itemMeta.title}"`,
            body: `Delivery V${nextVersion} is waiting on creative review.`,
            messageKey: "notifications.events.delivery_submitted",
            messageParams: { title: itemMeta.title, version: nextVersion },
            actionUrl,
          },
          tx,
        );
      }
    }

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

    // FEAT-01 — emit the right in-app kind for the creative decision:
    //   - `approval`           → the content owner + the designer,
    //                            so they know the creative review
    //                            cleared.
    //   - `changes_requested`  → the designer (the one who has to
    //                            iterate), and the content owner
    //                            (kept in the loop).
    //   - transition to
    //     ready_to_publish     → `ready_to_publish` to the owner +
    //                            designer (the "go live" signal).
    // The client_reviewer (creative_client gate) is intentionally
    // not in the notify set — that audience sees the review via
    // the dedicated client portal, not the bell.
    const itemMetaRows = await tx
      .select({
        title: contentItems.title,
        contentOwnerId: contentItems.contentOwnerId,
        designerId: contentItems.designerId,
      })
      .from(contentItems)
      .where(eq(contentItems.id, lockedRequest.contentItemId))
      .limit(1);
    const itemMeta = itemMetaRows[0];
    const skipSelf = (uid: string | null | undefined): string | null =>
      uid && uid !== actor.id ? uid : null;
    if (itemMeta && input.decision === "approved") {
      for (const recipient of [
        skipSelf(itemMeta.contentOwnerId),
        skipSelf(itemMeta.designerId),
      ].filter((u): u is string => Boolean(u))) {
        await enqueueApprovalNotification(
          {
            userId: recipient,
            workspaceId: item.workspaceId,
            contentItemId: lockedRequest.contentItemId,
            title: `Creative approved: "${itemMeta.title}"`,
            body: `The ${lockedRequest.gate} reviewer approved this delivery.`,
            messageKey: "notifications.events.delivery_approved",
            messageParams: { title: itemMeta.title },
          },
          tx,
        );
      }
      if (outcome.contentStatus === "ready_to_publish") {
        for (const recipient of [
          skipSelf(itemMeta.contentOwnerId),
          skipSelf(itemMeta.designerId),
        ].filter((u): u is string => Boolean(u))) {
          await enqueueReadyToPublishNotification(
            {
              userId: recipient,
              workspaceId: item.workspaceId,
              contentItemId: lockedRequest.contentItemId,
              title: `Ready to publish: "${itemMeta.title}"`,
              body: "All approvals are in. The item is ready to publish.",
              messageKey: "notifications.events.ready_to_publish",
              messageParams: { title: itemMeta.title },
            },
            tx,
          );
        }
      }
    } else if (itemMeta && input.decision === "changes_requested") {
      for (const recipient of [
        skipSelf(itemMeta.designerId),
        skipSelf(itemMeta.contentOwnerId),
      ].filter((u): u is string => Boolean(u))) {
        const reason = input.feedback?.slice(0, 240);
        await enqueueDeliveryNotification(
          {
            userId: recipient,
            workspaceId: item.workspaceId,
            contentItemId: lockedRequest.contentItemId,
            title: `Changes requested: "${itemMeta.title}"`,
            body: reason
              ? `Reviewer feedback: ${reason}`
              : "The reviewer requested changes on the latest delivery.",
            messageKey: reason
              ? "notifications.events.changes_requested_with_reason"
              : "notifications.events.delivery_changes_requested",
            messageParams: reason ? { title: itemMeta.title, reason } : { title: itemMeta.title },
          },
          tx,
        );
      }
    }

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

/**
 * STUDIOFLOW_MASTER_PROMPT.md §10 — list every delivery version for a
 * content item, newest first, with the links and submitter display
 * name. Read by the content-detail page so designers and reviewers
 * can see what was actually submitted.
 *
 * Authorization: any workspace member (same as `listApprovalsForItem`).
 */
export type DeliveryListItem = {
  id: string;
  versionNumber: number;
  description: string;
  designerNote: string | null;
  submittedAt: Date;
  isFinalApproved: boolean;
  submittedBy: { id: string; name: string };
  links: {
    id: string;
    provider: string;
    label: string;
    url: string;
    isPreview: boolean;
  }[];
};

export async function listDeliveriesForItem(
  actor: Actor,
  contentItemId: string,
): Promise<DeliveryListItem[]> {
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
    "list_deliveries",
  );

  const versionRows = await db
    .select({
      id: deliveryVersions.id,
      versionNumber: deliveryVersions.versionNumber,
      description: deliveryVersions.description,
      designerNote: deliveryVersions.designerNote,
      submittedAt: deliveryVersions.submittedAt,
      isFinalApproved: deliveryVersions.isFinalApproved,
      submittedBy: users.id,
      submittedByName: users.displayName,
    })
    .from(deliveryVersions)
    .innerJoin(users, eq(users.id, deliveryVersions.submittedBy))
    .where(eq(deliveryVersions.contentItemId, contentItemId))
    .orderBy(sql`${deliveryVersions.versionNumber} DESC`);

  if (versionRows.length === 0) return [];

  const versionIds = versionRows.map((v) => v.id);
  const linkRows = await db
    .select({
      id: deliveryLinks.id,
      deliveryVersionId: deliveryLinks.deliveryVersionId,
      provider: deliveryLinks.provider,
      label: deliveryLinks.label,
      url: deliveryLinks.url,
      isPreview: deliveryLinks.isPreview,
    })
    .from(deliveryLinks)
    .where(inArray(deliveryLinks.deliveryVersionId, versionIds))
    .orderBy(sql`${deliveryLinks.createdAt} ASC`);

  const linksByVersion = new Map<string, DeliveryListItem["links"]>();
  for (const link of linkRows) {
    const list = linksByVersion.get(link.deliveryVersionId) ?? [];
    list.push({
      id: link.id,
      provider: link.provider,
      label: link.label,
      url: link.url,
      isPreview: link.isPreview,
    });
    linksByVersion.set(link.deliveryVersionId, list);
  }

  return versionRows.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    description: v.description,
    designerNote: v.designerNote,
    submittedAt: v.submittedAt,
    isFinalApproved: v.isFinalApproved,
    submittedBy: { id: v.submittedBy, name: v.submittedByName },
    links: linksByVersion.get(v.id) ?? [],
  }));
}

/**
 * STUDIOFLOW_MASTER_PROMPT.md §10 — list every delivery version for a
 * content item with a **client-safe projection**.
 *
 * Differs from `listDeliveriesForItem` (which is the internal-only
 * read for the workflow detail page) in that this function:
 *
 *  - accepts an `isClientReviewer` flag in `opts` and redacts the
 *    fields a client must never see: `designerNote`, the submitter's
 *    full display name, and the submitter's email (which is never
 *    selected at all in the client projection);
 *  - is the canonical read used by the `<DeliveryVersionList>`
 *    component, which intentionally knows nothing about role-based
 *    redaction.
 *
 * Authorization: any workspace member (same as `listApprovalsForItem`).
 */
export type DeliveryVersionListItem = {
  id: string;
  versionNumber: number;
  description: string;
  /** Internal-only; null when the actor is a client reviewer. */
  designerNote: string | null;
  submittedAt: Date;
  isFinalApproved: boolean;
  /**
   * Submitter projection. For client reviewers, the `name` is
   * intentionally blank — the UI renders nothing rather than
   * leaking identity.
   */
  submittedBy: { id: string; name: string };
  links: {
    id: string;
    provider: string;
    label: string;
    url: string;
    isPreview: boolean;
  }[];
};

export async function listDeliveryVersionsForItem(
  actor: Actor,
  contentItemId: string,
  opts: { isClientReviewer?: boolean } = {},
): Promise<DeliveryVersionListItem[]> {
  const isClientReviewer = Boolean(opts.isClientReviewer);

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
    "list_delivery_versions",
  );

  // The client projection never selects the email column, so an
  // accidental column leak is impossible at the SQL layer.
  const versionRows = await db
    .select({
      id: deliveryVersions.id,
      versionNumber: deliveryVersions.versionNumber,
      description: deliveryVersions.description,
      designerNote: deliveryVersions.designerNote,
      submittedAt: deliveryVersions.submittedAt,
      isFinalApproved: deliveryVersions.isFinalApproved,
      submittedBy: users.id,
      submittedByName: users.displayName,
    })
    .from(deliveryVersions)
    .innerJoin(users, eq(users.id, deliveryVersions.submittedBy))
    .where(eq(deliveryVersions.contentItemId, contentItemId))
    .orderBy(sql`${deliveryVersions.versionNumber} DESC`);

  if (versionRows.length === 0) return [];

  const versionIds = versionRows.map((v) => v.id);
  const linkRows = await db
    .select({
      id: deliveryLinks.id,
      deliveryVersionId: deliveryLinks.deliveryVersionId,
      provider: deliveryLinks.provider,
      label: deliveryLinks.label,
      url: deliveryLinks.url,
      isPreview: deliveryLinks.isPreview,
    })
    .from(deliveryLinks)
    .where(inArray(deliveryLinks.deliveryVersionId, versionIds))
    .orderBy(sql`${deliveryLinks.createdAt} ASC`);

  const linksByVersion = new Map<string, DeliveryVersionListItem["links"]>();
  for (const link of linkRows) {
    const list = linksByVersion.get(link.deliveryVersionId) ?? [];
    list.push({
      id: link.id,
      provider: link.provider,
      label: link.label,
      url: link.url,
      isPreview: link.isPreview,
    });
    linksByVersion.set(link.deliveryVersionId, list);
  }

  return versionRows.map((v) => ({
    id: v.id,
    versionNumber: v.versionNumber,
    description: v.description,
    designerNote: isClientReviewer ? null : v.designerNote,
    submittedAt: v.submittedAt,
    isFinalApproved: v.isFinalApproved,
    submittedBy: isClientReviewer
      ? { id: v.submittedBy, name: "" }
      : { id: v.submittedBy, name: v.submittedByName },
    links: linksByVersion.get(v.id) ?? [],
  }));
}
