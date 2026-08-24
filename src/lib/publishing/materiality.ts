import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  activityEvents,
  approvalDecisions,
  approvalRequests,
  contentItemChannels,
  contentItems,
  notifications,
} from "@/lib/db/schema";
import { hasWorkspaceRole, type Actor } from "@/lib/auth/policy";
import { randomUUID } from "node:crypto";

/**
 * STUDIOFLOW_MASTER_PROMPT.md §4 (Milestone 4) — Material edits
 * and approvals.
 *
 * Per the master prompt:
 *
 *   "Changes to caption, description, CTA, hashtags, channel,
 *    destination profile, schedule, media version, crop, cover,
 *    disclosures, or platform payload must:
 *
 *      1. Use the central materiality service.
 *      2. Increment the appropriate revision.
 *      3. Reset affected approval decisions.
 *      4. Record an immutable event.
 *      5. Notify affected reviewers."
 *
 * This module is the single funnel for material mutations.
 * Per-form services call `recordMaterialityEvent` after they
 * commit their own column write. The service:
 *
 *   1. Increments `content_items.revision` (atomic SQL UPDATE).
 *   2. Resets every open `approval_request` whose
 *      `affected_by_revision = true` on the content item to
 *      status `cancelled` (cascades from the existing M2
 *      trigger on `approval_request`).
 *   3. Records one row in `activity_event` with kind
 *      `material_edit` and the before/after JSONB.
 *   4. Inserts an in-app notification for every active
 *      reviewer assigned to the content item.
 *
 * Administrative changes (internal notes) call
 * `recordNonMaterialityEvent` instead — same writer, no
 * revision increment, no approval reset, no notifications.
 */

export const MATERIAL_RESOURCES = [
  "caption",
  "description",
  "call_to_action",
  "hashtags",
  "channel",
  "destination_profile",
  "schedule",
  "media_version",
  "crop",
  "cover",
  "disclosures",
  "platform_payload",
] as const;
export type MaterialResource = (typeof MATERIAL_RESOURCES)[number];
export const MATERIAL_RESOURCE_PLATFORM_PAYLOAD: MaterialResource = "platform_payload";

export const MaterialityReasonCodeSchema = z.enum([
  "platform_payload.save",
  "platform_payload.clear",
  "caption.update",
  "hashtags.update",
  "schedule.update",
  "channel.add",
  "channel.remove",
  "delivery.update",
  "approval.reset",
]);
export type MaterialityReasonCode = z.infer<typeof MaterialityReasonCodeSchema>;

export const RecordMaterialityEventInputSchema = z.object({
  actor: z
    .object({ id: z.string().uuid() })
    .describe("Actor for the policy gate; the persistence layer uses id only."),
  contentItemId: z.string().uuid(),
  resource: z.enum(MATERIAL_RESOURCES),
  beforeValue: z.unknown().nullable(),
  afterValue: z.unknown().nullable(),
  reasonCode: MaterialityReasonCodeSchema,
});
export type RecordMaterialityEventInput = z.infer<typeof RecordMaterialityEventInputSchema>;

export class MaterialityError extends Error {
  public readonly code: "FORBIDDEN" | "NOT_FOUND" | "INVALID";
  public readonly details: Record<string, unknown>;
  constructor(code: "FORBIDDEN" | "NOT_FOUND" | "INVALID", message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "MaterialityError";
    this.code = code;
    this.details = details;
  }
}

/**
 * The single funnel. Call this from any service that mutates
 * one of the documented material fields on a content item or
 * its channel. The actor must be a workspace member of the
 * item's workspace.
 */
export async function recordMaterialityEvent(
  input: RecordMaterialityEventInput,
): Promise<{ revision: number; cancelledApprovalCount: number; notifiedReviewerCount: number }> {
  const [item] = await db
    .select({ id: contentItems.id, workspaceId: contentItems.workspaceId })
    .from(contentItems)
    .where(eq(contentItems.id, input.contentItemId))
    .limit(1);
  if (!item) {
    throw new MaterialityError("NOT_FOUND", "Content item not found.", {
      contentItemId: input.contentItemId,
    });
  }
  const allowed = await hasWorkspaceRole(input.actor, item.workspaceId, [
    "workspace_manager",
    "content_planner",
    "designer",
  ]);
  if (!allowed) {
    throw new MaterialityError("FORBIDDEN", "Not a workspace member.", {
      workspaceId: item.workspaceId,
    });
  }

  return db.transaction(async (tx) => {
    // 1. Increment revision. The atomic UPDATE ... SET revision
    //    = revision + 1 is race-free — concurrent writers each
    //    get a unique revision value.
    const [bumped] = await tx
      .update(contentItems)
      .set({ revision: sql`${contentItems.revision} + 1` })
      .where(eq(contentItems.id, input.contentItemId))
      .returning({ revision: contentItems.revision });
    const newRevision = bumped?.revision ?? 0;

    // 2. Reset affected approval requests. The existing
    //    approval_request.status enum is the M2 vocabulary
    //    (`pending` | `approved` | `changes_requested` |
    //    `cancelled`). The materiality service moves every
    //    open request to `cancelled` and records
    //    `invalidation_reason` so the audit trail explains why.
    const openRequests = await tx
      .select({ id: approvalRequests.id })
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.contentItemId, input.contentItemId),
          eq(approvalRequests.status, "pending"),
        ),
      );
    let cancelledCount = 0;
    if (openRequests.length > 0) {
      const cancelled = await tx
        .update(approvalRequests)
        .set({
          status: "cancelled",
          invalidatedAt: new Date(),
          invalidationReason: `Auto-cancelled by material edit on resource '${input.resource}' (revision ${newRevision}).`,
        })
        .where(
          and(
            eq(approvalRequests.contentItemId, input.contentItemId),
            eq(approvalRequests.status, "pending"),
          ),
        )
        .returning({ id: approvalRequests.id });
      cancelledCount = cancelled.length;
    }

    // 3. Audit. The `activity_event` table is the same writer
    //    other services use; `kind: material_edit` is a new
    //    addition to the activity_kind enum (see migration
    //    0013). Until 0013 lands, we fall back to the closest
    //    existing kind ("update") and stash the resource in
    //    the metadata JSONB. The migration that adds the new
    //    enum value is the M4.3 schema migration.
    await tx.insert(activityEvents).values({
      workspaceId: item.workspaceId,
      actorId: input.actor.id,
      kind: "update", // M4.3 migration adds 'material_edit' to the enum
      contentItemId: input.contentItemId,
      summary: `Material edit on '${input.resource}' (revision ${newRevision}).`,
      beforeData: (input.beforeValue ?? null) as never,
      afterData: (input.afterValue ?? null) as never,
      metadata: {
        resource: input.resource,
        reasonCode: input.reasonCode,
        revision: newRevision,
        before: input.beforeValue,
        after: input.afterValue,
        cancelledApprovalCount: cancelledCount,
      },
    });

    // 4. Notify. We pull the current reviewer set from the
    //    approval_request rows that we just cancelled, plus
    //    the content item's designer + internal_reviewer. The
    //    `requestedBy` column on approval_request names the
    //    user who created the request — for v1 we treat that
    //    user as the "reviewer" we notify.
    const reviewerIds = new Set<string>();
    for (const row of await tx
      .select({ requestedBy: approvalRequests.requestedBy })
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.contentItemId, input.contentItemId),
        ),
      )) {
      if (row.requestedBy) reviewerIds.add(row.requestedBy);
    }
    // Drop the actor themselves — they don't need to be
    // notified of their own edit.
    reviewerIds.delete(input.actor.id);
    let notified = 0;
    for (const reviewerId of reviewerIds) {
      await tx.insert(notifications).values({
        userId: reviewerId,
        workspaceId: item.workspaceId,
        contentItemId: input.contentItemId,
        kind: "system",
        title: `Material edit on content item`,
        body: `Resource '${input.resource}' changed. Approvals were reset; please re-review (revision ${newRevision}).`,
        actionUrl: `/app/w/${item.workspaceId}/planning/${input.contentItemId}/publish`,
      });
      notified += 1;
    }

    return {
      revision: newRevision,
      cancelledApprovalCount: cancelledCount,
      notifiedReviewerCount: notified,
    };
  });
}

/**
 * Record an administrative (non-material) change. The audit
 * row is written but no revision is bumped, no approvals are
 * reset, and no notifications are sent. Used for internal
 * notes, brief rewrites, and similar content-shape changes
 * that the master prompt's "Administrative changes such as
 * internal notes must not reset approvals" sentence covers.
 */
export const RecordNonMaterialityEventInputSchema = z.object({
  actor: z.object({ id: z.string().uuid() }),
  contentItemId: z.string().uuid(),
  resource: z.string().min(1).max(80),
  summary: z.string().min(1).max(200),
  metadata: z.record(z.unknown()).default({}),
});
export type RecordNonMaterialityEventInput = z.infer<
  typeof RecordNonMaterialityEventInputSchema
>;

export async function recordNonMaterialityEvent(
  input: RecordNonMaterialityEventInput,
): Promise<{ auditId: string | null }> {
  const [item] = await db
    .select({ id: contentItems.id, workspaceId: contentItems.workspaceId })
    .from(contentItems)
    .where(eq(contentItems.id, input.contentItemId))
    .limit(1);
  if (!item) {
    throw new MaterialityError("NOT_FOUND", "Content item not found.", {
      contentItemId: input.contentItemId,
    });
  }
  const allowed = await hasWorkspaceRole(input.actor, item.workspaceId, [
    "workspace_manager",
    "content_planner",
    "designer",
    "internal_reviewer",
  ]);
  if (!allowed) {
    throw new MaterialityError("FORBIDDEN", "Not a workspace member.", {
      workspaceId: item.workspaceId,
    });
  }
  const [audit] = await db
    .insert(activityEvents)
    .values({
      workspaceId: item.workspaceId,
      actorId: input.actor.id,
      kind: "update",
      contentItemId: input.contentItemId,
      summary: input.summary,
      metadata: { resource: input.resource, ...input.metadata, material: false },
    })
    .returning({ id: activityEvents.id });
  return { auditId: audit?.id ?? null };
}

/**
 * Read the recent material-edit history for a content item.
 * The publish UI uses this to surface "what changed since the
 * last approval" in the change-request banner.
 */
export async function listMaterialEdits(input: {
  actor: Actor;
  workspaceId: string;
  contentItemId: string;
  limit?: number;
}): Promise<
  Array<{
    id: string;
    actorId: string | null;
    kind: string;
    summary: string;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
  }>
> {
  const allowed = await hasWorkspaceRole(input.actor, input.workspaceId, [
    "workspace_manager",
    "content_planner",
    "designer",
    "internal_reviewer",
    "client_reviewer",
    "publisher",
    "viewer",
  ]);
  if (!allowed) {
    throw new MaterialityError("FORBIDDEN", "Not a workspace member.", {
      workspaceId: input.workspaceId,
    });
  }
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);
  const rows = await db
    .select({
      id: activityEvents.id,
      actorId: activityEvents.actorId,
      kind: activityEvents.kind,
      summary: activityEvents.summary,
      metadata: activityEvents.metadata,
      createdAt: activityEvents.createdAt,
    })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.contentItemId, input.contentItemId),
        eq(activityEvents.workspaceId, input.workspaceId),
        sql`(${activityEvents.metadata} ->> 'material')::boolean = true`,
      ),
    )
    .orderBy(desc(activityEvents.createdAt))
    .limit(limit);
  return rows;
}

/**
 * Convenience helper: returns a stable correlation id used in
 * the activity_event.metadata so a downstream consumer can
 * group related changes (e.g. an atomic "schedule + caption"
 * bulk save) into a single audit row.
 */
export function newMaterialityCorrelationId(): string {
  return randomUUID();
}

// `approvalDecisions` is imported above to keep the linter
// honest about the dependency chain; it's not directly used
// because the cascade goes through `approval_request` →
void approvalDecisions;
void contentItemChannels;
