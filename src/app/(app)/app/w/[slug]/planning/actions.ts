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
  type WorkflowAction,
  type UpdateContentInput,
  batchCreateContentItems,
  mergeAiDraftIntoBrief,
} from "@/lib/content/service";
import { BatchCreateSchema, parseBatchRows } from "@/lib/content/batch";
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

export async function quickCreateAction(workspaceSlug: string, _prev: unknown, formData: FormData) {
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
    return {
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  const id = await quickCreateContentItem(actor, parsed.data);
  revalidatePath(`/app/w/${workspaceSlug}/planning`);
  redirect(`/app/w/${workspaceSlug}/planning/${id}`);
}

export async function updateContentItemAction(
  workspaceSlug: string,
  contentItemId: string,
  _prev: unknown,
  formData: FormData,
) {
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
    return {
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
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
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath(`/app/w/${workspaceSlug}/planning`);
  revalidatePath(`/app/w/${workspaceSlug}/planning/${contentItemId}`);
  redirect(`/app/w/${workspaceSlug}/planning/${contentItemId}`);
}

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
 * edit form. Returns the new brief text on success; an error string on
 * failure (e.g. the item is past `draft | changes_requested`).
 */
export async function applyAiDraftAction(input: {
  workspaceSlug: string;
  contentItemId: string;
  draftText: string;
  mode: "insert" | "replace";
}): Promise<{ error?: string; brief?: string }> {
  const parsed = ApplyAiDraftSchema.safeParse({
    contentItemId: input.contentItemId,
    draftText: input.draftText,
    mode: input.mode,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
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
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath(`/app/w/${input.workspaceSlug}/planning/${input.contentItemId}`);
  return { brief: newBrief };
}

export async function batchCreateAction(workspaceSlug: string, _prev: unknown, formData: FormData) {
  const { actor, workspace } = await requireWorkspaceContext(workspaceSlug);
  const rawRows = String(formData.get("rows") ?? "");
  const rows = parseBatchRows(rawRows);
  // Surface parse-time errors (over-length caption, unknown
  // format, etc.) before the server tries to write the batch.
  const bad = rows.filter((r) => "parseError" in r);
  if (bad.length > 0) {
    return {
      error: `Row ${bad.map((b) => b.lineNumber).join(", ")}: ${bad
        .map((b) => ("parseError" in b ? b.parseError : ""))
        .join("; ")}`,
    };
  }
  const parsed = BatchCreateSchema.safeParse({
    workspaceId: workspace.id,
    items: rows.map((r) => ({
      title: r.title,
      format: r.format as
        | "static_post"
        | "carousel"
        | "story"
        | "short_form_video"
        | "long_form_video"
        | "live_content"
        | "article"
        | "other",
      brief: r.brief,
      plannedPublishAt: r.plannedPublishAt,
    })),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  // The base `BatchCreateInput` doesn't carry per-row
  // extensions (caption / hashtags / location). We pass them
  // to the service as a side-channel; rows without
  // extensions just contribute `undefined`. The service
  // builds the `formatPayload` for each row from the
  // extensions.
  const itemsWithExtensions = parsed.data.items.map((item, idx) => {
    const ext = rows[idx]?.extensions ?? {};
    return { ...item, extensions: ext };
  });
  await batchCreateContentItems(actor, {
    ...parsed.data,
    items: itemsWithExtensions,
  });
  revalidatePath(`/app/w/${workspaceSlug}/planning`);
  redirect(`/app/w/${workspaceSlug}/planning`);
}

export async function transitionAction(input: {
  workspaceSlug: string;
  contentItemId: string;
  action: WorkflowAction;
  reason?: string;
  returnTarget?: string;
}): Promise<{ error?: string; from?: string; to?: string }> {
  const { actor } = await requireWorkspaceContext(input.workspaceSlug);
  try {
    return await transitionContent(actor, {
      contentItemId: input.contentItemId,
      action: input.action,
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.returnTarget ? { returnTarget: input.returnTarget } : {}),
    });
  } catch (error) {
    // Return the error as a value rather than re-throwing. Next.js 16
    // encodes thrown server-action errors as a hashed digest in the RSC
    // response (content-type: text/x-component, `1:E{"digest":"…"}`),
    // dropping the original message — the client then surfaces a generic
    // minified React error instead of the action's real text. Returning
    // a value keeps the message in the RSC payload. Matches the
    // pattern already used by `applyAiDraftAction`, `submitDeliveryAction`,
    // and `decideApprovalAction` in this file.
    return { error: error instanceof Error ? error.message : "The workflow action failed." };
  }
}

export async function claimAction(input: {
  workspaceSlug: string;
  contentItemId: string;
}): Promise<{ error?: string }> {
  const { actor } = await requireWorkspaceContext(input.workspaceSlug);
  try {
    await claimAsDesigner(actor, input.contentItemId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The claim action failed." };
  }
  revalidatePath(`/app/w/${input.workspaceSlug}/planning/${input.contentItemId}`);
  return {};
}

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
}): Promise<{ error?: string }> {
  const parsed = AssignDesignerActionSchema.safeParse({
    contentItemId: input.contentItemId,
    designerId: input.designerId,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const { actor } = await requireWorkspaceContext(input.workspaceSlug);
  try {
    await assignDesigner(actor, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The assign action failed." };
  }
  // Now move the item to `in_design`. The workflow transition does
  // its own role gate; the design row was set in the previous call
  // so the "Assign a designer before moving…" guard inside
  // `transitionContent` is satisfied.
  try {
    await transitionContent(actor, {
      contentItemId: parsed.data.contentItemId,
      action: "assign_designer",
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The assign action failed." };
  }
  revalidatePath(`/app/w/${input.workspaceSlug}/planning/${input.contentItemId}`);
  return {};
}

export async function submitDeliveryAction(
  workspaceSlug: string,
  contentItemId: string,
  _prev: unknown,
  formData: FormData,
) {
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
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const result = await submitDelivery(actor, parsed.data);
  revalidatePath(`/app/w/${workspaceSlug}/planning/${contentItemId}`);
  return result;
}

export async function decideApprovalAction(input: {
  workspaceSlug: string;
  approvalRequestId: string;
  decision: "approved" | "changes_requested";
  feedback?: string;
}): Promise<{ error?: string }> {
  const { actor } = await requireWorkspaceContext(input.workspaceSlug);
  const parsed = DecideApprovalSchema.safeParse({
    approvalRequestId: input.approvalRequestId,
    decision: input.decision,
    ...(input.feedback ? { feedback: input.feedback } : {}),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  try {
    await decideApproval(actor, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The approval action failed." };
  }
  revalidatePath(`/app/w/${input.workspaceSlug}/planning`);
  return {};
}

export async function recordPublicationAction(input: {
  workspaceSlug: string;
  contentItemChannelId: string;
  status: "published" | "skipped" | "failed";
  publishedUrl?: string;
  note?: string;
  failureReason?: string;
}): Promise<{ error?: string }> {
  const { actor } = await requireWorkspaceContext(input.workspaceSlug);
  const parsed = RecordPublicationSchema.safeParse({
    contentItemChannelId: input.contentItemChannelId,
    status: input.status,
    ...(input.publishedUrl ? { publishedUrl: input.publishedUrl } : {}),
    ...(input.note ? { note: input.note } : {}),
    ...(input.failureReason ? { failureReason: input.failureReason } : {}),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  try {
    await recordPublication(actor, parsed.data);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The publication action failed.",
    };
  }
  revalidatePath(`/app/w/${input.workspaceSlug}/planning`);
  return {};
}

// ─── Discussion actions (Goal 8) ────────────────────────────────────────
export async function createCommentAction(
  workspaceSlug: string,
  _prev: { error?: string } | null,
  formData: FormData,
): Promise<{ error?: string } | null> {
  const { actor, workspace } = await requireWorkspaceContext(workspaceSlug);
  const parsed = CreateCommentSchema.safeParse({
    contentItemId: formData.get("contentItemId"),
    parentCommentId: formData.get("parentCommentId") || undefined,
    body: formData.get("body"),
    visibility: formData.get("visibility") ?? "internal",
    label: formData.get("label") ?? "general",
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((i) => i.message).join("; "),
    };
  }
  await createComment(actor, parsed.data);
  revalidatePath(`/app/w/${workspaceSlug}/planning/${formData.get("contentItemId")}`);
  void workspace;
  return null;
}

export async function resolveCommentAction(input: {
  workspaceSlug: string;
  commentId: string;
  resolved: boolean;
}) {
  const { actor } = await requireWorkspaceContext(input.workspaceSlug);
  const parsed = ResolveCommentSchema.safeParse({
    commentId: input.commentId,
    resolved: input.resolved,
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  }
  await resolveComment(actor, parsed.data);
  revalidatePath(`/app/w/${input.workspaceSlug}/planning/`);
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
) {
  const { actor } = await requireWorkspaceContext(workspaceSlug);
  const rawPayload = String(formData.get("formatPayload") ?? "{}");
  let formatPayload: unknown;
  try {
    formatPayload = JSON.parse(rawPayload);
  } catch {
    return { error: "Invalid formatPayload JSON" };
  }
  const parsed = UpdateFormatPayloadFormSchema.safeParse({
    contentItemId: formData.get("contentItemId"),
    format: formData.get("format"),
    formatPayload: rawPayload,
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  try {
    await updateFormatPayload(actor, {
      contentItemId: parsed.data.contentItemId,
      format: parsed.data.format,
      formatPayload: formatPayload as Record<string, unknown>,
    });
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath(`/app/w/${workspaceSlug}/planning/${parsed.data.contentItemId}`);
  return { ok: true as const };
}
