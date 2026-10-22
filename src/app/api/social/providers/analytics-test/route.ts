import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { runAnalyticsProbe } from "@/features/social-analytics/server";
import { mutatingApiHeaders } from "@/lib/security/headers";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: mutatingApiHeaders() });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "unauthorized" }, 401);
  const actor = await currentActor();
  if (!actor) return json({ error: "unauthorized" }, 401);
  const context = await resolveActiveAgencyContext({ actor });
  if (!context?.agencyId || !(await isAgencyAdmin(actor, context.agencyId))) {
    return json({ error: "forbidden" }, 403);
  }
  const body = (await request.json().catch(() => null)) as { channelId?: unknown } | null;
  if (!body || typeof body.channelId !== "string" || body.channelId.length > 100) {
    return json({ error: "invalid_request" }, 400);
  }
  const result = await runAnalyticsProbe(context.agencyId, body.channelId);
  if (!result) return json({ error: "not_found" }, 404);
  return json(result);
}
