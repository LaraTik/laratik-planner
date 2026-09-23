import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { currentActor } from "@/lib/auth/current-actor";
import {
  getTaskDetail,
  archiveTask,
  restoreTask,
  updateTask,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "@/lib/tasks/service";
import { PermissionDeniedError } from "@/lib/auth/policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const Body = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(10000).optional(),
  workspaceId: z.string().uuid().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  status: z.enum(TASK_STATUSES).optional(),
});

function errorResponse(error: unknown) {
  if (error instanceof PermissionDeniedError)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (error instanceof Error && error.message.startsWith("task."))
    return NextResponse.json({ error: error.message }, { status: 400 });
  throw error;
}

async function actorOrResponse() {
  const session = await auth();
  if (!session?.user?.id)
    return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) } as const;
  const actor = await currentActor();
  if (!actor)
    return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) } as const;
  return { actor } as const;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await actorOrResponse();
  if ("response" in authResult) return authResult.response;
  try {
    return NextResponse.json({ task: await getTaskDetail(authResult.actor, (await params).id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await actorOrResponse();
  if ("response" in authResult) return authResult.response;
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  try {
    const data = parsed.data;
    const task = await updateTask(authResult.actor, (await params).id, {
      title: data.title,
      description: data.description,
      workspaceId: data.workspaceId,
      assigneeId: data.assigneeId,
      dueAt:
        data.dueAt === undefined ? undefined : data.dueAt === null ? null : new Date(data.dueAt),
      priority: data.priority,
      status: data.status,
    });
    return NextResponse.json({ task });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await actorOrResponse();
  if ("response" in authResult) return authResult.response;
  try {
    return NextResponse.json({ task: await archiveTask(authResult.actor, (await params).id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await actorOrResponse();
  if ("response" in authResult) return authResult.response;
  try {
    return NextResponse.json({ task: await restoreTask(authResult.actor, (await params).id) });
  } catch (error) {
    return errorResponse(error);
  }
}
