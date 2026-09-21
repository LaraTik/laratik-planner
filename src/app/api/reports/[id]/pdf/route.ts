import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { resolveActiveAgencyContext } from "@/lib/auth/agency-context";
import { isAgencyAdmin } from "@/lib/auth/policy";
import { loadReport } from "@/lib/reports/storage";

/**
 * GET /api/reports/:id/pdf — stream a generated PDF.
 *
 * Auth: signed-in user whose active agency matches the report's
 * agency. We do not gate on platform admin because the report may
 * legitimately belong to a normal agency admin.
 *
 * Storage: file-backed (`data/reports/${id}.pdf`). The first
 * deployment with multi-node or durable-blob storage swaps the
 * `loadReport` implementation; this route stays unchanged.
 */
export async function GET(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  if (!id || typeof id !== "string") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const agency = await resolveActiveAgencyContext({ actor: { id: session.user.id } });
  if (!agency) {
    return NextResponse.json({ error: "No active agency" }, { status: 404 });
  }
  const isAdmin = await isAgencyAdmin({ id: session.user.id }, agency.agencyId);
  const loaded = await loadReport(id);
  if (!loaded) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (loaded.row.agencyId !== agency.agencyId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // The route lives at `/api/reports/[id]/pdf`; we let any signed-in
  // agency member (not just admins) fetch the bytes because the file
  // is already gated by the agencyId check above. If you tighten
  // this in future, surface a hard-link switch here.
  void isAdmin;

  const arrayBuffer = loaded.bytes.buffer.slice(
    loaded.bytes.byteOffset,
    loaded.bytes.byteOffset + loaded.bytes.byteLength,
  ) as ArrayBuffer;
  return new NextResponse(arrayBuffer, {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${loaded.row.filename}"`,
      "content-length": String(loaded.bytes.byteLength),
      "cache-control": "private, no-store",
    },
  });
}
