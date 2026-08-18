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
import { z } from "zod";

const InviteSchema = z.object({
  email: z.string().email(),
  inviteeName: z.string().optional(),
  grantsAgencyAdmin: z.union([z.literal("on"), z.literal("off")]).optional(),
  workspaceRoles: z.string().optional(), // JSON: [{ workspaceId, role }]
});

export async function sendInviteAction(_prev: unknown, formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) return { error: "Not signed in" };
  const agencyId = await activeAgencyId();
  if (!agencyId) return { error: "Agency not configured" };
  if (!(await isAgencyAdmin({ id: session.user.id }, agencyId))) {
    throw new PermissionDeniedError("send_invite");
  }

  const parsed = InviteSchema.safeParse({
    email: formData.get("email"),
    inviteeName: formData.get("inviteeName") ?? undefined,
    grantsAgencyAdmin: formData.get("grantsAgencyAdmin") ? "on" : "off",
    workspaceRoles: formData.get("workspaceRoles") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join("; ") };
  }

  let workspaceRoles: { workspaceId: string; role: string }[] = [];
  if (parsed.data.workspaceRoles) {
    try {
      workspaceRoles = JSON.parse(parsed.data.workspaceRoles);
    } catch {
      return { error: "Invalid workspaceRoles JSON" };
    }
  }

  const result = await createInvitation({
    email: parsed.data.email,
    ...(parsed.data.inviteeName ? { inviteeName: parsed.data.inviteeName } : {}),
    grantsAgencyAdmin: parsed.data.grantsAgencyAdmin === "on",
    workspaceRoles,
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
    await deactivateUser(userId);
  } else {
    await reactivateUser(userId);
  }
  revalidatePath("/app/users");
  return { success: true };
}
