"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import {
  savePlatformPayload,
  recordNonMaterialityEvent,
  PlatformPayloadError,
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
  contentItemId: z.string().uuid(),
  socialChannelId: z.string().uuid(),
  payload: z.string(), // JSON-stringified PlatformPayload
});

export async function savePublishPackageAction(input: z.input<typeof SavePayloadFormSchema>) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Not signed in" };
  const actor = await currentActor();
  if (!actor) return { ok: false as const, error: "Not signed in" };
  const parsed = SavePayloadFormSchema.parse(input);
  const payload = JSON.parse(parsed.payload);
  // Workspace resolution via the standard helper. We accept
  // the social channel id and look up the workspace through
  // the content item; the service layer re-validates.
  const ws = await getAccessibleWorkspace(actor, "");
  void ws; // service-layer check is authoritative
  try {
    // The service re-fetches the workspace from the content
    // item join; the workspaceId passed here is best-effort
    // and the service's `ensureContentItemChannelInWorkspace`
    // is the real gate.
    const { db } = await import("@/lib/db");
    const { contentItems, socialChannels } = await import("@/lib/db/schema");
    const { eq } = await import("drizzle-orm");
    const [item] = await db
      .select({ workspaceId: contentItems.workspaceId })
      .from(contentItems)
      .where(eq(contentItems.id, parsed.contentItemId))
      .limit(1);
    const [chan] = await db
      .select({ workspaceId: socialChannels.workspaceId })
      .from(socialChannels)
      .where(eq(socialChannels.id, parsed.socialChannelId))
      .limit(1);
    if (!item || !chan) return { ok: false as const, error: "Channel link not found" };
    if (item.workspaceId !== chan.workspaceId) {
      return {
        ok: false as const,
        error: "Channel does not belong to the content item's workspace",
      };
    }
    const allowed = await hasWorkspaceRole(actor, item.workspaceId, [
      "workspace_manager",
      "content_planner",
    ]);
    if (!allowed) return { ok: false as const, error: "Forbidden" };
    const result = await savePlatformPayload(actor, item.workspaceId, {
      contentItemId: parsed.contentItemId,
      socialChannelId: parsed.socialChannelId,
      payload,
    });
    revalidatePath(`/app/w/${chan.workspaceId}/planning/${parsed.contentItemId}/publish`);
    return { ok: true as const, payload: result };
  } catch (e) {
    if (e instanceof PlatformPayloadError) {
      return { ok: false as const, error: e.message, code: e.code };
    }
    return { ok: false as const, error: "Failed to save publish package" };
  }
}

const NonMaterialNoteSchema = z.object({
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
  const parsed = NonMaterialNoteSchema.parse(input);
  try {
    await recordNonMaterialityEvent({
      actor,
      contentItemId: parsed.contentItemId,
      resource: parsed.resource,
      summary: parsed.summary,
    });
    return { ok: true as const };
  } catch {
    return { ok: false as const, error: "Failed to record note" };
  }
}
