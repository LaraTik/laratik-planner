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
