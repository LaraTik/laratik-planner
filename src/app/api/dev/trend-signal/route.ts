import { NextResponse, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { db } from "@/lib/db";
import { trendSignals } from "@/lib/db/schema";
import { serverEnv } from "@/lib/validation/env";
import { mutatingApiHeaders } from "@/lib/security/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Test-only signal fixture for the Trend Radar Use in brief journey. */
export async function POST(request: NextRequest) {
  if (serverEnv.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { workspaceSlug?: string };
  const workspaceSlug = body.workspaceSlug?.trim();
  if (!workspaceSlug) {
    return NextResponse.json({ error: "workspaceSlug is required" }, { status: 400 });
  }

  const agencyContext = await resolveActiveAgencyContext({ actor });
  if (!agencyContext?.agencyId) {
    return NextResponse.json({ error: "Agency context required" }, { status: 403 });
  }
  const workspace = await getAccessibleWorkspace(actor, workspaceSlug);
  if (!workspace || workspace.agencyId !== agencyContext.agencyId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const sourceKey = "tiktok_creative_center";
  const sourceId = `e2e-${workspace.id}`;
  const existing = await db
    .select({ id: trendSignals.id })
    .from(trendSignals)
    .where(and(eq(trendSignals.workspaceId, workspace.id), eq(trendSignals.sourceId, sourceId)))
    .limit(1);
  const signal = existing[0]
    ? existing[0]
    : (
        await db
          .insert(trendSignals)
          .values({
            workspaceId: workspace.id,
            platform: "tiktok",
            type: "topic",
            label: "Weekend reset routines",
            normalizedLabel: "weekend reset routines",
            score: 0.92,
            rawScore: 0.92,
            rawPayload: { fixture: true },
            velocity: 0.84,
            lifecycle: "emerging",
            vertical: ["lifestyle"],
            sourceUrl: "https://example.com/e2e-trend",
            sourceId,
            sourceKey,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          })
          .returning({ id: trendSignals.id })
      )[0];

  return NextResponse.json({ ok: true, signalId: signal?.id }, { headers: mutatingApiHeaders() });
}
