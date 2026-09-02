"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import {
  confirmPublishReadiness,
  PlatformPayloadSchema,
  savePlatformPayload,
  setFinalCopyApproval,
  recordNonMaterialityEvent,
  PlatformPayloadError,
  ReadinessError,
} from "@/lib/publishing";
import {
  platformPayloadErrorCode,
  readinessErrorCode,
  type PublishActionErrorCode,
} from "@/lib/publishing/action-errors";

/**
 * M4 — Publish page server actions.
 *
 * Thin wrappers over the publish-package service. The actions
 * layer is the only place we map domain error codes to stable UI
 * error codes, and the only place we call
 * `revalidatePath` for the publish page.
 */

function failure(errorCode: PublishActionErrorCode) {
  return { ok: false as const, errorCode };
}

const SavePayloadFormSchema = z.object({
  workspaceSlug: z.string().min(1).max(64),
  contentItemId: z.string().uuid(),
  socialChannelId: z.string().uuid(),
  payload: z.string(), // JSON-stringified PlatformPayload
});

export async function savePublishPackageAction(input: z.input<typeof SavePayloadFormSchema>) {
  const session = await auth();
  if (!session?.user?.id) return failure("authRequired");
  const actor = await currentActor();
  if (!actor) return failure("authRequired");
  const parsed = SavePayloadFormSchema.safeParse(input);
  if (!parsed.success) return failure("invalidPublishRequest");
  try {
    const workspace = await getAccessibleWorkspace(actor, parsed.data.workspaceSlug);
    if (!workspace) return failure("workspaceNotFound");
    const candidate: unknown = JSON.parse(parsed.data.payload);
    const payload = PlatformPayloadSchema.safeParse(candidate);
    if (!payload.success) return failure("invalidPlatformPayload");
    const result = await savePlatformPayload(actor, workspace.id, {
      contentItemId: parsed.data.contentItemId,
      socialChannelId: parsed.data.socialChannelId,
      payload: payload.data,
    });
    revalidatePath(
      `/app/w/${parsed.data.workspaceSlug}/planning/${parsed.data.contentItemId}/publish`,
    );
    revalidatePath(`/app/w/${parsed.data.workspaceSlug}/planning/${parsed.data.contentItemId}`);
    return { ok: true as const, payload: result };
  } catch (e) {
    if (e instanceof PlatformPayloadError) {
      return failure(platformPayloadErrorCode(e.code));
    }
    return failure("saveFailed");
  }
}

const NonMaterialNoteSchema = z.object({
  workspaceSlug: z.string().min(1).max(64),
  contentItemId: z.string().uuid(),
  resource: z.string().min(1).max(80),
  summary: z.string().min(1).max(200),
});

/**
 * Record an internal note (administrative change). Does NOT
 * trigger revision increment, approval reset, or notifications.
 * The master prompt's "Administrative changes such as internal
 * notes must not reset approvals" rule.
 */
export async function recordInternalNoteAction(input: z.input<typeof NonMaterialNoteSchema>) {
  const session = await auth();
  if (!session?.user?.id) return failure("authRequired");
  const actor = await currentActor();
  if (!actor) return failure("authRequired");
  const parsed = NonMaterialNoteSchema.safeParse(input);
  if (!parsed.success) return failure("invalidInternalNote");
  try {
    const workspace = await getAccessibleWorkspace(actor, parsed.data.workspaceSlug);
    if (!workspace) return failure("workspaceNotFound");
    await recordNonMaterialityEvent({
      actor,
      contentItemId: parsed.data.contentItemId,
      resource: parsed.data.resource,
      summary: parsed.data.summary,
    });
    revalidatePath(
      `/app/w/${parsed.data.workspaceSlug}/planning/${parsed.data.contentItemId}/publish`,
    );
    return { ok: true as const };
  } catch {
    return failure("recordNoteFailed");
  }
}

const ApprovalFormSchema = z.object({
  workspaceSlug: z.string().min(1).max(64),
  contentItemId: z.string().uuid(),
  socialChannelId: z.string().uuid(),
  approved: z.boolean(),
});

export async function setFinalCopyApprovalAction(input: z.input<typeof ApprovalFormSchema>) {
  const actor = await currentActor();
  if (!actor) return failure("authRequired");
  const parsed = ApprovalFormSchema.safeParse(input);
  if (!parsed.success) return failure("invalidApprovalRequest");
  try {
    const workspace = await getAccessibleWorkspace(actor, parsed.data.workspaceSlug);
    if (!workspace) return failure("workspaceNotFound");
    const payload = await setFinalCopyApproval(actor, workspace.id, parsed.data);
    revalidatePath(
      `/app/w/${parsed.data.workspaceSlug}/planning/${parsed.data.contentItemId}/publish`,
    );
    return { ok: true as const, payload };
  } catch (error) {
    if (error instanceof PlatformPayloadError) {
      return failure(platformPayloadErrorCode(error.code));
    }
    return failure("approvalFailed");
  }
}

const ReadinessFormSchema = z.object({
  workspaceSlug: z.string().min(1).max(64),
  contentItemId: z.string().uuid(),
});

export async function confirmPublishReadinessAction(input: z.input<typeof ReadinessFormSchema>) {
  const actor = await currentActor();
  if (!actor) return failure("authRequired");
  const parsed = ReadinessFormSchema.safeParse(input);
  if (!parsed.success) return failure("invalidReadinessRequest");
  try {
    const workspace = await getAccessibleWorkspace(actor, parsed.data.workspaceSlug);
    if (!workspace) return failure("workspaceNotFound");
    const report = await confirmPublishReadiness(actor, {
      workspaceId: workspace.id,
      contentItemId: parsed.data.contentItemId,
    });
    revalidatePath(
      `/app/w/${parsed.data.workspaceSlug}/planning/${parsed.data.contentItemId}/publish`,
    );
    return { ok: true as const, report };
  } catch (error) {
    if (error instanceof ReadinessError) {
      return failure(readinessErrorCode(error.code));
    }
    return failure("readinessFailed");
  }
}
