import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { exportContentItemsCsv } from "@/lib/exports/content-csv";
import { csvDisposition } from "@/lib/utils/csv";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/export/content-csv?slug=...&month=YYYY-MM
 *
 * Returns a CSV of every content item in the workspace for the
 * given month. The download is a stream; the route is `nodejs`
 * runtime because it composes a service that talks to Postgres.
 *
 * Auth: signed in + workspace member with internal role. The
 * service layer enforces the role gate; the route only resolves
 * the workspace slug.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "Missing slug" }, { status: 400 });
  }
  const monthParam = url.searchParams.get("month");
  const monthStart = monthParam
    ? new Date(`${monthParam}-01T00:00:00Z`)
    : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const monthEnd = new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
  );

  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const csv = await exportContentItemsCsv(
    { id: session.user.id },
    workspace.id,
    { monthStart, monthEnd },
  );
  const filename = `planning-${workspace.slug}-${monthParam ?? "current"}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": csvDisposition(filename),
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
