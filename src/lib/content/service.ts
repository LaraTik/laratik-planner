import "server-only";
import { and, asc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activityEvents,
  approvalDecisions,
  approvalRequests,
  contentAssignments,
  contentItemChannels,
  contentItems,
  outboxEvents,
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
import {
  parseFormatPayload,
  FormatPayloadByFormat,
  type ContentFormat,
} from "@/lib/format-payload/schemas";
import {
  AUDIENCE_COPY_KEYS,
  audienceCopyFromPayload,
  mergeAudienceCopy,
} from "@/lib/content/audience-copy";
import { designerEditableFieldsFor } from "@/lib/content/production-fields";
import { recordMaterialityEvent } from "@/lib/publishing/materiality";
import {
  enqueueApprovalNotification,
  enqueueAssignmentNotification,
  enqueueChangesRequestedNotification,
  enqueueClaimNotification,
  enqueueDeadlineNotification,
  enqueueReadyToPublishNotification,
  enqueueReleaseNotification,
  enqueueReviewRequestNotification,
} from "@/lib/notifications/service";

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
 * Update only the `formatPayload` (jsonb) of a content item.
 *
 * Distinct from `updateContentItem` (which also changes title /
 * format / brief / schedule) so the per-format "More details"
 * editor can save structured creative fields without forcing
 * the planner to round-trip the full edit form. The
 * editability guard is the same as `updateContentItem` for managers and
 * planners: only `draft` and `changes_requested` items are editable. An
 * assigned designer may update only the production-field allowlist while an
 * item is `in_design` or `changes_requested`, per master prompt §10. Beyond that, the function is
 * schema-driven: the per-format Zod schema is the source of
 * truth, and unknown fields are silently dropped on parse
 * (forward-compat — adding a key to the schema is a no-op
 * for older rows).
 *
 * The stored `formatPayload` is the *parsed* value, not the
 * raw form data. The service normalises the input (fills in
 * the `schemaVersion` key, drops empty optional fields) so a
 * quick re-save after a feature add doesn't leave stale
 * `null` values in the JSONB.
 *
 * The activity event records only the field-set change (e.g.
 * `format_payload_updated`), not the diff — JSONB diffs are
 * noisy and not actionable in audit. The before/afterData
 * records the key set so audit can answer "which fields did
 * the planner touch this week" without re-parsing the row.
 */
export const UpdateFormatPayloadSchema = z.object({
  contentItemId: z.string().uuid(),
  format: z.enum([
    "static_post",
    "carousel",
    "story",
    "short_form_video",
    "long_form_video",
    "live_content",
    "article",
    "other",
  ]) satisfies z.ZodType<ContentFormat>,
  formatPayload: z.record(z.string(), z.unknown()),
});
export type UpdateFormatPayloadInput = z.infer<typeof UpdateFormatPayloadSchema>;

export async function updateFormatPayload(actor: Actor, input: UpdateFormatPayloadInput) {
  const parsed = UpdateFormatPayloadSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  const [item] = await db
    .select({
      id: contentItems.id,
      workspaceId: contentItems.workspaceId,
      status: contentItems.status,
      format: contentItems.format,
      designerId: contentItems.designerId,
      formatPayload: contentItems.formatPayload,
    })
    .from(contentItems)
    .where(eq(contentItems.id, parsed.data.contentItemId))
    .limit(1);
  if (!item) throw new Error("Content item not found");

  const isManagerOrPlanner = await hasWorkspaceRole(actor, item.workspaceId, [
    "workspace_manager",
    "content_planner",
  ]);
  const isAssignedDesigner =
    item.designerId === actor.id && (await hasWorkspaceRole(actor, item.workspaceId, ["designer"]));
  await requirePolicy(Promise.resolve(isManagerOrPlanner || isAssignedDesigner), "update_content");

  if (
    isManagerOrPlanner &&
    !UPDATEABLE_STATUSES.includes(item.status as (typeof UPDATEABLE_STATUSES)[number])
  ) {
    throw new Error(
      `This idea is in ${item.status.replaceAll("_", " ")} and can no longer be edited.`,
    );
  }
  if (
    isAssignedDesigner &&
    !DESIGNER_EDITABLE_STATUSES.includes(item.status as (typeof DESIGNER_EDITABLE_STATUSES)[number])
  ) {
    throw new Error(
      `This idea is in ${item.status.replaceAll("_", " ")} and can no longer be edited.`,
    );
  }

  // The format of the *content item* is the source of truth
  // for which per-format schema we apply. We accept the
  // format in the input so the editor can pre-validate
  // before save, but we re-read it from the DB so a stale
  // form post (e.g. user changed format then changed
  // formatPayload) doesn't write the wrong shape.
  const submitted = parseFormatPayload(item.format, parsed.data.formatPayload) as Record<
    string,
    unknown
  >;
  const current = parseFormatPayload(item.format, item.formatPayload) as Record<string, unknown>;
  const next = isAssignedDesigner ? { ...current } : submitted;
  if (isAssignedDesigner) {
    for (const key of designerEditableFieldsFor(item.format)) {
      if (Object.prototype.hasOwnProperty.call(submitted, key)) next[key] = submitted[key];
      else delete next[key];
    }
  }
  const stored = parseFormatPayload(item.format, next);

  // Snapshot the previous key set for the activity event.
  const beforeKeys = Object.keys(current).sort();

  await db.transaction(async (tx) => {
    await tx
      .update(contentItems)
      .set({ formatPayload: stored, updatedAt: new Date() })
      .where(eq(contentItems.id, parsed.data.contentItemId));

    await tx.insert(activityEvents).values({
      workspaceId: item.workspaceId,
      contentItemId: item.id,
      actorId: actor.id,
      kind: "content_updated",
      summary: `Updated creative details: ${item.format}`,
      beforeData: { formatPayloadKeys: beforeKeys },
      afterData: { formatPayloadKeys: Object.keys(stored as object).sort() },
    });
  });

  revalidatePath(`/app/w/`);
  revalidatePath(`/app/w/`, "layout");
}

/** Canonical audience copy update. Copy is material even when the item is
 * already in review or ready to publish, so it always uses materiality. */
export const UpdateAudienceCopySchema = z.object({
  contentItemId: z.string().uuid(),
  format: z.enum([
    "static_post",
    "carousel",
    "story",
    "short_form_video",
    "long_form_video",
    "live_content",
    "article",
    "other",
  ]) satisfies z.ZodType<ContentFormat>,
  formatPayload: z.record(z.string(), z.unknown()),
});
export type UpdateAudienceCopyInput = z.infer<typeof UpdateAudienceCopySchema>;

export async function updateAudienceCopy(actor: Actor, input: UpdateAudienceCopyInput) {
  const parsed = UpdateAudienceCopySchema.parse(input);
  const [item] = await db
    .select({
      id: contentItems.id,
      workspaceId: contentItems.workspaceId,
      status: contentItems.status,
      format: contentItems.format,
      formatPayload: contentItems.formatPayload,
      revision: contentItems.revision,
    })
    .from(contentItems)
    .where(eq(contentItems.id, parsed.contentItemId))
    .limit(1);
  if (!item) throw new Error("Content item not found");
  await requirePolicy(
    hasWorkspaceRole(actor, item.workspaceId, ["workspace_manager", "content_planner"]),
    "update_audience_copy",
  );
  if (item.status === "cancelled")
    throw new Error("This idea is cancelled and can no longer be edited.");

  const current = parseFormatPayload(item.format, item.formatPayload) as Record<string, unknown>;
  const submitted = parseFormatPayload(item.format, parsed.formatPayload) as Record<
    string,
    unknown
  >;
  const currentCreative = { ...current };
  const submittedCreative = { ...submitted };
  for (const key of AUDIENCE_COPY_KEYS) {
    delete currentCreative[key];
    delete submittedCreative[key];
  }
  delete currentCreative.translations;
  delete submittedCreative.translations;
  if (JSON.stringify(currentCreative) !== JSON.stringify(submittedCreative)) {
    throw new Error("Only audience-facing copy can be changed from the Copy tab.");
  }
  const next = mergeAudienceCopy(item.format, current, audienceCopyFromPayload(submitted));
  const changedKeys: string[] = AUDIENCE_COPY_KEYS.filter(
    (key) => JSON.stringify(current[key] ?? null) !== JSON.stringify(next[key] ?? null),
  );
  if (JSON.stringify(current.translations ?? null) !== JSON.stringify(next.translations ?? null)) {
    changedKeys.push("translations");
  }
  if (changedKeys.length === 0) return { revision: item.revision, changedKeys: [] as string[] };

  await db
    .update(contentItems)
    .set({ formatPayload: next, updatedAt: new Date() })
    .where(eq(contentItems.id, item.id));
  const materiality = await recordMaterialityEvent({
    actor,
    contentItemId: item.id,
    resource: "audience_copy",
    beforeValue: { changedKeys },
    afterValue: { changedKeys },
    reasonCode: "audience_copy.update",
  });
  revalidatePath(`/app/w/`);
  revalidatePath(`/app/w/`, "layout");
  return { revision: materiality.revision, changedKeys };
}

/**
 * Legacy compatibility wrapper. New Copy saves use
 * `updateAudienceCopy`, and therefore follow the normal material
 * edit path (revision, approval reset, activity, notifications).
 *
 * Compared to `updateFormatPayload`:
 *  - Bypasses `UPDATEABLE_STATUSES`. Available in
 *    `in_design` / `creative_review` / `approved_for_design` /
 *    `ready_to_publish` (in addition to `draft` /
 *    `changes_requested`).
 *  - Role-gated to planner / manager. Designer, publisher, and client
 *    reviewer are NOT allowed to patch copy post-design — that's the
 *    designer's own gate and the reviewer's rejection surface.
 *  - Writes only the three audience-facing fields; does NOT
 *    touch strategy / creative fields. Strategy and creative
 *    remain locked to `UPDATEABLE_STATUSES` via
 *    `updateFormatPayload`.
 *  - The historical `content_copy_patched` enum remains valid for
 *    old rows, but this wrapper never writes that event anymore.
 *
 * Patches are partial: callers send any subset of
 * `caption` / `hashtags` / `firstComment`. Empty / undefined
 * values clear the field (the existing
 * `parseFormatPayload` already drops empty optionals on read,
 * so the row shape stays clean).
 */
export const PatchAudienceCopySchema = z.object({
  contentItemId: z.string().uuid(),
  // Each field is optional; at least one must be present.
  caption: z.string().max(2200).optional(),
  hashtags: z.array(z.string().min(1).max(80)).max(30).optional(),
  firstComment: z.string().max(2200).optional(),
});
export type PatchAudienceCopyInput = z.infer<typeof PatchAudienceCopySchema>;

export async function patchAudienceCopy(actor: Actor, input: PatchAudienceCopyInput) {
  const parsed = PatchAudienceCopySchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  }
  if (
    parsed.data.caption === undefined &&
    parsed.data.hashtags === undefined &&
    parsed.data.firstComment === undefined
  ) {
    throw new Error("At least one of caption, hashtags, or firstComment must be provided.");
  }

  const [item] = await db
    .select({
      id: contentItems.id,
      workspaceId: contentItems.workspaceId,
      status: contentItems.status,
      format: contentItems.format,
      formatPayload: contentItems.formatPayload,
    })
    .from(contentItems)
    .where(eq(contentItems.id, parsed.data.contentItemId))
    .limit(1);
  if (!item) throw new Error("Content item not found");

  const format = (item as { format?: ContentFormat }).format;
  if (!format) throw new Error("Content format is missing");
  const current = parseFormatPayload(format, item.formatPayload) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (parsed.data.caption !== undefined) patch.caption = parsed.data.caption;
  if (parsed.data.hashtags !== undefined) patch.hashtags = parsed.data.hashtags;
  if (parsed.data.firstComment !== undefined) patch.firstComment = parsed.data.firstComment;
  return updateAudienceCopy(actor, {
    contentItemId: parsed.data.contentItemId,
    format,
    formatPayload: mergeAudienceCopy(format, current, patch),
  });
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
      // Per-row extensions (caption / hashtags / location
      // from the v2 batch format) → formatPayload. We
      // run the value through the per-format Zod schema so
      // a row that exceeds a per-format limit (e.g. a
      // hashtag that is too long for a specific format)
      // rolls back the whole batch — atomic, per master
      // prompt §17. The result is always the canonical
      // shape the editor + mapper expect.
      let formatPayload: Record<string, unknown> = { schemaVersion: 1 };
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
          title: item.title,
          format: item.format,
          brief: item.brief,
          formatPayload,
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
    /**
     * FEAT-09 (GAP-FULL-REVIEW-2026-08-25) — new filters for the
     * planning list. All optional; missing means "no filter on this
     * field". Search is case-insensitive and matches either title or
     * brief. `format` must be one of the values declared in
     * `QuickCreateSchema`; `ownerId` is the content owner (the row
     * that drives the assignee column on the list).
     */
    search?: string;
    ownerId?: string;
    format?: string;
    /**
     * Cursor-based pagination. The cursor is the
     * `{ plannedPublishAt, id }` of the last item from the previous
     * page. The next page returns rows whose
     * `(plannedPublishAt, id)` tuple is strictly greater, so the
     * ordering is stable even when many items share the same
     * publish date.
     */
    cursor?: { plannedPublishAt: Date; id: string };
    /**
     * Offset-based pagination. Mutually exclusive with `cursor` —
     * if both are provided, the cursor wins (it's the more
     * efficient path for large datasets). Use this when the UI
     * needs page-based navigation (e.g. "page 3 of 12").
     */
    offset?: number;
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
  if (opts.ownerId) conditions.push(eq(contentItems.contentOwnerId, opts.ownerId));
  if (opts.format) {
    // Cast at the SQL boundary — the page has already validated the
    // string against the ContentFormat enum before passing it in.
    conditions.push(eq(contentItems.format, opts.format as never));
  }
  if (opts.cursor) {
    // Compound keyset condition: same plannedPublishAt but a later
    // id, or a strictly later plannedPublishAt. Keeps the page
    // boundary stable when two items share a publish date.
    const c = opts.cursor;
    conditions.push(
      sql`(${contentItems.plannedPublishAt} > ${c.plannedPublishAt}) OR (${contentItems.plannedPublishAt} = ${c.plannedPublishAt} AND ${contentItems.id} > ${c.id})`,
    );
  }
  if (opts.search) {
    const needle = `%${opts.search.toLowerCase()}%`;
    // ilike is case-insensitive in Postgres; lower(title) keeps the
    // path index-friendly for short queries.
    conditions.push(
      sql`(lower(${contentItems.title}) LIKE ${needle} OR lower(${contentItems.brief}) LIKE ${needle})`,
    );
  }

  // Offset path. We apply it AFTER the cursor is resolved (they're
  // mutually exclusive; the cursor path is the historical one and
  // the offset path is the new page-based one). An offset past the
  // dataset returns an empty array.
  const offset = opts.offset && opts.offset > 0 ? opts.offset : 0;
  return db
    .select()
    .from(contentItems)
    .where(and(...conditions))
    .orderBy(sql`${contentItems.plannedPublishAt} ASC`, sql`${contentItems.id} ASC`)
    .limit(opts.limit ?? 200)
    .offset(offset);
}

/**
 * Count workspace content items matching the same filter set as
 * `listWorkspaceContent` (minus pagination, which is irrelevant for a
 * count). Used by the planning list to render the "Showing X–Y of Z"
 * total and to compute the total page count for the pagination
 * control. Two queries (rows + count) is the standard pagination
 * pattern; both are indexed on `workspaceId` + `plannedPublishAt`
 * via the existing content_item indexes, so the cost is one extra
 * fast scan per page load.
 */
export async function countWorkspaceContent(
  actor: Actor,
  workspaceId: string,
  opts: {
    monthStart?: Date;
    monthEnd?: Date;
    status?: string;
    search?: string;
    ownerId?: string;
    format?: string;
  } = {},
): Promise<number> {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, [...INTERNAL_WORKSPACE_ROLES]),
    "count_content",
  );
  const conditions = [eq(contentItems.workspaceId, workspaceId), isNull(contentItems.archivedAt)];
  if (opts.monthStart) conditions.push(sql`${contentItems.plannedPublishAt} >= ${opts.monthStart}`);
  if (opts.monthEnd) conditions.push(sql`${contentItems.plannedPublishAt} < ${opts.monthEnd}`);
  if (opts.status) conditions.push(sql`${contentItems.status} = ${opts.status}`);
  if (opts.ownerId) conditions.push(eq(contentItems.contentOwnerId, opts.ownerId));
  if (opts.format) {
    conditions.push(eq(contentItems.format, opts.format as never));
  }
  if (opts.search) {
    const needle = `%${opts.search.toLowerCase()}%`;
    conditions.push(
      sql`(lower(${contentItems.title}) LIKE ${needle} OR lower(${contentItems.brief}) LIKE ${needle})`,
    );
  }
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentItems)
    .where(and(...conditions));
  return row?.count ?? 0;
}

/**
 * FEAT-12 (GAP-FULL-REVIEW-2026-08-25) — the "Unassigned Design Queue"
 * page (§3 Stitch frame, master prompt §14 `listUnassignedDesignWork`).
 *
 * Returns content items that:
 *   1. live in the given workspace,
 *   2. are NOT archived,
 *   3. are in `approved_for_design` (the §10 state where a designer
 *      may claim them), and
 *   4. have no `designer_id` set.
 *
 * Ordered by `planned_publish_at` ascending so the items the team is
 * about to ship float to the top. The `status` / `limit` / `cursor`
 * options are parity with `listWorkspaceContent` so the page can page
 * through a large backlog without rewriting the listing code.
 *
 * The role gate is the same `INTERNAL_WORKSPACE_ROLES` set the planning
 * list uses — a client reviewer must never see this surface (their
 * counterpart is the `client/...` portal).
 */
export interface ListUnassignedDesignWorkOptions {
  status?: string;
  limit?: number;
  cursor?: { plannedPublishAt: Date; id: string };
}

export async function listUnassignedDesignWork(
  actor: Actor,
  workspaceId: string,
  opts: ListUnassignedDesignWorkOptions = {},
) {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, [...INTERNAL_WORKSPACE_ROLES]),
    "list_unassigned_design_work",
  );

  const conditions = [
    eq(contentItems.workspaceId, workspaceId),
    isNull(contentItems.archivedAt),
    isNull(contentItems.designerId),
    // `status` is a pg enum; the page has already validated the
    // string against the allowed values before passing it in.
    eq(contentItems.status, (opts.status ?? "approved_for_design") as never),
  ];
  if (opts.cursor) {
    const c = opts.cursor;
    conditions.push(
      sql`(${contentItems.plannedPublishAt} > ${c.plannedPublishAt}) OR (${contentItems.plannedPublishAt} = ${c.plannedPublishAt} AND ${contentItems.id} > ${c.id})`,
    );
  }

  return db
    .select()
    .from(contentItems)
    .where(and(...conditions))
    .orderBy(sql`${contentItems.plannedPublishAt} ASC`, sql`${contentItems.id} ASC`)
    .limit(opts.limit ?? 200);
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
    revalidatePath(`/app/w/`);
    return { archivedIds, skippedIds: contentItemIds.filter((id) => !archivedSet.has(id)) };
  });
}

// ─── Designer roster (FEAT-FULL-REVIEW-2026-08-26) ─────────────────────
//
// `assignDesigner` (the §14 manager-driven path) needs to know which
// designers exist in a workspace so the picker can offer real
// candidates. We pull active memberships with the `designer` role
// and join `users` for the human label.
//
// The same query is reusable from the publish / design-queue pages
// if they ever need a "task owner" picker. Returns `displayName`
// when set, otherwise `name`, otherwise a short id slice — same
// precedence the planning list owner dropdown uses
// (`src/app/(app)/app/w/[slug]/planning/page.tsx`).

import { users, workspaceMemberships as wsMemberships } from "@/lib/db/schema";

export async function listWorkspaceDesigners(
  actor: Actor,
  workspaceId: string,
): Promise<{ id: string; label: string }[]> {
  await requirePolicy(
    hasWorkspaceRole(actor, workspaceId, [...INTERNAL_WORKSPACE_ROLES]),
    "list_designers",
  );
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      name: users.name,
    })
    .from(workspaceMembershipRoles)
    .innerJoin(wsMemberships, eq(wsMemberships.id, workspaceMembershipRoles.workspaceMembershipId))
    .innerJoin(users, eq(users.id, wsMemberships.userId))
    .where(
      and(
        eq(wsMemberships.workspaceId, workspaceId),
        eq(wsMemberships.status, "active"),
        eq(workspaceMembershipRoles.role, "designer"),
      ),
    )
    .orderBy(asc(users.displayName), asc(users.name));
  return rows.map((r) => ({
    id: r.id,
    label: r.displayName ?? r.name ?? r.id.slice(0, 8),
  }));
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
  revalidatePath(`/app/w/`);
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
    hasWorkspaceRole(actor, item.workspaceId, ["workspace_manager", "content_planner"]),
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
      summary: `Assigned designer ${parsed.data.designerId} to "${item.title}"`,
      beforeData: { designerId: previousDesigner },
      afterData: { designerId: parsed.data.designerId },
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
  revalidatePath(`/app/w/`);
}

/**
 * Planner releases a designer's hold on an item. Sets designer_id to
 * null and rolls the item back to `approved_for_design` so it shows
 * up in the unassigned queue. workspace_manager / content_planner.
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
    hasWorkspaceRole(actor, item.workspaceId, ["workspace_manager", "content_planner"]),
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
      summary: `Released designer hold on "${item.title}"`,
      beforeData: { designerId: releasedDesigner, status: item.status },
      afterData: { designerId: null },
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
  revalidatePath(`/app/w/`);
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
    })
    .from(contentItems)
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
    });
  });
  revalidatePath(`/app/w/`);
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
