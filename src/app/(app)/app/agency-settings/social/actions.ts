"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import {
  disableSocial,
  enableSocial,
  resetSocialRecovery,
  rotateSocialDek,
  SocialServiceError,
} from "@/lib/social/service";

/**
 * M4.5 — social DEK admin actions.
 *
 * The agency admin UI is built on server actions so the form
 * transitions are progressive-enhancement friendly (no client JS
 * required to submit). Each action:
 *
 *   1. Authenticates the actor (NextAuth session).
 *   2. Delegates to the service layer (which does the agency-admin
 *      check + the actual work + the audit log).
 *   3. Revalidates the agency-settings path on success.
 *   4. Returns a typed `SocialActionState` so the client component
 *      can render the success / error inline.
 *
 * The DEK recovery key is only ever in the success state of the
 * enable / rotate actions. The failure state never includes it.
 */

export type SocialActionState = {
  ok?: boolean;
  error?: string;
  code?: string;
  /** The DEK recovery key (base64). Present ONLY in the success state of enable / rotate. */
  dekRecoveryKey?: string;
  dekKeyVersion?: number;
};

const noActor: SocialActionState = { error: "Not authenticated", code: "auth.required" };

export async function enableSocialAction(
  _prev: SocialActionState,
  formData: FormData,
): Promise<SocialActionState> {
  const session = await auth();
  if (!session?.user?.id) return noActor;
  const actor = await currentActor();
  if (!actor) return noActor;
  const agencyId = String(formData.get("agencyId") ?? "");
  if (!agencyId) {
    return { error: "Missing agencyId", code: "input.missing-agency" };
  }
  try {
    const result = await enableSocial(actor, agencyId);
    revalidatePath("/app/agency-settings/social");
    return {
      ok: true,
      dekRecoveryKey: result.dekRecoveryKey,
      dekKeyVersion: result.dekKeyVersion,
    };
  } catch (err) {
    if (err instanceof SocialServiceError) {
      return { error: err.message, code: err.code };
    }
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

export async function rotateSocialDekAction(
  _prev: SocialActionState,
  formData: FormData,
): Promise<SocialActionState> {
  const session = await auth();
  if (!session?.user?.id) return noActor;
  const actor = await currentActor();
  if (!actor) return noActor;
  const agencyId = String(formData.get("agencyId") ?? "");
  if (!agencyId) {
    return { error: "Missing agencyId", code: "input.missing-agency" };
  }
  try {
    const result = await rotateSocialDek(actor, agencyId, { confirm: true });
    revalidatePath("/app/agency-settings/social");
    return {
      ok: true,
      dekRecoveryKey: result.dekRecoveryKey,
      dekKeyVersion: result.dekKeyVersion,
    };
  } catch (err) {
    if (err instanceof SocialServiceError) {
      return { error: err.message, code: err.code };
    }
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

export async function disableSocialAction(
  _prev: SocialActionState,
  formData: FormData,
): Promise<SocialActionState> {
  const session = await auth();
  if (!session?.user?.id) return noActor;
  const actor = await currentActor();
  if (!actor) return noActor;
  const agencyId = String(formData.get("agencyId") ?? "");
  if (!agencyId) {
    return { error: "Missing agencyId", code: "input.missing-agency" };
  }
  try {
    await disableSocial(actor, agencyId, { confirm: true });
    revalidatePath("/app/agency-settings/social");
    return { ok: true };
  } catch (err) {
    if (err instanceof SocialServiceError) {
      return { error: err.message, code: err.code };
    }
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}

export async function resetSocialRecoveryAction(
  _prev: SocialActionState,
  formData: FormData,
): Promise<SocialActionState> {
  const session = await auth();
  if (!session?.user?.id) return noActor;
  const actor = await currentActor();
  if (!actor) return noActor;
  const agencyId = String(formData.get("agencyId") ?? "");
  if (!agencyId) {
    return { error: "Missing agencyId", code: "input.missing-agency" };
  }
  try {
    await resetSocialRecovery(actor, agencyId, { confirm: true });
    revalidatePath("/app/agency-settings/social");
    return { ok: true };
  } catch (err) {
    if (err instanceof SocialServiceError) {
      return { error: err.message, code: err.code };
    }
    return { error: err instanceof Error ? err.message : "Unexpected error" };
  }
}
