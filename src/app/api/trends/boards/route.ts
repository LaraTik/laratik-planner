import { NextResponse, type NextRequest } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { trendBoards } from "@/lib/db/schema";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { hasWorkspaceRole } from "@/lib/auth/policy";
import { mutatingApiHeaders } from "@/lib/security/headers";

const workspaceSchema = z.object({ workspace: z.string().min(1) });
const createSchema = z.object({
  workspaceSlug: z.string().min(1),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
});

async function context(slug: string) {
  const actor = await currentActor();
  if (!actor)
    return {
      response: NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: mutatingApiHeaders() },
      ),
    };
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency)
    return {
      response: NextResponse.json(
        { error: "no_active_agency" },
        { status: 403, headers: mutatingApiHeaders() },
      ),
    };
  const workspace = await getAccessibleWorkspace(actor, slug, agency.agencyId);
  if (!workspace)
    return {
      response: NextResponse.json(
        { error: "workspace_not_accessible" },
        { status: 403, headers: mutatingApiHeaders() },
      ),
    };
  return { actor, workspace };
}

export async function GET(req: NextRequest) {
  const parsed = workspaceSchema.safeParse({
    workspace: new URL(req.url).searchParams.get("workspace") ?? "",
  });
  if (!parsed.success)
    return NextResponse.json(
      { error: "invalid_query" },
      { status: 400, headers: mutatingApiHeaders() },
    );
  const ctx = await context(parsed.data.workspace);
  if ("response" in ctx) return ctx.response;
  const boards = await db
    .select()
    .from(trendBoards)
    .where(eq(trendBoards.workspaceId, ctx.workspace.id))
    .orderBy(asc(trendBoards.createdAt));
  return NextResponse.json({ boards }, { status: 200, headers: mutatingApiHeaders() });
}

export async function POST(req: NextRequest) {
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
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
  const [board] = await db
    .insert(trendBoards)
    .values({
      workspaceId: ctx.workspace.id,
      userId: ctx.actor.id,
      name: parsed.data.name,
      ...(parsed.data.description ? { description: parsed.data.description } : {}),
    })
    .returning();
  return NextResponse.json({ ok: true, board }, { status: 201, headers: mutatingApiHeaders() });
}
