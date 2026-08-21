export function assertCanDeactivateAgencyMember(input: {
  actorUserId: string;
  targetUserId: string;
  targetIsAgencyAdmin: boolean;
  activeAgencyAdminCount: number;
}): void {
  if (input.actorUserId === input.targetUserId) {
    throw new Error("You cannot deactivate your own account");
  }
  if (input.targetIsAgencyAdmin && input.activeAgencyAdminCount <= 1) {
    throw new Error("The final active agency administrator cannot be deactivated");
  }
}

/**
 * Safety guard for downgrading the `isAgencyAdmin` flag on a member.
 *
 * Two rules:
 *  1. The actor cannot change their own flag (lockout protection — once
 *     demoted, the user can no longer reach the user-management surface
 *     to re-promote anyone).
 *  2. The final active agency admin cannot be demoted. The caller's
 *     `activeAgencyAdminCountAfterChange` is the count of admins **after**
 *     the proposed change: the call site computes the new count by
 *     `currentCount + (wouldPromote ? +1 : -1)`, so passing 0 here
 *     means the demotion would leave the agency with no admins.
 */
export function assertCanDemoteAgencyAdmin(input: {
  actorUserId: string;
  targetUserId: string;
  targetIsAgencyAdmin: boolean;
  activeAgencyAdminCountAfterChange: number;
}): void {
  if (input.actorUserId === input.targetUserId && input.targetIsAgencyAdmin) {
    throw new Error("You cannot change your own agency-admin status");
  }
  if (input.targetIsAgencyAdmin && input.activeAgencyAdminCountAfterChange < 1) {
    throw new Error("The final active agency administrator cannot be demoted");
  }
}
