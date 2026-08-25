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
  quickCreateContentItem,
  transitionContent,
  claimAsDesigner,
  updateContentItem,
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
  const parsed = BatchCreateSchema.safeParse({
    workspaceId: workspace.id,
    items: parseBatchRows(String(formData.get("rows") ?? "")),
  });
  if (!parsed.success)
    return { error: "Use 1–50 rows: Title | format | ISO date/time | optional brief." };
  await batchCreateContentItems(actor, parsed.data);
  revalidatePath(`/app/w/${workspaceSlug}/planning`);
  redirect(`/app/w/${workspaceSlug}/planning`);
}

export async function transitionAction(input: {
  workspaceSlug: string;
  contentItemId: string;
  action: WorkflowAction;
  reason?: string;
  returnTarget?: string;
}) {
  const { actor } = await requireWorkspaceContext(input.workspaceSlug);
  return transitionContent(actor, {
    contentItemId: input.contentItemId,
    action: input.action,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.returnTarget ? { returnTarget: input.returnTarget } : {}),
  });
}

export async function claimAction(input: { workspaceSlug: string; contentItemId: string }) {
  const { actor } = await requireWorkspaceContext(input.workspaceSlug);
  await claimAsDesigner(actor, input.contentItemId);
  revalidatePath(`/app/w/${input.workspaceSlug}/planning/${input.contentItemId}`);
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
}) {
  const { actor } = await requireWorkspaceContext(input.workspaceSlug);
  const parsed = DecideApprovalSchema.safeParse({
    approvalRequestId: input.approvalRequestId,
    decision: input.decision,
    ...(input.feedback ? { feedback: input.feedback } : {}),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  await decideApproval(actor, parsed.data);
  revalidatePath(`/app/w/${input.workspaceSlug}/planning`);
}

export async function recordPublicationAction(input: {
  workspaceSlug: string;
  contentItemChannelId: string;
  status: "published" | "skipped" | "failed";
  publishedUrl?: string;
  note?: string;
  failureReason?: string;
}) {
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
  await recordPublication(actor, parsed.data);
  revalidatePath(`/app/w/${input.workspaceSlug}/planning`);
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
