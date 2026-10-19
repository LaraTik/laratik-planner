import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { db } from "@/lib/db";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";
import { loadAdvertisingReport } from "@/lib/advertising/reporting-query";
import {
  advertisingSignalFeedbackMutationSchema,
  type AdvertisingSignalFeedbackMutation,
} from "@/lib/advertising/signal-feedback";
import {
  listAdvertisingSignalFeedback,
  saveAdvertisingSignalFeedback,
} from "@/lib/advertising/signal-feedback-service";
import { mutatingApiHeaders } from "@/lib/security/headers";

const queryShape = {
  workspace: z.string().min(1),
  accountId: z.string().uuid(),
  since: z.string().date(),
  until: z.string().date(),
};

const querySchema = z
  .object(queryShape)
  .refine((value) => value.since <= value.until, { path: ["until"] });

const createSchema = z
  .object({ ...queryShape, mutation: advertisingSignalFeedbackMutationSchema })
  .refine((value) => value.since <= value.until, { path: ["until"] });

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: mutatingApiHeaders() });
}

async function resolveScope(input: z.infer<typeof querySchema>) {
  const actor = await currentActor();
  if (!actor) return { error: "not_signed_in" as const, status: 401 };
  const agency = await resolveActiveAgencyContext({ actor });
  if (!agency) return { error: "agency_context_unavailable" as const, status: 404 };
  const workspace = await getAccessibleWorkspace(actor, input.workspace, agency.agencyId);
  if (!workspace) return { error: "workspace_not_accessible" as const, status: 403 };

  const report = await loadAdvertisingReport(db, {
    actor,
    agencyId: agency.agencyId,
    workspaceId: workspace.id,
    accountId: input.accountId,
    since: input.since,
    until: input.until,
    surface: "aggregate",
  });
  if (report.kind !== "ok") return { error: "advertising_report_not_found" as const, status: 404 };
  return { actor, agencyId: agency.agencyId, workspace };
}

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse({
    workspace: request.nextUrl.searchParams.get("workspace"),
    accountId: request.nextUrl.searchParams.get("accountId"),
    since: request.nextUrl.searchParams.get("since"),
    until: request.nextUrl.searchParams.get("until"),
  });
  if (!parsed.success) return errorResponse("invalid_query", 400);

  try {
    const scope = await resolveScope(parsed.data);
    if ("error" in scope) return errorResponse(scope.error, scope.status ?? 500);
    const feedback = await listAdvertisingSignalFeedback({
      workspaceId: scope.workspace.id,
      accountId: parsed.data.accountId,
      userId: scope.actor.id,
      since: parsed.data.since,
      until: parsed.data.until,
    });
    return NextResponse.json({ feedback }, { headers: mutatingApiHeaders() });
  } catch {
    return errorResponse("advertising_signal_feedback_failed", 500);
  }
}

export async function POST(request: NextRequest) {
  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return errorResponse("invalid_body", 400);

  try {
    const scope = await resolveScope(parsed.data);
    if ("error" in scope) return errorResponse(scope.error, scope.status ?? 500);
    const mutation: AdvertisingSignalFeedbackMutation = parsed.data.mutation;
    const feedback = await saveAdvertisingSignalFeedback({
      agencyId: scope.agencyId,
      workspaceId: scope.workspace.id,
      accountId: parsed.data.accountId,
      userId: scope.actor.id,
      since: parsed.data.since,
      until: parsed.data.until,
      mutation,
    });
    return NextResponse.json({ feedback }, { status: 200, headers: mutatingApiHeaders() });
  } catch {
    return errorResponse("advertising_signal_feedback_failed", 500);
  }
}
