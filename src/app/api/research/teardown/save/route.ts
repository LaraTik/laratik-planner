import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { researchTeardowns } from "@/lib/db/schema";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { ResearchTeardownSchema } from "@/lib/research/teardown";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";

const saveSchema = z.object({
  workspaceSlug: z.string().trim().min(1).max(120),
  teardown: ResearchTeardownSchema,
});

export async function POST(request: NextRequest) {
  const parsed = saveSchema.safeParse(await request.json().catch(() => ({})));
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
  const workspace = await getAccessibleWorkspace(actor, parsed.data.workspaceSlug, agency.agencyId);
  if (!workspace) {
    return NextResponse.json(
      { error: "workspace_not_accessible" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  }
  if (!(await hasWorkspaceRole(actor, workspace.id, ["workspace_manager", "content_planner"]))) {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  }

  const [teardown] = await db
    .insert(researchTeardowns)
    .values({
      workspaceId: workspace.id,
      createdBy: actor.id,
      sourceKind: "planner_notes",
      result: parsed.data.teardown,
    })
    .returning();
  if (!teardown) {
    return NextResponse.json(
      { error: "save_failed" },
      { status: 500, headers: mutatingApiHeaders() },
    );
  }
  return NextResponse.json({ teardown }, { status: 201, headers: mutatingApiHeaders() });
}
