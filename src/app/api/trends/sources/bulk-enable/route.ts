import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
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
 * POST /api/trends/sources/bulk-enable
 *
 * Body: { workspaceSlug?: string, keys: string[] }
 *
 * Effect: upserts `trend_sources` rows for the agency's catalog
 * keys, sets `enabled=true` for each, and appends one
 * `trend_source_audit` row per source. Grey-area sources are
 * rejected unless the agency has already acknowledged them
 * (the ToS modal posts to `/acknowledge-tos` first).
 *
 * Permission: agency admin. The onboarding wizard is
 * client-only and tolerates a 403 by showing a friendly error
 * in the page; a non-admin sees the wizard read-only.
 */
const bodySchema = z.object({
  workspaceSlug: z.string().min(1).optional(),
  keys: z.array(z.string().min(1)).min(1).max(50),
});

const GREY_AREA_SOURCES = new Set([
  "tiktok_tamnd_cli",
  "x_twikit",
  "instagram_instaloader",
  "linkedin_tomquirk",
  "kawsarlog_threads",
]);

export async function POST(req: NextRequest) {
  try {
    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
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

    // Validate keys against the catalog; grey-area sources without
    // a prior ToS acknowledgement are rejected.
    const catalogKeys = new Set(TREND_SOURCE_CATALOG.map((s) => s.key));
    const validKeys = parsed.data.keys.filter((k) => catalogKeys.has(k));
    if (validKeys.length === 0) {
      return NextResponse.json(
        { error: "no_valid_keys" },
        { status: 400, headers: mutatingApiHeaders() },
      );
    }

    // Reject grey-area sources that haven't been acknowledged yet.
    const existing = await db
      .select({
        sourceKey: trendSources.sourceKey,
        tosAcknowledgedAt: trendSources.tosAcknowledgedAt,
      })
      .from(trendSources)
      .where(
        and(eq(trendSources.agencyId, agency.agencyId), inArray(trendSources.sourceKey, validKeys)),
      );
    const acked = new Set(
      existing.filter((r) => r.tosAcknowledgedAt !== null).map((r) => r.sourceKey),
    );
    const rejected = validKeys.filter(
      (k) =>
        GREY_AREA_SOURCES.has(k) ||
        // Catalog-level grey check via definition lookup
        TREND_SOURCE_CATALOG.find((s) => s.key === k)?.tosClass === "grey",
    );
    const blockedGreys = rejected.filter((k) => !acked.has(k));
    if (blockedGreys.length > 0) {
      return NextResponse.json(
        { error: "tos_required", sources: blockedGreys },
        { status: 400, headers: mutatingApiHeaders() },
      );
    }

    // Upsert + enable each.
    const now = new Date();
    for (const key of validKeys) {
      const def = TREND_SOURCE_CATALOG.find((s) => s.key === key);
      if (!def) continue;
      await db
        .insert(trendSources)
        .values({
          agencyId: agency.agencyId,
          sourceKey: key,
          displayName: def.displayName,
          enabled: true,
          tier: def.tier,
          tosClass: def.tosClass,
          region: "XX",
        })
        .onConflictDoUpdate({
          target: [trendSources.agencyId, trendSources.sourceKey],
          set: {
            enabled: true,
            enabledBy: actor.id,
            enabledAt: now,
            updatedAt: now,
          },
        });
      await db.insert(trendSourceAudits).values({
        agencyId: agency.agencyId,
        sourceKey: key,
        actorUserId: actor.id,
        action: "enable",
        result: "success",
      });
    }

    return NextResponse.json(
      { ok: true, enabled: validKeys },
      { status: 200, headers: mutatingApiHeaders() },
    );
  } catch (error) {
    captureError("trend_source.bulk_enable.failed", error, {});
    return NextResponse.json(
      { error: publicProviderError("ai", error) },
      { status: 500, headers: mutatingApiHeaders() },
    );
  }
}
