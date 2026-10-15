"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import {
  CommunityAccessError,
  setAgencyCommunityInboxEnabled,
  setWorkspaceCommunityInboxEnabled,
} from "@/lib/community/service";

export type CommunityToggleState = { ok?: boolean; error?: string; code?: string };

export async function toggleAgencyCommunityInbox(
  _previous: CommunityToggleState,
  formData: FormData,
): Promise<CommunityToggleState> {
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) return { error: "session-required" };
  const context = await resolveActiveAgencyContext({ actor });
  if (!context?.agencyId) return { error: "agency-required" };
  const enabled = formData.get("enabled") === "true";
  try {
    await setAgencyCommunityInboxEnabled(actor, context.agencyId, enabled);
    revalidatePath("/app/agency-settings");
    return { ok: true };
  } catch (error) {
    if (error instanceof CommunityAccessError) return { error: error.message, code: error.code };
    return { error: "community-module-update-failed" };
  }
}

export async function toggleWorkspaceCommunityInbox(
  _previous: CommunityToggleState,
  formData: FormData,
): Promise<CommunityToggleState> {
  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) return { error: "session-required" };
  const agencySlug = String(formData.get("agencySlug") ?? "");
  const workspaceSlug = String(formData.get("workspaceSlug") ?? "");
  const workspace = await getAccessibleWorkspaceAtPath(actor, agencySlug, workspaceSlug);
  if (!workspace) return { error: "workspace-not-found" };
  const enabled = formData.get("enabled") === "true";
  try {
    await setWorkspaceCommunityInboxEnabled(actor, workspace, enabled);
    revalidatePath(`${formData.get("basePath") ?? ""}/engagement`);
    return { ok: true };
  } catch (error) {
    if (error instanceof CommunityAccessError) return { error: error.message, code: error.code };
    return { error: "community-workspace-update-failed" };
  }
}
