import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { db } from "@/lib/db";
import { trendSourceHealth, trendSources } from "@/lib/db/schema";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { serverEnv } from "@/lib/validation/env";
import { TREND_SOURCE_CATALOG } from "@/lib/trends/source-catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Test-only circuit-breaker fixture used by the Trend Radar E2E smoke test. */
export async function POST(req: NextRequest) {
  if (serverEnv.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Not available in production" },
      { status: 404, headers: mutatingApiHeaders() },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: mutatingApiHeaders() },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { sourceKey?: string };
  if (!body.sourceKey) {
    return NextResponse.json(
      { error: "sourceKey is required" },
      { status: 400, headers: mutatingApiHeaders() },
    );
  }

  const actor = await currentActor();
  const context = actor ? await resolveActiveAgencyContext({ actor }) : null;
  if (!context?.agencyId) {
    return NextResponse.json(
      { error: "agency_not_found" },
      { status: 404, headers: mutatingApiHeaders() },
    );
  }

  const source = TREND_SOURCE_CATALOG.find((candidate) => candidate.key === body.sourceKey);
  if (!source) {
    return NextResponse.json(
      { error: "unknown_source" },
      { status: 404, headers: mutatingApiHeaders() },
    );
  }

  await db
    .insert(trendSources)
    .values({
      agencyId: context.agencyId,
      sourceKey: source.key,
      displayName: source.displayName,
      enabled: true,
      tier: source.tier,
      tosClass: source.tosClass,
      region: "XX",
    })
    .onConflictDoUpdate({
      target: [trendSources.agencyId, trendSources.sourceKey],
      set: { enabled: true, updatedAt: new Date() },
    });

  await db
    .insert(trendSourceHealth)
    .values({
      agencyId: context.agencyId,
      sourceKey: body.sourceKey,
      status: "degraded",
      circuitState: "open",
      circuitOpenedAt: new Date(),
      checkedAt: new Date(),
      lastError: {
        code: "e2e_forced_open",
        message: "Forced open by the test fixture",
        at: new Date().toISOString(),
      },
    })
    .onConflictDoUpdate({
      target: [trendSourceHealth.agencyId, trendSourceHealth.sourceKey],
      set: {
        status: "degraded",
        circuitState: "open",
        circuitOpenedAt: new Date(),
        checkedAt: new Date(),
        lastError: {
          code: "e2e_forced_open",
          message: "Forced open by the test fixture",
          at: new Date().toISOString(),
        },
      },
    });

  return NextResponse.json({ ok: true }, { headers: mutatingApiHeaders() });
}
