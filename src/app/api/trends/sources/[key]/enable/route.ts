import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { trendSources, trendSourceAudits } from "@/lib/db/schema";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { captureError } from "@/lib/observability/sentry";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { publicProviderError } from "@/lib/security/public-error";
import { TREND_SOURCE_CATALOG } from "@/lib/trends/source-catalog";

/**
 * POST /api/trends/sources/{key}/enable
 *
 * Body: { enabled: boolean }
 *
 * Effect: upserts the agency's `trend_sources` row with the
 * provided `enabled` flag. Paid sources without a configured
 * API key are rejected with 400.
 *
 * Permission: agency admin.
 */
const bodySchema = z.object({ enabled: z.boolean() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key: sourceKey } = await ctx.params;
    const def = TREND_SOURCE_CATALOG.find((s) => s.key === sourceKey);
    if (!def) {
      return NextResponse.json(
        { error: "unknown_source" },
        { status: 404, headers: mutatingApiHeaders() },
      );
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) {
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
    if (!(await isAgencyAdmin(actor, agency.agencyId))) {
      return NextResponse.json(
        { error: "forbidden" },
        { status: 403, headers: mutatingApiHeaders() },
      );
    }

    // Refuse to enable a paid source without an API key.
    if (parsed.data.enabled && def.requiresApiKey) {
      const [existing] = await db
        .select({ apiKeyRef: trendSources.apiKeyRef })
        .from(trendSources)
        .where(
          and(eq(trendSources.agencyId, agency.agencyId), eq(trendSources.sourceKey, sourceKey)),
        )
        .limit(1);
      if (!existing?.apiKeyRef) {
        return NextResponse.json(
          { error: "api_key_required" },
          { status: 400, headers: mutatingApiHeaders() },
        );
      }
    }

    const now = new Date();
    await db
      .insert(trendSources)
      .values({
        agencyId: agency.agencyId,
        sourceKey,
        displayName: def.displayName,
        enabled: parsed.data.enabled,
        tier: def.tier,
        tosClass: def.tosClass,
        region: "XX",
      })
      .onConflictDoUpdate({
        target: [trendSources.agencyId, trendSources.sourceKey],
        set: {
          enabled: parsed.data.enabled,
          updatedAt: now,
        },
      });

    await db.insert(trendSourceAudits).values({
      agencyId: agency.agencyId,
      sourceKey,
      actorUserId: actor.id,
      action: parsed.data.enabled ? "enable" : "disable",
      result: "success",
    });

    return NextResponse.json(
      { ok: true, sourceKey, enabled: parsed.data.enabled },
      { status: 200, headers: mutatingApiHeaders() },
    );
  } catch (error) {
    captureError("trend_source.toggle.failed", error, {});
    return NextResponse.json(
      { error: publicProviderError("ai", error) },
      { status: 500, headers: mutatingApiHeaders() },
    );
  }
}
