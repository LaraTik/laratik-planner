"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { activeAgencyId, isAgencyAdmin, PermissionDeniedError } from "@/lib/auth/policy";
import {
  createInvitation,
  deactivateUser,
  reactivateUser,
  resendInvitation,
  revokeInvitation,
} from "@/lib/auth/invitations";
import { invitationCommandSchema } from "@/lib/auth/invitation-command";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export async function sendInviteAction(_prev: unknown, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not signed in" };
  const agencyId = await activeAgencyId();
  if (!agencyId) return { error: "Agency not configured" };
  if (!(await isAgencyAdmin({ id: session.user.id }, agencyId))) {
    throw new PermissionDeniedError("send_invite");
  }

  let workspaceRoles: unknown = [];
  try {
    const raw = formData.get("workspaceRoles");
    workspaceRoles = typeof raw === "string" && raw ? JSON.parse(raw) : [];
  } catch {
    return { error: "Invalid workspace access selection" };
  }
  const parsed = invitationCommandSchema.safeParse({
    email: formData.get("email"),
    inviteeName: formData.get("inviteeName") || undefined,
    grantsAgencyAdmin: formData.get("grantsAgencyAdmin") === "on",
    workspaceRoles,
  });
  if (!parsed.success) return { error: "Check the email address and workspace roles." };

  const rateLimit = await enforceRateLimit({
    scope: "invitation_create",
    subject: session.user.id,
    actorId: session.user.id,
  });
  if (!rateLimit.allowed) return { error: "Too many invitations. Please try again later." };

  const result = await createInvitation({
    email: parsed.data.email,
    ...(parsed.data.inviteeName ? { inviteeName: parsed.data.inviteeName } : {}),
    grantsAgencyAdmin: parsed.data.grantsAgencyAdmin,
    workspaceRoles: parsed.data.workspaceRoles,
    invitedBy: session.user.id,
  });

  revalidatePath("/app/users");
  return {
    success: true,
    invitationId: result.id,
    expiresAt: result.expiresAt.toISOString().slice(0, 10),
    // In dev, surface the link; in prod, it's email-only
    devLink: process.env.NODE_ENV === "production" ? null : result.acceptUrl,
  };
}

export async function resendInviteAction(invitationId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not signed in" };
  const agencyId = await activeAgencyId();
  if (!agencyId) return { error: "Agency not configured" };
  if (!(await isAgencyAdmin({ id: session.user.id }, agencyId))) {
    throw new PermissionDeniedError("resend_invite");
  }
  const rateLimit = await enforceRateLimit({
    scope: "invitation_resend",
    subject: session.user.id,
    actorId: session.user.id,
  });
  if (!rateLimit.allowed) return { error: "Too many resend attempts. Please try again later." };
  await resendInvitation(invitationId, session.user.id);
  revalidatePath("/app/users");
  return { success: true };
}

export async function revokeInviteAction(invitationId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not signed in" };
  const agencyId = await activeAgencyId();
  if (!agencyId) return { error: "Agency not configured" };
  if (!(await isAgencyAdmin({ id: session.user.id }, agencyId))) {
    throw new PermissionDeniedError("revoke_invite");
  }
  await revokeInvitation(invitationId);
  revalidatePath("/app/users");
  return { success: true };
}

export async function toggleDeactivationAction(userId: string, currentlyActive: boolean) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not signed in" };
  const agencyId = await activeAgencyId();
  if (!agencyId) return { error: "Agency not configured" };
  if (!(await isAgencyAdmin({ id: session.user.id }, agencyId))) {
    throw new PermissionDeniedError("toggle_user_status");
  }
  if (currentlyActive) {
    try {
      await deactivateUser({ actorUserId: session.user.id, targetUserId: userId, agencyId });
    } catch (error) {
      const message =
        error instanceof Error &&
        (error.message === "You cannot deactivate your own account" ||
          error.message === "The final active agency administrator cannot be deactivated")
          ? error.message
          : "The member could not be deactivated.";
      return { error: message };
    }
  } else {
    await reactivateUser({ userId, agencyId, actorUserId: session.user.id });
  }
  revalidatePath("/app/users");
  return { success: true };
}
