"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { db } from "@/lib/db";
import { contentItems } from "@/lib/db/schema";
import {
  QuickCreateSchema,
  UpdateContentSchema,
  assignDesigner,
  AssignDesignerSchema,
  quickCreateContentItem,
  transitionContent,
  claimAsDesigner,
  updateContentItem,
  updateFormatPayload,
  patchAudienceCopy,
  updateAudienceCopy,
  UpdateAudienceCopySchema,
  type WorkflowAction,
  type UpdateContentInput,
  batchCreateContentItems,
  mergeAiDraftIntoBrief,
} from "@/lib/content/service";
import {
  BatchClientRowSchema,
  BatchCreateSchema,
  parseBatchDateTime,
  parseBatchRows,
  validateBatchRow,
} from "@/lib/content/batch";
import {
  SubmitDeliverySchema,
  submitDelivery,
  DecideApprovalSchema,
  decideApproval,
} from "@/lib/deliveries/service";
import { RecordPublicationSchema, recordPublication } from "@/lib/publishing/service";
import {
  createComment,
  CreateCommentSchema,
  resolveComment,
  ResolveCommentSchema,
} from "@/lib/discussions/service";
import { actionFailure, fieldErrorsFromZod, type ActionState } from "@/lib/validation/action-state";

/**
 * Per-action field maps (plan §4 — "Per-action field map").
 *
 * Each field name is the *form* field name (what the form
 * reads off `formData.get(name)`), not the Zod schema key
 * (which may use camelCase for objects like `plannedPublishAt`).
 * The two usually match for these actions, but the form name
 * is the source of truth because the form's `<FormField id>`
 * is what the user sees + clicks on the form-summary card.
 */
type QuickCreateFields = "title" | "format" | "plannedPublishAt" | "brief" | "channelIds";
type UpdateContentFields = QuickCreateFields;
type BatchCreateFields = "rows";
type TransitionFields = "action" | "reason";
type AssignDesignerFields = "designerId";
type ApplyAiDraftFields = "draftText" | "mode";
type SubmitDeliveryFields = "description" | "designerNote" | "linkLabel" | "linkUrl";
type DecideApprovalFields = "decision" | "feedback";
type RecordPublicationFields =
  "contentItemChannelId" | "status" | "publishedUrl" | "note" | "failureReason";
type CreateCommentFields = "contentItemId" | "body" | "visibility" | "label";
type UpdateFormatPayloadFields = "contentItemId" | "format" | "formatPayload";
type UpdateAudienceCopyFields = "contentItemId" | "format" | "formatPayload";
type ResolveCommentFields = "commentId" | "resolved";

async function requireWorkspaceContext(workspaceSlug: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  const actor = { id: session.user.id };
  const agencyContext = await resolveActiveAgencyContext({ actor });
  if (!agencyContext) throw new Error("Agency not configured");
  const workspace = await getAccessibleWorkspace(actor, workspaceSlug, agencyContext.agencyId);
  if (!workspace) throw new Error("Workspace not found");
  return { actor, workspace };
}

// ─── Quick create ─────────────────────────────────────────────────────
export async function quickCreateAction(
  workspaceSlug: string,
  _prev: unknown,
  formData: FormData,
): Promise<ActionState<QuickCreateFields>> {
  const { actor, workspace } = await requireWorkspaceContext(workspaceSlug);
  const channelIdsRaw = formData.getAll("channelIds").map(String);
  const parsed = QuickCreateSchema.safeParse({
    workspaceId: workspace.id,
    title: formData.get("title"),
    format: formData.get("format"),
    brief: formData.get("brief") ?? undefined,
    plannedPublishAt: formData.get("plannedPublishAt"),
    channelIds: channelIdsRaw.length > 0 ? channelIdsRaw : undefined,
  });
  if (!parsed.success) {
    return fieldErrorsFromZod<QuickCreateFields>(parsed.error);
  }
  let id: string;
  try {
    id = await quickCreateContentItem(actor, parsed.data);
  } catch (error) {
    return actionFailure<QuickCreateFields>(error, "The idea could not be created.");
  }
  revalidatePath(`/app/w/${workspaceSlug}/planning`);
  redirect(`/app/w/${workspaceSlug}/planning/${id}`);
}

// ─── Update content item ──────────────────────────────────────────────
export async function updateContentItemAction(
  workspaceSlug: string,
  contentItemId: string,
  _prev: unknown,
  formData: FormData,
): Promise<ActionState<UpdateContentFields>> {
  const { actor } = await requireWorkspaceContext(workspaceSlug);
  const channelIdsRaw = formData.getAll("channelIds").map(String);
  const parsed = UpdateContentSchema.safeParse({
    title: formData.get("title"),
    format: formData.get("format"),
    brief: formData.get("brief") ?? "",
    plannedPublishAt: formData.get("plannedPublishAt"),
    channelIds: channelIdsRaw,
  });
  if (!parsed.success) {
    return fieldErrorsFromZod<UpdateContentFields>(parsed.error);
  }
  try {
    await updateContentItem(actor, {
      contentItemId,
      title: parsed.data.title,
      format: parsed.data.format,
      brief: parsed.data.brief ?? "",
      plannedPublishAt: parsed.data.plannedPublishAt,
      channelIds: parsed.data.channelIds,
    });
  } catch (error) {
    return actionFailure<UpdateContentFields>(error, "The idea could not be saved.");
  }
  revalidatePath(`/app/w/${workspaceSlug}/planning`);
  revalidatePath(`/app/w/${workspaceSlug}/planning/${contentItemId}`);
  redirect(`/app/w/${workspaceSlug}/planning/${contentItemId}`);
}

// ─── Apply AI draft ───────────────────────────────────────────────────
const ApplyAiDraftSchema = z.object({
  contentItemId: z.string().uuid(),
  draftText: z.string().min(1).max(4000),
  mode: z.enum(["insert", "replace"]),
});

/**
 * Apply an AI-generated draft to a content item's brief (§15: the human
 * stays in control — Insert appends, Replace overwrites). Reuses the
 * `updateContentItem` service so the editability guard and the
 * `content_updated` activity event fire once, identically to the manual
 * edit form. Returns the new brief text on success; an error object on
 * failure (e.g. the item is past `draft | changes_requested`).
 */
export async function applyAiDraftAction(input: {
  workspaceSlug: string;
  contentItemId: string;
  draftText: string;
  mode: "insert" | "replace";
}): Promise<ActionState<ApplyAiDraftFields> & { brief?: string }> {
  const parsed = ApplyAiDraftSchema.safeParse({
    contentItemId: input.contentItemId,
    draftText: input.draftText,
    mode: input.mode,
  });
  if (!parsed.success) {
    return fieldErrorsFromZod<ApplyAiDraftFields>(parsed.error);
  }
  const { actor } = await requireWorkspaceContext(input.workspaceSlug);
  const [item] = await db
    .select({
      id: contentItems.id,
      title: contentItems.title,
      format: contentItems.format,
      brief: contentItems.brief,
      plannedPublishAt: contentItems.plannedPublishAt,
    })
    .from(contentItems)
    .where(eq(contentItems.id, parsed.data.contentItemId))
    .limit(1);
  if (!item) return { error: "Content item not found" };
  const newBrief = mergeAiDraftIntoBrief(item.brief ?? "", parsed.data.draftText, parsed.data.mode);
  try {
    await updateContentItem(actor, {
      contentItemId: item.id,
      title: item.title,
      format: item.format as UpdateContentInput["format"],
      brief: newBrief,
      plannedPublishAt: item.plannedPublishAt,
      channelIds: undefined,
    });
  } catch (error) {
    return actionFailure<ApplyAiDraftFields>(error, "The AI draft could not be applied.");
  }
  revalidatePath(`/app/w/${input.workspaceSlug}/planning/${input.contentItemId}`);
  return { ok: true, brief: newBrief };
}

// ─── Batch create ─────────────────────────────────────────────────────
export async function batchCreateAction(
  workspaceSlug: string,
  _prev: unknown,
  formData: FormData,
): Promise<ActionState<BatchCreateFields>> {
  const { actor, workspace } = await requireWorkspaceContext(workspaceSlug);
  const rawRows = String(formData.get("rows") ?? "");
  let items: Array<{
    title: string;
    format: string;
    brief: string;
    plannedPublishAt: Date;
    channelIds?: string[];
    extensions?: Record<string, unknown>;
  }>;

  if (rawRows.trim().startsWith("[")) {
    let decoded: unknown;
    try {
      decoded = JSON.parse(rawRows);
    } catch {
      return {
        error: "The imported rows are not valid JSON.",
        fieldErrors: { rows: "Invalid rows" },
      };
    }
    const clientRows = z.array(BatchClientRowSchema).safeParse(decoded);
    if (!clientRows.success) {
      return {
        error: "The imported rows are incomplete. Review the highlighted rows and try again.",
        fieldErrors: { rows: "Invalid rows" },
      };
    }
    const invalidRows: number[] = [];
    items = clientRows.data.map((row, index) => {
      const issues = validateBatchRow({
        title: row.title,
        format: row.format,
        plannedPublishAt: row.plannedPublishAt,
        brief: row.brief,
        timeZone: workspace.timezone,
        ...(row.extensions ? { extensions: row.extensions } : {}),
      });
      const plannedPublishAt = parseBatchDateTime(row.plannedPublishAt, workspace.timezone);
      if (issues.some((issue) => issue.severity === "error") || !plannedPublishAt)
        invalidRows.push(index + 1);
      return {
        title: row.title,
        format: row.format,
        brief: row.brief,
        plannedPublishAt: plannedPublishAt ?? new Date(NaN),
        channelIds: row.channelIds,
        ...(row.extensions ? { extensions: row.extensions } : {}),
      };
    });
    if (invalidRows.length > 0) {
      const message = `Rows ${invalidRows.join(", ")}: fix the highlighted errors before saving.`;
      return { error: message, fieldErrors: { rows: message } };
    }
  } else {
    const rows = parseBatchRows(rawRows);
    const invalidRows = rows.filter((row) =>
      validateBatchRow({ ...row, timeZone: workspace.timezone }).some(
        (issue) => issue.severity === "error",
      ),
    );
    if (invalidRows.length > 0) {
      const message = `Rows ${invalidRows.map((row) => row.lineNumber).join(", ")}: fix the highlighted errors before saving.`;
      return { error: message, fieldErrors: { rows: message } };
    }
    items = rows.map((row) => ({
      title: row.title,
      format: row.format,
      brief: row.brief,
      plannedPublishAt:
        parseBatchDateTime(row.plannedPublishAt, workspace.timezone) ?? new Date(NaN),
      ...(Object.keys(row.extensions).length > 0 ? { extensions: row.extensions } : {}),
    }));
  }

  const parsed = BatchCreateSchema.safeParse({ workspaceId: workspace.id, items });
  if (!parsed.success) {
    return {
      error: "Review the batch rows and fix the highlighted errors.",
      fieldErrors: { rows: parsed.error.issues[0]?.message ?? "Invalid rows" },
    };
  }
  try {
    await batchCreateContentItems(actor, {
      ...parsed.data,
      items: parsed.data.items,
    });
  } catch (error) {
    return actionFailure<BatchCreateFields>(error, "The batch could not be saved.");
  }
  revalidatePath(`/app/w/${workspaceSlug}/planning`);
  redirect(`/app/w/${workspaceSlug}/planning?batchCreated=${parsed.data.items.length}`);
}

// ─── Workflow transition ──────────────────────────────────────────────
export async function transitionAction(input: {
  workspaceSlug: string;
  contentItemId: string;
  action: WorkflowAction;
  reason?: string;
  returnTarget?: string;
}): Promise<ActionState<TransitionFields> & { from?: string; to?: string }> {
  const { actor } = await requireWorkspaceContext(input.workspaceSlug);
  if (!input.action) {
    return {
      error: "Missing action",
      fieldErrors: { action: "Choose an action" },
    };
  }
  try {
    const result = await transitionContent(actor, {
      contentItemId: input.contentItemId,
      action: input.action,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.returnTarget ? { returnTarget: input.returnTarget } : {}),
    });
    return { ok: true, from: result?.from, to: result?.to };
  } catch (error) {
    // Return the error as a value rather than re-throwing. Next.js 16
    // encodes thrown server-action errors as a hashed digest in the RSC
    // response (content-type: text/x-component, `1:E{"digest":"…"}`),
    // dropping the original message — the client then surfaces a generic
    // minified React error instead of the action's real text. Returning
    // a value keeps the message in the RSC payload. Matches the
    // pattern already used by `applyAiDraftAction`, `submitDeliveryAction`,
    // and `decideApprovalAction` in this file.
    return actionFailure<TransitionFields>(error, "The workflow action failed.");
  }
}

// ─── Designer claim ───────────────────────────────────────────────────
export async function claimAction(input: {
  workspaceSlug: string;
  contentItemId: string;
}): Promise<ActionState> {
  const { actor } = await requireWorkspaceContext(input.workspaceSlug);
  try {
    await claimAsDesigner(actor, input.contentItemId);
  } catch (error) {
    return actionFailure(error, "The claim action failed.");
  }
  revalidatePath(`/app/w/${input.workspaceSlug}/planning/${input.contentItemId}`);
  return { ok: true };
}

// ─── Assign designer ──────────────────────────────────────────────────
/**
 * FEAT-FULL-REVIEW-2026-08-26 — manager assigns a specific designer to
 * an item in `approved_for_design`, then transitions the item to
 * `in_design`. The two calls are sequenced in a single round-trip so
 * the UI can show one "Assign designer" affordance and the user sees a
 * single end-state.
 *
 * We don't compose them in a single DB transaction: the workflow state
 * machine treats designer assignment as an idempotent side effect and
 * the status transition as an event-sourced state change. A rollback
 * in the middle would leave the user with no clear retry path.
 * Sequencing and surfacing the second action's error keeps the
 * designer assignment in place even if the transition fails — the
 * planner can re-click the "Move to design" button without losing the
 * pick.
 */
const AssignDesignerActionSchema = AssignDesignerSchema;

export async function assignDesignerAction(input: {
  workspaceSlug: string;
  contentItemId: string;
  designerId: string;
}): Promise<ActionState<AssignDesignerFields>> {
  const parsed = AssignDesignerActionSchema.safeParse({
    contentItemId: input.contentItemId,
    designerId: input.designerId,
  });
  if (!parsed.success) {
    return fieldErrorsFromZod<AssignDesignerFields>(parsed.error);
  }
  const { actor } = await requireWorkspaceContext(input.workspaceSlug);
  const [item] = await db
    .select({ status: contentItems.status })
    .from(contentItems)
    .where(eq(contentItems.id, parsed.data.contentItemId))
    .limit(1);
  if (!item || !["approved_for_design", "in_design"].includes(item.status)) {
    return actionFailure<AssignDesignerFields>(
      new Error("The item is no longer ready for designer assignment."),
      "The assign action failed.",
    );
  }
  try {
    await assignDesigner(actor, parsed.data);
  } catch (error) {
    return actionFailure<AssignDesignerFields>(error, "The assign action failed.");
  }
  // A manager can assign before design starts or reassign while the
  // item is already in design. Only the former needs the workflow
  // transition; attempting it for an in-design item would reject a
  // valid reassignment because the state machine has already moved.
  if (item.status === "approved_for_design") {
    try {
      await transitionContent(actor, {
        contentItemId: parsed.data.contentItemId,
        action: "assign_designer",
      });
    } catch (error) {
      return actionFailure<AssignDesignerFields>(error, "The assign action failed.");
    }
  }
  revalidatePath(`/app/w/${input.workspaceSlug}/planning/${input.contentItemId}`);
  return { ok: true };
}

// ─── Submit delivery ──────────────────────────────────────────────────
export async function submitDeliveryAction(
  workspaceSlug: string,
  contentItemId: string,
  _prev: unknown,
  formData: FormData,
): Promise<ActionState<SubmitDeliveryFields>> {
  const { actor } = await requireWorkspaceContext(workspaceSlug);
  // Parse links: each pair of label + url fields
  const labels = formData.getAll("linkLabel").map((v) => String(v));
  const urls = formData.getAll("linkUrl").map((v) => String(v));
  const providers = formData.getAll("linkProvider").map((v) => String(v));
  const previews = formData.getAll("linkPreview").map((v) => String(v));
  const links = labels
    .map((label, i: number) => ({
      provider: (providers[i] ?? "other") as
        "google_drive" | "dropbox" | "onedrive" | "frame_io" | "figma" | "canva" | "other",
      label,
      url: urls[i] ?? "",
      isPreview: previews[i] === "on",
    }))
    .filter((l) => l.label && l.url);

  const parsed = SubmitDeliverySchema.safeParse({
    contentItemId,
    description: formData.get("description"),
    designerNote: formData.get("designerNote") ?? undefined,
    links,
  });
  if (!parsed.success) {
    return fieldErrorsFromZod<SubmitDeliveryFields>(parsed.error);
  }
  try {
    const result = await submitDelivery(actor, parsed.data);
    if (result && typeof result === "object" && "error" in result && result.error) {
      return { error: String(result.error) };
    }
  } catch (error) {
    return actionFailure<SubmitDeliveryFields>(error, "The delivery could not be submitted.");
  }
  revalidatePath(`/app/w/${workspaceSlug}/planning/${contentItemId}`);
  return { ok: true };
}

// ─── Decide approval ──────────────────────────────────────────────────
export async function decideApprovalAction(input: {
  workspaceSlug: string;
  approvalRequestId: string;
  decision: "approved" | "changes_requested";
  feedback?: string;
}): Promise<ActionState<DecideApprovalFields>> {
  const { actor } = await requireWorkspaceContext(input.workspaceSlug);
  const parsed = DecideApprovalSchema.safeParse({
    approvalRequestId: input.approvalRequestId,
    decision: input.decision,
    ...(input.feedback ? { feedback: input.feedback } : {}),
  });
  if (!parsed.success) {
    return fieldErrorsFromZod<DecideApprovalFields>(parsed.error);
  }
  try {
    await decideApproval(actor, parsed.data);
  } catch (error) {
    return actionFailure<DecideApprovalFields>(error, "The approval action failed.");
  }
  revalidatePath(`/app/w/${input.workspaceSlug}/planning`);
  // Publication outcomes change the workflow status rendered by the
  // planning detail page as well as the list. Revalidate the dynamic
  // detail route so a publisher's next visit cannot see a stale
  // ready-to-publish snapshot.
  revalidatePath(`/app/w/${input.workspaceSlug}/planning/[id]`, "page");
  return { ok: true };
}

// ─── Record publication ───────────────────────────────────────────────
export async function recordPublicationAction(input: {
  workspaceSlug: string;
  contentItemChannelId: string;
  status: "published" | "skipped" | "failed";
  publishedUrl?: string;
  note?: string;
  failureReason?: string;
}): Promise<ActionState<RecordPublicationFields>> {
  const { actor } = await requireWorkspaceContext(input.workspaceSlug);
  const parsed = RecordPublicationSchema.safeParse({
    contentItemChannelId: input.contentItemChannelId,
    status: input.status,
    ...(input.publishedUrl ? { publishedUrl: input.publishedUrl } : {}),
    ...(input.note ? { note: input.note } : {}),
    ...(input.failureReason ? { failureReason: input.failureReason } : {}),
  });
  if (!parsed.success) {
    return fieldErrorsFromZod<RecordPublicationFields>(parsed.error);
  }
  try {
    await recordPublication(actor, parsed.data);
  } catch (error) {
    return actionFailure<RecordPublicationFields>(error, "The publication action failed.");
  }
  revalidatePath(`/app/w/${input.workspaceSlug}/planning`);
  return { ok: true };
}

// ─── Discussion actions (Goal 8) ─────────────────────────────────────
export async function createCommentAction(
  workspaceSlug: string,
  _prev: unknown,
  formData: FormData,
): Promise<ActionState<CreateCommentFields> & { mentionedUserIds?: string[] }> {
  const { actor, workspace } = await requireWorkspaceContext(workspaceSlug);
  const parsed = CreateCommentSchema.safeParse({
    contentItemId: formData.get("contentItemId"),
    parentCommentId: formData.get("parentCommentId") || undefined,
    body: formData.get("body"),
    visibility: formData.get("visibility") ?? "internal",
    label: formData.get("label") ?? "general",
  });
  if (!parsed.success) {
    return fieldErrorsFromZod<CreateCommentFields>(parsed.error);
  }
  // The new <CommentComposer> posts a structured mention list
  // alongside the body (the picker tracks user ids, not just
  // `@displayName` tokens). The discussion service still
  // falls back to the body regex for clients that don't
  // post the structured list (e.g. legacy single-input
  // forms), so omitting the list is a no-op. The server uses
  // the *union* of the structured list and the regex list so
  // we never lose a mention that the user picked via the
  // picker, even if the user's display name was edited out
  // of the body by the time they hit Post.
  let structuredMentionIds: string[] = [];
  const raw = formData.get("mentionedUserIds");
  if (typeof raw === "string" && raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        structuredMentionIds = parsed.filter(
          (v): v is string => typeof v === "string" && v.length > 0,
        );
      }
    } catch {
      // ignore — service will fall back to body regex
    }
  }
  await createComment(actor, parsed.data, structuredMentionIds);
  revalidatePath(`/app/w/${workspaceSlug}/planning/${formData.get("contentItemId")}`);
  void workspace;
  return { ok: true, mentionedUserIds: structuredMentionIds };
}

export async function resolveCommentAction(input: {
  workspaceSlug: string;
  commentId: string;
  resolved: boolean;
}): Promise<ActionState<ResolveCommentFields>> {
  const { actor } = await requireWorkspaceContext(input.workspaceSlug);
  const parsed = ResolveCommentSchema.safeParse({
    commentId: input.commentId,
    resolved: input.resolved,
  });
  if (!parsed.success) {
    return fieldErrorsFromZod<ResolveCommentFields>(parsed.error);
  }
  await resolveComment(actor, parsed.data);
  revalidatePath(`/app/w/${input.workspaceSlug}/planning/`);
  return { ok: true };
}

/**
 * Update only the `formatPayload` (jsonb) of a content item.
 *
 * Used by the "More details" editor on the content detail page.
 * The full `updateContentItemAction` also writes the brief /
 * title / format / schedule; this action touches only the
 * structured creative contract, so the editor can save per-field
 * changes without forcing the planner to round-trip the full
 * edit form. The server-side validation re-applies the per-format
 * Zod schema (see `lib/format-payload/schemas.ts`); unknown
 * fields are silently dropped on parse, malformed input throws
 * an error that the editor surfaces inline.
 *
 * The FormData shape is a single `formatPayload` field carrying
 * the JSON-serialised object. The client encodes the editor's
 * in-memory state on submit; the server re-parses, re-validates,
 * and writes the canonical shape.
 */
const UpdateFormatPayloadFormSchema = z.object({
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
  ]),
  formatPayload: z.string().min(2).max(200_000),
});

export async function updateFormatPayloadAction(
  workspaceSlug: string,
  _prev: unknown,
  formData: FormData,
): Promise<ActionState<UpdateFormatPayloadFields>> {
  const { actor } = await requireWorkspaceContext(workspaceSlug);
  const rawPayload = String(formData.get("formatPayload") ?? "{}");
  let formatPayload: unknown;
  try {
    formatPayload = JSON.parse(rawPayload);
  } catch {
    return {
      error: "Invalid formatPayload JSON",
      fieldErrors: { formatPayload: "The format payload is not valid JSON." },
    };
  }
  const parsed = UpdateFormatPayloadFormSchema.safeParse({
    contentItemId: formData.get("contentItemId"),
    format: formData.get("format"),
    formatPayload: rawPayload,
  });
  if (!parsed.success) {
    return fieldErrorsFromZod<UpdateFormatPayloadFields>(parsed.error);
  }
  try {
    await updateFormatPayload(actor, {
      contentItemId: parsed.data.contentItemId,
      format: parsed.data.format,
      formatPayload: formatPayload as Record<string, unknown>,
    });
  } catch (e) {
    return actionFailure<UpdateFormatPayloadFields>(e, "The format payload could not be saved.");
  }
  revalidatePath(`/app/w/${workspaceSlug}/planning/${parsed.data.contentItemId}`);
  return { ok: true };
}

// ─── Canonical audience copy (material) ───────────────────────────────
export async function updateAudienceCopyAction(
  workspaceSlug: string,
  _prev: unknown,
  formData: FormData,
): Promise<ActionState<UpdateAudienceCopyFields>> {
  const { actor } = await requireWorkspaceContext(workspaceSlug);
  let formatPayload: unknown;
  try {
    formatPayload = JSON.parse(String(formData.get("formatPayload") ?? "{}"));
  } catch {
    return actionFailure<UpdateAudienceCopyFields>(
      new Error("Invalid copy payload."),
      "The copy could not be saved.",
    );
  }
  const parsed = UpdateAudienceCopySchema.safeParse({
    contentItemId: formData.get("contentItemId"),
    format: formData.get("format"),
    formatPayload,
  });
  if (!parsed.success) return fieldErrorsFromZod<UpdateAudienceCopyFields>(parsed.error);
  try {
    await updateAudienceCopy(actor, parsed.data);
  } catch (e) {
    return actionFailure<UpdateAudienceCopyFields>(e, "The copy could not be saved.");
  }
  revalidatePath(`/app/w/${workspaceSlug}/planning/${parsed.data.contentItemId}`);
  return { ok: true };
}

// ─── Legacy patch alias (material under the hood) ─────────────────────
/**
 * Compatibility path for older callers. It accepts a partial patch of
 * `caption` / `hashtags` / `firstComment`, leaves strategy / creative /
 * structure fields untouched, and now routes through the same material
 * audience-copy service as the canonical Copy tab.
 *
 * Role-gated to planner / manager via the service. Designer,
 * publisher, and client reviewer fall back to the read-only surface.
 *
 * Form shape (FormData):
 *   - contentItemId (uuid)
 *   - caption (optional, string)
 *   - firstComment (optional, string)
 *   - hashtags (optional, repeated — one per tag)
 */
const PatchAudienceCopyFormSchema = z.object({
  contentItemId: z.string().uuid(),
  caption: z.string().max(2200).optional(),
  firstComment: z.string().max(2200).optional(),
});

type PatchAudienceCopyFields = "contentItemId" | "caption" | "hashtags" | "firstComment";

export async function patchAudienceCopyAction(
  workspaceSlug: string,
  _prev: unknown,
  formData: FormData,
): Promise<ActionState<PatchAudienceCopyFields>> {
  const { actor } = await requireWorkspaceContext(workspaceSlug);
  const parsed = PatchAudienceCopyFormSchema.safeParse({
    contentItemId: formData.get("contentItemId"),
    caption: formData.get("caption") ?? undefined,
    firstComment: formData.get("firstComment") ?? undefined,
  });
  if (!parsed.success) {
    return fieldErrorsFromZod<PatchAudienceCopyFields>(parsed.error);
  }
  const hashtagsRaw = formData.getAll("hashtags").map((v) => String(v));
  // Normalise: drop empties, trim whitespace.
  const hashtags =
    hashtagsRaw.length > 0
      ? hashtagsRaw.map((h) => h.trim()).filter((h) => h.length > 0)
      : undefined;
  const patch: {
    contentItemId: string;
    caption?: string;
    hashtags?: string[];
    firstComment?: string;
  } = { contentItemId: parsed.data.contentItemId };
  if (parsed.data.caption !== undefined) patch.caption = parsed.data.caption;
  if (hashtags !== undefined) patch.hashtags = hashtags;
  if (parsed.data.firstComment !== undefined) patch.firstComment = parsed.data.firstComment;
  try {
    await patchAudienceCopy(actor, patch);
  } catch (e) {
    return actionFailure<PatchAudienceCopyFields>(e, "The copy could not be saved.");
  }
  revalidatePath(`/app/w/${workspaceSlug}/planning/${parsed.data.contentItemId}`);
  return { ok: true };
}
