"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import {
  grantPlatformAdmin,
  revokePlatformAdmin,
  PlatformAdminErrorCode,
  PlatformAdminServiceError,
  GrantPlatformAdminSchema,
  RevokePlatformAdminSchema,
} from "@/lib/platform/admins";

/**
 * Platform Admin grant / revoke actions (superadmin-clarity).
 *
 * Thin server-action wrappers over `src/lib/platform/admins.ts`.
 * The service layer enforces `requirePlatformAdmin`; this file
 * maps service errors to UI-friendly strings. The page revalidates
 * `/app/platform/admins` after every successful mutation.
 *
 * The first-ever grant is intentionally NOT in this file — it is
 * the SQL escape hatch in `docs/agency-setup.md §3.2`. The product
 * UI refuses to grant to a non-existent user; auto-creating users
 * from a Platform Admin grant would be a privilege-inflation
 * footgun.
 */

const GrantFormSchema = GrantPlatformAdminSchema;
const RevokeFormSchema = z.object({
  userId: RevokePlatformAdminSchema.shape.userId,
  reason: RevokePlatformAdminSchema.shape.reason,
});

export type GrantActionState = {
  ok?: boolean;
  error?: string;
  alreadyGranted?: boolean;
  userId?: string;
  email?: string;
};

export type RevokeActionState = {
  ok?: boolean;
  error?: string;
};

async function requirePlatformActor() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Not signed in");
  }
  const actor = await currentActor();
  if (!actor) throw new Error("Not signed in");
  return { session, actor };
}

export async function grantPlatformAdminAction(
  _prev: GrantActionState,
  formData: FormData,
): Promise<GrantActionState> {
  const { actor } = await requirePlatformActor();
  const parsed = GrantFormSchema.safeParse({
    email: formData.get("email"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  try {
    const result = await grantPlatformAdmin(actor, parsed.data);
    revalidatePath("/app/platform/admins");
    return {
      ok: true,
      alreadyGranted: result.alreadyGranted,
      userId: result.userId,
      email: parsed.data.email,
    };
  } catch (e) {
    if (e instanceof PlatformAdminServiceError) {
      return { error: e.message };
    }
    return { error: "Could not grant platform admin." };
  }
}

export async function revokePlatformAdminAction(
  _prev: RevokeActionState,
  formData: FormData,
): Promise<RevokeActionState> {
  const { actor } = await requirePlatformActor();
  const parsed = RevokeFormSchema.safeParse({
    userId: formData.get("userId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return {
      error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    };
  }
  try {
    await revokePlatformAdmin(actor, parsed.data);
    revalidatePath("/app/platform/admins");
    return { ok: true };
  } catch (e) {
    if (e instanceof PlatformAdminServiceError) {
      // The "last admin" guard has a more direct message; surface it as-is.
      if (e.code === PlatformAdminErrorCode.LastAdmin) {
        return { error: e.message };
      }
      return { error: e.message };
    }
    return { error: "Could not revoke platform admin." };
  }
}
