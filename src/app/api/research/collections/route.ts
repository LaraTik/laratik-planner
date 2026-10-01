import { NextResponse, type NextRequest } from "next/server";
import { and, asc, eq, or } from "drizzle-orm";
import { z } from "zod";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { db } from "@/lib/db";
import { researchCollections } from "@/lib/db/schema";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { mutatingApiHeaders } from "@/lib/security/headers";

const querySchema = z.object({ workspace: z.string().trim().min(1).max(120) });
const createSchema = z.object({
  workspaceSlug: z.string().trim().min(1).max(120),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  shareScope: z.enum(["me", "workspace"]).default("me"),
});

async function context(workspaceSlug: string) {
  const actor = await currentActor();
  if (!actor) return { response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency)
    return { response: NextResponse.json({ error: "no_active_agency" }, { status: 403 }) };
  const workspace = await getAccessibleWorkspace(actor, workspaceSlug, agency.agencyId);
  if (!workspace)
    return { response: NextResponse.json({ error: "workspace_not_accessible" }, { status: 403 }) };
  return { actor, workspace };
}

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    workspace: new URL(request.url).searchParams.get("workspace") ?? "",
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid_query" },
      { status: 400, headers: mutatingApiHeaders() },
    );

  const ctx = await context(parsed.data.workspace);
  if ("response" in ctx) return ctx.response;
  const collections = await db
    .select({
      id: researchCollections.id,
      name: researchCollections.name,
      description: researchCollections.description,
      shareScope: researchCollections.shareScope,
      createdBy: researchCollections.createdBy,
    })
    .from(researchCollections)
    .where(
      and(
        eq(researchCollections.workspaceId, ctx.workspace.id),
        or(
          eq(researchCollections.shareScope, "workspace"),
          eq(researchCollections.createdBy, ctx.actor.id),
        ),
      ),
    )
    .orderBy(asc(researchCollections.name));
  return NextResponse.json({ collections }, { status: 200, headers: mutatingApiHeaders() });
}

export async function POST(request: NextRequest) {
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid_body" },
      { status: 400, headers: mutatingApiHeaders() },
    );

  const ctx = await context(parsed.data.workspaceSlug);
  if ("response" in ctx) return ctx.response;
  if (
    !(await hasWorkspaceRole(ctx.actor, ctx.workspace.id, ["workspace_manager", "content_planner"]))
  ) {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: mutatingApiHeaders() },
    );
  }

  const [collection] = await db
    .insert(researchCollections)
    .values({
      workspaceId: ctx.workspace.id,
      createdBy: ctx.actor.id,
      name: parsed.data.name,
      ...(parsed.data.description ? { description: parsed.data.description } : {}),
      shareScope: parsed.data.shareScope,
    })
    .onConflictDoNothing()
    .returning({
      id: researchCollections.id,
      name: researchCollections.name,
      description: researchCollections.description,
      shareScope: researchCollections.shareScope,
      createdBy: researchCollections.createdBy,
    });

  if (!collection)
    return NextResponse.json(
      { error: "duplicate" },
      { status: 409, headers: mutatingApiHeaders() },
    );
  return NextResponse.json({ collection }, { status: 201, headers: mutatingApiHeaders() });
}
