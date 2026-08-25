import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/config";
import { exportBrandAssetsZip } from "@/lib/exports/brand-assets-zip";
import { getAccessibleWorkspace } from "@/lib/workspaces/context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/export/brand-assets-zip?slug=...
 *
 * Returns a ZIP archive of every active brand asset in the
 * workspace, plus a MANIFEST.txt describing value-only assets
 * and external links. Used by the "Download brand kit" button
 * on the brand-kit page.
 *
 * Auth: signed in + internal workspace role (enforced in the
 * service).
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
  const workspace = await getAccessibleWorkspace({ id: session.user.id }, slug);
  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }
  const { buffer, filename } = await exportBrandAssetsZip({ id: session.user.id }, workspace.id);
  // Buffer -> Uint8Array for the Web Response constructor.
  const body = new Uint8Array(buffer);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
