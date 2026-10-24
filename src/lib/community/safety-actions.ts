"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { db } from "@/lib/db";
import { communityEvents, workspaceSettings } from "@/lib/db/schema";
import { getAccessibleWorkspaceAtPath } from "@/lib/workspaces/context";
import { workspaceBasePath } from "@/lib/urls";
import {
  CommunityAccessError,
  getCommunityWorkspaceAccess,
  requireCommunityPermission,
} from "./service";

const EmergencyStopSchema = z.boolean();

export type CommunityEmergencyStopResult =
  | { ok: true; emergencyStop: boolean }
  | {
      ok: false;
      code: "unauthorized" | "workspace_not_found" | "module_unavailable" | "invalid_input";
    };

/**
 * Managers can stop or resume human reply processing. This only changes the
 * workspace safety flag; it never enables auto-send or bypasses provider
 * capability checks.
 */
export async function setCommunityEmergencyStopAction(
  agencySlug: string,
  workspaceSlug: string,
  rawEmergencyStop: unknown,
): Promise<CommunityEmergencyStopResult> {
  const parsed = EmergencyStopSchema.safeParse(rawEmergencyStop);
  if (!parsed.success) return { ok: false, code: "invalid_input" };

  const session = await auth();
  const actor = await currentActor();
  if (!session?.user?.id || !actor) return { ok: false, code: "unauthorized" };

  const workspace = await getAccessibleWorkspaceAtPath(actor, agencySlug, workspaceSlug);
  if (!workspace) return { ok: false, code: "workspace_not_found" };

  try {
    await requireCommunityPermission(actor, workspace, "manage_settings");
    const access = await getCommunityWorkspaceAccess(workspace.agencyId, workspace.id);
    if (access.emergencyStop !== parsed.data) {
      await db.transaction(async (tx) => {
        // Ensure a row exists, then serialize concurrent toggles against it.
        await tx
          .insert(workspaceSettings)
          .values({ workspaceId: workspace.id, communityInboxEmergencyStop: access.emergencyStop })
          .onConflictDoNothing({ target: workspaceSettings.workspaceId });
        const [settings] = await tx
          .select({ emergencyStop: workspaceSettings.communityInboxEmergencyStop })
          .from(workspaceSettings)
          .where(eq(workspaceSettings.workspaceId, workspace.id))
          .for("update");
        if (!settings || settings.emergencyStop === parsed.data) return;
        await tx
          .update(workspaceSettings)
          .set({ communityInboxEmergencyStop: parsed.data, updatedAt: new Date() })
          .where(eq(workspaceSettings.workspaceId, workspace.id));
        await tx.insert(communityEvents).values({
          workspaceId: workspace.id,
          actorId: actor.id,
          kind: parsed.data
            ? "community_emergency_stop_enabled"
            : "community_emergency_stop_disabled",
          detail: parsed.data
            ? "community_emergency_stop_enabled"
            : "community_emergency_stop_disabled",
          metadata: { emergencyStop: parsed.data },
        });
      });
    }

    const basePath = `${workspaceBasePath(agencySlug, workspaceSlug)}/engagement`;
    revalidatePath(`${basePath}/settings`);
    revalidatePath(`${basePath}/automations`);
    revalidatePath(`${basePath}/inbox`);
    revalidatePath(`${basePath}/activity`);
    revalidatePath(basePath);
    return { ok: true, emergencyStop: parsed.data };
  } catch (error) {
    if (error instanceof CommunityAccessError) {
      return {
        ok: false,
        code: error.code === "permission_denied" ? "unauthorized" : "module_unavailable",
      };
    }
    throw error;
  }
}
