import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { trendSources, trendSourceAudits } from "@/lib/db/schema";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { captureError } from "@/lib/observability/sentry";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { publicProviderError } from "@/lib/security/public-error";
import { TREND_SOURCE_CATALOG } from "@/lib/trends/source-catalog";
import { encryptForAgency } from "@/lib/security/secrets";

/**
 * POST /api/trends/sources/{key}/key
 *
 * Body: { apiKey: string }
 *
 * Effect: encrypts the API key via the platform KEK and stores the
 * reference on the `trend_sources.api_key_ref` column. The
 * sidecar reads the key through the same KEK.
 *
 * Permission: agency admin.
 */
const bodySchema = z.object({ apiKey: z.string().min(8).max(2048) });

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
    if (!def.requiresApiKey) {
      return NextResponse.json(
        { error: "source_does_not_need_key" },
        { status: 400, headers: mutatingApiHeaders() },
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

    const secretRef = encryptForAgency(parsed.data.apiKey);
    const refId = `${secretRef.keyVersion}:${secretRef.lastFour}`;

    const now = new Date();
    await db
      .insert(trendSources)
      .values({
        agencyId: agency.agencyId,
        sourceKey,
        displayName: def.displayName,
        enabled: true,
        tier: def.tier,
        tosClass: def.tosClass,
        region: "XX",
        apiKeyRef: refId,
      })
      .onConflictDoUpdate({
        target: [trendSources.agencyId, trendSources.sourceKey],
        set: {
          apiKeyRef: refId,
          updatedAt: now,
        },
      });

    await db.insert(trendSourceAudits).values({
      agencyId: agency.agencyId,
      sourceKey,
      actorUserId: actor.id,
      action: "configure",
      reason: "api_key_set",
      result: "success",
    });

    return NextResponse.json(
      { ok: true, sourceKey, hasKey: true },
      { status: 200, headers: mutatingApiHeaders() },
    );
  } catch (error) {
    captureError("trend_source.key.save.failed", error, {});
    return NextResponse.json(
      { error: publicProviderError("ai", error) },
      { status: 500, headers: mutatingApiHeaders() },
    );
  }
}
