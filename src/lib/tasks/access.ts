import "server-only";

import { isAgencyAdmin, isAgencyMember, type Actor } from "@/lib/auth/policy";

type TaskAccessRecord = {
  agencyId: string;
  createdBy: string;
  assigneeId: string | null;
};

export type TaskAccess = {
  canView: boolean;
  canManage: boolean;
  isAgencyAdmin: boolean;
};

/**
 * Resolve the canonical agency-task access contract in one place.
 * Active agency members can view; creators, assignees, and agency admins
 * can manage; only agency admins receive administrative task controls.
 */
export async function getTaskAccess(actor: Actor, task: TaskAccessRecord): Promise<TaskAccess> {
  const canView = await isAgencyMember(actor, task.agencyId);
  if (!canView) return { canView: false, canManage: false, isAgencyAdmin: false };

  const isAdmin = await isAgencyAdmin(actor, task.agencyId);
  return {
    canView: true,
    canManage: isAdmin || task.createdBy === actor.id || task.assigneeId === actor.id,
    isAgencyAdmin: isAdmin,
  };
}
