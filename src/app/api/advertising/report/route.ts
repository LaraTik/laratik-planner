import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { currentActor } from "@/lib/auth/current-actor";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import {
  advertisingAiContextFromReport,
  advertisingCsvFromReport,
} from "@/lib/advertising/reporting-boundary";
import { loadAdvertisingReport } from "@/lib/advertising/reporting-query";
import { db } from "@/lib/db";
import { mutatingApiHeaders } from "@/lib/security/headers";
import { serverEnv } from "@/lib/validation/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z
  .object({
    accountId: z.string().uuid(),
    workspaceId: z.string().uuid().nullable().optional(),
    since: z.string().date(),
    until: z.string().date(),
    surface: z.enum([
      "workspace_dashboard",
      "tenant_dashboard",
      "campaign_detail",
      "ad_detail",
      "aggregate",
      "csv_export",
      "ai_context",
      "financial_dashboard",
    ]),
  })
  .refine((value) => value.since <= value.until, {
    message: "until must not precede since",
    path: ["until"],
  })
  .refine(
    (value) =>
      new Date(`${value.until}T00:00:00Z`).getTime() -
        new Date(`${value.since}T00:00:00Z`).getTime() <=
      93 * 24 * 60 * 60 * 1000,
    { message: "report range is limited to 93 days", path: ["until"] },
  );

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: mutatingApiHeaders() });
}

/**
 * Read-only persisted advertising report boundary. The route resolves tenant
 * context first, then delegates all data filtering and aggregation to the
 * server-only reporting query and authorization seam.
 */
export async function GET(request: NextRequest) {
  if (!serverEnv.ADVERTISING_REPORTING_ENABLED) {
    return errorResponse("advertising_reporting_disabled", 404);
  }
  const actor = await currentActor();
  if (!actor) return errorResponse("not_signed_in", 401);
  const agencyContext = await resolveActiveAgencyContext({ actor });
  if (!agencyContext) return errorResponse("agency_context_unavailable", 404);

  const parsed = querySchema.safeParse({
    accountId: request.nextUrl.searchParams.get("accountId"),
    workspaceId: request.nextUrl.searchParams.get("workspaceId"),
    since: request.nextUrl.searchParams.get("since"),
    until: request.nextUrl.searchParams.get("until"),
    surface: request.nextUrl.searchParams.get("surface"),
  });
  if (!parsed.success) return errorResponse("invalid_report_query", 400);

  let result: Awaited<ReturnType<typeof loadAdvertisingReport>>;
  try {
    result = await loadAdvertisingReport(db, {
      actor,
      agencyId: agencyContext.agencyId,
      workspaceId: parsed.data.workspaceId ?? null,
      accountId: parsed.data.accountId,
      since: parsed.data.since,
      until: parsed.data.until,
      surface: parsed.data.surface,
    });
  } catch {
    return errorResponse("advertising_report_failed", 500);
  }
  // Do not let callers probe whether a guessed account exists. Both an
  // unknown account and a known-but-hidden account use the same response.
  if (result.kind === "not_found" || result.kind === "forbidden") {
    return errorResponse("advertising_report_not_found", 404);
  }

  if (parsed.data.surface === "csv_export") {
    const csv = advertisingCsvFromReport(result.report);
    if (!csv) return errorResponse("advertising_report_forbidden", 403);
    return new NextResponse(csv, {
      headers: {
        ...mutatingApiHeaders(),
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="advertising-${parsed.data.since}-${parsed.data.until}.csv"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  }

  const aiContext =
    parsed.data.surface === "ai_context"
      ? advertisingAiContextFromReport(result.report)
      : undefined;
  if (parsed.data.surface === "ai_context" && !aiContext) {
    return errorResponse("advertising_report_forbidden", 403);
  }
  return NextResponse.json(
    {
      account: result.account,
      report: {
        surface: result.report.surface,
        totals: result.report.totals,
        rows: result.report.rows,
        cacheKey: result.report.cacheKey,
      },
      objects: result.objects,
      audience: result.audience,
      ...(aiContext ? { aiContext } : {}),
      lastSuccessfulSyncAt: result.lastSuccessfulSyncAt,
      syncStatus: result.syncStatus,
      partial: result.partial,
      freshness: result.freshness,
      dataHealth: result.dataHealth,
    },
    { headers: mutatingApiHeaders() },
  );
}
