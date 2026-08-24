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

/**
 * M4 — Publish page server actions.
 *
 * Thin wrappers over the publish-package service. The actions
 * layer is the only place we map `PlatformPayloadError` codes
 * to UI-friendly error strings, and the only place we call
 * `revalidatePath` for the publish page.
 */

const SavePayloadFormSchema = z.object({
  workspaceSlug: z.string().min(1).max(64),
  contentItemId: z.string().uuid(),
  socialChannelId: z.string().uuid(),
  payload: z.string(), // JSON-stringified PlatformPayload
});

export async function savePublishPackageAction(input: z.input<typeof SavePayloadFormSchema>) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Not signed in" };
  const actor = await currentActor();
  if (!actor) return { ok: false as const, error: "Not signed in" };
  const parsed = SavePayloadFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Check the publish package fields." };
  try {
    const workspace = await getAccessibleWorkspace(actor, parsed.data.workspaceSlug);
    if (!workspace) return { ok: false as const, error: "Workspace not found." };
    const candidate: unknown = JSON.parse(parsed.data.payload);
    const payload = PlatformPayloadSchema.safeParse(candidate);
    if (!payload.success) {
      return { ok: false as const, error: "Check the platform-specific publish fields." };
    }
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
      return { ok: false as const, error: e.message, code: e.code };
    }
    return { ok: false as const, error: "Failed to save publish package" };
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
  if (!session?.user?.id) return { ok: false as const, error: "Not signed in" };
  const actor = await currentActor();
  if (!actor) return { ok: false as const, error: "Not signed in" };
  const parsed = NonMaterialNoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Enter a valid internal note." };
  try {
    const workspace = await getAccessibleWorkspace(actor, parsed.data.workspaceSlug);
    if (!workspace) return { ok: false as const, error: "Workspace not found." };
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
    return { ok: false as const, error: "Failed to record note" };
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
  if (!actor) return { ok: false as const, error: "Not signed in" };
  const parsed = ApprovalFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid approval request." };
  try {
    const workspace = await getAccessibleWorkspace(actor, parsed.data.workspaceSlug);
    if (!workspace) return { ok: false as const, error: "Workspace not found." };
    const payload = await setFinalCopyApproval(actor, workspace.id, parsed.data);
    revalidatePath(
      `/app/w/${parsed.data.workspaceSlug}/planning/${parsed.data.contentItemId}/publish`,
    );
    return { ok: true as const, payload };
  } catch (error) {
    if (error instanceof PlatformPayloadError) {
      return { ok: false as const, error: error.message, code: error.code };
    }
    return { ok: false as const, error: "Failed to update final-copy approval." };
  }
}

const ReadinessFormSchema = z.object({
  workspaceSlug: z.string().min(1).max(64),
  contentItemId: z.string().uuid(),
});

export async function confirmPublishReadinessAction(input: z.input<typeof ReadinessFormSchema>) {
  const actor = await currentActor();
  if (!actor) return { ok: false as const, error: "Not signed in" };
  const parsed = ReadinessFormSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid readiness request." };
  try {
    const workspace = await getAccessibleWorkspace(actor, parsed.data.workspaceSlug);
    if (!workspace) return { ok: false as const, error: "Workspace not found." };
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
      return { ok: false as const, error: error.message, code: error.code };
    }
    return { ok: false as const, error: "Failed to confirm publishing readiness." };
  }
}
