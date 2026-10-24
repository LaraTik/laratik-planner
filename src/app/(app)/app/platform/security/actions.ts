"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { db } from "@/lib/db";
import { agencies } from "@/lib/db/schema";
import {
  createSupportAccessRequest,
  expireStaleSupportAccessGrants,
  listActiveGrantsForActor,
  listRecentAuditForActor,
  listRecentSupportAuditAsPlatform,
  listRecentRequestsByAgency,
  revokeSupportAccessGrant,
  SupportAccessError,
  type SupportAccessRequestRow,
} from "@/lib/support";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getPlatformPrincipal, requirePlatformPermission } from "@/lib/auth/platform-access";
import { PermissionDeniedError } from "@/lib/auth/policy";

/**
 * M3.4 — Platform console support-access actions.
 *
 * These are platform-side mutations for the support-access
 * surface. Agency admins decide requests from their own
 * agency settings route. The functions follow the existing
 * (app)/app/platform/STAR/actions.ts pattern: thin wrappers over
 * the service-layer helpers that the UI calls, with rate
 * limiting, error translation, and revalidatePath baked in.
 *
 * The service layer enforces the authorization; the actions
 * layer is the only place we map SupportAccessError codes to
 * UI-friendly error strings.
 */

const PlatformSessionError = "platform.session-required";

async function requirePlatformActor() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error(PlatformSessionError);
  }
  const actor = await currentActor();
  if (!actor) throw new Error(PlatformSessionError);
  return { session, actor };
}

const CreateSupportAccessRequestFormSchema = z.object({
  ticketReference: z.string().trim().min(3).max(120),
  reason: z.string().trim().min(8).max(2000),
  targetAgencyId: z.string().guid(),
  scopeWorkspaceId: z.string().guid().nullable().optional(),
  scopeMetadataOnly: z.boolean().default(false),
  requestedDurationHours: z.coerce.number().int().min(1).max(168),
  downloadsRequested: z.boolean().default(false),
});

export async function createSupportAccessRequestAction(
  input: z.input<typeof CreateSupportAccessRequestFormSchema>,
) {
  try {
    const { actor } = await requirePlatformActor();
    const parsed = CreateSupportAccessRequestFormSchema.parse(input);
    const limit = await enforceRateLimit({
      scope: "support_access_request",
      subject: actor.id,
      actorId: actor.id,
    });
    if (!limit.allowed) {
      return { ok: false as const, error: "Too many requests. Try again shortly." };
    }
    const request = await createSupportAccessRequest(actor, {
      ...parsed,
      scopeWorkspaceId: parsed.scopeWorkspaceId ?? null,
    });
    revalidatePath("/app/platform/security");
    revalidatePath(`/app/platform/agencies/${parsed.targetAgencyId}`);
    revalidatePath("/app/agency-settings/plan");
    return { ok: true as const, requestId: request.id };
  } catch (e) {
    return translateSupportError(e);
  }
}

export type SupportAccessRequestActionState = Readonly<{
  ok?: boolean;
  error?: string;
  code?: string;
  requestId?: string;
}>;

export async function createSupportAccessRequestFormAction(
  _previous: SupportAccessRequestActionState,
  formData: FormData,
): Promise<SupportAccessRequestActionState> {
  const stringValue = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  const workspace = formData.get("scopeWorkspaceId");
  return createSupportAccessRequestAction({
    ticketReference: stringValue("ticketReference"),
    reason: stringValue("reason"),
    targetAgencyId: stringValue("targetAgencyId"),
    scopeWorkspaceId: typeof workspace === "string" && workspace ? workspace : null,
    scopeMetadataOnly: formData.get("scopeMetadataOnly") === "on",
    requestedDurationHours: Number(stringValue("requestedDurationHours")),
    downloadsRequested: formData.get("downloadsRequested") === "on",
  });
}

const RevokeFormSchema = z.object({
  grantId: z.string().guid(),
  reason: z.string().trim().min(3).max(2000),
});

export async function revokeSupportAccessGrantAction(input: z.input<typeof RevokeFormSchema>) {
  const { actor } = await requirePlatformActor();
  const parsed = RevokeFormSchema.parse(input);
  try {
    const grant = await revokeSupportAccessGrant(actor, parsed.grantId, parsed.reason);
    revalidatePath("/app/platform/security");
    return { ok: true as const, grant };
  } catch (e) {
    return translateSupportError(e);
  }
}

export async function expireStaleSupportAccessGrantsAction() {
  const { actor } = await requirePlatformActor();
  await requirePlatformPermission(actor, "platform.access.manage");
  const result = await expireStaleSupportAccessGrants();
  revalidatePath("/app/platform/security");
  return { ok: true as const, ...result };
}

export async function loadPlatformSecurityOverview(actor: { id: string }) {
  const principal = await getPlatformPrincipal(actor);
  const canAudit = principal?.permissions.has("platform.audit.read") === true;
  const canRequestSupport = principal?.permissions.has("platform.support.request") === true;
  if (!canAudit && !canRequestSupport) {
    throw new PermissionDeniedError("platform-security-read");
  }
  // The platform security page renders:
  //   - the platform admin's own active grants
  //   - the platform admin's own recent audit log entries
  //   - per-agency open requests (across the platform)
  const [activeGrants, recentAudit, allAgencies] = await Promise.all([
    canRequestSupport ? listActiveGrantsForActor(actor) : [],
    canAudit ? listRecentSupportAuditAsPlatform(actor) : listRecentAuditForActor(actor),
    canRequestSupport
      ? db.select({ id: agencies.id, name: agencies.name, slug: agencies.slug }).from(agencies)
      : [],
  ]);
  const requestsByAgencyMap = canRequestSupport
    ? await listRecentRequestsByAgency(
        allAgencies.map((agency) => agency.id),
        { perAgencyLimit: 10 },
      )
    : new Map<string, SupportAccessRequestRow[]>();
  // Per-agency open requests, across the whole platform. This used to loop
  // `listRequestsForAgency` once per agency — one query per agency, i.e.
  // O(number of agencies). The old comment claimed the scan was "cheap"
  // because every agency has few requests; that bounded the RESULT while the
  // WORK stayed linear in the customer base. One ranked query now applies the
  // per-agency cap inside the database (see `listRecentRequestsByAgency`).
  const requestsByAgency = canRequestSupport
    ? allAgencies.flatMap((agency) => {
        const requests = requestsByAgencyMap.get(agency.id) ?? [];
        return requests.length > 0 ? [{ agency, requests }] : [];
      })
    : [];
  return {
    canAudit,
    canRequestSupport,
    activeGrants,
    recentAudit,
    requestsByAgency,
  };
}

function translateSupportError(e: unknown): { ok: false; error: string; code?: string } {
  if (e instanceof SupportAccessError) {
    return { ok: false, error: e.message, code: e.code };
  }
  if (e instanceof z.ZodError) {
    return { ok: false, error: e.issues.map((issue) => issue.message).join("; ") };
  }
  return { ok: false, error: "Unexpected error" };
}
