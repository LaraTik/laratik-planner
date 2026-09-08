import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { contentItems, trendBriefs, trendSignals } from "@/lib/db/schema";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { mutatingApiHeaders } from "@/lib/security/headers";

const querySchema = z.object({ workspace: z.string().min(1) });

export async function GET(req: NextRequest) {
  const actor = await currentActor();
  if (!actor)
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: mutatingApiHeaders() },
    );
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency)
    return NextResponse.json(
      { error: "no_active_agency" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  const parsed = querySchema.safeParse({
    workspace: new URL(req.url).searchParams.get("workspace") ?? "",
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid_query" },
      { status: 400, headers: mutatingApiHeaders() },
    );
  const workspace = await getAccessibleWorkspace(actor, parsed.data.workspace, agency.agencyId);
  if (!workspace)
    return NextResponse.json(
      { error: "workspace_not_accessible" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  const rows = await db
    .select({
      id: trendBriefs.id,
      contentItemId: trendBriefs.contentItemId,
      title: contentItems.title,
      status: contentItems.status,
      signalLabel: trendSignals.label,
      velocityAtSchedule: trendBriefs.velocityAtSchedule,
      createdAt: trendBriefs.createdAt,
    })
    .from(trendBriefs)
    .innerJoin(contentItems, eq(contentItems.id, trendBriefs.contentItemId))
    .leftJoin(trendSignals, eq(trendSignals.id, trendBriefs.signalId))
    .where(
      and(eq(trendBriefs.workspaceId, workspace.id), eq(contentItems.workspaceId, workspace.id)),
    )
    .orderBy(desc(trendBriefs.createdAt))
    .limit(50);
  return NextResponse.json({ briefs: rows }, { status: 200, headers: mutatingApiHeaders() });
}
