"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { workspaces } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import {
  QuickCreateSchema,
  UpdateContentSchema,
  quickCreateContentItem,
  transitionContent,
  claimAsDesigner,
  updateContentItem,
  type WorkflowAction,
  batchCreateContentItems,
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
import { hasWorkspaceRole } from "@/lib/auth/policy";

async function requireWorkspaceContext(workspaceSlug: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in");
  const [ws] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, workspaceSlug))
    .limit(1);
  if (!ws) throw new Error("Workspace not found");
  return { actor: { id: session.user.id }, workspace: ws };
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

// silence
void and;
void hasWorkspaceRole;
