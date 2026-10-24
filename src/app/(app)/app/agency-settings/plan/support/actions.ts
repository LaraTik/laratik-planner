"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { decideSupportAccessRequest, SupportAccessError } from "@/lib/support";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const DecisionFormSchema = z.object({
  requestId: z.string().guid(),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(3).max(2000),
  grantDownloads: z.boolean(),
});

export type SupportDecisionErrorCode =
  | "unauthorized"
  | "invalid_input"
  | "not_found"
  | "already_decided"
  | "rate_limited"
  | "decision_failed";

export type SupportDecisionActionState = {
  errorCode?: SupportDecisionErrorCode;
  successCode?: "approved" | "rejected";
};

export async function decideAgencySupportRequestAction(
  _previous: SupportDecisionActionState,
  formData: FormData,
): Promise<SupportDecisionActionState> {
  const parsed = DecisionFormSchema.safeParse({
    requestId: formData.get("requestId"),
    decision: formData.get("decision"),
    reason: formData.get("reason"),
    grantDownloads: formData.get("grantDownloads") === "on",
  });
  if (!parsed.success) return { errorCode: "invalid_input" };

  try {
    const actor = await currentActor();
    if (!actor) return { errorCode: "unauthorized" };
    const context = await resolveActiveAgencyContext({ actor });
    if (!context || !(await isAgencyAdmin(actor, context.agencyId))) {
      return { errorCode: "unauthorized" };
    }

    const rateLimit = await enforceRateLimit({
      scope: "support_access_decision",
      subject: actor.id,
      actorId: actor.id,
    });
    if (!rateLimit.allowed) return { errorCode: "rate_limited" };

    await decideSupportAccessRequest(
      actor,
      parsed.data.requestId,
      parsed.data.decision,
      { reason: parsed.data.reason, grantDownloads: parsed.data.grantDownloads },
      context.agencyId,
    );
    revalidatePath("/app/agency-settings/plan");
    revalidatePath("/app/agency-settings/plan/support");
    revalidatePath("/app/platform/security");
    return { successCode: parsed.data.decision };
  } catch (error) {
    if (error instanceof SupportAccessError) {
      if (error.code === "support.not-found" || error.code === "support.cross-agency") {
        return { errorCode: "not_found" };
      }
      if (error.code === "support.already-decided" || error.code === "support.expired") {
        return { errorCode: "already_decided" };
      }
      if (error.code === "support.not-agency-admin") return { errorCode: "unauthorized" };
    }
    return { errorCode: "decision_failed" };
  }
}
