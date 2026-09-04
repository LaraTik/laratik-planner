import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { runAnalyticsProbe } from "@/lib/social/analytics-probe";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const context = await resolveActiveAgencyContext({ actor });
  if (!context?.agencyId || !(await isAgencyAdmin(actor, context.agencyId))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as { channelId?: unknown } | null;
  if (!body || typeof body.channelId !== "string" || body.channelId.length > 100) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const result = await runAnalyticsProbe(context.agencyId, body.channelId);
  if (!result) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(result);
}
