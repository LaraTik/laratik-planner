import { NextResponse, type NextRequest } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { researchBookmarks, socialChannels, socialPostObservations } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { mutatingApiHeaders } from "@/lib/security/headers";

const bodySchema = z.object({
  workspaceSlug: z.string().min(1),
  observationId: z.string().uuid(),
});

async function getContext(workspaceSlug: string) {
  const actor = await currentActor();
  if (!actor) return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency)
    return { response: NextResponse.json({ error: "no_active_agency" }, { status: 403 }) };
  const workspace = await getAccessibleWorkspace(actor, workspaceSlug, agency.agencyId);
  if (!workspace)
    return { response: NextResponse.json({ error: "workspace_not_accessible" }, { status: 403 }) };
  if (!(await hasWorkspaceRole(actor, workspace.id, ["workspace_manager", "content_planner"])))
    return { response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { actor, workspace };
}

async function findObservation(workspaceId: string, observationId: string) {
  const [row] = await db
    .select({ id: socialPostObservations.id })
    .from(socialPostObservations)
    .innerJoin(socialChannels, eq(socialChannels.id, socialPostObservations.socialChannelId))
    .where(
      and(
        eq(socialPostObservations.id, observationId),
        eq(socialChannels.workspaceId, workspaceId),
        eq(socialChannels.connectionStatus, "connected"),
        isNull(socialChannels.archivedAt),
      ),
    )
    .limit(1);
  return row;
}

export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid_body" },
      { status: 400, headers: mutatingApiHeaders() },
    );
  const ctx = await getContext(parsed.data.workspaceSlug);
  if ("response" in ctx) return ctx.response;
  const observation = await findObservation(ctx.workspace.id, parsed.data.observationId);
  if (!observation)
    return NextResponse.json(
      { error: "observation_not_found" },
      { status: 404, headers: mutatingApiHeaders() },
    );
  const [bookmark] = await db
    .insert(researchBookmarks)
    .values({
      workspaceId: ctx.workspace.id,
      socialPostObservationId: observation.id,
      createdBy: ctx.actor.id,
    })
    .onConflictDoNothing()
    .returning({ id: researchBookmarks.id });
  return NextResponse.json(
    { ok: true, saved: Boolean(bookmark) },
    { status: 200, headers: mutatingApiHeaders() },
  );
}

export async function DELETE(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid_body" },
      { status: 400, headers: mutatingApiHeaders() },
    );
  const ctx = await getContext(parsed.data.workspaceSlug);
  if ("response" in ctx) return ctx.response;
  await db
    .delete(researchBookmarks)
    .where(
      and(
        eq(researchBookmarks.workspaceId, ctx.workspace.id),
        eq(researchBookmarks.socialPostObservationId, parsed.data.observationId),
      ),
    );
  return NextResponse.json({ ok: true }, { status: 200, headers: mutatingApiHeaders() });
}
