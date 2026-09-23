import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { PermissionDeniedError } from "@/lib/auth/policy";
import { createTask, listTasks, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/tasks/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Query = z.object({
  page: z.coerce.number().int().min(1).max(10000).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().max(160).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  workspaceId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  mine: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
  overdue: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .optional(),
});

const Body = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10000).optional(),
  workspaceId: z.string().uuid().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
});

function errorResponse(error: unknown) {
  if (error instanceof PermissionDeniedError)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (error instanceof Error && error.message.startsWith("task."))
    return NextResponse.json({ error: error.message }, { status: 400 });
  throw error;
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) return NextResponse.json({ error: "Agency unavailable" }, { status: 404 });
  const parsed = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsed.success) return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  try {
    return NextResponse.json(
      await listTasks(actor, { agencyId: context.agencyId, ...parsed.data }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const actor = await currentActor();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const context = await resolveActiveAgencyContext({ actor });
  if (!context) return NextResponse.json({ error: "Agency unavailable" }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  try {
    const task = await createTask(actor, {
      agencyId: context.agencyId,
      title: parsed.data.title,
      description: parsed.data.description,
      workspaceId: parsed.data.workspaceId,
      assigneeId: parsed.data.assigneeId,
      dueAt:
        parsed.data.dueAt === undefined
          ? undefined
          : parsed.data.dueAt === null
            ? null
            : new Date(parsed.data.dueAt),
      priority: parsed.data.priority,
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
