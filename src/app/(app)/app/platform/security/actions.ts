"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { db } from "@/lib/db";
import { agencies } from "@/lib/db/schema";
import {
  createSupportAccessRequest,
  decideSupportAccessRequest,
  expireStaleSupportAccessGrants,
  listActiveGrantsForActor,
  listRecentAuditForActor,
  listRecentSupportAuditAsPlatform,
  listRequestsForAgency,
  revokeSupportAccessGrant,
  SupportAccessError,
} from "@/lib/support";
import { enforceRateLimit } from "@/lib/security/rate-limit";
import { getPlatformPrincipal } from "@/lib/auth/platform-access";
import { PermissionDeniedError } from "@/lib/auth/policy";

/**
 * M3.4 — Platform console support-access actions.
 *
 * These are the only mutations a platform admin (or, where
 * noted, an agency admin) can run on the support-access
 * surface. The functions follow the existing
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
  targetAgencyId: z.string().uuid(),
  scopeWorkspaceId: z.string().uuid().nullable().optional(),
  scopeMetadataOnly: z.boolean().default(false),
  requestedDurationHours: z.coerce.number().int().min(1).max(168),
  downloadsRequested: z.boolean().default(false),
});

export async function createSupportAccessRequestAction(
  input: z.input<typeof CreateSupportAccessRequestFormSchema>,
) {
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
  try {
    const request = await createSupportAccessRequest(actor, {
      ...parsed,
      scopeWorkspaceId: parsed.scopeWorkspaceId ?? null,
    });
    revalidatePath("/app/platform/security");
    revalidatePath("/app/agency-settings/plan");
    return { ok: true as const, request };
  } catch (e) {
    return translateSupportError(e);
  }
}

const DecideFormSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(3).max(2000),
  grantDownloads: z.boolean().default(false),
});

export async function decideSupportAccessRequestAction(input: z.input<typeof DecideFormSchema>) {
  const { actor } = await requirePlatformActor();
  const parsed = DecideFormSchema.parse(input);
  const limit = await enforceRateLimit({
    scope: "support_access_decision",
    subject: actor.id,
    actorId: actor.id,
  });
  if (!limit.allowed) {
    return { ok: false as const, error: "Too many decisions. Try again shortly." };
  }
  try {
    const result = await decideSupportAccessRequest(actor, parsed.requestId, parsed.decision, {
      reason: parsed.reason,
      grantDownloads: parsed.grantDownloads,
    });
    revalidatePath("/app/platform/security");
    revalidatePath("/app/agency-settings/plan");
    return { ok: true as const, ...result };
  } catch (e) {
    return translateSupportError(e);
  }
}

const RevokeFormSchema = z.object({
  grantId: z.string().uuid(),
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
  const result = await expireStaleSupportAccessGrants();
  revalidatePath("/app/platform/security");
  void actor; // rate-limited implicitly by the platform gate
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
  // The agency-id scan is cheap: every agency has at most a
  // handful of recent requests, and the list is bounded.
  const [activeGrants, recentAudit, allAgencies] = await Promise.all([
    canRequestSupport ? listActiveGrantsForActor(actor) : [],
    canAudit ? listRecentSupportAuditAsPlatform(actor) : listRecentAuditForActor(actor),
    canRequestSupport
      ? db.select({ id: agencies.id, name: agencies.name, slug: agencies.slug }).from(agencies)
      : [],
  ]);
  const requestsByAgency = await Promise.all(
    allAgencies.map(async (a) => {
      const reqs = await listRequestsForAgency(a.id, { limit: 10 });
      return { agency: a, requests: reqs };
    }),
  );
  return {
    canAudit,
    canRequestSupport,
    activeGrants,
    recentAudit,
    requestsByAgency: requestsByAgency.filter((row) => row.requests.length > 0),
  };
}

function translateSupportError(e: unknown): { ok: false; error: string; code?: string } {
  if (e instanceof SupportAccessError) {
    return { ok: false, error: e.message, code: e.code };
  }
  if (e instanceof z.ZodError) {
    return { ok: false, error: e.errors.map((issue) => issue.message).join("; ") };
  }
  return { ok: false, error: "Unexpected error" };
}
