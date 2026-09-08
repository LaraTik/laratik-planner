import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { trendSourceAudits, trendSources } from "@/lib/db/schema";
import { currentActor } from "@/lib/auth/current-actor";
import { captureError } from "@/lib/observability/sentry";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { publicProviderError } from "@/lib/security/public-error";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";

/**
 * POST /api/trends/sources/{key}/acknowledge-tos
 *
 * Records that the agency admin has acknowledged the ToS warning
 * for a grey-area source (twikit, instaloader, tomquirk, kawsarlog).
 *
 * Body: empty (the source key comes from the path).
 *
 * Side effects:
 *   1. `trend_source.tos_acknowledged_by` and
 *      `trend_source.tos_acknowledged_at` are set on the agency's
 *      row.
 *   2. A `trend_source_audit` row is appended with
 *      `action=configure`, `result=success`, and metadata
 *      `{ acknowledged: true, tos_class: "grey" }`.
 *
 * Permission: only agency admins can acknowledge. The agency is
 * resolved from the active context (the same way every other
 * agency-scoped route does it).
 */

const bodySchema = z.object({}).strict();

const GREY_AREA_SOURCES = new Set([
  "tiktok_tamnd_cli",
  "x_twikit",
  "instagram_instaloader",
  "linkedin_tomquirk",
  "kawsarlog_threads",
]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key: sourceKey } = await ctx.params;
    if (!GREY_AREA_SOURCES.has(sourceKey)) {
      return NextResponse.json(
        { error: "source_does_not_require_acknowledgement" },
        { status: 400, headers: mutatingApiHeaders() },
      );
    }

    // Body is intentionally empty; parse to fail fast on garbage.
    try {
      bodySchema.parse(await req.json().catch(() => ({})));
    } catch {
      return NextResponse.json(
        { error: "invalid_body" },
        { status: 400, headers: mutatingApiHeaders() },
      );
    }

    const actor = await currentActor();
    if (!actor) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: mutatingApiHeaders() },
      );
    }

    const agency = await resolveActiveAgencyContext({ actor });
    if (!agency) {
      return NextResponse.json(
        { error: "no_active_agency" },
        { status: 403, headers: mutatingApiHeaders() },
      );
    }

    const now = new Date();

    // Upsert the source row. If the agency hasn't enabled the
    // source yet we still want to record the acknowledgement so
    // the admin can enable it later without seeing the modal again.
    const existing = await db
      .select({ id: trendSources.id })
      .from(trendSources)
      .where(and(eq(trendSources.agencyId, agency.agencyId), eq(trendSources.sourceKey, sourceKey)))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(trendSources).values({
        agencyId: agency.agencyId,
        sourceKey,
        displayName: sourceKey,
        enabled: false,
        tier: "experimental",
        tosClass: "grey",
        tosAcknowledgedBy: actor.id,
        tosAcknowledgedAt: now,
      });
    } else {
      await db
        .update(trendSources)
        .set({
          tosAcknowledgedBy: actor.id,
          tosAcknowledgedAt: now,
          updatedAt: now,
        })
        .where(
          and(eq(trendSources.agencyId, agency.agencyId), eq(trendSources.sourceKey, sourceKey)),
        );
    }

    await db.insert(trendSourceAudits).values({
      agencyId: agency.agencyId,
      sourceKey,
      actorUserId: actor.id,
      action: "configure",
      reason: "tos_acknowledgement",
      result: "success",
    });

    return NextResponse.json(
      { ok: true, sourceKey, acknowledgedAt: now.toISOString() },
      { status: 200, headers: mutatingApiHeaders() },
    );
  } catch (error) {
    captureError("trend_source.tos_acknowledge.failed", error, {});
    return NextResponse.json(
      { error: publicProviderError("ai", error) },
      { status: 500, headers: mutatingApiHeaders() },
    );
  }
}
