import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { getEffectiveEntitlement } from "@/lib/entitlements";
import { hasWorkspaceRole, isAgencyAdmin, type Actor } from "@/lib/auth/policy";
import { agencyModuleSettings, workspaces, workspaceSettings } from "@/lib/db/schema";
import {
  COMMUNITY_INBOX_MODULE,
  evaluateCommunityInboxAccess,
  type CommunityAccessReason,
} from "./access";
import { COMMUNITY_PERMISSION_ROLES, type CommunityPermission } from "./permissions";

export class CommunityAccessError extends Error {
  readonly code: CommunityAccessReason;

  constructor(code: CommunityAccessReason) {
    super(`Community & Inbox access denied: ${code}`);
    this.name = "CommunityAccessError";
    this.code = code;
  }
}

export type CommunityWorkspaceAccess = {
  allowed: boolean;
  reason: CommunityAccessReason;
  planIncluded: boolean;
  agencyEnabled: boolean;
  workspaceEnabled: boolean;
  mode: "manual" | "ai_assist" | "controlled_auto";
  autoSendEnabled: boolean;
  emergencyStop: boolean;
  retentionDays: number;
};

function parseMode(value: string | null | undefined): CommunityWorkspaceAccess["mode"] {
  if (value === "ai_assist" || value === "controlled_auto") return value;
  return "manual";
}

export async function getCommunityWorkspaceAccess(
  agencyId: string,
  workspaceId: string,
): Promise<CommunityWorkspaceAccess> {
  const [entitlement, [agencySetting], [settings]] = await Promise.all([
    getEffectiveEntitlement({ agencyId }).catch(() => null),
    db
      .select({ enabled: agencyModuleSettings.enabled })
      .from(agencyModuleSettings)
      .where(
        and(
          eq(agencyModuleSettings.agencyId, agencyId),
          eq(agencyModuleSettings.module, COMMUNITY_INBOX_MODULE),
        ),
      )
      .limit(1),
    db
      .select({
        enabled: workspaceSettings.communityInboxEnabled,
        mode: workspaceSettings.communityInboxMode,
        autoSendEnabled: workspaceSettings.communityInboxAutoSendEnabled,
        emergencyStop: workspaceSettings.communityInboxEmergencyStop,
        retentionDays: workspaceSettings.communityInboxRetentionDays,
      })
      .from(workspaceSettings)
      .where(eq(workspaceSettings.workspaceId, workspaceId))
      .limit(1),
  ]);

  const planModules = entitlement?.enabledModules ? [...entitlement.enabledModules] : [];
  const result = evaluateCommunityInboxAccess({
    planModules,
    agencyEnabled: agencySetting?.enabled,
    workspaceEnabled: settings?.enabled,
  });

  return {
    ...result,
    planIncluded: planModules.includes(COMMUNITY_INBOX_MODULE),
    agencyEnabled: agencySetting?.enabled === true,
    workspaceEnabled: settings?.enabled === true,
    mode: parseMode(settings?.mode),
    autoSendEnabled: settings?.autoSendEnabled === true,
    emergencyStop: settings?.emergencyStop !== false,
    retentionDays: settings?.retentionDays ?? 90,
  };
}

export async function canExposeCommunityInboxForAgency(agencyId: string): Promise<boolean> {
  const [entitlement, [setting]] = await Promise.all([
    getEffectiveEntitlement({ agencyId }).catch(() => null),
    db
      .select({ enabled: agencyModuleSettings.enabled })
      .from(agencyModuleSettings)
      .where(
        and(
          eq(agencyModuleSettings.agencyId, agencyId),
          eq(agencyModuleSettings.module, COMMUNITY_INBOX_MODULE),
        ),
      )
      .limit(1),
  ]);
  return Boolean(entitlement?.enabledModules?.has(COMMUNITY_INBOX_MODULE) && setting?.enabled);
}

export async function requireCommunityInboxAccess(agencyId: string, workspaceId: string) {
  const access = await getCommunityWorkspaceAccess(agencyId, workspaceId);
  if (!access.allowed) throw new CommunityAccessError(access.reason);
  return access;
}

type CommunityWorkspaceIdentity = Pick<typeof workspaces.$inferSelect, "id" | "agencyId">;

export async function canManageCommunityInbox(actor: Actor, workspace: CommunityWorkspaceIdentity) {
  return (
    (await isAgencyAdmin(actor, workspace.agencyId)) ||
    (await hasWorkspaceRole(actor, workspace.id, ["workspace_manager"]))
  );
}

/**
 * Shared server-side permission gate for every future community command.
 * Agency administrators retain the existing full-access policy; all other
 * actors must hold the module permission's workspace role and the three
 * Community & Inbox access gates must already be enabled.
 */
export async function requireCommunityPermission(
  actor: Actor,
  workspace: CommunityWorkspaceIdentity,
  permission: CommunityPermission,
) {
  await requireCommunityInboxAccess(workspace.agencyId, workspace.id);
  if (await isAgencyAdmin(actor, workspace.agencyId)) return;
  const roles = COMMUNITY_PERMISSION_ROLES[permission];
  if (!(await hasWorkspaceRole(actor, workspace.id, [...roles]))) {
    throw new CommunityAccessError("permission_denied");
  }
}

export async function setAgencyCommunityInboxEnabled(
  actor: Actor,
  agencyId: string,
  enabled: boolean,
) {
  if (!(await isAgencyAdmin(actor, agencyId))) throw new CommunityAccessError("agency_disabled");
  const entitlement = await getEffectiveEntitlement({ agencyId });
  if (!entitlement.enabledModules?.has(COMMUNITY_INBOX_MODULE)) {
    throw new CommunityAccessError("plan_not_included");
  }

  await db
    .insert(agencyModuleSettings)
    .values({
      agencyId,
      module: COMMUNITY_INBOX_MODULE,
      enabled,
      updatedBy: actor.id,
    })
    .onConflictDoUpdate({
      target: [agencyModuleSettings.agencyId, agencyModuleSettings.module],
      set: { enabled, updatedBy: actor.id, updatedAt: new Date() },
    });
}

export async function setWorkspaceCommunityInboxEnabled(
  actor: Actor,
  workspace: CommunityWorkspaceIdentity,
  enabled: boolean,
) {
  if (!(await canManageCommunityInbox(actor, workspace))) {
    throw new CommunityAccessError("workspace_disabled");
  }
  const current = await getCommunityWorkspaceAccess(workspace.agencyId, workspace.id);
  if (!current.planIncluded) throw new CommunityAccessError("plan_not_included");
  if (enabled && !current.agencyEnabled) throw new CommunityAccessError("agency_disabled");

  await db
    .insert(workspaceSettings)
    .values({ workspaceId: workspace.id, communityInboxEnabled: enabled })
    .onConflictDoUpdate({
      target: workspaceSettings.workspaceId,
      set: { communityInboxEnabled: enabled, updatedAt: new Date() },
    });
}
